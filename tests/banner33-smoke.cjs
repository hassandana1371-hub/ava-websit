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
 const p=await browser.newPage({reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/panel');await p.locator('#login-form [name=password]').fill('test-only-password-123');await p.locator('#login-form button').click();await p.locator('.dashboard-welcome').waitFor();
 const imagePath=path.join(tmp,'banner.png');cp.execFileSync('python3',['-c',"import sys;sys.path.insert(0,'tests');from media32_test import photo;from pathlib import Path;Path(sys.argv[1]).write_bytes(photo()[0]+b'padding'*80000)",imagePath],{cwd:root});const original='data:image/png;base64,'+fs.readFileSync(imagePath).toString('base64');assert(fs.statSync(imagePath).size>1024*1024);
 await p.goto(base+'/panel#admin/hero');await p.locator('#hero-form [name=showMotionLogo]').uncheck();await p.locator('#hero-form [name=interval]').fill('15');const row=p.locator('.hero-editor-slide').first();await row.locator('[data-slide-image]').setInputFiles(imagePath);await p.waitForFunction(expected=>document.querySelector('.hero-editor-slide .media-preview img').src===expected,original);await p.locator('#hero-form [type=submit]').click();await p.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('ذخیره شد'));
 const saved=await(await p.request.get(base+'/api/content')).json();assert.equal(saved.data.hero.slides[0].image,original,'banner bytes must survive upload and server save');
 const visitor=await browser.newPage({reducedMotion:'no-preference'});visitor.on('pageerror',e=>errors.push(e.message));await visitor.goto(base);const nextImage=await visitor.locator('.hero-scene').nth(1).getAttribute('src');await visitor.close();
 const slow=await browser.newPage({reducedMotion:'no-preference'});slow.on('pageerror',e=>errors.push(e.message));let release,blocked=new Promise(resolve=>release=resolve),requested=false;await slow.route('**/*',async r=>{if(r.request().url()===new URL(nextImage,base).href){requested=true;await blocked;}await r.continue();});await slow.goto(base,{waitUntil:'domcontentloaded'});await slow.locator('.hero-scene').first().evaluate(i=>i.decode());await slow.waitForFunction(()=>!!document.querySelector('.hero-dot[aria-current=true]'));assert(requested,'next frame must preload');await slow.locator('.hero-next').click();await slow.waitForTimeout(200);assert.equal(await slow.locator('.hero-slide').first().getAttribute('aria-hidden'),'false','keep old photo while next is loading');release();await slow.waitForFunction(()=>document.querySelectorAll('.hero-slide')[1].getAttribute('aria-hidden')==='false');await slow.locator('.hero-scene').nth(1).evaluate(i=>i.decode());assert.deepEqual(errors,[]);console.log('PASS original banner bytes preserved after upload/save; next photo preloads and old frame stays visible until slow image is ready');
 }finally{await browser.close();server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
