const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'..');
const seed = JSON.parse(fs.readFileSync(path.join(root,'src/defaults.json'),'utf8'));
(async()=>{
 const html = fs.readFileSync(path.join(root,'index.html'));
 const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base = `http://127.0.0.1:${server.address().port}/`;
 const browser = await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM || '/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 const current = page=>page.locator('.hero-slide-choice[aria-current=true]');
 try{
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.hero-slide').count(),4);assert.equal(await page.locator('.hero-slide:visible').count(),1);
  const metrics = await page.evaluate(()=>({bottom:document.querySelector('#hero').getBoundingClientRect().bottom,images:[...document.querySelectorAll('.hero-scene')].map(i=>({ok:i.complete&&i.naturalWidth>1800,src:i.src.slice(0,23)})),width:document.documentElement.scrollWidth}));
  assert.equal(metrics.bottom,900);assert.equal(metrics.width,1440);assert(metrics.images.every(i=>i.ok&&i.src.startsWith('data:image/webp;base64,')));
  assert.equal(await page.locator('#hero-play').getAttribute('aria-pressed'),'false');
  await page.locator('#hero-next').click();assert((await current(page).getAttribute('aria-label')).includes('شیشه،'));
  assert.equal(await page.locator('.hero-slide:visible .button').getAttribute('href'),'#category/transparent');
  await page.locator('.hero-slide:visible .button').click();await page.locator('.catalog-heading h1').filter({hasText:'نمایشگرهای شفاف'}).waitFor();
  await page.goto(base);await page.locator('#hero-previous').click();assert((await current(page).getAttribute('aria-label')).includes('زیر قدم‌ها'));
  await page.locator('#hero-viewport').focus();await page.keyboard.press('ArrowRight');assert((await current(page).getAttribute('aria-label')).includes('بدون مرز'));
  assert.equal(await page.locator('.hero-slide:visible .button').getAttribute('href'),'#category/rental-flexible');
  console.log('PASS four embedded high-resolution images, full first viewport, next/previous wrapping, keyboard, reduced motion and category links');

  await page.goto(base+'#admin/hero');const rows=page.locator('.hero-editor-slide');assert.equal(await rows.count(),4);
  await rows.first().locator('[name=title]').fill('عنوان اختصاصی آوا');await rows.first().locator('[name=description]').fill('متن سفارشی برای اسلاید اول');
  await rows.first().locator('[data-slide-image]').setInputFiles(path.join(root,'src/assets/hero-film.webp'));
  await page.locator('#hero-form [type=submit]').click();
  await rows.first().locator('[data-slide-image]').setInputFiles(path.join(root,'src/assets/hero-flex.webp'));await page.locator('#hero-form [type=submit]').click();
  await page.goto(base);await page.locator('.hero-slide:visible h1').filter({hasText:'عنوان اختصاصی آوا'}).waitFor();assert.equal(await page.locator('#hero-image-caption').isVisible(),false);
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('ava-content-studio-v1')));
  assert(saved.hero.slides[0].image.startsWith('data:image/webp;base64,'));assert.equal(saved.hero.slides[0].image,'data:image/webp;base64,'+fs.readFileSync(path.join(root,'src/assets/hero-flex.webp')).toString('base64'));
  await page.reload();assert((await page.locator('.hero-slide:visible h1').textContent()).includes('عنوان اختصاصی آوا'));
  await page.goto(base+'#admin/hero');await rows.first().locator('[data-move-slide="1"]').click();await page.locator('#hero-form [type=submit]').click();await page.goto(base);assert((await page.locator('.hero-slide:visible h1').textContent()).includes('شیشه،'));
  await page.goto(base+'#admin/hero');await page.locator('#add-hero-slide').click();assert.equal(await rows.count(),5);await rows.last().locator('[name=title]').fill('اسلاید افزوده');await page.locator('#hero-form [type=submit]').click();
  await page.reload();assert.equal(await rows.count(),5);await rows.last().locator('summary').click();page.once('dialog',d=>d.accept());await rows.last().locator('[data-delete-slide]').click();await page.locator('#hero-form [type=submit]').click();await page.reload();assert.equal(await rows.count(),4);
  console.log('PASS per-slide text, repeat image replacement after save, persistence, reordering, add/delete and custom image caption');

  await page.goto(base+'#admin/backup');const downloading=page.waitForEvent('download');await page.locator('#export-site').click();const file='/tmp/ava-v13-hero-export.html';await(await downloading).saveAs(file);
  const restored = await browser.newPage({reducedMotion:'reduce'});await restored.route('http://hero-export.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')}));await restored.goto('http://hero-export.test/');assert.equal(await restored.locator('.hero-slide').count(),4);assert((await restored.locator('.hero-slide:visible h1').textContent()).includes('شیشه،'));assert.equal(await restored.locator('.hero-scene').first().evaluate(i=>i.naturalWidth),1916);
  const legacy=JSON.parse(JSON.stringify(seed));delete legacy.hero.slides;delete legacy.hero.autoplay;delete legacy.hero.interval;legacy.hero.title='عنوان نسخهٔ قبلی';legacy.hero.image='data:image/webp;base64,'+fs.readFileSync(path.join(root,'src/assets/hero-wall.webp')).toString('base64');
  await page.goto(base);await page.evaluate(value=>localStorage.setItem('ava-content-studio-v1',JSON.stringify(value)),legacy);await page.reload();assert((await page.locator('.hero-slide:visible h1').textContent()).includes('عنوان نسخهٔ قبلی'));assert.equal(await page.locator('.hero-slide').count(),4);assert.equal(await page.locator('#hero-image-caption').isVisible(),false);
  console.log('PASS standalone HTML export keeps images and edits; migration preserves old hero text and uploaded image');

  const animated = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});animated.on('pageerror',e=>errors.push(e.message));
  await animated.goto(base);await animated.evaluate(value=>{value.hero.interval=4000;localStorage.setItem('ava-content-studio-v1',JSON.stringify(value));},seed);await animated.reload();
  await animated.waitForTimeout(4200);assert((await current(animated).getAttribute('aria-label')).includes('شیشه،'));await animated.waitForTimeout(1100);
  await animated.locator('#hero-next').click();await animated.waitForTimeout(1100);assert((await current(animated).getAttribute('aria-label')).includes('بدون مرز'));assert.equal(await animated.locator('#hero-play').getAttribute('aria-pressed'),'false');
  await animated.mouse.move(0,0);await animated.waitForTimeout(4200);assert((await current(animated).getAttribute('aria-label')).includes('بدون مرز'));
  await animated.locator('#hero-play').click();await animated.mouse.move(0,0);await animated.locator('.site-header').click({position:{x:5,y:5}});await animated.waitForTimeout(4200);assert((await current(animated).getAttribute('aria-label')).includes('زیر قدم‌ها'));await animated.waitForTimeout(1100);assert.equal(await animated.locator('.hero-slide:visible').count(),1);
  console.log('PASS animated transitions, autoplay, manual stop and explicit restart without duplicate slides');

  for(const width of [390,320,768]){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,isMobile:true,reducedMotion:'reduce'});const mobile=await context.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await mobile.evaluate(()=>document.fonts.ready);
   assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),width);
   for(let n=0;n<4;n++){
    const copy=await mobile.locator('.hero-slide:visible .hero-copy').boundingBox(),footer=await mobile.locator('.hero-slider-footer').boundingBox();assert(copy.x>=0&&copy.x+copy.width<=width+1);assert(copy.y+copy.height<footer.y);
    await mobile.locator('#hero-next').tap();
   }
   const view=mobile.locator('#hero-viewport');await view.dispatchEvent('pointerdown',{pointerType:'touch',clientX:250,clientY:350});await view.dispatchEvent('pointerup',{pointerType:'touch',clientX:100,clientY:355});assert((await current(mobile).getAttribute('aria-label')).includes('شیشه،'));
   await mobile.screenshot({path:`/tmp/ava-v13-final-${width}.png`});await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS touch/swipe and readable slides without horizontal overflow at 320/390/768; no browser errors');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1);});
