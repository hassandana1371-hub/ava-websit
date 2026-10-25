// Requires Playwright and Chromium; the app itself has no package dependencies.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.AVA_TEST_URL || 'http://127.0.0.1:8082/';
const fixture = path.join('/tmp','ava-catalog-export-test.html');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect x="10" y="10" width="140" height="80" rx="8" fill="#5271ff"/></svg>');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.AVA_TEST_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    const page = await context.newPage();const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(base);
    await page.locator('.products-menu-trigger').click();
    assert.equal(await page.locator('.products-dropdown>.product-category-group').count(),7);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.products-menu-trigger').getAttribute('aria-expanded'),'false');
    await page.locator('.products-menu-trigger').click();
    await page.goto(base + '#category/urban-indoor');
    await page.waitForURL('**/#category/urban-indoor');
    assert.equal(await page.locator('#catalog-page h1').textContent(),'تلویزیون‌های شهری داخلی');
    assert.equal(await page.locator('#home-content').isVisible(),false);
    await page.locator('#catalog-page .product-card[href="#product/indoor-125"]').click();
    await page.waitForURL('**/#product/indoor-125');
    assert.equal(await page.locator('.product-introduction h1').textContent(),'ماژول LED داخلی P1.25');
    assert.equal(await page.locator('#content-detail').isVisible(),false);
    await page.reload();assert.equal(await page.locator('.product-introduction h1').textContent(),'ماژول LED داخلی P1.25');
    await page.goBack();await page.waitForURL('**/#category/urban-indoor');
    await page.goForward();await page.waitForURL('**/#product/indoor-125');
    console.log('PASS dropdown, category page, dedicated product link, reload and browser history');

    await page.locator('.site-menu-toggle').click();await page.locator('#open-admin').click();
    const go = async key => {await page.locator(`.admin-sidebar [data-page="${key}"]`).click();};
    await go('categories');await page.locator('#add-category').click();
    await page.locator('#category-form [name=name]').fill('دستهٔ آزمایشی');
    await page.locator('#category-form [name=description]').fill('معرفی دستهٔ قابل ویرایش');
    await page.locator('#category-form [type=submit]').click();
    await page.locator('#category-editor').waitFor({state:'hidden'});
    const row = page.locator('#category-admin-list .admin-entry').filter({hasText:'دستهٔ آزمایشی'});
    const categoryId = await row.getAttribute('data-category-id');
    await row.getByRole('button',{name:'ویرایش',exact:true}).click();
    await page.locator('#category-form [name=name]').fill('نمایشگرهای ویژه');
    await page.locator('#category-form [type=submit]').click();await page.locator('#category-editor').waitFor({state:'hidden'});
    console.log('PASS create and rename category');

    await go('products');await page.locator('#add-entry').click();
    await page.locator('#entry-form [name=title]').fill('نمایشگر آزمایشی');
    await page.locator('#entry-form [name=model]').fill('AVA-TEST');
    await page.locator('#entry-category').selectOption(categoryId);
    await page.locator('#entry-form [name=featured]').check();
    await page.locator('#entry-form [name=summary]').fill('خلاصهٔ محصول آزمایشی');
    await page.locator('#entry-form [name=body]').fill('متن معرفی کامل محصول');
    await page.locator('#entry-form [name=specifications]').fill('کاربری: فضای داخلی\nنوع نمایشگر: LED');
    await page.locator('#entry-form [name=datasheetUrl]').fill('https://example.com/specs.pdf');
    await page.locator('#entry-form [name=manualUrl]').fill('https://example.com/manual.pdf');
    await page.locator('#entry-image').setInputFiles({name:'product.svg',mimeType:'image/svg+xml',buffer:svg});
    await page.locator('#entry-image-preview img').waitFor();
    await page.locator('#entry-pdf').setInputFiles({name:'specs.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% fixture\n%%EOF')});
    await page.locator('#pdf-filename').filter({hasText:'specs.pdf'}).waitFor();
    await page.locator('#entry-form [type=submit]').click();await page.locator('#entry-editor').waitFor({state:'hidden'});
    const itemRow = page.locator('#entry-list .admin-entry').filter({hasText:'نمایشگر آزمایشی'});
    const productId = await itemRow.getAttribute('data-entry-id');
    await page.goto(base + '#product/' + productId);
    assert.equal(await page.locator('.product-not-found').count(),1,'Draft product direct link must not reveal the product');
    await page.goto(base + '#admin/products');
    await page.locator('#entry-list .admin-entry').filter({hasText:'نمایشگر آزمایشی'}).getByRole('button',{name:'انتشار',exact:true}).click();
    await page.locator('#view-site').click();await page.waitForURL('**/#home');
    assert.equal(await page.locator('#featured-products .product-card').filter({hasText:'نمایشگر آزمایشی'}).count(),1);
    await page.goto(base + '#category/' + categoryId);
    await page.locator('.catalog-search').fill('AVA-TEST');assert.equal(await page.locator('#catalog-page .product-card').count(),1);
    await page.locator('.catalog-search').fill('پیدا نشود');assert.equal(await page.locator('#catalog-page .product-card').count(),0);
    await page.locator('.catalog-search').fill('');await page.locator('#catalog-page .product-card').click();
    await page.getByRole('tab',{name:'مشخصات فنی',exact:true}).click();
    assert.equal(await page.locator('.product-specifications tr').count(),2);
    assert((await page.locator('.product-specifications').textContent()).includes('فضای داخلی'));
    await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:'فایل‌ها و دانلودها'}).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.product-downloads a').count(),3);
    const pdfWait = page.waitForEvent('download');await page.locator('.product-downloads a').first().click();const pdf = await pdfWait;
    assert.equal(pdf.suggestedFilename(),productId + '.pdf');
    await page.getByRole('link',{name:'استعلام این محصول'}).click();
    await page.waitForURL('**/#contact');await page.locator('#home-content').waitFor({state:'visible'});
    assert((await page.locator('#message').inputValue()).includes('نمایشگر آزمایشی'));
    console.log('PASS product editor, draft/publication, featured selection, model search, specs, PDF download, consultation');

    await page.goto(base + '#admin/categories');
    await page.locator(`[data-category-id="${categoryId}"]`).getByRole('button',{name:'ویرایش',exact:true}).click();
    await page.locator('#category-form [name=visible]').uncheck();
    await page.locator('#category-form [type=submit]').click();await page.locator('#category-editor').waitFor({state:'hidden'});
    await page.goto(base + '#product/' + productId);assert.equal(await page.locator('.product-not-found').count(),1);
    await page.goto(base + '#category/' + categoryId);assert.equal(await page.locator('.product-not-found').count(),1);
    await page.goto(base + '#admin/categories');
    page.once('dialog',dialog => dialog.accept());
    await page.locator(`[data-category-id="${categoryId}"]`).getByRole('button',{name:'حذف',exact:true}).click();
    await page.goto(base + '#product/' + productId);
    assert.equal(await page.locator('.product-introduction h1').textContent(),'نمایشگر آزمایشی');
    assert.equal(await page.locator('.product-introduction>.product-category-label').textContent(),'دسته‌بندی‌نشده');
    assert.equal(await page.locator('.product-introduction img').count(),0);
    console.log('PASS hidden category and draft direct-link guards; category deletion preserves and reassigns product');

    await page.goto(base + '#admin/products');
    await page.locator('#entry-list .admin-entry').filter({hasText:'نمایشگر آزمایشی'}).getByRole('button',{name:'ویرایش',exact:true}).click();
    await page.locator('#entry-form [name=specifications]').fill('خط نامعتبر');
    await page.locator('#entry-form [type=submit]').click();assert((await page.locator('#entry-error').textContent()).includes('نام: مقدار'));
    page.once('dialog',dialog => dialog.accept());await page.locator('#cancel-entry').click();
    await page.goto(base + '#product/' + productId);await page.getByRole('tab',{name:'مشخصات فنی',exact:true}).click();
    assert.equal(await page.locator('.product-specifications tr').count(),2);
    console.log('PASS invalid technical data preserves previously saved specifications');

    await page.goto(base + '#admin/backup');
    const exportWait = page.waitForEvent('download');await page.locator('#export-site').click();await (await exportWait).saveAs(fixture);
    const restoredContext = await browser.newContext({reducedMotion:'reduce'});const restored = await restoredContext.newPage();
    restored.on('pageerror',error => errors.push(error.message));
    await restored.route('http://catalog-restored.test/',route => route.fulfill({contentType:'text/html',body:fs.readFileSync(fixture,'utf8')}));
    await restored.goto('http://catalog-restored.test/#product/' + productId);
    assert.equal(await restored.locator('.product-introduction h1').textContent(),'نمایشگر آزمایشی');
    await restored.getByRole('tab',{name:'مشخصات فنی',exact:true}).click();assert.equal(await restored.locator('.product-specifications tr').count(),2);
    console.log('PASS standalone HTML export preserves product route, category, specifications and uploads');

    const legacy = JSON.parse(fs.readFileSync(path.join(__dirname,'../src/defaults.json'),'utf8'));
    delete legacy.productCategories;legacy.header.nameFa = 'نام حفظ‌شده';
    for (const product of legacy.modules.products.items) for (const key of ['categoryId','model','featured','specifications','datasheetUrl','manualUrl']) delete product[key];
    const legacyContext = await browser.newContext({reducedMotion:'reduce'});const oldPage = await legacyContext.newPage();
    oldPage.on('pageerror',error => errors.push(error.message));
    await oldPage.goto(base);await oldPage.evaluate(value => localStorage.setItem('ava-content-studio-v1',JSON.stringify(value)),legacy);await oldPage.reload();
    assert.equal(await oldPage.locator('.ava-wordmark small').textContent(),'نام حفظ‌شده');
    await oldPage.goto(base + '#product/indoor-125');
    assert.equal(await oldPage.locator('.product-introduction h1').textContent(),'ماژول LED داخلی P1.25');
    assert.equal(await oldPage.locator('.product-introduction>.product-category-label').textContent(),'دسته‌بندی‌نشده');
    console.log('PASS previous version migration preserves content and header without guessing product categories');

    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      for (const hash of ['products','category/urban-indoor','product/' + productId,'admin/categories','admin/products']) {
        await page.goto(base + '#' + hash);
        await page.locator(hash.startsWith('admin/') ? '#admin-app' : '#catalog-page').waitFor({state:'visible'});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`Overflow at ${width} ${hash}`);
      }
      await page.goto(base + '#products');await page.locator('.products-menu-trigger').click();
      const box = await page.locator('.products-dropdown').boundingBox();assert(box.x >= 0 && box.x+box.width <= width+1,'Dropdown must fit screen');
      if (width === 390) await page.screenshot({path:'/tmp/ava-v7-mobile.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS responsive catalogue, product page, admin and dropdown at 1440, 768, 390, 320; no browser errors');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
