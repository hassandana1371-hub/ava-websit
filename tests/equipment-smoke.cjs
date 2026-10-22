const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'..');
const seed = JSON.parse(fs.readFileSync(path.join(root,'src/defaults.json'),'utf8'));
const names = ['رسیور کارت','پاور (منبع تغذیه)','مگنت','پروسسور','سندر کارت','هاب‌برد','ماژول LED','کابل و اتصالات'];

(async()=>{
  const html = fs.readFileSync(path.join(root,'index.html'));
  const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
  try{
    const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.evaluate(()=>document.fonts.ready);
    await page.locator('.partners-menu-trigger').hover();await page.waitForTimeout(180);assert.equal(await page.locator('.partners-dropdown').isVisible(),false);
    await page.locator('.partners-menu-trigger').click();await page.locator('.partners-dropdown').waitFor({state:'visible'});
    await page.locator('.equipment-category-trigger').click();assert.deepEqual(await page.locator('.equipment-submenu a').allTextContents(),names);
    await page.locator('.equipment-submenu a[href="#equipment/receiving-card"]').click();await page.locator('.equipment-page h1').waitFor();
    assert.equal(await page.locator('.equipment-page h1').textContent(),'رسیور کارت');await page.reload();assert.equal(await page.locator('.equipment-page h1').textContent(),'رسیور کارت');
    await page.getByRole('link',{name:'استعلام قیمت و موجودی',exact:true}).click();await page.locator('#home-content').waitFor({state:'visible'});assert((await page.locator('#message').inputValue()).includes('استعلام تجهیز «رسیور کارت»'));
    console.log('PASS partners equipment branch, exact order, click-only behavior, dedicated page and quote prefill');

    await page.goto(base+'#admin/equipment');await page.locator('#entry-list').waitFor();assert.equal(await page.locator('#entry-list .admin-entry').count(),8);
    await page.locator('[data-entry-id=receiving-card]').getByRole('button',{name:'ویرایش',exact:true}).click();
    await page.locator('#entry-form [name=title]').fill('رسیور کارت حرفه‌ای');await page.locator('#entry-form [name=body]').fill('توضیح سفارشی تجهیز');await page.locator('#entry-form [type=submit]').click();await page.locator('#entry-editor').waitFor({state:'hidden'});
    await page.goto(base+'#equipment/receiving-card');await page.locator('.equipment-page h1').filter({hasText:'رسیور کارت حرفه‌ای'}).waitFor();assert((await page.locator('.service-page-body').textContent()).includes('توضیح سفارشی تجهیز'));
    await page.goto(base+'#admin/equipment');await page.locator('[data-entry-id=receiving-card]').getByRole('button',{name:'پیش‌نویس',exact:true}).click();
    await page.goto(base+'#equipment/receiving-card');await page.locator('.product-not-found h1').filter({hasText:'این تجهیز در دسترس نیست.'}).waitFor();
    await page.locator('.partners-menu-trigger').click();await page.locator('.equipment-category-trigger').click();assert.equal(await page.locator('.equipment-submenu a').count(),7);
    await page.goto(base+'#admin/equipment');await page.locator('[data-entry-id=receiving-card]').getByRole('button',{name:'انتشار',exact:true}).click();
    await page.locator('#add-entry').click();await page.locator('#entry-form [name=title]').fill('تجهیز سفارشی');await page.locator('#entry-form [name=status]').selectOption('published');await page.locator('#entry-form [type=submit]').click();await page.locator('#entry-editor').waitFor({state:'hidden'});
    const row=page.locator('.admin-entry').filter({hasText:'تجهیز سفارشی'});page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'حذف',exact:true}).click();await page.reload();assert.equal(await page.locator('#entry-list .admin-entry').count(),8);
    await page.goto(base+'#equipment');await page.locator('.equipment-list').waitFor();assert.equal(await page.locator('.equipment-list article').count(),8);
    console.log('PASS editable equipment module, draft protection, add/delete persistence and equipment overview');

    await page.goto(base+'#admin/backup');const waiting=page.waitForEvent('download');await page.locator('#export-site').click();const file='/tmp/ava-v12-export.html';await(await waiting).saveAs(file);
    const restored=await browser.newPage();await restored.route('http://equipment-restored.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8')}));await restored.goto('http://equipment-restored.test/#equipment/receiving-card');assert.equal(await restored.locator('.equipment-page h1').textContent(),'رسیور کارت حرفه‌ای');
    const legacy=JSON.parse(JSON.stringify(seed));delete legacy.modules.equipment;legacy.updatedAt=Date.now();legacy.modules.partners.items=[{...seed.modules.services.items[0],id:'existing-partner',title:'همکار قبلی',body:'اطلاعات همکار حفظ شود'}];
    await page.goto(base);await page.evaluate(value=>localStorage.setItem('ava-content-studio-v1',JSON.stringify(value)),legacy);await page.reload();
    await page.locator('.partners-menu-trigger').click();assert.equal(await page.locator('.partners-directory-link').textContent(),'معرفی همکاران');await page.locator('.equipment-category-trigger').click();assert.equal(await page.locator('.equipment-submenu a').count(),8);
    await page.locator('.partners-directory-link').click();await page.locator('#partners').waitFor({state:'visible'});assert.equal(await page.locator('#partners h3').textContent(),'همکار قبلی');
    await page.goto(base+'#admin/partners');assert.equal(await page.locator('#entry-list .admin-entry').count(),1);await page.locator('.admin-sidebar [data-page=equipment]').click();assert.equal(await page.locator('#entry-list .admin-entry').count(),8);
    console.log('PASS standalone export and old data migration preserve collaborator records separately from equipment');

    for(const width of [390,320]){
      const context=await browser.newContext({viewport:{width,height:800},hasTouch:true,isMobile:true});const mobile=await context.newPage();mobile.on('pageerror',e=>errors.push(e.message));
      await mobile.goto(base);await mobile.evaluate(()=>document.fonts.ready);await mobile.locator('.partners-menu-trigger').tap();await mobile.locator('.equipment-category-trigger').tap();
      assert.equal(await mobile.locator('.equipment-submenu a:visible').count(),8);const box=await mobile.locator('.partners-dropdown').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y+box.height<=800);
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),width);assert.equal(await mobile.evaluate(()=>scrollX),0);
      if(width===390)await mobile.screenshot({path:'/tmp/ava-v12-equipment-mobile.png',fullPage:false});
      await mobile.locator('.equipment-submenu a[href="#equipment/sending-card"]').tap();await mobile.locator('.equipment-page h1').filter({hasText:'سندر کارت'}).waitFor();assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),width);
      await context.close();
    }
    assert.deepEqual(errors,[]);console.log('PASS mobile nested navigation, screen bounds at 390/320 and no browser errors');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1);});
