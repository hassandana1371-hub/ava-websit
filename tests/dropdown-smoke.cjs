const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'..');
const labels = ['تلویزیون‌های شهری','تلویزیون‌های رنتال','استندهای دیجیتال','نمایشگرهای شفاف (ترنسپرنت)','نمایشگرهای کنفرانسی ـ خانگی','کف LED','نمایشگرهای تزئینی'];
const sublabels = {urban:['فضای داخلی','فضای خارجی','Flexible'],rental:['خارجی','داخلی','Flexible'],'conference-home':['لمسی','عادی']};
const state = JSON.parse(fs.readFileSync(path.join(root,'src/defaults.json'),'utf8'));
const template = state.modules.products.items[0];state.modules.products.items=[];
const title = (name,id) => ({...template,id,title:name,categoryId:id === 'outdoor-fixture' ? 'urban-outdoor' : 'urban-indoor'});
state.modules.products.items.push(title('محصول داخلی','indoor-fixture'),title('محصول خارجی','outdoor-fixture'));
state.updatedAt = Date.now();

(async () => {
  const html = fs.readFileSync(path.join(root,'index.html'));
  const server = http.createServer((req,res) => {res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const errors = [];
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e => errors.push(e.message));
    await page.goto(base);await page.evaluate(()=>document.fonts.ready);
    await page.locator('.products-menu-trigger').hover();await page.waitForTimeout(250);
    assert.equal(await page.locator('.products-dropdown').isVisible(),false,'Hover must not open products');
    await page.locator('.products-menu-trigger').click();await page.locator('.products-dropdown').waitFor({state:'visible'});
    assert.deepEqual(await page.locator('.product-category-row .product-category-name').allTextContents(),labels);
    assert.equal(await page.locator('.products-dropdown .dropdown-all').count(),0);
    for (const [id,names] of Object.entries(sublabels)) {
      const group = page.locator(`[data-category-group="${id}"]`);await group.hover();await page.waitForTimeout(150);
      assert.equal(await group.locator('.products-submenu').isVisible(),false,'Hover must not expand a category');
      const before = page.url();
      await group.locator('.subcategory-toggle').click();
      await group.locator('.products-submenu').waitFor({state:'visible'});
      assert.equal(page.url(),before,'Clicking the subcategory arrow should expand without navigating');
      assert.deepEqual(await group.locator('.products-submenu a>span').allTextContents(),names);
      assert.equal(await page.locator('.products-submenu:visible').count(),1);
    }
    await page.locator('[data-category-group=digital-stands]').hover();assert.equal(await page.locator('.products-submenu:visible').count(),1,'Hover must not alter the open category');
    await page.locator('[data-category-group=urban] .subcategory-toggle').focus();await page.keyboard.press('Enter');
    await page.locator('[data-category-group=urban] .products-submenu').waitFor({state:'visible'});
    await page.keyboard.press('Escape');assert.equal(await page.locator('[data-category-group=urban] .products-submenu').isVisible(),false);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.products-dropdown').isVisible(),false);
    console.log('PASS click-only root and category expansion, parent arrow action, Flexible, removed footer link and keyboard');

    await page.evaluate(value => localStorage.setItem('ava-content-studio-v1',JSON.stringify(value)),state);await page.reload();
    await page.goto(base + '#category/urban');await page.locator('#catalog-page').waitFor({state:'visible'});
    assert.equal(await page.locator('#catalog-page .product-card').count(),2);
    assert.deepEqual(await page.locator('.category-overview-card strong').allTextContents(),['فضای داخلی','فضای خارجی','Flexible']);
    await page.locator('.category-overview-card[href="#category/urban-indoor"]').click();await page.waitForURL('**/#category/urban-indoor');
    await page.locator('#catalog-page h1').filter({hasText:'داخلی'}).waitFor();assert.equal(await page.locator('#catalog-page .product-card').count(),1);
    assert((await page.locator('.catalog-breadcrumbs').textContent()).includes('تلویزیون‌های شهری'));
    console.log('PASS parent counts and product aggregation, child filtering and breadcrumb trail');

    await page.goto(base + '#admin/categories');
    await page.locator('[data-category-id=urban-indoor]').getByRole('button',{name:'ویرایش',exact:true}).click();
    assert.equal(await page.locator('#category-parent').inputValue(),'urban');
    await page.locator('#category-parent').selectOption('rental');await page.locator('#category-form [type=submit]').click();await page.locator('#category-editor').waitFor({state:'hidden'});
    await page.goto(base + '#category/rental');await page.locator('#catalog-page').waitFor({state:'visible'});
    assert.equal(await page.locator('#catalog-page .product-card').count(),1);
    await page.goto(base + '#admin/categories');await page.locator('[data-category-id=rental]').getByRole('button',{name:'ویرایش',exact:true}).click();
    assert.equal(await page.locator('#category-parent').isDisabled(),true);
    await page.locator('#category-form [name=visible]').uncheck();await page.locator('#category-form [type=submit]').click();await page.locator('#category-editor').waitFor({state:'hidden'});
    await page.goto(base + '#product/indoor-fixture');await page.locator('.product-not-found').waitFor();
    await page.goto(base + '#category/urban-indoor');await page.locator('.product-not-found').waitFor();
    await page.goto(base + '#admin/categories');page.once('dialog',d => d.accept());
    await page.locator('[data-category-id=rental]').getByRole('button',{name:'حذف',exact:true}).click();
    await page.goto(base + '#product/indoor-fixture');await page.locator('.product-introduction').waitFor();
    assert.equal(await page.locator('.product-introduction>.product-category-label').textContent(),'دسته‌بندی‌نشده');
    console.log('PASS editable parent links, hidden ancestor guards and subtree deletion preserving products');

    const legacy = JSON.parse(JSON.stringify(state));delete legacy.taxonomyRevision;
    legacy.productCategories = state.productCategories.filter(c => ['displays','controllers','accessories','uncategorized'].includes(c.id)).map(({parentId,menu,...rest}) => rest);
    legacy.modules.products.items = [{...legacy.modules.products.items[0],id:'legacy-product',title:'محصول قبلی',categoryId:'displays'}];legacy.header.nameFa = 'نام قبلی حفظ شود';
    await page.evaluate(value => localStorage.setItem('ava-content-studio-v1',JSON.stringify(value)),legacy);await page.goto(base);await page.reload();
    await page.locator('.products-menu-trigger').click();await page.locator('.products-dropdown').waitFor({state:'visible'});
    assert.deepEqual(await page.locator('.product-category-row .product-category-name').allTextContents(),labels);
    assert.equal(await page.locator('.ava-wordmark small').textContent(),'نام قبلی حفظ شود');
    await page.goto(base + '#product/legacy-product');assert.equal(await page.locator('.product-introduction h1').textContent(),'محصول قبلی');
    console.log('PASS version 7/8 data migration adds requested menu without losing existing content');

    for (const width of [390,320]) {
      const touch = await browser.newContext({viewport:{width,height:700},hasTouch:true,isMobile:true});const mobile = await touch.newPage();mobile.on('pageerror',e => errors.push(e.message));
      await mobile.goto(base);await mobile.evaluate(()=>document.fonts.ready);await mobile.locator('.products-menu-trigger').tap();await mobile.locator('.products-dropdown').waitFor({state:'visible'});
      for (const id of ['urban','rental','conference-home']) {
        const group = mobile.locator(`[data-category-group="${id}"]`);await group.locator('.subcategory-toggle').tap();
        await group.locator('.products-submenu').waitFor({state:'visible'});
        assert.equal(await group.locator('.products-submenu a:visible').count(),sublabels[id].length);
      }
      const box = await mobile.locator('.products-dropdown').boundingBox();assert(box.x>=0 && box.x+box.width<=width+1 && box.y+box.height<=700,'Nested menu must fit viewport');
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await mobile.locator('[data-category-group=conference-home] a[data-category=conference-touch]').tap();await mobile.waitForURL('**/#category/conference-touch');await mobile.locator('#catalog-page h1').filter({hasText:'لمسی'}).waitFor();
      if (width === 390) {await mobile.goto(base);await mobile.locator('.products-menu-trigger').tap();await mobile.locator('[data-category-group=rental] .subcategory-toggle').tap();await mobile.screenshot({path:'/tmp/ava-v10-mobile.png',fullPage:false});}
      await touch.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS mobile tap, nested menu navigation, screen bounds at 390/320 and no browser errors');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1);});
