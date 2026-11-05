"""Read-only public SEO check. This does not measure Google indexation or rankings."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from html.parser import HTMLParser
import json
import re
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import urlopen
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

PATHS=['/','/category/urban','/category/urban-indoor','/category/urban-outdoor','/products']

class Document(HTMLParser):
    def __init__(self,source):
        super().__init__();self.meta={};self.title='';self.canonical='';self.in_title=False;self.feed(source)
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='title':self.in_title=True
        if tag=='meta' and attrs.get('name'):self.meta[attrs['name']]=attrs.get('content','')
        if tag=='link' and attrs.get('rel')=='canonical':self.canonical=attrs.get('href','')
    def handle_endtag(self,tag):
        if tag=='title':self.in_title=False
    def handle_data(self,value):
        if self.in_title:self.title+=value

def fetch(url):
    try:
        with urlopen(url,timeout=25) as response:
            limit=12*1024*1024;body=response.read(limit+1)
            if len(body)>limit:return {'status':response.status,'error':'Response exceeds the audit size limit; content not fully checked'}
            source=body.decode('utf-8','replace')
            return {'status':response.status,'final_url':response.url,'source':source}
    except HTTPError as error:return {'status':error.code,'error':str(error)}
    except Exception as error:return {'status':None,'error':str(error)}

def audit(origin,expected_release=None):
    urls=[origin+path for path in PATHS]+[origin+'/robots.txt',origin+'/sitemap.xml']
    with ThreadPoolExecutor(max_workers=4) as pool:responses=dict(zip(urls,pool.map(fetch,urls)))
    report={'origin':origin,'checked_at':datetime.now(ZoneInfo('Asia/Tehran')).isoformat(),'scope':'public technical checks; no Google rankings or Search Console access','pages':[],'issues':[]}
    for path in PATHS:
        url=origin+path;response=responses[url];record={'url':url,'status':response['status'],'issues':[]}
        if response['status']!=200 or response.get('error'):record['issues'].append(response.get('error','HTTP failure'))
        else:
            source=response['source'];doc=Document(source);main=re.search(r'<main id="ava-seo-content"[^>]*>(.*?)</main>',source,re.S)
            record.update(final_url=response['final_url'],release=doc.meta.get('ava-site-release'),title=doc.title,description=doc.meta.get('description'),canonical=doc.canonical,robots=doc.meta.get('robots'),server_content=bool(main),server_product_count=0)
            # Count catalogue entries rather than unrelated navigation list items.
            if main:
                listing=re.search(r'<ul class="server-product-list">(.*?)</ul>',main[1],re.S)
                record['server_product_count']=listing[1].count('<li>') if listing else 0
            if not main:record['issues'].append('Server-rendered main content missing')
            if doc.canonical!=url:record['issues'].append('Canonical differs from the expected page URL')
            if doc.meta.get('robots')!='index,follow':record['issues'].append('Page is not set to index,follow; check product visibility and publication')
            if not doc.title or not doc.meta.get('description'):record['issues'].append('Title or description missing')
            if expected_release and record['release']!=expected_release:record['issues'].append('Expected release not served')
        report['pages'].append(record)
        report['issues'].extend(url+': '+issue for issue in record['issues'])
    robots=responses[origin+'/robots.txt'];sitemap=responses[origin+'/sitemap.xml']
    report['robots_status']=robots['status'];report['sitemap_status']=sitemap['status']
    if robots['status']==200 and not robots.get('error'):
        parser=RobotFileParser();parser.parse(robots['source'].splitlines())
        report['googlebot_allowed']={path:parser.can_fetch('Googlebot',origin+path) for path in PATHS}
        report['issues'].extend('Googlebot disallowed: '+path for path,allowed in report['googlebot_allowed'].items() if not allowed)
    else:report['issues'].append('robots.txt could not be verified: '+robots.get('error','HTTP failure'))
    if sitemap['status']==200 and not sitemap.get('error'):
        try:
            locations={node.text for node in ET.fromstring(sitemap['source']).iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
            report['sitemap_urls']=len(locations)
            report['issues'].extend('Missing from sitemap: '+origin+path for path in PATHS if origin+path not in locations)
        except ET.ParseError:report['issues'].append('Sitemap XML could not be parsed')
    else:report['issues'].append('sitemap.xml could not be verified: '+sitemap.get('error','HTTP failure'))
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--origin',default='https://avagroups.ir');parser.add_argument('--expect-release')
    args=parser.parse_args();parts=urlsplit(args.origin)
    if parts.scheme not in ['http','https'] or not parts.hostname or parts.username or parts.password or parts.path not in ['', '/'] or parts.query or parts.fragment:parser.error('--origin must be an origin URL without credentials, query or path')
    result=audit(args.origin.rstrip('/'),args.expect_release);print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(1 if result['issues'] else 0)
