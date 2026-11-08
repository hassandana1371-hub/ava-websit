import copy,json,sqlite3,unittest
from pathlib import Path
import server_test as fixture
from tools.import_products import import_catalog,ROOT
from tools.refine_products35 import refine

class RefineTests(unittest.TestCase):
 setUp=fixture.ServerTest.setUp
 tearDown=fixture.ServerTest.tearDown
 request=fixture.ServerTest.request
 login=fixture.ServerTest.login
 def setup_catalog(self):
  import_catalog(fixture.app.DB,ROOT/'catalog-import34',True,Path(self.directory.name)/'backups')
 def data(self):
  with fixture.app.connect() as db:return json.loads(db.execute('SELECT data FROM content').fetchone()[0])
 def adjust(self,apply=True):return refine(fixture.app.DB,apply,Path(self.directory.name)/'backups')
 def test_exact_rental_branches_price_rounding_and_no_repeated_increase(self):
  self.setup_catalog();before=self.data();dry=self.adjust(False);self.assertEqual(self.data(),before)
  report=self.adjust();data=self.data();self.assertEqual([report[k] for k in ['moved_indoor','moved_outdoor','moved_flexible','angled','base_prices','option_prices']],[28,24,7,16,212,172]);self.assertEqual(report['unclassified'],[])
  children={c['id']:c['name'] for c in data['productCategories'] if c.get('parentId')=='rental'}
  self.assertEqual(children,{'rental-indoor':'داخلی','rental-outdoor':'خارجی','rental-flexible':'Flexible','led-angled':'فارسی‌بر ۹۰ درجه'})
  for old,new in zip(before['modules']['products']['items'],data['modules']['products']['items']):
   self.assertEqual(new['image'],old['image']);self.assertEqual(new.get('externalId'),old.get('externalId'));self.assertEqual(new['priceAmount'],None if old['priceAmount'] is None else (old['priceAmount']*110+50)//100)
   for a,b in zip(old.get('priceOptions',[]),new.get('priceOptions',[])):self.assertEqual(b['priceAmount'],(a['priceAmount']*110+50)//100)
  self.assertTrue(self.adjust()['already_applied']);self.assertEqual(self.data(),data)
  with sqlite3.connect(report['backup']) as db:self.assertEqual(json.loads(db.execute('SELECT data FROM content').fetchone()[0]),before)
  self.assertEqual(self.request('/category/led-curved')[:2][0],301);self.assertEqual(self.request('/category/led-curved')[1]['Location'],'/category/rental-flexible')
 def test_manual_price_before_adjustment_and_after_adjustment_is_preserved(self):
  self.setup_catalog();data=self.data();item=data['modules']['products']['items'][24];item['priceAmount']=111;item['priceOptions'][0]['priceAmount']=45
  with fixture.app.connect() as db:db.execute('UPDATE content SET revision=revision+1,data=?',(json.dumps(data),))
  self.adjust();self.assertEqual(self.data()['modules']['products']['items'][24]['priceAmount'],122);self.assertEqual(self.data()['modules']['products']['items'][24]['priceOptions'][0]['priceAmount'],50)
  with fixture.app.connect() as db:
   data=self.data();data['modules']['products']['items'][24]['priceAmount']=999;db.execute('UPDATE content SET revision=revision+1,data=?',(json.dumps(data),))
  self.adjust();self.assertEqual(self.data()['modules']['products']['items'][24]['priceAmount'],999)
 def test_theme_effect_validation_and_ssr_font_settings(self):
  self.login();payload=json.loads(self.request('/api/content')[2]);data=payload['data']
  data['typography']=dict(body='Vazirmatn',headings='Estedad',navigation='Tahoma',products='Vazirmatn',content='inherit',bodySize=16,headingWeight=800)
  data['hero'].update(transition='cube',transitionDuration=1200)
  self.assertEqual(self.request('/api/content',payload)[0],200)
  html=self.request('/')[2].decode();self.assertIn('id="ava-typography"',html);self.assertIn('--ava-nav-font:Tahoma,sans-serif',html);self.assertIn('--ava-body-size:16px',html)
  for field,value in [('transition','css-injection'),('transitionDuration',4000)]:
   bad=json.loads(self.request('/api/content')[2]);bad['data']['hero'][field]=value;self.assertEqual(self.request('/api/content',bad)[0],400)
  bad=json.loads(self.request('/api/content')[2]);bad['data']['typography']['body']='evil;font:url(https://invalid.test)';self.assertEqual(self.request('/api/content',bad)[0],400)
  fixture.app.initialize();self.assertEqual(self.data()['hero']['transition'],'cube');self.assertEqual(self.data()['typography']['products'],'Vazirmatn')
