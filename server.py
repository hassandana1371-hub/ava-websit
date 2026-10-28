"""AVA CMS server. Python 3.11+, SQLite, no external packages.

Run `python3 server.py set-password` first. Production requires HTTPS at a
reverse proxy and AVA_PUBLIC_ORIGIN. See DEPLOYMENT-fa.md.
"""
import site_features
import gzip
import argparse
import copy
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('AVA_DATA_DIR', str(ROOT / 'private-data'))) / 'ava.sqlite3'
MAX_BODY = 48 * 1024 * 1024
MODULES = ['products', 'services', 'projects', 'partners', 'software', 'articles', 'contact', 'catalog', 'equipment']


def connect():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    return db


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT, digest TEXT);
        CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER, data TEXT);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT, expires REAL);
        CREATE TABLE IF NOT EXISTS attempts (address TEXT, created REAL);
        ''')
        if not db.execute('SELECT 1 FROM content').fetchone():
            db.execute('INSERT INTO content VALUES (1,1,?)', ((ROOT / 'src/defaults.json').read_text(),))
        site_features.initialize(db)
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT revision,data FROM content WHERE id=1').fetchone()
        existing=json.loads(row['data']);upgraded=site_features.upgrade_contact(existing)
        if upgraded is not existing:
            upgraded['updatedAt']=int(time.time()*1000)
            db.execute('UPDATE content SET revision=?,data=? WHERE id=1',(row['revision']+1,json.dumps(upgraded,ensure_ascii=False)))
    os.chmod(DB, 0o600)


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def check_password(password, row):
    try:
        return bool(row) and hmac.compare_digest(password_hash(password, row['salt']), row['digest'])
    except (UnicodeError, ValueError):
        return False


def set_password(db, password):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError('رمز باید بین ۱۲ تا ۲۵۶ نویسه باشد.')
    try:
        password.encode('utf-8')
    except UnicodeError:
        raise ValueError('نویسهٔ رمز معتبر نیست.')
    salt = secrets.token_hex(16)
    db.execute('INSERT OR REPLACE INTO account VALUES (1,?,?)', (salt, password_hash(password, salt)))
    db.execute('DELETE FROM sessions')


def validate_content(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError('ساختار محتوا معتبر نیست.')
    for key in ['header', 'hero', 'contact', 'modules', 'pageBanners']:
        if not isinstance(data.get(key, {} if key == 'pageBanners' else None), dict):
            raise ValueError('ساختار بخش‌ها معتبر نیست.')
    if not isinstance(data.get('navigation'), list) or len(data['navigation']) != 8:
        raise ValueError('منو معتبر نیست.')
    categories = data.get('productCategories')
    if not isinstance(categories, list) or len(categories) > 100:
        raise ValueError('دسته‌بندی معتبر نیست.')
    ids = set()
    for c in categories:
        if not isinstance(c, dict) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', str(c.get('id', ''))) or c['id'] in ids:
            raise ValueError('شناسهٔ دسته معتبر نیست.')
        ids.add(c['id'])
    def string(value, limit=2000):
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('نوع یا طول متن معتبر نیست.')

    def banner(value):
        if not isinstance(value, dict) or not isinstance(value.get('show'), bool):
            raise ValueError('تنظیم بنر معتبر نیست.')
        for key, limit in [('title',160), ('description',1000), ('imageAlt',200)]:
            string(value.get(key, ''), limit)
        interval = value.get('interval', 3000)
        if type(interval) is not int or not 1000 <= interval <= 15000:
            raise ValueError('زمان بنر معتبر نیست.')
        slides = value.get('slides', [])
        if not isinstance(slides, list) or len(slides) > 8:
            raise ValueError('تعداد عکس‌های بنر معتبر نیست.')
        for slide in slides:
            if not isinstance(slide, dict):
                raise ValueError('عکس بنر معتبر نیست.')
            string(slide.get('asset', ''), 80)
            string(slide.get('imageAlt', ''), 200)

    for c in categories:
        string(c.get('name'), 80)
        string(c.get('description'), 1000)
        if not c['name'].strip() or type(c.get('visible')) is not bool:
            raise ValueError('تنظیم دسته معتبر نیست.')
        parent_id = c.get('parentId', '')
        if parent_id:
            parent = next((p for p in categories if p['id'] == parent_id), None)
            if not parent or parent.get('parentId') or parent_id == c['id'] or c['id'] == 'uncategorized' or parent_id == 'uncategorized':
                raise ValueError('والد دسته معتبر نیست.')
        if c.get('banner') is not None:
            banner(c['banner'])
    header, hero = data['header'], data['hero']
    for key in ['nameEn','nameFa','sloganEn','sloganFa']:
        string(header.get(key), 180)
    for key in ['showLogo','showNameEn','showNameFa','showSloganEn','showSloganFa']:
        if type(header.get(key)) is not bool:
            raise ValueError('تنظیم هدر معتبر نیست.')
    if type(hero.get('show')) is not bool or type(hero.get('interval')) is not int or not 1000 <= hero['interval'] <= 15000:
        raise ValueError('تنظیم هیرو معتبر نیست.')
    if not isinstance(hero.get('slides'), list) or not 1 <= len(hero['slides']) <= 8:
        raise ValueError('تعداد اسلایدهای هیرو معتبر نیست.')
    slide_ids = set()
    targets = set(MODULES) | {'hero','vision','process'}
    for slide in [hero] + hero['slides']:
        if not isinstance(slide, dict):
            raise ValueError('اسلاید معتبر نیست.')
        for key in ['eyebrow','title','highlight','description','imageAlt','primaryLabel','secondaryLabel']:
            string(slide.get(key), 2500 if key == 'description' else 200)
        for key in ['primaryTarget','secondaryTarget']:
            if slide.get(key) not in targets:
                raise ValueError('مقصد اسلاید معتبر نیست.')
    for slide in hero['slides']:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', str(slide.get('id',''))) or slide['id'] in slide_ids or not slide['title'].strip():
            raise ValueError('شناسه یا عنوان اسلاید معتبر نیست.')
        slide_ids.add(slide['id'])
    nav_ids = set()
    for row in data['navigation']:
        if not isinstance(row, dict) or row.get('id') not in MODULES[:8] or row['id'] in nav_ids or row.get('target') not in targets | {'external'} or type(row.get('visible')) is not bool:
            raise ValueError('گزینهٔ منو معتبر نیست.')
        nav_ids.add(row['id'])
        string(row.get('label'), 45)
        if not row['label'].strip() or (row['target'] == 'external' and not row.get('url')):
            raise ValueError('نام یا مقصد منو معتبر نیست.')
    for key in ['title','description','phone','email','address']:
        string(data['contact'].get(key), 2500 if key == 'description' else 500)
    for key,limit in [('mobile',80),('phoneDisplay',80),('mobileDisplay',80),('phoneLabel',80),('mobileLabel',80),('phoneNote',200),('mobileNote',200)]:string(data['contact'].get(key,''),limit)
    if type(data.get('contactRevision',1)) is not int or data.get('contactRevision',1) not in [1,2]:raise ValueError('نسخهٔ اطلاعات تماس معتبر نیست.')
    locations=data['contact'].get('locations',[])
    if not isinstance(locations,list) or len(locations)>12:raise ValueError('حداکثر ۱۲ نشانی قابل ثبت است.')
    location_ids=set()
    for location in locations:
        if not isinstance(location,dict):raise ValueError('نشانی معتبر نیست.')
        string(location.get('id'),80);string(location.get('title'),120);string(location.get('address'),1000)
        if not location['id'] or location['id'] in location_ids or not location['title'].strip() or not location['address'].strip():raise ValueError('عنوان و متن نشانی را کامل وارد کنید.')
        location_ids.add(location['id'])

    page_banners = data.get('pageBanners', {})
    if len(page_banners) > 600:
        raise ValueError('تعداد بنرها بیش از حد مجاز است.')
    for key, value in page_banners.items():
        if not re.fullmatch(r'[A-Za-z0-9_:-]{1,170}', key):
            raise ValueError('شناسهٔ صفحه معتبر نیست.')
        banner(value)
    for key in MODULES:
        module = data['modules'].get(key)
        if not isinstance(module, dict) or not isinstance(module.get('items'), list) or len(module['items']) > 500:
            raise ValueError('ساختار محتوای بخش معتبر نیست.')
        string(module.get('name'), 80)
        string(module.get('description'), 1000)
        if key == 'products':
            banner(module.get('banner'))
        seen = set()
        for item in module['items']:
            if not isinstance(item, dict) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', str(item.get('id', ''))) or item['id'] in seen or item.get('status') not in ['draft', 'published']:
                raise ValueError('شناسه یا وضعیت محتوا معتبر نیست.')
            seen.add(item['id'])
            if not isinstance(item.get('title'), str) or not item['title'].strip() or len(item['title']) > 160:
                raise ValueError('عنوان محتوا معتبر نیست.')
            if key == 'products' and item.get('categoryId') not in ids:
                raise ValueError('دستهٔ محصول معتبر نیست.')
            for field, limit in [('summary',700),('body',20000),('meta',200),('fileName',160)]:
                string(item.get(field, ''), limit)
            if item.get('banner') is not None:
                banner(item['banner'])
            if key == 'products':
                price = item.get('priceAmount')
                if price is not None and (type(price) is not int or not 0 <= price <= 9000000000000):
                    raise ValueError('قیمت محصول معتبر نیست.')
                if item.get('priceKind') not in ['quote','reference','sale']:
                    raise ValueError('نوع قیمت معتبر نیست.')
                for field, limit in [('model',120),('imageCaption',200),('priceUnit',80)]:
                    string(item.get(field, ''), limit)
                date = item.get('priceDate', '')
                if date and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
                    raise ValueError('تاریخ قیمت معتبر نیست.')
                specs = item.get('specifications', [])
                if not isinstance(specs, list) or len(specs) > 60:
                    raise ValueError('مشخصات فنی معتبر نیست.')
                for spec in specs:
                    if not isinstance(spec, dict):
                        raise ValueError('ردیف مشخصات معتبر نیست.')
                    string(spec.get('label'), 150)
                    string(spec.get('value'), 400)
                    if not spec['label'].strip() or not spec['value'].strip():
                        raise ValueError('نام و مقدار مشخصه ضروری است.')
    for item_module in data['modules'].values():
        for item in item_module['items']:
            string(item.get('seoTitle',''),160);string(item.get('seoDescription',''),320)
    if not isinstance(data.get('footer',{}),dict) or not isinstance(data.get('pageSeo',{}),dict):raise ValueError('تنظیمات معتبر نیست.')
    for k in ['text','copyright']:string(data.get('footer',{}).get(k,''),1000)
    if not isinstance(data.get('company',{}),dict):raise ValueError('معرفی شرکت معتبر نیست.')
    string(data.get('company',{}).get('description',''),2500);string(data.get('company',{}).get('serviceArea',''),200)
    for path,seo in data.get('pageSeo',{}).items():
        string(path,180)
        if not isinstance(seo,dict):raise ValueError('سئو معتبر نیست.')
        string(seo.get('title',''),160);string(seo.get('description',''),320)
        string(seo.get('heading',''),200);string(seo.get('intro',''),2500)
        if 'showContent' in seo and type(seo['showContent']) is not bool:raise ValueError('نمایش متن معتبر نیست.')
        sections=seo.get('sections',[])
        if not isinstance(sections,list) or len(sections)>12:raise ValueError('بخش‌های متن معتبر نیست.')
        for section in sections:
            if not isinstance(section,dict):raise ValueError('متن بخش معتبر نیست.')
            string(section.get('heading'),200);string(section.get('body'),2500)
    for slide in hero['slides']:
        link=slide.get('clickUrl','')
        string(link,2000)
        if link and not (link.startswith('#') or (link.startswith('/') and not link.startswith('//')) or urlsplit(link).scheme in ['https','http']):raise ValueError('مقصد هیرو معتبر نیست.')
    def walk(value, key='', depth=0):
        if depth > 14:
            raise ValueError('ساختار محتوا بیش از حد تو در تو است.')
        if isinstance(value, dict):
            if len(value) > 600:
                raise ValueError('تعداد فیلدها بیش از حد مجاز است.')
            for k, v in value.items():
                if k in ['__proto__', 'constructor', 'prototype']:
                    raise ValueError('فیلد معتبر نیست.')
                walk(v, k, depth+1)
        elif isinstance(value, list):
            if len(value) > 500:
                raise ValueError('تعداد ردیف‌ها بیش از حد مجاز است.')
            for v in value:
                walk(v, key, depth+1)
        elif isinstance(value, str):
            limit = 20000
            if key in ['image', 'logo', 'file'] and value:
                pattern = r'data:application/pdf;base64,JVBERi0[A-Za-z0-9+/=\r\n]*' if key == 'file' else r'data:image/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\r\n]+'
                limit = 2850000 if key == 'file' else 6990800
                if not re.fullmatch(pattern, value):
                    raise ValueError('فایل معتبر نیست.')
            if len(value) > limit:
                raise ValueError('اندازهٔ یک فیلد بیش از حد مجاز است.')
            if key.lower().endswith('url') and key != 'clickUrl' and value:
                url = urlsplit(value)
                if url.scheme not in ['http', 'https'] or not url.hostname or url.username or url.password:
                    raise ValueError('پیوند معتبر نیست.')
        elif value is not None and not isinstance(value, (bool, int, float)):
            raise ValueError('نوع داده معتبر نیست.')
    walk(data)
    return site_features.upgrade_contact(data)


def public_content(data):
    data = copy.deepcopy(data)
    categories = data['productCategories']
    visible = {c['id'] for c in categories if c.get('visible') and not c.get('parentId')}
    visible.update(c['id'] for c in categories if c.get('visible') and c.get('parentId') in visible)
    data['productCategories'] = [c for c in categories if c['id'] in visible]
    allowed_pages = set(MODULES) | {'category:'+c for c in visible}
    for key, module in data['modules'].items():
        module['items'] = [i for i in module['items'] if i.get('status') == 'published' and (key != 'products' or i.get('categoryId') in visible)]
        prefix = 'product' if key == 'products' else 'service' if key == 'services' else key
        allowed_pages.update(prefix+':'+i['id'] for i in module['items'])
    visible_paths={'/','/contact','/about'}|{'/'+k for k in MODULES}|{'/category/'+c for c in visible}
    for key,module in data['modules'].items():
        prefix='product' if key=='products' else 'service' if key=='services' else key
        visible_paths.update('/'+prefix+'/'+i['id'] for i in module['items'])
    data['pageSeo']={k:v for k,v in data.get('pageSeo',{}).items() if k in visible_paths}
    data['pageBanners'] = {k:v for k,v in data.get('pageBanners', {}).items() if k in allowed_pages}
    return data


class Handler(BaseHTTPRequestHandler):
    server_version = 'AVA'
    timeout = 20
    def log_message(self, fmt, *args):
        # Never log cookies, request bodies or passwords.
        super().log_message(fmt, *args)

    def reply(self, code, value, cookie=None, content_type='application/json; charset=utf-8'):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
        compressed=len(body)>1024 and ('text/' in content_type or 'json' in content_type or 'xml' in content_type) and 'gzip' in self.headers.get('Accept-Encoding','')
        if compressed:body=gzip.compress(body,compresslevel=3)
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        if compressed:self.send_header('Content-Encoding','gzip')
        self.send_header('Vary','Accept-Encoding')
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if urlsplit(self.path).path.startswith('/assets/') and code==200 else 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def session(self, db):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookie[self.server.cookie_name].value
        except (KeyError, ValueError, CookieError):
            return None
        return db.execute('SELECT * FROM sessions WHERE token=? AND expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()

    def valid_host(self):
        return self.headers.get('Host', '') == urlsplit(self.server.origin).netloc

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {'error':'میزبان معتبر نیست.'})
        path = urlsplit(self.path).path
        bundled,assets=site_features.asset_bundle(ROOT/'index.html')
        if path in assets:
            blob,mime=assets[path];return self.reply(200,blob,content_type=mime)
        with connect() as db:
            session = self.session(db)
            if path == '/api/stats':
                if not session:return self.reply(401, {'error':'ورود لازم است.'})
                return self.reply(200,site_features.statistics(db))
            if path == '/api/session':
                configured = bool(db.execute('SELECT 1 FROM account').fetchone())
                return self.reply(200, {'authenticated':bool(session), 'configured':configured, 'csrf':session['csrf'] if session else ''})
            row = db.execute('SELECT * FROM content WHERE id=1').fetchone()
            data = json.loads(row['data'])
            if path == '/api/content':
                return self.reply(200, {'revision':row['revision'], 'data':data if session else public_content(data)})
            public=public_content(data)
            if path == '/robots.txt':
                return self.reply(200,site_features.robots_text(self.server.origin).encode(),content_type='text/plain; charset=utf-8')
            if path == '/sitemap.xml':
                return self.reply(200,site_features.xml_sitemap(public,self.server.origin).encode(),content_type='application/xml; charset=utf-8')
            if path in ['/', '/index.html', '/admin','/panel','/panel/'] or path in site_features.pages(public):
                # Always embed public data, even when an administrator requests HTML.
                html = bundled
                seed = json.dumps(public_content(data), ensure_ascii=False).replace('<', '\\u003c')
                html = re.sub(r'(<script id="ava-initial-data" type="application/json">).*?(</script>)', lambda m:m[1]+seed+m[2], html, flags=re.S)
                html = html.replace('<head>', '<head><script id="ava-server-mode" type="application/json">true</script><script id="ava-site-origin" type="application/json">'+json.dumps(self.server.origin).replace('<','\\u003c')+'</script>', 1)
                if path.startswith(('/panel','/admin')):
                    html=html.replace('<head>','<head><meta name="robots" content="noindex,nofollow">',1)
                else:
                    seo=site_features.seo_html(public,'/' if path=='/index.html' else path,self.server.origin)
                    if seo:
                        html=re.sub(r'<title>.*?</title>','',html, count=1,flags=re.S)
                        html=re.sub(r'<meta name="description"[^>]*>','',html,count=1)
                        html=html.replace('</head>',seo[0]+'</head>',1).replace('<div id="public-site">','<div id="public-site" hidden>',1)
                        html=html.replace('</body>',seo[1]+'</body>')
                return self.reply(200, html.encode(), content_type='text/html; charset=utf-8')
        self.reply(404, {'error':'صفحه پیدا نشد.'})

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') != self.server.origin:
            return self.reply(403, {'error':'مبدأ درخواست معتبر نیست.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error':'نوع درخواست معتبر نیست.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > MAX_BODY:
                return self.reply(413, {'error':'حجم درخواست بیش از حد مجاز است.'})
            payload = json.loads(self.rfile.read(size), parse_constant=lambda value: (_ for _ in ()).throw(ValueError('عدد معتبر نیست.')))
            if not isinstance(payload, dict):
                raise ValueError('درخواست معتبر نیست.')
        except (ValueError, UnicodeDecodeError, RecursionError):
            return self.reply(400, {'error':'درخواست JSON معتبر نیست.'})
        path = urlsplit(self.path).path
        with connect() as db:
            if path == '/api/track':
                if len(json.dumps(payload))>1000:return self.reply(400, {'error':'رویداد بزرگ است.'})
                if self.session(db):return self.reply(200, {'ok':True,'ignored':True})
                try:cookie=site_features.record(db,payload,self.headers.get('Cookie',''),public_content(json.loads(db.execute('SELECT data FROM content').fetchone()[0])),not self.server.dev)
                except ValueError as error:return self.reply(400, {'error':str(error)})
                db.commit()
                return self.reply(200, {'ok':True},cookie)
            # Serialize credential/session writes, including concurrent password changes.
            db.execute('BEGIN IMMEDIATE')
            now = time.time()
            db.execute('DELETE FROM sessions WHERE expires<=?', (now,))
            db.execute('DELETE FROM attempts WHERE created<?', (now-900,))
            if path == '/api/login':
                address = hashlib.sha256(self.client_address[0].encode()).hexdigest()
                if db.execute('SELECT COUNT(*) FROM attempts WHERE address=?', (address,)).fetchone()[0] >= 5:
                    return self.reply(429, {'error':'تلاش‌های ورود زیاد است؛ ۱۵ دقیقه بعد دوباره تلاش کنید.'})
                db.execute('INSERT INTO attempts VALUES (?,?)', (address, now))
                password = payload.get('password', '')
                account = db.execute('SELECT * FROM account').fetchone()
                if not isinstance(password, str) or len(password) > 256 or not check_password(password, account):
                    db.commit()
                    return self.reply(401, {'error':'رمز ورود صحیح نیست یا مدیر هنوز تنظیم نشده است.'})
                db.execute('DELETE FROM attempts WHERE address=?', (address,))
                token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
                db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), csrf, now+28800))
                db.commit()
                return self.reply(200, {'authenticated':True, 'csrf':csrf}, self.make_cookie(token, 28800))
            session = self.session(db)
            if not session:
                return self.reply(401, {'error':'برای ذخیرهٔ تغییرات وارد پنل شوید.'})
            if not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
                return self.reply(403, {'error':'شناسهٔ درخواست معتبر نیست؛ دوباره وارد شوید.'})
            if path == '/api/logout':
                db.execute('DELETE FROM sessions WHERE token=?', (session['token'],))
                db.commit()
                return self.reply(200, {'ok':True}, self.make_cookie('', 0))
            if path == '/api/password':
                account = db.execute('SELECT * FROM account').fetchone()
                if not check_password(str(payload.get('currentPassword', ''))[:257], account):
                    return self.reply(403, {'error':'رمز فعلی صحیح نیست.'})
                try:
                    set_password(db, payload.get('password'))
                except ValueError as error:
                    return self.reply(400, {'error':str(error)})
                db.commit()
                return self.reply(200, {'ok':True}, self.make_cookie('', 0))
            if path == '/api/content':
                row = db.execute('SELECT revision FROM content').fetchone()
                if payload.get('revision') != row['revision']:
                    return self.reply(409, {'error':'محتوا در دستگاه دیگری تغییر کرده است. از فرم فعلی کپی بگیرید و صفحه را تازه کنید.'})
                try:
                    content = validate_content(payload.get('data'))
                except (ValueError, TypeError, KeyError) as error:
                    return self.reply(400, {'error':str(error)})
                revision = row['revision']+1
                db.execute('UPDATE content SET revision=?,data=? WHERE id=1', (revision, json.dumps(content, ensure_ascii=False)))
                db.commit()
                return self.reply(200, {'ok':True, 'revision':revision})
        self.reply(404, {'error':'مسیر پیدا نشد.'})

    def make_cookie(self, value, age):
        return f'{self.server.cookie_name}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}' + ('' if self.server.dev else '; Secure')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', nargs='?', choices=['serve', 'set-password'], default='serve')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--dev', action='store_true')
    args = parser.parse_args()
    initialize()
    if args.command == 'set-password':
        password = getpass.getpass('رمز جدید (حداقل ۱۲ نویسه): ')
        if password != getpass.getpass('تکرار رمز: '):
            raise SystemExit('رمزها یکسان نیستند.')
        with connect() as db:
            set_password(db, password)
        print('رمز مدیر تنظیم شد. نشست‌های قبلی بسته شدند.')
        return
    origin = os.environ.get('AVA_PUBLIC_ORIGIN', '').rstrip('/')
    if args.dev:
        if args.host not in ['127.0.0.1', 'localhost']:
            raise SystemExit('--dev فقط برای localhost است.')
        origin = f'http://127.0.0.1:{args.port}'
    elif not origin.startswith('https://') or urlsplit(origin).path:
        raise SystemExit('AVA_PUBLIC_ORIGIN را برابر آدرس HTTPS سایت تنظیم کنید؛ راهنما: DEPLOYMENT-fa.md')
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.origin, httpd.dev = origin, args.dev
    httpd.cookie_name = 'ava_session' if args.dev else '__Host-ava_session'
    print(f'AVA running: {origin}/#admin/dashboard', flush=True)
    httpd.serve_forever()


if __name__ == '__main__':
    main()
