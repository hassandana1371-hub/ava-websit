"""Explicit, additive catalogue import into the existing AVA content database.

Never runs at server startup. Dry-run by default; --apply requires a backup.
"""
import argparse
import base64
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import server
from tools.ava_product_import import load_products

CATEGORY_MAP={
 'داخلی':('urban-indoor',''), 'بیرونی':('urban-outdoor',''), 'اجاره‌ای':('rental',''),
 'پوستر LED':('digital-stands',''), 'شفاف':('transparent',''), 'قطعات و لوازم':('accessories',''),
 'پردازنده تصویر':('controllers',''), 'کف LED':('led-floor',''),
 'زاویه‌دار':('led-angled','نمایشگرهای زاویه‌دار'), 'تبلیغاتی':('led-advertising','نمایشگرهای تبلیغاتی'),
 'سفارشی':('led-custom','نمایشگرهای سفارشی'), 'استادیومی':('led-stadium','نمایشگرهای استادیومی'),
 'منحنی':('led-curved','نمایشگرهای منحنی'),
}

def safe_asset(package,name):
 path=PurePosixPath(name)
 if path.is_absolute() or '..' in path.parts or len(path.parts)!=2 or path.parts[0]!='assets':raise ValueError('Invalid asset path')
 result=(Path(package)/name).resolve()
 if not result.is_relative_to(Path(package).resolve()) or not result.is_file():raise ValueError('Missing/unsafe asset: '+name)
 return result

