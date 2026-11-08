"""Explicit v35 rental regrouping and once-only 10% price adjustment."""
import argparse,copy,datetime as dt,json,re,sqlite3,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import server
KEY='ava-v35-rental-and-price-10-percent'

def rental_branch(text):
 indoor=bool(re.search(r'\bin\s*door\b|فضای داخلی',text,re.I));outdoor=bool(re.search(r'\bout\s*door\b|فضای خارجی',text,re.I))
 if indoor!=outdoor:return 'rental-indoor' if indoor else 'rental-outdoor'
 return None

def transform(data):
 report={'moved_indoor':0,'moved_outdoor':0,'moved_flexible':0,'angled':0,'base_prices':0,'option_prices':0,'unclassified':[]}
 categories={c['id']:c for c in data['productCategories']}
 if 'rental' not in categories:raise ValueError('Rental parent category is missing')
 for id,name in [('rental-outdoor','خارجی'),('rental-indoor','داخلی'),('rental-flexible','Flexible'),('led-angled','فارسی‌بر ۹۰ درجه')]:
  if id not in categories:
   category=dict(id=id,name=name,parentId='rental',visible=True,menu=True,description='');data['productCategories'].append(category);categories[id]=category
  categories[id].update(name=name,parentId='rental',menu=True)
 for p in data['modules']['products']['items']:
  cat=p.get('categoryId')
  if cat=='rental':
   branch=rental_branch(' '.join(str(p.get(k,'')) for k in ['title','model','summary','body']))
   if branch:p['categoryId']=branch;report['moved_indoor' if branch=='rental-indoor' else 'moved_outdoor']+=1
   else:report['unclassified'].append(p['id'])
  elif cat=='led-curved':p['categoryId']='rental-flexible';report['moved_flexible']+=1
  elif cat=='led-angled':report['angled']+=1
  value=p.get('priceAmount')
  if type(value) is int:p['priceAmount']=(value*110+50)//100;report['base_prices']+=1
  for option in p.get('priceOptions',[]):
   value=option.get('priceAmount')
   if type(value) is int:option['priceAmount']=(value*110+50)//100;report['option_prices']+=1
 data['productCategories']=[c for c in data['productCategories'] if c['id']!='led-curved']
 data.setdefault('categoryRedirects',{})['led-curved']='rental-flexible'
 return report

def refine(database,apply=False,backup_dir=None):
 database=Path(database).resolve()
 if not database.is_file():raise ValueError('Existing test database required')
 with sqlite3.connect(database,timeout=20) as db:
  db.row_factory=sqlite3.Row
  exists=db.execute("SELECT 1 FROM sqlite_master WHERE name='catalog_adjustments'").fetchone()
  if exists and db.execute('SELECT 1 FROM catalog_adjustments WHERE key=?',(KEY,)).fetchone():return {'already_applied':True,'base_prices':0,'option_prices':0,'applied':False}
  backup=None
  if apply:
   if backup_dir is None:raise ValueError('A backup directory is required')
   directory=Path(backup_dir);directory.mkdir(mode=0o700,parents=True,exist_ok=True)
   backup=directory/('ava-before-v35-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.sqlite3')
   with sqlite3.connect(backup) as target:db.backup(target)
   backup.chmod(0o600);db.execute('BEGIN IMMEDIATE')
   db.execute('CREATE TABLE IF NOT EXISTS catalog_adjustments(key TEXT PRIMARY KEY,created TEXT NOT NULL,report TEXT NOT NULL)')
   if db.execute('SELECT 1 FROM catalog_adjustments WHERE key=?',(KEY,)).fetchone():return {'already_applied':True,'base_prices':0,'option_prices':0,'applied':False}
  else:db.execute('BEGIN')
  row=db.execute('SELECT revision,data FROM content WHERE id=1').fetchone();data=json.loads(row['data'])
  report=transform(data);server.validate_content(data);report.update(applied=apply,already_applied=False,backup=str(backup) if backup else None)
  if apply:
   data['updatedAt']=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
   db.execute('UPDATE content SET revision=?,data=? WHERE id=1',(row['revision']+1,json.dumps(data,ensure_ascii=False)))
   db.execute('INSERT INTO catalog_adjustments VALUES(?,?,?)',(KEY,dt.datetime.now(dt.timezone.utc).isoformat(),json.dumps(report,ensure_ascii=False)))
  else:db.rollback()
 server.site_features.clear_content_cache()
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--database',type=Path,required=True);parser.add_argument('--apply',action='store_true');parser.add_argument('--backup-dir',type=Path);parser.add_argument('--report',type=Path);args=parser.parse_args()
 result=json.dumps(refine(args.database,args.apply,args.backup_dir),ensure_ascii=False,indent=2)+'\n'
 if args.report:args.report.write_text(result)
 print(result)
