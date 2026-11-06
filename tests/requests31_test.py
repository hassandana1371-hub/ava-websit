import copy
import hashlib
import json
import time
import unittest
import server_test as fixture

class RequestsTests(unittest.TestCase):
 setUp=fixture.ServerTest.setUp
 tearDown=fixture.ServerTest.tearDown
 request=fixture.ServerTest.request
 login=fixture.ServerTest.login
 def payload(self,key='test-request-123'):
  return dict(customer='مشتری <b>تست</b>',phone='۰۹۱۲ ۱۷۱۸۰۲۴',message='برای نصب نمایشگر مشاوره می‌خواهم',source='/service/initial-rental',requestKey=key)
 def test_public_submission_private_inbox_and_read_delete(self):
  self.assertEqual(self.request('/api/requests',self.payload())[0],201)
  self.assertEqual(self.request('/api/requests',self.payload())[0],200)
  for url in ['/api/requests','/api/requests/summary']:
   self.assertEqual(self.request(url)[0],401)
  self.assertNotIn('مشتری <b>تست</b>',self.request('/')[2].decode())
  self.login();result=json.loads(self.request('/api/requests')[2]);self.assertEqual(result['total'],1);self.assertEqual(result['unread'],1)
  row=result['items'][0];self.assertEqual(row['phone'],'09121718024');self.assertEqual(row['source_path'],'/service/initial-rental')
  self.assertEqual(self.request('/api/requests/update',{'id':row['id'],'action':'delete'},**{'X-CSRF-Token':'bad'})[0],403)
  self.assertEqual(self.request('/api/requests/update',{'id':row['id'],'action':'read'})[0],200)
  fixture.app.initialize();self.assertEqual(json.loads(self.request('/api/requests/summary')[2])['unread'],0)
  self.assertEqual(json.loads(self.request('/api/requests/summary')[2])['total'],1)
  self.assertEqual(self.request('/api/requests/update',{'id':row['id'],'action':'delete'})[0],200)
  fixture.app.initialize();self.assertEqual(json.loads(self.request('/api/requests/summary')[2])['total'],0)
 def test_version29_contact_upgrade_preserves_deleted_address_and_account(self):
  with fixture.app.connect() as db:
   row=db.execute('SELECT revision,data FROM content').fetchone();data=json.loads(row['data']);data['contactRevision']=2;data['contact']['phoneLabel']='تلفن اصلی آوا';data['contact']['locations']=[x for x in data['contact']['locations'] if x['id']!='factory'];db.execute('UPDATE content SET data=?',(json.dumps(data),));before_account=tuple(db.execute('SELECT * FROM account').fetchone())
  fixture.app.initialize()
  with fixture.app.connect() as db:
   result=db.execute('SELECT revision,data FROM content').fetchone();upgraded=json.loads(result['data'])
   self.assertEqual(result['revision'],row['revision']+1);self.assertEqual(upgraded['contact']['phoneLabel'],'شماره تماس');self.assertEqual(upgraded['contact']['locations'],data['contact']['locations']);self.assertEqual(upgraded['modules'],data['modules']);self.assertEqual(tuple(db.execute('SELECT * FROM account').fetchone()),before_account)
  fixture.app.initialize()
  with fixture.app.connect() as db:self.assertEqual(db.execute('SELECT revision FROM content').fetchone()[0],result['revision'])
 def test_submission_validation_origin_honeypot_and_rate_bound(self):
  self.assertEqual(self.request('/api/requests',self.payload(),Origin='https://evil.test')[0],403)
  for patch in [dict(customer=''),dict(phone='bad'),dict(message=''),dict(source='/panel'),dict(requestKey='x')]:
   payload=self.payload();payload.update(patch);self.assertEqual(self.request('/api/requests',payload)[0],400)
  p=self.payload();p['website']='spam';self.assertEqual(self.request('/api/requests',p)[0],200)
  with fixture.app.connect() as db:
   self.assertEqual(db.execute('SELECT COUNT(*) FROM service_requests').fetchone()[0],0)
   db.executemany('INSERT INTO request_limits VALUES (?,?)',[(hashlib.sha256(b'127.0.0.1').hexdigest(),time.time())]*30)
  self.assertEqual(self.request('/api/requests',self.payload())[0],429)
 def test_project_gallery_persistence_visibility_and_validation(self):
  self.login();r=json.loads(self.request('/api/content')[2]);data=r['data'];image='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='
  project=dict(id='gallery-test',title='پروژهٔ تست',summary='معرفی',body='متن',meta='',image=image,url='',file='',fileName='',status='published',gallery=[dict(image=image,alt='عکس دوم')])
  data['modules']['projects']['items'].append(project)
  self.assertEqual(self.request('/api/content',r)[0],200)
  fixture.app.initialize();saved=json.loads(self.request('/api/content')[2]);self.assertEqual(saved['data']['modules']['projects']['items'][-1]['gallery'],project['gallery'])
  invalid=copy.deepcopy(saved['data']);invalid['modules']['projects']['items'][-1]['gallery']*=13
  with self.assertRaises(ValueError):fixture.app.validate_content(invalid)
  invalid=copy.deepcopy(saved['data']);invalid['modules']['projects']['items'][-1]['gallery'][0]['image']='javascript:bad'
  with self.assertRaises(ValueError):fixture.app.validate_content(invalid)
  saved['data']['modules']['projects']['items'][-1]['status']='draft';self.assertEqual(self.request('/api/content',saved)[0],200)
  self.cookie=self.csrf='';self.assertFalse(any(p['id']=='gallery-test' for p in json.loads(self.request('/api/content')[2])['data']['modules']['projects']['items']))
 def test_service_removal_preserves_request_and_hidden_module_is_private(self):
  self.request('/api/requests',self.payload());self.login();r=json.loads(self.request('/api/content')[2]);r['data']['modules']['services']['visible']=False
  self.assertEqual(self.request('/api/content',r)[0],200)
  public=fixture.app.public_content(r['data']);self.assertEqual(public['modules']['services']['items'],[])
  self.assertEqual(self.request('/api/requests',self.payload('test-request-456'))[0],400)
  r=json.loads(self.request('/api/content')[2]);r['data']['modules']['services']['items']=[];self.assertEqual(self.request('/api/content',r)[0],200)
  fixture.app.initialize();self.assertEqual(json.loads(self.request('/api/requests/summary')[2])['total'],1)

if __name__=='__main__':unittest.main()
