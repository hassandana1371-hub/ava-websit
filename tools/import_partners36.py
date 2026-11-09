"""Link shared canonical products to the existing partner equipment directory."""
import argparse,base64,copy,datetime as dt,hashlib,json,sqlite3,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import server
from tools.ava_partner_import import load_products
from tools.import_products import adapt,safe_asset
from tools.refine_products35 import KEY as PRICE35
GROUPS=[('magnet','مگنت'),('power-supply','پاور'),('receiving-card','ریسیور'),('sending-card','سندر'),('processor','پروسسور')]
ALIASES={'magnet':['مگنت'],'power-supply':['پاور','منبع تغذیه'],'receiving-card':['ریسیور','رسیور','گیرنده'],'sending-card':['سندر','فرستنده'],'processor':['پروسسور','پردازنده']}

def prepare(source,target):
 source=Path(source);target=Path(target);raw=json.loads((source/'catalog-data.json').read_text())
 if raw['rateTomanPerUsd']!=300000:raise ValueError('Expected 300000 toman per USD')
 payload=load_products(source/'catalog-data.json')
 supplied=json.loads((source/'products-toman.json').read_text())
 if payload!=supplied:raise ValueError('Prepared JSON differs from the supplied loader output')
 target.mkdir(mode=0o700,parents=True,exist_ok=True);(target/'assets').mkdir(exist_ok=True);hashes={}
 for row in payload['products']:
  row['basePriceToman']=row['priceToman'];row['priceToman']=None if row['priceToman'] is None else (row['priceToman']*110+50)//100
  for option in row['options']:option['priceToman']=None if option['priceToman'] is None else (option['priceToman']*110+50)//100
  for image in row['images']:
   p=image['path'];blob=safe_asset(source,p).read_bytes();(target/p).write_bytes(blob);hashes[p]=hashlib.sha256(blob).hexdigest()
 manifest={'version':1,'markupPercent':10,'assets':hashes,'products':payload['products']}
 (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');return len(payload['products'])

def import_partners(database,package,apply=False,backup_dir=None):
 database=Path(database).resolve();package=Path(package).resolve()
 if not database.is_file():raise ValueError('Existing initialized database required')
 manifest=json.loads((package/'manifest.json').read_text());rows=manifest['products'];seen=set()
 if manifest.get('version')!=1 or manifest.get('markupPercent')!=10:raise ValueError('Invalid partner package')
 for row in rows:
  external=row['externalId']
  if external in seen or not external.startswith('ava-led-catalog:') or row['categoryPath']!=['همکاران',row['category']] or row['category'] not in [n for _,n in GROUPS]:raise ValueError('Invalid/duplicate partner record')
  seen.add(external)
  for image in row['images']:
   name=image['path']
   if hashlib.sha256(safe_asset(package,name).read_bytes()).hexdigest()!=manifest['assets'].get(name):raise ValueError('Image checksum mismatch')
 report=dict(input=len(rows),inserted=0,linked=0,skipped_deleted=0,preserved_prices=0,price_adjusted=0,canonical_names_corrected=0,unit_review=sum(r['priceStatus']=='unit_review' for r in rows),backup=None,applied=apply)
 with sqlite3.connect(database,timeout=20) as db:
  db.row_factory=sqlite3.Row
  if apply:
   if not backup_dir:raise ValueError('Backup directory required with --apply')
   directory=Path(backup_dir);directory.mkdir(mode=0o700,parents=True,exist_ok=True);backup=directory/('ava-before-partners36-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.sqlite3')
   with sqlite3.connect(backup) as target:db.backup(target)
   backup.chmod(0o600);report['backup']=str(backup);db.execute('BEGIN IMMEDIATE')
   db.execute('CREATE TABLE IF NOT EXISTS partner_import_sources(external_id TEXT PRIMARY KEY,product_id TEXT NOT NULL,source_json TEXT NOT NULL)')
  else:db.execute('BEGIN')
  row=db.execute('SELECT revision,data FROM content WHERE id=1').fetchone();data=json.loads(row['data']);original=copy.deepcopy(data)
  equipment=data['modules']['equipment']['items'];group_ids={};used=set()
  for preferred,name in GROUPS:
   match=next((p for p in equipment if p['id']==preferred),None) or next((p for p in equipment if p['id'] not in used and any(a in p['title'] for a in ALIASES[preferred])),None)
   if match is None:
    match=dict(id=preferred,title=name,summary='',body='',meta='',image='',url='',status='published');equipment.append(match)
   match['title']=name;group_ids[name]=match['id'];used.add(match['id'])
  excluded=[p['id'] for p in equipment if p['id']=='led-module' or p['title'].strip() in ['ماژول','ماژول LED','LED Module']]
  data['partnerCatalog']=dict(enabled=True,categories=[group_ids[n] for _,n in GROUPS],excludedEquipmentIds=excluded)
  products=data['modules']['products']['items'];by_external={p.get('externalId'):p for p in products if p.get('externalId')};by_id={p['id']:p for p in products}
  tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
  ledger={r['external_id']:r['product_id'] for r in db.execute('SELECT external_id,product_id FROM product_import_sources')} if 'product_import_sources' in tables else {}
  own={r[0] for r in db.execute('SELECT external_id FROM partner_import_sources')} if 'partner_import_sources' in tables else set()
  if apply:db.execute('CREATE TABLE IF NOT EXISTS product_import_sources(external_id TEXT PRIMARY KEY,product_id TEXT NOT NULL UNIQUE,imported_at TEXT NOT NULL,source_json TEXT NOT NULL)')
  markup_done='catalog_adjustments' in tables and bool(db.execute('SELECT 1 FROM catalog_adjustments WHERE key=?',(PRICE35,)).fetchone())
  baselines={p['externalId']:p for p in json.loads((ROOT/'catalog-import34/manifest.json').read_text())['products']} if (ROOT/'catalog-import34/manifest.json').is_file() else {}
  images={}
  for record in rows:
   external=record['externalId'];product=by_external.get(external);identity='import-'+external.split(':',1)[1]
   if product is None and (external in ledger or external in own):
    report['skipped_deleted']+=1;continue
   if product is None:
    if identity in by_id:raise ValueError('Canonical product ID collision')
    prepared=copy.deepcopy(record);prepared['category']='پردازنده تصویر' if record['category']=='پروسسور' else 'قطعات و لوازم';product=adapt(prepared,package,images);products.append(product);by_id[identity]=product;by_external[external]=product;report['inserted']+=1
   else:
    report['preserved_prices']+=1
    # Upgrade an untouched pre-v35 reference once; a manual price/unit/status is authoritative.
    if not markup_done and external not in own and product.get('priceKind')=='reference' and product.get('priceAmount')==record['basePriceToman'] and record['priceStatus']=='priced' and product.get('priceUnit')==record['priceUnitLabel']:
     product['priceAmount']=record['priceToman'];report['price_adjusted']+=1;report['preserved_prices']-=1
   product['partnerCategoryId']=group_ids[record['category']];report['linked']+=1
   if external=='ava-led-catalog:ava-51-07':
    baseline=baselines.get(external,{})
    if product['title']==baseline.get('name'):
     product['title']='NovaStar NV7508';report['canonical_names_corrected']+=1
   if apply:
    db.execute('INSERT OR IGNORE INTO partner_import_sources VALUES(?,?,?)',(external,product['id'],json.dumps(record,ensure_ascii=False)))
    db.execute('INSERT OR IGNORE INTO product_import_sources VALUES(?,?,?,?)',(external,product['id'],dt.datetime.now(dt.timezone.utc).isoformat(),json.dumps(record,ensure_ascii=False)))
  server.validate_content(data)
  if apply and data!=original:
   data['updatedAt']=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000);db.execute('UPDATE content SET revision=?,data=? WHERE id=1',(row['revision']+1,json.dumps(data,ensure_ascii=False)))
  if not apply:db.rollback()
  report['total_products']=len(products);report['categories']={name:sum(p.get('partnerCategoryId')==id for p in products) for name,id in group_ids.items()}
 server.site_features.clear_content_cache();return report

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--prepare',type=Path);parser.add_argument('--package',type=Path,default=ROOT/'partner-import36');parser.add_argument('--database',type=Path);parser.add_argument('--apply',action='store_true');parser.add_argument('--backup-dir',type=Path);parser.add_argument('--report',type=Path);args=parser.parse_args()
 if args.prepare:print(json.dumps({'prepared':prepare(args.prepare,args.package)}));sys.exit(0)
 if not args.database:parser.error('--database required')
 result=json.dumps(import_partners(args.database,args.package,args.apply,args.backup_dir),ensure_ascii=False,indent=2)+'\n'
 if args.report:args.report.write_text(result)
 print(result)