def prepare(source,target):
 source=Path(source);target=Path(target)
 raw=json.loads((source/'catalog-data.json').read_text())
 if raw['rateTomanPerUsd']!=300000:raise ValueError('Expected the requested 300000 toman conversion rate')
 payload=load_products(source/'catalog-data.json')
 raw_rows={'ava-led-catalog:'+r['id']:r for r in raw['products']}
 for row in payload['products']:
  original=raw_rows[row['externalId']];row['sourcePage']=original['sourcePage'];row['sourceRow']=original['sourceRow']
 target.mkdir(parents=True,exist_ok=True);(target/'assets').mkdir(exist_ok=True)
 names={i['path'] for row in payload['products'] for i in row['images']}
 hashes={}
 for name in sorted(names):
  original=safe_asset(source,name);shutil.copyfile(original,target/name);hashes[name]=hashlib.sha256(original.read_bytes()).hexdigest()
 manifest={'version':1,'source':'ava-led-catalog','assets':hashes,'products':payload['products']}
 # Supplier USD amounts and the conversion rate never enter this public package.
 (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 return len(payload['products'])

def read_manifest(package):
 package=Path(package);manifest=json.loads((package/'manifest.json').read_text())
 if manifest.get('version')!=1 or manifest.get('source')!='ava-led-catalog':raise ValueError('Invalid manifest')
 ids=set()
 for row in manifest['products']:
  external=row['externalId']
  if not isinstance(external,str) or not external.startswith('ava-led-catalog:') or external in ids:raise ValueError('Duplicate/invalid externalId')
  ids.add(external)
  if row['category'] not in CATEGORY_MAP:raise ValueError('Unmapped category: '+row['category'])
  for image in row['images']:
   name=image['path'];file=safe_asset(package,name)
   if hashlib.sha256(file.read_bytes()).hexdigest()!=manifest['assets'].get(name):raise ValueError('Asset checksum mismatch: '+name)
 return manifest

def adapt(row,package,images):
 specs=[]
 for value in row['specifications']:
  if not value or value.strip()=='/':continue
  label,separator,detail=value.partition(':')
  specs.append({'label':label.strip() if separator and detail.strip() else 'مشخصه '+str(len(specs)+1),'value':detail.strip() if separator and detail.strip() else value.strip()})
 if row.get('pitch'):specs.insert(0,{'label':'فاصله پیکسل (میلی‌متر)','value':str(row['pitch'])})
 if row.get('dimensionsMm'):specs.insert(0,{'label':'ابعاد (میلی‌متر)','value':' × '.join(map(str,row['dimensionsMm']))})
 image='';caption=''
 if row['images']:
  # Use the package's AVA-labelled version whenever that model has one.
  selected=next((i for i in row['images'] if i['kind']=='rebranded-reference'),row['images'][0]);name=selected['path']
  if name not in images:images[name]='data:image/webp;base64,'+base64.b64encode(safe_asset(package,name).read_bytes()).decode()
  image=images[name];caption='تصویر مرجع کاتالوگ'
 priced=row['priceStatus']=='priced' and row['priceToman'] is not None and row['priceUnit'] in ('piece','m2')
 return dict(id='import-'+row['externalId'].split(':',1)[1],externalId=row['externalId'],title=row['name'],
  summary=' · '.join(filter(None,[row['series'],row.get('model'),row['category']])),body=row['series'],meta='',url='',
  image=image,imageAsset='',imageStyle='photo' if image else '',imageCaption=caption,status='published',
  categoryId=CATEGORY_MAP[row['category']][0],model=row.get('model') or '',featured=False,
  priceAmount=row['priceToman'] if priced else None,priceKind='reference' if priced else 'quote',
  priceUnit=row['priceUnitLabel'],priceDate='',specifications=specs,seoTitle='',seoDescription='',
  priceOptions=[{'name':o['name'],'priceAmount':o['priceToman'] if o['priceUnit'] in ('piece','m2') else None,'priceUnit':o['priceUnitLabel']} for o in row['options']],
  datasheetUrl='',manualUrl='',file='',fileName='')

def import_catalog(database,package,apply=False,backup_dir=None,source_json=None):
 database=Path(database).resolve();package=Path(package).resolve()
 if not database.is_file():raise ValueError('Existing database required; initialize a separate test site first')
 manifest=read_manifest(package);raw_by_id={}
 if source_json:
  source=json.loads(Path(source_json).read_text())
  raw_by_id={'ava-led-catalog:'+r['id']:{'record':r,'rateTomanPerUsd':source['rateTomanPerUsd']} for r in source['products']}
 report={'input':len(manifest['products']),'inserted':0,'updated':0,'skipped_existing':0,'skipped_deleted':0,'categories_added':[],
  'unit_review':[],'inquiry':[],'missing_images':[],'options_products':0,'backup':None,'applied':apply}
 with sqlite3.connect(database,timeout=20) as db:
  db.row_factory=sqlite3.Row
  if apply:
   if backup_dir is None:raise ValueError('--backup-dir is required with --apply')
   directory=Path(backup_dir).resolve();directory.mkdir(parents=True,exist_ok=True,mode=0o700)
   backup=directory/('ava-before-products-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.sqlite3')
   with sqlite3.connect(backup) as target:db.backup(target)
   backup.chmod(0o600);report['backup']=str(backup)
   db.execute('BEGIN IMMEDIATE')
   db.execute('CREATE TABLE IF NOT EXISTS product_import_sources(external_id TEXT PRIMARY KEY,product_id TEXT NOT NULL UNIQUE,imported_at TEXT NOT NULL,source_json TEXT NOT NULL)')
  else:db.execute('BEGIN')
  row=db.execute('SELECT revision,data FROM content WHERE id=1').fetchone()
  if row is None:raise ValueError('Content not initialized')
  data=json.loads(row['data']);original=copy.deepcopy(data);items=data['modules']['products']['items']
  by_external={p['externalId']:p for p in items if p.get('externalId')};by_id={p['id']:p for p in items}
  has_ledger=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_import_sources'").fetchone()
  ledger={r['external_id']:r['product_id'] for r in db.execute('SELECT external_id,product_id FROM product_import_sources')} if has_ledger else {}
  categories={c['id'] for c in data['productCategories']};images={};now=dt.datetime.now(dt.timezone.utc).isoformat()
  from tools.refine_products35 import KEY as PRICE35,rental_branch
  adjustments=db.execute("SELECT 1 FROM sqlite_master WHERE name='catalog_adjustments'").fetchone();markup_done=bool(adjustments and db.execute('SELECT 1 FROM catalog_adjustments WHERE key=?',(PRICE35,)).fetchone())
  for product in manifest['products']:
   external=product['externalId'];identity='import-'+external.split(':',1)[1]
   if product['priceStatus'] in ('unit_review','inquiry'):report[product['priceStatus']].append(external)
   if not product['images']:report['missing_images'].append(external)
   if product['options']:report['options_products']+=1
   if external in by_external or external in ledger:
    live=by_external.get(external) or by_id.get(ledger.get(external));report['skipped_existing' if live else 'skipped_deleted']+=1
    identity=live['id'] if live else ledger[external]
   else:
    if identity in by_id:raise ValueError('Product ID collision; refusing to overwrite '+identity)
    cat_id,cat_name=CATEGORY_MAP[product['category']]
    cat_id=data.get('categoryRedirects',{}).get(cat_id,cat_id)
    if cat_id not in categories:
     if not cat_name:raise ValueError('Existing target category missing: '+cat_id)
     data['productCategories'].append(dict(id=cat_id,name=cat_name,description='',visible=True,parentId='',menu=True))
     categories.add(cat_id);report['categories_added'].append(cat_id)
    item=adapt(product,package,images);item['categoryId']=cat_id
    if markup_done:
     if cat_id=='rental':item['categoryId']=rental_branch(product['name']) or cat_id
     if type(item['priceAmount']) is int:item['priceAmount']=(item['priceAmount']*110+50)//100
     for option in item['priceOptions']:
      if type(option['priceAmount']) is int:option['priceAmount']=(option['priceAmount']*110+50)//100
    items.append(item);by_id[identity]=item;by_external[external]=item;report['inserted']+=1
   if apply and external not in ledger:
    db.execute('INSERT INTO product_import_sources VALUES(?,?,?,?)',(external,identity,now,json.dumps(raw_by_id.get(external,product),ensure_ascii=False)))
  server.validate_content(data)
  if apply and data!=original:
   data['updatedAt']=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
   db.execute('UPDATE content SET revision=?,data=? WHERE id=1',(row['revision']+1,json.dumps(data,ensure_ascii=False)))
  if not apply:db.rollback()
  report['total_products']=len(items)
 if apply:server.site_features.clear_content_cache()
 return report

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--prepare',type=Path,help='Original package directory; validate with the supplied loader')
 parser.add_argument('--package',type=Path,default=ROOT/'catalog-import34')
 parser.add_argument('--database',type=Path)
 parser.add_argument('--apply',action='store_true')
 parser.add_argument('--backup-dir',type=Path)
 parser.add_argument('--source-json',type=Path,help='Optional private supplier JSON for internal provenance only')
 parser.add_argument('--report',type=Path)
 args=parser.parse_args()
 if args.prepare:print(json.dumps({'prepared':prepare(args.prepare,args.package)}));return
 if args.database is None:parser.error('--database is required; no production default is used')
 report=import_catalog(args.database,args.package,args.apply,args.backup_dir,args.source_json)
 result=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
 if args.report:args.report.write_text(result)
 print(result)

if __name__=='__main__':main()
