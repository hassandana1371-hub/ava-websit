const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),cp=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ava32-')),env={...process.env,AVA_DATA_DIR:tmp};
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 cp.execFileSync('python3',['-c',`import sys,json,base64;sys.path.insert(0,'tests')
import server
from media32_test import photo
server.initialize()
with server.connect() as db:
 server.set_password(db,'test-only-password-123')
 data=json.loads(db.execute('SELECT data FROM content').fetchone()[0]);blob,image=photo()
 data['modules']['projects']['items']=[dict(id='large-project',title='پروژه بزرگ',summary='',body='',meta='',url='',image=image,status='published',gallery=[dict(image='data:image/png;base64,'+base64.b64encode(blob+str(i).encode()).decode(),alt='نما') for i in range(12)])]
 db.execute('UPDATE content SET revision=revision+1,data=?',(json.dumps(data),))`],{cwd:root,env});
 const server=cp.spawn('python3',['-u','server.py','--dev','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',b=>stderr+=b);await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',c=>reject(Error(String(c)+stderr)));});
 const base=`http://127.0.0.1:${port}`,browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));let contentRequests=0;
 await p.route('**/api/content',r=>{contentRequests++;return r.abort();});await p.goto(base+'/panel');await p.locator('#login-form').waitFor({timeout:10000});assert.equal(contentRequests,0,'login must not wait for gallery/content');await p.unroute('**/api/content');
 await p.locator('#login-form [name=password]').fill('test-only-password-123');await p.locator('#login-form button').click();await p.locator('.dashboard-welcome').waitFor({timeout:10000});
 await p.goto(base+'/panel#admin/backup');const download=p.waitForEvent('download');await p.locator('#export-backup').click();const backup=path.join(tmp,'backup.json');await(await download).saveAs(backup);const data=JSON.parse(fs.readFileSync(backup,'utf8'));assert.equal(data.modules.projects.items[0].gallery.length,12);assert(data.modules.projects.items[0].gallery.every(i=>i.image.startsWith('data:image/png;base64,')));assert(!JSON.stringify(data).includes('/media/'));
 const visitor=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});visitor.on('pageerror',e=>errors.push(e.message));const response=await visitor.goto(base+'/projects');assert((await response.body()).length<1000000);await visitor.locator('#projects .card-action').click();await visitor.locator('.project-stage img').evaluate(i=>i.decode());assert.equal(await visitor.locator('.project-thumbnails button').count(),13);assert.equal(await visitor.evaluate(()=>document.documentElement.scrollWidth),390);
 assert.deepEqual(errors,[]);console.log('PASS large gallery: login without content request, authenticated loading, portable JSON backup with all original photos, compact public HTML and mobile gallery');
 }finally{await browser.close();server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
