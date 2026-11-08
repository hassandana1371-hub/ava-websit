"""Additive catalogue migration, persistence, privacy and idempotency regressions."""
import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import server_test as fixture
from tools.import_products import import_catalog,read_manifest,ROOT

PACKAGE=ROOT/'catalog-import34'

class ImportTests(unittest.TestCase):
    setUp=fixture.ServerTest.setUp
    tearDown=fixture.ServerTest.tearDown
    request=fixture.ServerTest.request
    login=fixture.ServerTest.login
    def run_import(self,apply=True):
        return import_catalog(fixture.app.DB,PACKAGE,apply,Path(self.directory.name)/'backups')
    def data(self):
        with fixture.app.connect() as db:return json.loads(db.execute('SELECT data FROM content').fetchone()[0])
    def test_backup_dry_run_and_additive_import_preserve_existing_data(self):
        before=self.data()
        with fixture.app.connect() as db:
            db.execute('CREATE TABLE warehouse_sentinel(value TEXT)');db.execute("INSERT INTO warehouse_sentinel VALUES('DO NOT CHANGE')")
            account=tuple(db.execute('SELECT * FROM account').fetchone())
        dry=self.run_import(False);self.assertEqual(dry['inserted'],273);self.assertEqual(self.data(),before)
        report=self.run_import();self.assertEqual((report['inserted'],report['updated'],report['total_products']),(273,0,297))
        after=self.data();self.assertEqual(after['modules']['products']['items'][:24],before['modules']['products']['items'])
        for key in before:
            if key not in ('modules','productCategories','updatedAt'):self.assertEqual(after[key],before[key])
        for key in before['modules']:
            if key!='products':self.assertEqual(after['modules'][key],before['modules'][key])
        self.assertEqual(len(report['categories_added']),5)
        with sqlite3.connect(report['backup']) as db:self.assertEqual(json.loads(db.execute('SELECT data FROM content').fetchone()[0]),before)
        with fixture.app.connect() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM account').fetchone()),account)
            self.assertEqual(db.execute('SELECT value FROM warehouse_sentinel').fetchone()[0],'DO NOT CHANGE')
    def test_all_rows_prices_units_options_and_images_map_without_guessing(self):
        report=self.run_import();data=self.data();rows=read_manifest(PACKAGE)['products'];by_id={p.get('externalId'):p for p in data['modules']['products']['items']}
        self.assertEqual(len(report['unit_review']),69);self.assertEqual(len(report['inquiry']),6);self.assertEqual(len(report['missing_images']),11)
        self.assertEqual(report['options_products'],124)
        for row in rows:
            item=by_id[row['externalId']]
            self.assertEqual(item['priceAmount'],row['priceToman'] if row['priceStatus']=='priced' else None)
            self.assertEqual(item['priceKind'],'reference' if row['priceStatus']=='priced' else 'quote')
            self.assertEqual(item['priceUnit'],row['priceUnitLabel']);self.assertFalse(item['featured'])
            self.assertEqual(bool(item['image']),bool(row['images']))
        first=by_id[rows[0]['externalId']];self.assertEqual(first['priceAmount'],160500000);self.assertEqual(first['priceOptions'][0]['priceAmount'],30000000)
        for image in ['product-51.webp','product-133.webp','product-150.webp']:
            path='assets/'+image
            row=next(r for r in rows if any(i['path']==path for i in r['images']))
            import base64
            self.assertEqual(base64.b64decode(by_id[row['externalId']]['image'].split(',')[1]),(PACKAGE/path).read_bytes())
    def test_repeat_does_not_undo_panel_edits_hide_or_deletion(self):
        self.run_import();self.login();payload=json.loads(self.request('/api/content',**{'X-AvA-Media':'references'})[2]);items=payload['data']['modules']['products']['items'];item=items[24];external=item['externalId'];removed=items.pop(25)['externalId']
        item.update(priceAmount=123456789,priceUnit='هر عدد',priceKind='sale',status='draft',image='')
        options=copy.deepcopy(item['priceOptions']);self.assertEqual(self.request('/api/content',payload)[0],200)
        report=self.run_import();self.assertEqual(report['inserted'],0);self.assertEqual(report['skipped_deleted'],1);self.assertEqual(report['skipped_existing'],272)
        after=self.data()['modules']['products']['items'];item=next(p for p in after if p.get('externalId')==external)
        self.assertEqual((item['priceAmount'],item['image'],item['status']),(123456789,'','draft'));self.assertEqual(item['priceOptions'],options)
        self.assertNotIn(removed,{p.get('externalId') for p in after})
        payload=json.loads(self.request('/api/content',**{'X-AvA-Media':'references'})[2]);item=next(p for p in payload['data']['modules']['products']['items'] if p.get('externalId')==external)
        item.pop('externalId');item.pop('priceOptions');item['summary']='Legacy client edit'
        self.assertEqual(self.request('/api/content',payload)[0],200)
        item=next(p for p in self.data()['modules']['products']['items'] if p.get('externalId')==external);self.assertEqual(item['priceOptions'],options)
        fixture.app.initialize();self.assertEqual(self.run_import()['inserted'],0)
    def test_public_prices_and_media_do_not_expose_internal_supplier_records(self):
        self.run_import()
        with fixture.app.connect() as db:
            db.execute("UPDATE product_import_sources SET source_json=?",(json.dumps({'priceUsd':535,'rateTomanPerUsd':300000,'private':'SUPPLIER_PRIVATE_MARKER'}),))
        status,_,body=self.request('/api/content',**{'X-AvA-Media':'references'});self.assertEqual(status,200)
        for marker in (b'priceUsd',b'rateTomanPerUsd',b'SUPPLIER_PRIVATE_MARKER'):self.assertNotIn(marker,body)
        data=json.loads(body)['data'];first=data['modules']['products']['items'][24]
        image=self.request(first['image']);self.assertEqual(image[0],200);self.assertTrue(image[2].startswith(b'RIFF'))
        html=self.request('/product/'+first['id'])[2].decode();self.assertIn('گزینه‌های افزوده',html);self.assertIn('۱۶۰٬۵۰۰٬۰۰۰',html);self.assertIn('۳۰٬۰۰۰٬۰۰۰',html)
        self.assertNotIn('SUPPLIER_PRIVATE_MARKER',html)
    def test_capacity_error_rolls_back_all_changes_and_keeps_backup(self):
        data=self.data();template=data['modules']['products']['items'][0]
        for n in range(230):data['modules']['products']['items'].append(dict(template,id='existing-'+str(n)))
        with fixture.app.connect() as db:db.execute('UPDATE content SET data=?',(json.dumps(data),))
        with self.assertRaises(ValueError):self.run_import()
        self.assertEqual(self.data(),data)
        with fixture.app.connect() as db:self.assertFalse(db.execute("SELECT 1 FROM sqlite_master WHERE name='product_import_sources'").fetchone())
        self.assertTrue(list((Path(self.directory.name)/'backups').glob('*.sqlite3')))

if __name__=='__main__':unittest.main()
