"""Public SEO documents and persistent, first-party aggregate analytics."""
from pathlib import Path
import re
_SEARCH_CACHE={}
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

def search_defaults():
    """Versioned copy is bundled in HTML; no database migration overwrites edits."""
    file=Path(__file__).with_name('index.html');stamp=file.stat().st_mtime_ns
    if _SEARCH_CACHE.get('stamp')!=stamp:
        match=re.search(r'<script id="ava-search-content"[^>]*>(.*?)</script>',file.read_text(),re.S)
        _SEARCH_CACHE.update(stamp=stamp,data=json.loads(match[1]) if match else {})
    return _SEARCH_CACHE['data']

def company_description(data):
    return data.get('company',{}).get('description') or 'گروه آوا در زمینهٔ فروش و اجارهٔ نمایشگر LED و تلویزیون شهری فعالیت می‌کند. محصولات و خدمات مرتبط را بررسی کنید و برای انتخاب متناسب با محل نصب یا رویداد، درخواست مشاوره و استعلام بفرستید.'

def robots_text(origin):
    # Named groups repeat restrictions because robots rules are not inherited.
    groups=[]
    for agent in ['*','OAI-SearchBot','ChatGPT-User']:
        groups.append('User-agent: '+agent+'\nDisallow: /panel\nDisallow: /admin\nDisallow: /api/\nAllow: /\n')
    return '\n'.join(groups)+'\nSitemap: '+origin+'/sitemap.xml\n'

def pages(data):
    brand=data['header']['nameFa']
    result={'/':{'title':brand,'heading':brand,'description':data['hero']['description'],'body':data['hero']['description'],'indexable':True}}
    product_items=data['modules']['products']['items']
    for key,module in data['modules'].items():
        result['/'+key]={'title':module['name'],'heading':module['name'],'description':module['description'],'body':module['description'],'indexable':bool(module['items']) or key=='contact'}
        if key not in ['products','services','equipment']:continue
        prefix={'products':'product','services':'service','equipment':'equipment'}[key]
        for item in module['items']:
            result['/'+prefix+'/'+item['id']]={'title':item['title'],'heading':item['title'],'description':item['summary'],'body':item['body'],'specs':item.get('specifications',[]),'product':key=='products','item':item,'kind':prefix,'indexable':True}
    for c in data['productCategories']:
        ids={c['id']}|{child['id'] for child in data['productCategories'] if child.get('parentId')==c['id']}
        result['/category/'+c['id']]={'title':c['name'],'heading':c.get('banner',{}).get('title') or c['name'],'description':c['description'],'body':c['description'],'indexable':any(i['categoryId'] in ids for i in product_items),'category':c}
    result['/contact']={'title':data['contact']['title'],'heading':data['contact']['title'],'description':data['contact']['description'],'body':'\n'.join(data['contact'].get(k,'') for k in ['address','phone','email']),'indexable':True}
    result['/about']={'title':'دربارهٔ '+brand,'heading':'دربارهٔ '+brand,'description':company_description(data)[:320],'body':'\n'.join(filter(None,[company_description(data),data.get('company',{}).get('serviceArea',''),*[data['contact'].get(k,'') for k in ['phone','email','address']]])),'indexable':True}
    defaults=search_defaults()
    for path,p in result.items():
        default=defaults.get(path,{});custom=data.get('pageSeo',{}).get(path,{})
        for field in ['title','description']:
            p[field]=custom.get(field) or default.get(field) or p[field]
        # Product/service editor fields have consistent priority in SSR and browser.
        item=p.get('item',{})
        p['title']=item.get('seoTitle') or p['title'];p['description']=item.get('seoDescription') or p['description']
        copy={**default,**{k:v for k,v in custom.items() if k not in ['title','description']}}
        if copy.get('showContent',True) and (copy.get('intro') or copy.get('sections')):
            p['copy']=copy
        if path=='/' and p.get('copy'):p['heading']=copy.get('heading') or p['heading']
    for p in result.values():
        if p.get('copy'):
            p['copy']={**p['copy'],'links':[link for link in p['copy'].get('links',[]) if link['path'] in result and result[link['path']]['indexable']]}
    return result

