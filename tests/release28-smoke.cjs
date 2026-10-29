const {chromium}=require('playwright');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),cp=require('node:child_process');const root=path.resolve(__dirname,'..');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ava28-'));const env={...process.env,AVA_DATA_DIR:tmp};
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 cp.execFileSync('python3',['-c',`import server,json
server.initialize()
with server.connect() as db:
 row=db.execute('SELECT data FROM content').fetchone();d=json.loads(row['data']);d['hero']['showMotionLogo']=False;d['hero']['interval']=15000
 for s in d['hero']['slides']:s.pop('clickUrl',None);s.pop('linkEnabled',None)
 d['hero']['slides'].sort(key=lambda s:s['id']!='mobile-led-trailer')
 for i,p in enumerate([p for p in d['modules']['products']['items'] if p.get('featured')]):
  if i==0:p.update(title='عنوان بسیار طولانی نمایشگر برای بررسی دو سطر هم‌اندازه در کارت محصول منتخب آوا',summary='توضیح طولانی '*40,model='',priceKind='quote')
  if i==1:p.update(title='نمایشگر',summary='',model='MODEL-1234567890-LONG-NAME',priceKind='sale',priceAmount=999999999)
 db.execute('UPDATE content SET data=?',(json.dumps(d),));server.set_password(db,'test-only-password-123')`],{cwd:root,env});
 const server=cp.spawn('python3',['-u','server.py','--dev','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',b=>stderr+=b.toString());await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',c=>reject(new Error('server '+c+stderr)));});
 const base=`http://127.0.0.1:${port}/`;const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];const watch=p=>p.on('pageerror',e=>errors.push(e.message));
 try{
 for(const [width,height,mobile] of [[320,740,true],[390,844,true],[844,390,true],[1920,1080,false]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});const p=await context.newPage();watch(p);await p.goto(base);await p.locator('.hero-scene').first().evaluate(i=>i.decode());await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
  const fit=await p.locator('.hero-scene').first().evaluate(i=>getComputedStyle(i).objectFit);assert.equal(fit,mobile?'contain':'cover');
  const hero=await p.locator('#hero').boundingBox();if(mobile){const header=await p.locator('.site-header').boundingBox();const expected=height<500?Math.max(180,height-header.height):Math.max(200,Math.min(440,width*.625));assert(Math.abs(hero.height-expected)<1);}else assert.equal(hero.height,984);
  assert.equal(await p.locator('.hero-slide').first().locator('a').getAttribute('href'),'/category/led-trailers');
  const cards=await p.locator('#featured-products .product-card').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width,media:n.querySelector('.product-card-media').getBoundingClientRect().height,price:n.querySelector('.product-price-block').getBoundingClientRect().height,action:n.querySelector('.product-card-link').getBoundingClientRect().height})));
  assert.equal(cards.length,6);for(const key of ['height','width','media','price','action'])assert(Math.max(...cards.map(n=>n[key]))-Math.min(...cards.map(n=>n[key]))<1,`${width}: unequal ${key}`);
  if(width<=700)assert(cards[0].width>=width-30);
  if(width===390){
   await p.screenshot({path:path.join(root,'exports/ava-v28-mobile-preview.png'),fullPage:false});
   // Real swipe must change slide without following its anchor; a new tap must work.
   const cdp=await context.newCDPSession(p);const y=Math.round(hero.y+hero.height*.45);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:285,y}]});for(const x of [255,220,180,130]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await p.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.waitForFunction(()=>document.querySelectorAll('.hero-slide')[1].getAttribute('aria-hidden')==='false');assert.equal(new URL(p.url()).pathname,'/');
   await p.waitForTimeout(100);await p.touchscreen.tap(195,y);await p.waitForURL('**/category/urban');
   await p.goto(base);await p.locator('.hero-image-link').first().tap();await p.waitForURL('**/category/led-trailers');
   await p.goto(base);assert.equal(await p.locator('#software .software-card').count(),7);await p.locator('#software .software-card').first().locator('.card-action').click();assert((await p.locator('#detail-body').innerText()).includes('5.9.2'));assert.equal(await p.locator('#detail-body a').getAttribute('rel'),'noopener noreferrer');await p.locator('#content-detail').evaluate(d=>d.close());
   assert.equal(await p.locator('#footer-contact .contact-number').nth(1).innerText(),'0912 17 18 024');assert((await p.locator('#footer-contact').innerText()).includes('کوچهٔ اختر'));
  }
  await context.close();
 }
 console.log('PASS responsive hero fit, no overflow, equal mixed cards, genuine touch swipe/tap and legacy trailer links');
 const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true});watch(p);await p.goto(base+'panel');await p.locator('#login-form [name=password]').fill('test-only-password-123');await p.locator('#login-form button').click();await p.locator('.dashboard-welcome').waitFor();
 await p.goto(base+'panel#admin/hero');let first=p.locator('.hero-editor-slide').first();await first.getByLabel('انتخاب مقصد اسلاید').selectOption('/service/led-trailer-rental');await p.locator('#hero-form [type=submit]').click();await p.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('ذخیره شد'));await p.reload();first=p.locator('.hero-editor-slide').first();assert.equal(await first.locator('[name=clickUrl]').inputValue(),'/service/led-trailer-rental');
 const visitor=await browser.newPage({reducedMotion:'reduce'});watch(visitor);await visitor.goto(base);await visitor.locator('.hero-image-link').first().click();await visitor.waitForURL('**/service/led-trailer-rental');
 await first.locator('[name=linkEnabled]').uncheck();await p.locator('#hero-form [type=submit]').click();await p.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('ذخیره شد'));await visitor.goto(base);assert.equal(await visitor.locator('.hero-slide').first().locator('a').count(),0);
 await first.locator('[name=linkEnabled]').check();await p.locator('#hero-form [type=submit]').click();await p.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('ذخیره شد'));
 await p.goto(base+'panel#admin/software');await p.locator('[data-entry-id=novalct]').getByRole('button',{name:'ویرایش',exact:true}).click();await p.locator('#entry-form [name=title]').fill('NovaLCT ویرایش مدیر');await p.locator('#entry-form [type=submit]').click();await p.locator('#entry-editor').waitFor({state:'hidden'});await p.reload();assert((await p.locator('[data-entry-id=novalct]').innerText()).includes('ویرایش مدیر'));
 await p.goto(base+'panel#admin/backup');const dl=p.waitForEvent('download');await p.locator('#export-site').click();const out=path.join(tmp,'export.html');await(await dl).saveAs(out);const exported=fs.readFileSync(out,'utf8');const offline=await browser.newPage({reducedMotion:'reduce'});watch(offline);await offline.route('http://ava28.test/',r=>r.fulfill({contentType:'text/html',body:exported}));await offline.goto('http://ava28.test/');assert.equal(await offline.locator('.hero-image-link').first().getAttribute('href'),'#service/led-trailer-rental');await offline.locator('.hero-image-link').first().click();await offline.locator('.service-page').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS admin destination presets, service navigation, link disable/enable, software edits and standalone export');
 }finally{await browser.close();server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
