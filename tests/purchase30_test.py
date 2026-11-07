"""Buying-page catalogue, accurate reference prices, public schema and HTTP aliases."""
import copy
import http.client
import json
import re
import subprocess
from pathlib import Path
import unittest

import server_test as fixture
from seo24_test import Document, VisibleContent

class PurchaseTests(unittest.TestCase):
    setUp=fixture.ServerTest.setUp
    tearDown=fixture.ServerTest.tearDown
    request=fixture.ServerTest.request
    login=fixture.ServerTest.login

    def main(self,path):
        status,headers,body=self.request(path)
        self.assertEqual(status,200)
        text=body.decode()
        main=re.search(r'<main id="ava-seo-content"[^>]*>(.*?)</main>',text,re.S)[1]
        return Document(text),VisibleContent(main),main

    def test_buyer_catalogue_is_readable_without_javascript_and_does_not_invent_offers(self):
        document,content,main=self.main('/category/urban')
        self.assertIn('خرید تلویزیون شهری',document.title)
        self.assertIn('مدل‌ها و قیمت‌های ثبت‌شده',content.text)
        self.assertIn('قیمت مرجع هر ماژول: ۱۲٬۲۳۱٬۰۰۰ تومان',content.text)
        self.assertIn('2026-10-22',content.text)
        self.assertIn('/product/indoor-125',content.links)
        self.assertNotIn('/product/trailer-p29',content.links)
        self.assertLess(main.index('class="server-catalogue"'),main.index('راهنمای خرید تلویزیون شهری و مقایسه'))
        graph=document.schema[0]['@graph'];listing=next(x for x in graph if x['@type']=='ItemList')
        self.assertEqual(listing['numberOfItems'],len(listing['itemListElement']))
        self.assertEqual([x['position'] for x in listing['itemListElement']],list(range(1,listing['numberOfItems']+1)))
        self.assertEqual(next(x for x in graph if x['@type']=='CollectionPage')['mainEntity']['@id'],listing['@id'])
        self.assertNotIn('offers',json.dumps(graph))
        self.assertNotIn('aggregateRating',json.dumps(graph))
        _,quote,_=self.main('/category/led-trailers')
        self.assertIn('استعلام قیمت',quote.text)
        _,detail,_=self.main('/product/indoor-125')
        self.assertIn('قیمت مرجع هر ماژول: ۱۲٬۲۳۱٬۰۰۰ تومان',detail.text)

    def test_private_products_stay_out_of_catalogue_and_schema_and_data_is_not_rewritten(self):
        self.login();result=json.loads(self.request('/api/content')[2]);data=result['data']
        product=data['modules']['products']['items'][0]
        product['title']='نام سفارشی محصول'
        product['priceAmount']=87654321
        draft=copy.deepcopy(product);draft.update(id='private-catalogue',title='HIDDEN PRIVATE TITLE',status='draft')
        data['modules']['products']['items'].append(draft)
        next(c for c in data['productCategories'] if c['id']=='urban-outdoor')['visible']=False
        self.assertEqual(self.request('/api/content',{'revision':result['revision'],'data':data})[0],200)
        with fixture.app.connect() as db:
            before=db.execute('SELECT data FROM content').fetchone()[0]
            account=tuple(db.execute('SELECT * FROM account').fetchone())
        self.cookie=self.csrf=''
        document,content,main=self.main('/products')
        self.assertIn('نام سفارشی محصول',content.text)
        self.assertIn('۸۷٬۶۵۴٬۳۲۱',content.text)
        self.assertNotIn('HIDDEN PRIVATE TITLE',main)
        listing=next(x for x in document.schema[0]['@graph'] if x['@type']=='ItemList')
        urls=[x['url'] for x in listing['itemListElement']]
        self.assertFalse(any(x.endswith('/private-catalogue') for x in urls))
        self.assertFalse(any(x.endswith('/outdoor-25') for x in urls))
        fixture.app.initialize()
        with fixture.app.connect() as db:
            self.assertEqual(db.execute('SELECT data FROM content').fetchone()[0],before)
            self.assertEqual(tuple(db.execute('SELECT * FROM account').fetchone()),account)

    def test_public_audit_tool_checks_real_http_pages_without_authentication(self):
        result=subprocess.run(['python3',str(Path(__file__).resolve().parents[1]/'tools/check_seo.py'),'--origin',self.server.origin,'--expect-release','33'],capture_output=True,text=True,timeout=40)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        report=json.loads(result.stdout)
        self.assertEqual(report['issues'],[])
        self.assertTrue(all(report['googlebot_allowed'].values()))
        self.assertTrue(next(p for p in report['pages'] if p['url'].endswith('/category/urban'))['server_product_count']>0)
        self.assertNotIn('averagePosition',report)

    def test_canonical_redirects_and_head_responses(self):
        for path,target in [('/index.html','/'),('/index.html?utm_source=test','/?utm_source=test'),('/category/urban/','/category/urban'),('/products/?utm_campaign=led','/products?utm_campaign=led')]:
            status,headers,body=self.request(path)
            self.assertEqual(status,301,path)
            self.assertEqual(headers['Location'],target)
            self.assertEqual(body,b'')
        self.assertEqual(self.request('/not-a-page/')[0],404)
        for path,status in [('/',200),('/robots.txt',200),('/sitemap.xml',200),('/category/urban/',301),('/not-a-page/',404)]:
            connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
            connection.request('HEAD',path)
            response=connection.getresponse()
            self.assertEqual(response.status,status,path)
            self.assertEqual(response.read(),b'')
            if status==200:self.assertGreater(int(response.getheader('Content-Length')),0)
            connection.close()

if __name__=='__main__':unittest.main()