def breadcrumb(data,path,all_pages):
    trail=[{'name':'خانه','path':'/'}]
    if path=='/':return trail
    p=all_pages[path];kind=p.get('kind')
    if path.startswith('/category/') or kind=='product':
        trail.append({'name':data['modules']['products']['name'],'path':'/products'})
        category=p.get('category') or next((c for c in data['productCategories'] if c['id']==p.get('item',{}).get('categoryId')),None)
        if category:
            parent=next((c for c in data['productCategories'] if c['id']==category.get('parentId')),None)
            if parent:trail.append({'name':parent['name'],'path':'/category/'+parent['id']})
            if '/category/'+category['id']!=path:trail.append({'name':category['name'],'path':'/category/'+category['id']})
    elif kind=='service':trail.append({'name':data['modules']['services']['name'],'path':'/services'})
    trail.append({'name':p['heading'],'path':path})
    return trail

def structured_data(data,path,origin,all_pages=None):
    all_pages=all_pages or pages(data);p=all_pages[path];org=origin+'/#organization';url=origin+path
    graph=[{'@type':'Organization','@id':org,'name':data['header']['nameEn'] or data['header']['nameFa'],'alternateName':data['header']['nameFa'],'url':origin+'/'},
           {'@type':'WebSite','@id':origin+'/#website','url':origin+'/','name':data['header']['nameFa'],'inLanguage':'fa-IR','publisher':{'@id':org}},
           {'@type':'AboutPage' if path=='/about' else 'CollectionPage' if path=='/products' or path.startswith('/category/') else 'WebPage','@id':url+'#webpage','url':url,'name':p['title']+' | AvA Groups','description':p['description'][:320],'inLanguage':'fa-IR','isPartOf':{'@id':origin+'/#website'}},
           {'@type':'BreadcrumbList','@id':url+'#breadcrumb','itemListElement':[{'@type':'ListItem','position':n+1,'name':c['name'],'item':origin+c['path']} for n,c in enumerate(breadcrumb(data,path,all_pages))]}]
    graph[0]['description']=company_description(data)
    if data.get('company',{}).get('serviceArea'):graph[0]['areaServed']=data['company']['serviceArea']
    contact={k:data['contact'].get(v,'').strip() for k,v in [('telephone','phone'),('email','email')]}
    contact={k:v for k,v in contact.items() if v}
    if contact:graph[0]['contactPoint']={'@type':'ContactPoint','contactType':'فروش و پشتیبانی',**contact}
    if path=='/about':graph[2]['mainEntity']={'@id':org}
    item=p.get('item')
    if item and p.get('kind') in ['product','service']:
        entity={'@type':'Product' if p['kind']=='product' else 'Service','@id':url+'#entity','name':item['title'],'description':item['summary'],'url':url,'mainEntityOfPage':{'@id':url+'#webpage'}}
        if p['kind']=='product':
            entity['sku']=item['id']
            if item.get('model'):entity['model']=item['model']
        else:entity['provider']={'@id':org}
        graph.append(entity)
    return {'@context':'https://schema.org','@graph':graph}

