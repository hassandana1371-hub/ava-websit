const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const seed = JSON.parse(fs.readFileSync(path.join(root,'src/defaults.json'),'utf8'));
const labels = ['اجارهٔ تریلر LED سیار','اجارهٔ تلویزیون‌های شهری','مشاورهٔ پروژه‌ها','طراحی و نصب ویدئووال','راه‌اندازی تجهیزات تصویر','پشتیبانی و نگهداری نمایشگرها','آموزش و تحویل پروژه'];

(async()=>{
  const html = fs.readFileSync(path.join(root,'index.html'));
  const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const errors = [];
  try {
    const page = await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce',acceptDownloads:true});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.evaluate(()=>document.fonts.ready);
    await page.locator('.services-menu-trigger').hover();await page.waitForTimeout(200);assert.equal(await page.locator('.services-dropdown').isVisible(),false);
    await page.locator('.services-menu-trigger').click();await page.locator('.services-dropdown').waitFor({state:'visible'});
    assert.deepEqual(await page.locator('.services-dropdown a>span:first-child').allTextContents(),labels);
    await page.screenshot({path:'/tmp/ava-v11-services-desktop.png',fullPage:false});
    await page.locator('.products-menu-trigger').click();assert.equal(await page.locator('.services-dropdown').isVisible(),false);
    await page.locator('.services-menu-trigger').click();assert.equal(await page.locator('.products-dropdown').isVisible(),false);
    await page.locator('.services-dropdown a[href="#service/initial-rental"]').click();
    await page.locator('.service-page-heading h1').filter({hasText:labels[1]}).waitFor();assert.equal(await page.locator('#home-content').isVisible(),false);
    await page.reload();assert.equal(await page.locator('.service-page-heading h1').textContent(),labels[1]);
    await page.getByRole('link',{name:'درخواست این خدمت',exact:true}).click();await page.locator('#home-content').waitFor({state:'visible'});
    assert((await page.locator('#message').inputValue()).includes(labels[1]));
    await page.goto(base+'#services');await page.locator('#services .card-action').first().click();await page.locator('.service-page').waitFor();
    assert.equal(await page.locator('#content-detail').isVisible(),false);
    console.log('PASS services menu labels, click-only behavior, mutually exclusive menus, detail page, reload and request prefill');

    await page.goto(base+'#admin/services');
    let row = page.locator('[data-entry-id=initial-rental]');await row.getByRole('button',{name:'ویرایش',exact:true}).click();
    await page.locator('#entry-form [name=title]').fill('اجارهٔ نمایشگر برای رویداد');
    await page.locator('#entry-form [name=body]').fill('متن ویرایش‌شدهٔ خدمت از داخل پنل');
    await page.locator('#entry-form [type=submit]').click();await page.locator('#entry-editor').waitFor({state:'hidden'});
    await page.goto(base+'#service/initial-rental');await page.locator('.service-page-heading h1').filter({hasText:'اجارهٔ نمایشگر برای رویداد'}).waitFor();
    assert((await page.locator('.service-page-body').textContent()).includes('متن ویرایش‌شدهٔ خدمت از داخل پنل'));
    await page.goto(base+'#admin/services');await page.locator('[data-entry-id=initial-rental]').getByRole('button',{name:'پیش‌نویس',exact:true}).click();
    await page.goto(base+'#service/initial-rental');await page.locator('.product-not-found h1').filter({hasText:'این خدمت در دسترس نیست.'}).waitFor();
    await page.locator('.services-menu-trigger').click();assert.equal(await page.locator('.services-dropdown a').count(),6);
    await page.goto(base+'#admin/services');await page.locator('[data-entry-id=initial-rental]').getByRole('button',{name:'انتشار',exact:true}).click();
    await page.goto(base+'#admin/backup');const wait = page.waitForEvent('download');await page.locator('#export-site').click();const download = await wait;
    const exportedPath = '/tmp/ava-v11-services-export.html';await download.saveAs(exportedPath);
    const restored = await browser.newPage({reducedMotion:'reduce'});await restored.route('http://services-restored.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(exportedPath,'utf8')}));
    await restored.goto('http://services-restored.test/#service/initial-rental');assert.equal(await restored.locator('.service-page-heading h1').textContent(),'اجارهٔ نمایشگر برای رویداد');
    console.log('PASS panel editing, draft exclusion, republishing and self-contained export');

    const old = JSON.parse(JSON.stringify(seed));delete old.servicesRevision;old.updatedAt=Date.now();
    old.modules.services.items = [
      {...seed.modules.services.items.find(i=>i.id==='initial-rental'),title:'اجارهٔ نمایشگر',body:'توضیح قبلی حفظ شود'},
      {...seed.modules.services.items.find(i=>i.id==='initial-consulting'),title:'مشاورهٔ انتخاب'},
      {...seed.modules.services.items.find(i=>i.id==='initial-rental'),id:'custom-service',title:'خدمت اختصاصی قبلی',body:'اطلاعات اختصاصی'}
    ];
    await page.goto(base);await page.evaluate(value=>localStorage.setItem('ava-content-studio-v1',JSON.stringify(value)),old);await page.reload();
    await page.locator('.services-menu-trigger').click();assert.equal(await page.locator('.services-dropdown a').count(),8);
    await page.locator('.services-dropdown a[href="#service/initial-rental"]').click();await page.locator('.service-page').waitFor();
    assert.equal(await page.locator('.service-page-heading h1').textContent(),labels[1]);assert((await page.locator('.service-page-body').textContent()).includes('توضیح قبلی حفظ شود'));
    await page.goto(base+'#service/custom-service');assert.equal(await page.locator('.service-page-heading h1').textContent(),'خدمت اختصاصی قبلی');
    console.log('PASS previous services migrate once while preserving custom records and descriptions');

    for (const width of [390,320]) {
      const context = await browser.newContext({viewport:{width,height:800},hasTouch:true,isMobile:true,reducedMotion:'reduce'});const mobile = await context.newPage();mobile.on('pageerror',error=>errors.push(error.message));
      await mobile.goto(base);await mobile.evaluate(()=>document.fonts.ready);await mobile.locator('.services-menu-trigger').tap();
      const box = await mobile.locator('.services-dropdown').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y+box.height<=800);
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),width,'Open services menu must not expand the document');
      assert.equal(await mobile.evaluate(()=>scrollX),0,'Opening the menu must not shift the page');
      if(width===390)await mobile.screenshot({path:'/tmp/ava-v11-services-mobile.png',fullPage:false});
      await mobile.locator('.services-dropdown a[href="#service/service-videowall"]').tap();await mobile.locator('.service-page').waitFor();
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await context.close();
    }
    assert.deepEqual(errors,[]);console.log('PASS services dropdown and page on 390/320 mobile; no browser errors');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1);});
