const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
(async()=>{
 const html=fs.readFileSync(path.join(root,'index.html'));
 const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});r.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/`;const browser=await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);const frame=page.locator('.hero-motion-frame');await frame.waitFor();await page.waitForFunction(()=>document.querySelector('.hero-motion-frame')?.contentDocument?.getAnimations().length===12);
  assert.equal(await page.locator('.hero-slide').count(),6);assert.equal(await page.locator('.hero-slide[aria-hidden=false]').getAttribute('class'),'hero-slide hero-motion-slide');
  assert.equal(await page.locator('.hero-arrow').count(),2);assert.equal(await page.locator('.hero-dot').count(),6);assert.equal(await page.locator('#hero a,.hero-slider-footer').count(),0);assert.equal(await frame.getAttribute('sandbox'),'allow-same-origin');
  const timings=await frame.evaluate(f=>f.contentDocument.getAnimations().map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations,end:a.effect.getComputedTiming().endTime})));
  assert(timings.every(t=>t.duration===7000&&t.iterations===2));assert.equal(Math.max(...timings.map(t=>t.end)),14120);
  await page.waitForFunction(()=>{const f=document.querySelector('.hero-motion-frame');return f.contentDocument.querySelector('.stage').getAnimations()[0].effect.getComputedTiming().currentIteration===1;},{},{timeout:9000});
  assert.equal(await page.locator('.hero-motion-slide').getAttribute('aria-hidden'),'false');
  await page.waitForFunction(()=>document.querySelector('.hero-slide[aria-hidden=false] img')?.alt.includes('نمایشگر LED بزرگ'),{},{timeout:9000});
  await page.waitForTimeout(700);assert.equal(await page.locator('.hero-slide:visible').count(),1);
  await page.waitForFunction(()=>document.querySelector('.hero-slide[aria-hidden=false] img')?.alt.includes('فیلم LED شفاف'),{},{timeout:2500});
  console.log('PASS original SVG plays two real 7-second loops, then transitions to photos with their 2-second interval');
  // Return to the logo after the full photo sequence; its animation must restart.
  await page.waitForFunction(()=>document.querySelector('.hero-motion-slide').getAttribute('aria-hidden')==='false',{},{timeout:8000});
  await page.waitForFunction(()=>document.querySelector('.hero-motion-frame').contentDocument.querySelector('.stage').getAnimations()[0].playState==='running');const restarted=await frame.evaluate(f=>f.contentDocument.querySelector('.stage').getAnimations()[0].currentTime);assert(restarted<1000);
  console.log('PASS carousel returns to the logo and restarts its two-iteration animation');

  await page.goto(base+'#admin/hero');assert.equal(await page.locator('#hero-form [name=showMotionLogo]').isChecked(),true);await page.locator('#hero-form [name=showMotionLogo]').uncheck();await page.locator('#hero-form [type=submit]').click();await page.goto(base);assert.equal(await frame.count(),0);assert.equal(await page.locator('.hero-slide').count(),5);
  await page.goto(base+'#admin/hero');await page.locator('#hero-form [name=showMotionLogo]').check();await page.locator('#hero-form [type=submit]').click();
  await page.goto(base+'#admin/backup');const downloading=page.waitForEvent('download');await page.locator('#export-site').click();const file='/tmp/ava-v16-motion-export.html';await(await downloading).saveAs(file);
  const restored=await browser.newPage({reducedMotion:'reduce'});await restored.route('http://motion-export.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')}));await restored.goto('http://motion-export.test/');await restored.waitForFunction(()=>document.querySelector('.hero-motion-frame')?.contentDocument?.getAnimations().length===12);assert.equal(await restored.locator('.hero-scene').count(),5);
  assert(await restored.locator('.hero-motion-frame').evaluate(f=>f.contentDocument.getAnimations().every(a=>a.playState==='paused'&&a.currentTime===3500)));
  console.log('PASS panel toggle, standalone HTML export with embedded SVG and static reduced-motion presentation');
  for(const width of [320,390]){
   const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.waitForFunction(()=>document.querySelector('.hero-motion-frame')?.contentDocument?.getAnimations().length===12);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);const bounds=await p.locator('.hero-motion-frame').boundingBox();assert.equal(bounds.width,width);assert.equal(bounds.y+bounds.height,900);await p.screenshot({path:`/tmp/ava-v16-motion-${width}.png`});await p.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS mobile logo fits at 320/390, no horizontal overflow or browser errors');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
