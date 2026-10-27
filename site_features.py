"""Public SEO documents and persistent, first-party aggregate analytics."""
import datetime as dt
import hashlib
import html
import json
import secrets
from http.cookies import SimpleCookie, CookieError
from zoneinfo import ZoneInfo

TZ=ZoneInfo('Asia/Tehran')
def initialize(db):
    db.executescript('''CREATE TABLE IF NOT EXISTS site_metrics_meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS site_metrics(day TEXT,path TEXT,visitor TEXT,event TEXT,total INTEGER,PRIMARY KEY(day,path,visitor,event));''')

def pages(data):
    result={'/':{'title':data['header']['nameFa'],'description':data['hero']['description'],'body':data['hero']['description']}}
    for key,module in data['modules'].items():
        result['/'+key]={'title':module['name'],'description':module['description'],'body':module['description']}
        if key not in ['products','services','equipment']:continue
        prefix={'products':'product','services':'service','equipment':'equipment'}[key]
        for item in module['items']:
            result['/'+prefix+'/'+item['id']]={'title':item.get('seoTitle') or item['title'],'description':item.get('seoDescription') or item['summary'],'body':item['body'],'specs':item.get('specifications',[]),'product':key=='products'}
    for c in data['productCategories']:
        result['/category/'+c['id']]={'title':c['name'],'description':c['description'],'body':c['description']}
    result['/contact']={'title':data['contact']['title'],'description':data['contact']['description'],'body':'\n'.join(data['contact'].get(k,'') for k in ['address','phone','email'])}
    for path,seo in data.get('pageSeo',{}).items():
        if path in result:
            for field in ['title','description']:
                if seo.get(field):result[path][field]=seo[field]
    return result

def seo_html(data,path,origin):
    all_pages=pages(data);p=all_pages.get(path)
    if not p:return None
    esc=html.escape
    title=p['title']+' | AvA Groups';description=p['description'][:320]
    head='<title>'+esc(title)+'</title><meta name="description" content="'+esc(description,quote=True)+'"><link rel="canonical" href="'+esc(origin+path,quote=True)+'"><meta property="og:title" content="'+esc(title,quote=True)+'"><meta property="og:description" content="'+esc(description,quote=True)+'"><meta property="og:url" content="'+esc(origin+path,quote=True)+'">'
    links=''.join('<li><a href="'+esc(url,quote=True)+'">'+esc(record['title'])+'</a></li>' for url,record in all_pages.items())
    specs=''.join('<tr><th>'+esc(s['label'])+'</th><td>'+esc(s['value'])+'</td></tr>' for s in p.get('specs',[]))
    body='<main id="ava-seo-content" dir="rtl"><h1>'+esc(p['title'])+'</h1><p>'+esc(description)+'</p><div style="white-space:pre-line">'+esc(p.get('body',''))+'</div>'
    if specs:body+='<h2>مشخصات فنی</h2><table>'+specs+'</table>'
    body+='<nav aria-label="صفحات سایت"><ul>'+links+'</ul></nav></main>'
    return head,body

def xml_sitemap(data,origin):
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+html.escape(origin+p)+'</loc></url>' for p in pages(data))+'</urlset>'

def record(db,payload,cookie_header,data,secure):
    path=payload.get('path');event=payload.get('event')
    if path not in pages(data) or event not in ['pageview','contact-phone','contact-email','contact-request','contact-link']:raise ValueError('رویداد معتبر نیست.')
    try:
        cookies=SimpleCookie(cookie_header);token=cookies['ava_visitor'].value
    except (KeyError,ValueError,CookieError):token=''
    if len(token)!=43 or not all(c.isalnum() or c in '-_' for c in token):token=secrets.token_urlsafe(32)
    visitor=hashlib.sha256(token.encode()).hexdigest();now=dt.datetime.now(TZ);day=now.date().isoformat()
    # Bound duplicate bursts per visitor/page/day without collecting IP addresses.
    row=db.execute('SELECT total FROM site_metrics WHERE day=? AND path=? AND visitor=? AND event=?',(day,path,visitor,event)).fetchone()
    if not row or row[0]<500:
        db.execute('INSERT INTO site_metrics VALUES (?,?,?,?,1) ON CONFLICT(day,path,visitor,event) DO UPDATE SET total=total+1',(day,path,visitor,event))
        db.execute('INSERT OR IGNORE INTO site_metrics_meta VALUES (?,?)',('started_at',now.isoformat()))
    return 'ava_visitor='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'+('; Secure' if secure else '')

def statistics(db):
    today=dt.datetime.now(TZ).date();periods={}
    for key,days in [('today',1),('week',7),('month',30)]:
        since=(today-dt.timedelta(days=days-1)).isoformat()
        row=db.execute("SELECT COALESCE(SUM(total),0),COUNT(DISTINCT visitor) FROM site_metrics WHERE event='pageview' AND day>=?",(since,)).fetchone()
        periods[key]={'views':row[0],'visitors':row[1]}
    started=db.execute("SELECT value FROM site_metrics_meta WHERE key='started_at'").fetchone()
    top=[dict(r) for r in db.execute("SELECT path,SUM(total) views FROM site_metrics WHERE event='pageview' GROUP BY path ORDER BY views DESC LIMIT 20")]
    products=[dict(r) for r in db.execute("SELECT path,SUM(total) views FROM site_metrics WHERE event='pageview' AND path LIKE '/product/%' GROUP BY path ORDER BY views DESC LIMIT 20")]
    clicks=[dict(r) for r in db.execute("SELECT event,SUM(total) clicks FROM site_metrics WHERE event!='pageview' GROUP BY event ORDER BY clicks DESC")]
    return {'startedAt':started[0] if started else None,'timezone':'Asia/Tehran','periods':periods,'topPages':top,'topProducts':products,'contactClicks':clicks}

# Serve bundled default media/font files independently, with immutable URLs.
# User content data URIs stay inside the seed so existing uploads validate unchanged.
import base64
import re
_ASSET_CACHE={}
def asset_bundle(file):
    stamp=file.stat().st_mtime_ns
    if _ASSET_CACHE.get('stamp')==stamp:return _ASSET_CACHE['html'],_ASSET_CACHE['assets']
    source=file.read_text();assets={}
    def externalize(match):
        mime,encoded=match.group(1),match.group(2)
        blob=base64.b64decode(encoded);ext={'image/webp':'webp','image/jpeg':'jpg','font/woff2':'woff2'}.get(mime,'bin')
        path='/assets/'+hashlib.sha256(blob).hexdigest()[:32]+'.'+ext;assets[path]=(blob,mime);return path
    pattern=r'data:(image/webp|image/jpeg|font/woff2);base64,([A-Za-z0-9+/=]+)'
    for identifier in ['ava-hero-images','ava-product-images']:
        source=re.sub(r'(<script id="'+identifier+r'"[^>]*>)(.*?)(</script>)',lambda m:m[1]+re.sub(pattern,externalize,m[2])+m[3],source,flags=re.S)
    source=re.sub(r'data:(font/woff2);base64,([A-Za-z0-9+/=]+)',externalize,source)
    _ASSET_CACHE.update(stamp=stamp,html=source,assets=assets)
    return source,assets
