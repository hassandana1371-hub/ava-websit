import copy,json,sqlite3,unittest
from pathlib import Path
import server_test as fixture
from tools.import_products import import_catalog,ROOT
from tools.refine_products35 import refine
from tools.import_partners36 import import_partners

class PartnerTests(unittest.TestCase):
 setUp=fixture.ServerTest.setUp
 tearDown=fixture.ServerTest.tearDown
 request=fixture.ServerTest.request
 login=fixture.ServerTest.login
 def load_previous(self):
  import_catalog(fixture.app.DB,ROOT/'catalog-import34',True,Path(self.directory.name)/'backups');refine(fixture.app.DB,True,Path(self.directory.name)/'backups')
 def run_import(self,apply=True):return import_partners(fixture.app.DB,ROOT/'partner-import36',apply,Path(self.directory.name)/'backups')
 def data(self):
  with fixture.app.connect() as db:return json.loads(db.execute('SELECT data FROM content').fetchone()[0])
 def test_link_existing_without_price_image_status_overwrite_or_duplicate(self):
  self.load_previous();before=self.data();self.assertEqual(self.run_import(False)['linked'],42);self.assertEqual(self.data(),before)
  report=self.run_import();data=self.data();self.assertEqual((report['inserted'],report['linked'],report['total_products'],report['price_adjusted']),(0,42,297,0));self.assertEqual(report['categories'],{'مگنت':0,'پاور':10,'ریسیور':6,'سندر':7,'پروسسور':19})
  old={p['id']:p for p in before['modules']['products']['items']}
  for p in data['modules']['products']['items']:
   for key in ['priceAmount','priceUnit','priceKind','image','status','categoryId','priceOptions']:self.assertEqual(p.get(key),old[p['id']].get(key))
  lcb=next(p for p in data['modules']['products']['items'] if p.get('externalId')=='ava-led-catalog:ava-51-06');self.assertEqual(lcb['priceAmount'],85800000)
  nv=next(p for p in data['modules']['products']['items'] if p.get('externalId')=='ava-led-catalog:ava-51-07');self.assertEqual(nv['title'],'NovaStar NV7508')
  with sqlite3.connect(report['backup']) as db:self.assertEqual(json.loads(db.execute('SELECT data FROM content').fetchone()[0]),before)
  self.run_import();self.assertEqual(self.data(),data)
 def test_partner_catalogue_excludes_modules_but_keeps_legacy_page_and_other_products(self):
  self.load_previous();self.run_import();public=json.loads(self.request('/api/content',**{'X-AvA-Media':'references'})[2])['data'];groups=fixture.app.site_features.partner_groups(public)
  self.assertEqual([g['title'] for g in groups],['مگنت','پاور','ریسیور','سندر','پروسسور']);self.assertEqual(len(fixture.app.site_features.partner_products(public)),42)
  html=self.request('/partners')[2].decode();self.assertIn('۸۵٬۸۰۰٬۰۰۰',html);self.assertNotIn('href="/equipment/led-module"',html);self.assertNotIn('priceUsd',html);self.assertNotIn('rateTomanPerUsd',html)
  self.assertEqual(self.request('/equipment/led-module')[0],200)
  self.assertTrue(any(p['id']=='led-module' for p in self.data()['modules']['equipment']['items']))
  for id,count in [('power-supply',10),('receiving-card',6),('sending-card',7),('processor',19),('magnet',0)]:self.assertEqual(len(fixture.app.site_features.partner_products(public,id)),count)
 def test_manual_price_photo_hidden_status_and_deletion_survive_rerun(self):
  self.load_previous();self.run_import();self.login();payload=json.loads(self.request('/api/content',**{'X-AvA-Media':'references'})[2]);products=payload['data']['modules']['products']['items'];lcb=next(p for p in products if p.get('externalId')=='ava-led-catalog:ava-51-06');lcb.update(priceAmount=999,priceKind='sale',image='',status='draft')
  removed=next(p for p in products if p.get('externalId')=='ava-led-catalog:ava-51-07');products.remove(removed);self.assertEqual(self.request('/api/content',payload)[0],200)
  report=self.run_import();self.assertEqual(report['inserted'],0);self.assertEqual(report['skipped_deleted'],1);lcb=next(p for p in self.data()['modules']['products']['items'] if p.get('externalId')=='ava-led-catalog:ava-51-06');self.assertEqual((lcb['priceAmount'],lcb['image'],lcb['status']),(999,'','draft'))
  self.assertEqual(len(fixture.app.site_features.partner_products(json.loads(self.request('/api/content',**{'X-AvA-Media':'references'})[2])['data'])),40)
 def test_fresh_import_uses_final_price_and_shared_tombstone(self):
  report=self.run_import();self.assertEqual(report['inserted'],42);self.assertEqual(report['total_products'],66)
  data=self.data();lcb=next(p for p in data['modules']['products']['items'] if p.get('externalId')=='ava-led-catalog:ava-51-06');self.assertEqual(lcb['priceAmount'],85800000);self.assertEqual(sum(p['priceKind']=='quote' for p in data['modules']['products']['items'] if p.get('partnerCategoryId')),41)
  refine(fixture.app.DB,True,Path(self.directory.name)/'backups');data=self.data();lcb=next(p for p in data['modules']['products']['items'] if p.get('externalId')=='ava-led-catalog:ava-51-06');self.assertEqual(lcb['priceAmount'],85800000)
  data['modules']['products']['items'].remove(lcb)
  with fixture.app.connect() as db:db.execute('UPDATE content SET revision=revision+1,data=?',(json.dumps(data),))
  self.assertEqual(self.run_import()['skipped_deleted'],1)
  import_catalog(fixture.app.DB,ROOT/'catalog-import34',True,Path(self.directory.name)/'backups');self.assertFalse(any(p.get('externalId')=='ava-led-catalog:ava-51-06' for p in self.data()['modules']['products']['items']))

 def test_existing_synonym_category_and_manual_magnet_are_preserved(self):
  data=self.data();equipment=data['modules']['equipment']['items'];power=next(p for p in equipment if p['id']=='power-supply');power.update(id='custom-power',title='منبع تغذیه سفارشی')
  magnet=copy.deepcopy(data['modules']['products']['items'][0]);magnet.update(id='manual-magnet',title='مگنت موجود مدیر',imageAsset='',partnerCategoryId='magnet',priceAmount=75000);data['modules']['products']['items'].append(magnet)
  with fixture.app.connect() as db:db.execute('UPDATE content SET revision=revision+1,data=?',(json.dumps(data),))
  report=self.run_import();after=self.data();self.assertEqual(len(after['modules']['equipment']['items']),len(equipment));self.assertNotIn('power-supply',{p['id'] for p in after['modules']['equipment']['items']});self.assertIn('custom-power',after['partnerCatalog']['categories']);self.assertEqual(report['categories']['مگنت'],1)
  self.assertEqual(next(p for p in after['modules']['products']['items'] if p['id']=='manual-magnet'),magnet)