def related_links(data,path,all_pages):
    p=all_pages[path];links=list(p.get('copy',{}).get('links',[]))
    if path=='/' and not links:links=[{'path':'/products','label':'محصولات نمایشگر LED'},{'path':'/services','label':'خدمات نمایشگر LED'}]
    elif path=='/products' or path.startswith('/category/'):
        category=p.get('category');ids=None
        if category:ids={category['id']}|{c['id'] for c in data['productCategories'] if c.get('parentId')==category['id']}
        links.extend({'path':'/product/'+i['id'],'label':i['title']} for i in data['modules']['products']['items'] if ids is None or i.get('categoryId') in ids)
    elif path=='/services':links.extend({'path':'/service/'+i['id'],'label':i['title']} for i in data['modules']['services']['items'])
    elif p.get('kind')=='product':links.extend([{'path':'/category/'+p['item']['categoryId'],'label':'محصولات همین دسته'},{'path':'/contact','label':'استعلام محصول'}])
    elif p.get('kind')=='service':links.append({'path':'/contact','label':'درخواست این خدمت'})
    if path in ['/','/contact']:links.append({'path':'/about','label':'معرفی گروه آوا'})
    if path=='/about':links.extend([{'path':'/products','label':'محصولات نمایشگر LED'},{'path':'/services','label':'خدمات و اجاره'},{'path':'/contact','label':'تماس با آوا'}])
    seen=set();out=[]
    for link in links:
        if link['path']!=path and link['path'] not in seen and link['path'] in all_pages and all_pages[link['path']]['indexable']:
            out.append(link);seen.add(link['path'])
    return out

def seo_html(data,path,origin):
    all_pages=pages(data);p=all_pages.get(path)
    if not p:return None
    esc=html.escape;title=p['title']+' | AvA Groups';description=p['description'][:320]
    robots='index,follow' if p['indexable'] else 'noindex,follow'
    head='<title>'+esc(title)+'</title><meta name="description" content="'+esc(description,quote=True)+'"><meta name="robots" content="'+robots+'"><link rel="canonical" href="'+esc(origin+path,quote=True)+'">'
    for name,value in [('og:title',title),('og:description',description),('og:url',origin+path),('og:locale','fa_IR'),('og:type','website')]:head+='<meta property="'+name+'" content="'+esc(value,quote=True)+'">'
    schema=json.dumps(structured_data(data,path,origin,all_pages),ensure_ascii=False).replace('<','\\u003c')
    head+='<script id="ava-structured-data" type="application/ld+json">'+schema+'</script>'
    crumbs=' / '.join('<a href="'+esc(c['path'],quote=True)+'">'+esc(c['name'])+'</a>' for c in breadcrumb(data,path,all_pages))
    body='<main id="ava-seo-content" dir="rtl"><nav aria-label="مسیر صفحه">'+crumbs+'</nav><h1>'+esc(p['heading'])+'</h1><p>'+esc(description)+'</p>'
    copy=p.get('copy')
    if copy:
        if path!='/':body+='<h2>'+esc(copy.get('heading') or p['heading'])+'</h2>'
        body+='<p>'+esc(copy.get('intro',''))+'</p>'
        for section in copy.get('sections',[]):body+='<h2>'+esc(section['heading'])+'</h2><p>'+esc(section['body'])+'</p>'
    if p.get('body'):body+='<div style="white-space:pre-line">'+esc(p['body'])+'</div>'
    specs=''.join('<tr><th>'+esc(s['label'])+'</th><td>'+esc(s['value'])+'</td></tr>' for s in p.get('specs',[]))
    if specs:body+='<h2>مشخصات فنی</h2><table>'+specs+'</table>'
    links=''.join('<li><a href="'+esc(c['path'],quote=True)+'">'+esc(c['label'])+'</a></li>' for c in related_links(data,path,all_pages))
    if links:body+='<nav aria-label="صفحات مرتبط"><ul>'+links+'</ul></nav>'
    return head,body+'</main>'

def xml_sitemap(data,origin):
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+html.escape(origin+p)+'</loc></url>' for p,record in pages(data).items() if record['indexable'])+'</urlset>'

def record(db,payload,cookie_header,data,secure):
    path=payload.get('path');event=payload.get('event')
    if not isinstance(path,str) or not isinstance(event,str) or path not in pages(data) or event not in ['pageview','contact-phone','contact-email','contact-request','contact-link']:raise ValueError('رویداد معتبر نیست.')
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
