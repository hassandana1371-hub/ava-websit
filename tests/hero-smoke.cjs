const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const seed=JSON.parse(fs.readFileSync(path.join(root,'src/defaults.json'),'utf8'));
// Exercise photo editing/timing separately from the 14-second logo introduction.
seed.hero.showMotionLogo=false;
(async()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/(<script id="ava-initial-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,open,close)=>open+JSON.stringify(seed).replace(/</g,'\\u003c')+close);
 const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});r.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference',acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#hero a:not(.hero-image-link),#hero h1,#hero p,.hero-slider-footer,.hero-slide-choices,.hero-shade').count(),0);
  assert.equal((await page.locator('#hero').innerText()).trim(),'');assert.equal(await page.locator('.hero-scene').count(),5);
  assert.equal(await page.locator('#hero').evaluate(n=>n.getBoundingClientRect().bottom),900);
  await page.locator('.hero-scene').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));assert(await page.locator('.hero-scene').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>=1600&&i.src.startsWith('data:image/webp;base64,'))));
  await page.mouse.move(500,450);
  await page.evaluate(()=>{window.heroChanges=[];let previous='';new MutationObserver(()=>{const active=document.querySelector('.hero-slide[aria-hidden=false]');const alt=active.querySelector('img').alt;if(alt!==previous){previous=alt;window.heroChanges.push({alt,time:performance.now()});}}).observe(document.querySelector('#hero-viewport'),{subtree:true,attributes:true,attributeFilter:['aria-hidden']});});
  await page.waitForFunction(()=>window.heroChanges.length>=6,{},{timeout:14000});
  const changes=await page.evaluate(()=>window.heroChanges);for(let i=1;i<6;i++){const delta=changes[i].time-changes[i-1].time;assert(delta>1850&&delta<2200,`cadence ${delta}ms`);}
  assert.equal(changes[0].alt,changes[5].alt);
  // The outgoing image always moves left, including the final-to-first wrap.
  const frames=await page.locator('.hero-slide').evaluateAll(nodes=>nodes.flatMap(n=>n.getAnimations().map(a=>a.effect.getKeyframes().map(f=>f.transform))));
  if(frames.length)assert(frames.some(f=>f.includes('translateX(-100%)')));
  console.log('PASS image-only hero, embedded high-resolution media, two-second cadence while hovered, left transitions and looping');

  await page.goto(base+'#admin/hero');assert.equal(await page.locator('#hero-form [name=interval]').inputValue(),'2');assert.equal(await page.locator('#hero-form [name=interval]').getAttribute('min'),'1');
  const rows=page.locator('.hero-editor-slide');await rows.first().locator('[name=title]').fill('عکس سفارشی آوا');await rows.first().locator('[data-slide-image]').setInputFiles(path.join(root,'src/assets/hero-film.webp'));await page.locator('#hero-form [type=submit]').click();
  await rows.first().locator('[data-slide-image]').setInputFiles(path.join(root,'src/assets/hero-flex.webp'));await page.locator('#hero-form [type=submit]').click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ava-content-studio-v1')));assert.equal(stored.hero.slides[0].image,'data:image/webp;base64,'+fs.readFileSync(path.join(root,'src/assets/hero-flex.webp')).toString('base64'));assert.equal(stored.hero.interval,2000);
  await rows.first().locator('[data-move-slide="1"]').click();await page.locator('#hero-form [type=submit]').click();await page.reload();assert((await rows.first().locator('[name=title]').inputValue()).includes('شیشه'));
  await page.locator('#add-hero-slide').click();assert.equal(await rows.count(),6);await page.locator('#hero-form [type=submit]').click();await page.reload();await rows.last().locator('summary').click();page.once('dialog',d=>d.accept());await rows.last().locator('[data-delete-slide]').click();await page.locator('#hero-form [type=submit]').click();assert.equal(await rows.count(),5);
  console.log('PASS 2-second panel setting, repeat image replacement, rename, reorder, add/delete and persistence');

  await page.goto(base+'#admin/backup');const downloading=page.waitForEvent('download');await page.locator('#export-site').click();const file='/tmp/ava-v14-export.html';await(await downloading).saveAs(file);
  const exported=await browser.newPage({reducedMotion:'reduce'});await exported.route('http://hero-export.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')}));await exported.goto('http://hero-export.test/');assert.equal(await exported.locator('.hero-scene').count(),5);assert.equal(await exported.locator('.hero-scene').first().evaluate(i=>i.naturalWidth),1916);assert.equal((await exported.locator('#hero').innerText()).trim(),'');
  const legacy=JSON.parse(JSON.stringify(seed));delete legacy.hero.motionRevision;legacy.hero.interval=7000;legacy.hero.autoplay=false;legacy.hero.slides[0].title='اطلاعات قدیمی';legacy.hero.slides[0].image=stored.hero.slides[0].image;
  await page.goto(base);await page.evaluate(d=>localStorage.setItem('ava-content-studio-v1',JSON.stringify(d)),legacy);await page.reload();await page.goto(base+'#admin/hero');assert.equal(await page.locator('#hero-form [name=interval]').inputValue(),'2');assert.equal(await page.locator('#hero-form [name=autoplay]').count(),0);assert.equal(await rows.first().locator('[name=title]').inputValue(),'اطلاعات قدیمی');assert.equal(await rows.first().locator('.media-preview img').getAttribute('src'),stored.hero.slides[0].image);
  await page.locator('#hero-form [type=submit]').click();await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ava-content-studio-v1')).hero.autoplay),true);
  console.log('PASS standalone export, previous-version speed migration with image/data preservation, and always-enabled autoplay');

  for(const width of [320,390,768]){
   const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.evaluate(()=>document.fonts.ready);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);assert.equal(await p.locator('#hero').evaluate(n=>n.getBoundingClientRect().height),width<=760?Math.max(200,Math.min(440,width*.625)):900-(await p.locator('.site-header').boundingBox()).height);
   const image=await p.locator('.hero-slide[aria-hidden=false] img').boundingBox(),hero=await p.locator('#hero').boundingBox();assert.equal(image.width,hero.width);assert.equal(image.height,hero.height);
   assert.equal((await p.locator('#hero').innerText()).trim(),'');await p.waitForTimeout(1200);assert.equal(await p.locator('.hero-slide').first().getAttribute('aria-hidden'),'false');await p.screenshot({path:`/tmp/ava-v14-${width}.png`});await p.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS responsive image frame, no overlay text or horizontal overflow at 320/390/768, reduced motion and no browser errors');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
