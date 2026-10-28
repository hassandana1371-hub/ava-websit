(() => {
  'use strict';
  const bootHTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };
  const KEYS = ['products','services','projects','partners','software','articles','contact','catalog'];
  const CONTENT_KEYS = [...KEYS,'equipment'];
  const LABELS = {products:'محصولات',services:'خدمات',projects:'پروژه‌ها',partners:'همکاران',equipment:'فروش تجهیزات تلویزیون',software:'نرم‌افزار',articles:'مقالات',contact:'تماس با ما',catalog:'کاتالوگ'};
  const TITLES = {company:'معرفی شرکت',stats:'آمار بازدید',footer:'فوتر سایت',seo:'تنظیمات سئو',dashboard:'پیشخوان',header:'لوگو و هدر',hero:'هیرو / تصویر اصلی',navigation:'منوها و اتصال‌ها',categories:'دسته‌بندی محصولات',banners:'بنر اختصاصی صفحات',security:'رمز و ورود',backup:'نسخهٔ پشتیبان و خروجی'};
  const DESCRIPTIONS = {
    dashboard:'از اینجا ظاهر سایت را تنظیم کن و محتوای هر بخش را مدیریت کن.',
    header:'لوگو، نام فارسی و انگلیسی و شعارهای بالای سایت را جداگانه ویرایش کن.',
    hero:'موشن‌لوگوی آغازین، عکس‌ها، ترتیب اسلایدها و زمان جابه‌جایی هیرو را مدیریت کن.',
    navigation:'نام هر گزینه، مقصد آن، ترتیب نمایش و دیده‌شدنش را مشخص کن.',
    backup:'از اطلاعات نسخهٔ پشتیبان بگیر یا نسخهٔ کامل سایت و پنل را دریافت کن.',
    categories:'دسته‌ها را بساز، نام‌گذاری و مرتب کن؛ هر دسته صفحهٔ اختصاصی خودش را دارد.'
  };
  const META_LABELS = {products:'قیمت یا مشخصات کوتاه',services:'نوع خدمت / محدودهٔ ارائه',projects:'کارفرما / محل اجرا',partners:'زمینهٔ همکاری',equipment:'نام انگلیسی / نوع یا کاربرد تجهیز',software:'نسخه / سازگاری',articles:'نویسنده / موضوع',catalog:'نسخه / سال'};
  const storageKey = 'ava-content-studio-v1';
  const seed = JSON.parse($('#ava-initial-data').textContent);
  const defaultLogo = $('.ava-mark').outerHTML;
  const previewLogo = name => defaultLogo.replaceAll('ava-blue', 'ava-blue-' + name);
  const heroImages = JSON.parse($('#ava-hero-images').textContent);
  const productImages = {...JSON.parse($('#ava-product-images').textContent),...Object.fromEntries(Object.entries(heroImages).filter(([name])=>name.startsWith('trailer-')))};
  const legacyProductVisuals = JSON.parse($('#ava-product-visual-history').textContent);
  const heroMotionDocument = JSON.parse($('#ava-hero-motion').textContent);
  let heroController;
  const serverMode = !!$('#ava-server-mode');
  let authenticated = !serverMode, csrf = '', serverRevision = 0, serverReady = !serverMode, saving = false;
  let pageBannerControllers = [];
  let entryBannerEditor;
  let data = clone(seed);
  let persistence = true;
  let loadWarning = '';
  let dirty = false;
  let currentPage = '';
  let lastHash = currentHash();
  let adminVisible = false;
  let toastTimer;
  let editingModule = '';
  let entryImage = '';
  let entryImageAsset = '';
  let entryImageStyle = '';
  let categoryBannerEditor;
  let entryFile = '';

  async function api(path, payload) {
    const response = await fetch(path,{method:payload === undefined ? 'GET' : 'POST',credentials:'same-origin',headers:payload === undefined ? {} : {'Content-Type':'application/json','X-CSRF-Token':csrf},...(payload === undefined ? {} : {body:JSON.stringify(payload)})});
    let result;try {result = await response.json();}catch {throw new Error('پاسخ سرور قابل خواندن نیست؛ تغییرات ذخیره نشد.');}
    if (!response.ok) {if(response.status===401) authenticated=false;throw new Error(result.error || 'ارتباط با سرور انجام نشد.');}return result;
  }
  async function boot() {
    if(serverMode && location.pathname==='/admin' && !currentHash()) history.replaceState(null,'','#admin/dashboard');
    if (serverMode) {
      try {const session = await api('/api/session');authenticated=session.authenticated;csrf=session.csrf;serverReady=true;const result=await api('/api/content');data=validate(result.data);serverRevision=result.revision;
        $('.local-badge').textContent='متصل به سرور';$('.sidebar-note').textContent='تغییرات پس از ذخیره روی سرور نگهداری می‌شوند. از بخش پشتیبان خروجی بگیرید.';
        $('#admin-logout').hidden=false;
      } catch(error) {if(!currentHash().startsWith('#admin')&&$('#ava-seo-content'))return;renderLogin(error.message);return;}
    }
    data=validate(data);renderPublic();renderSidebar();route();document.documentElement.dataset.avaRoute=currentHash() || '#home';
  }
  function renderLogin(error = '') {
    $('#ava-seo-content')?.remove();setMeta('robots','noindex,nofollow');
    adminVisible=false;$('#public-site').hidden=true;$('#admin-app').hidden=true;
    const root=$('#admin-login');root.hidden=false;
    root.innerHTML=`<div class="login-card"><a href="#home" class="login-back">گروه آوا ↗</a><span class="admin-eyebrow">AVA GROUP / CONTENT STUDIO</span><h1>ورود به مدیریت سایت</h1><p>برای مدیریت محصولات، خدمات و بنرهای سایت وارد شوید.</p><form id="login-form" class="admin-form"><label>رمز مدیر<input type="password" name="password" autocomplete="current-password" required maxlength="256"></label><p role="alert" class="form-error" id="login-error">${escapeHTML(error)}</p><button class="admin-button" type="submit">ورود به پنل</button></form><small>رمز اولیه را هنگام راه‌اندازی سرور تعیین کنید؛ پس از ورود از بخش «رمز و ورود» قابل تغییر است.</small></div>`;
    $('#login-form').onsubmit=async event=>{event.preventDefault();const button=$('button[type=submit]',event.currentTarget);button.disabled=true;try {const session=await api('/api/login',{password:event.currentTarget.elements.password.value});csrf=session.csrf;authenticated=true;serverReady=true;const result=await api('/api/content');data=validate(result.data);serverRevision=result.revision;root.hidden=true;dirty=false;renderPublic();route();}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;}};
  }
  function renderSecurity(root) {
    if (!serverMode) {root.innerHTML='<div class="notice">ورود با رمز در نسخهٔ سروری فعال می‌شود. برای راه‌اندازی، بستهٔ سرور و راهنمای نصب را استفاده کنید؛ فایل HTML مستقل برای پیش‌نمایش و خروجی آفلاین است.</div>';return;}
    root.innerHTML='<div class="admin-panel"><form id="password-form" class="admin-form"><h2>تغییر رمز مدیر</h2><label>رمز فعلی<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="256"></label><label>رمز جدید<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="256"></label><label>تکرار رمز جدید<input type="password" name="confirmation" autocomplete="new-password" required minlength="12" maxlength="256"></label><small>حداقل ۱۲ نویسه؛ پس از تغییر رمز، همهٔ نشست‌ها بسته می‌شوند.</small><p class="form-error" role="alert" id="password-error"></p><button class="admin-button" type="submit">ذخیرهٔ رمز جدید</button></form></div>';
    $('#password-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const values=formValues(form);if(values.password!==values.confirmation){$('#password-error').textContent='تکرار رمز یکسان نیست.';return;}const button=$('button',form);button.disabled=true;try{await api('/api/password',values);authenticated=false;csrf='';renderLogin('رمز تغییر کرد؛ با رمز جدید وارد شوید.');}catch(e){$('#password-error').textContent=e.message;}finally{button.disabled=false;}};
  }
  function disposePageBanners() {for(const dispose of pageBannerControllers)dispose();pageBannerControllers=[];}
  function fillPageBanner(hero, initial, heading) {
    const banner=validateBanner(initial || {show:true,image:'',asset:'wall'}),slides=banner.slides;
    let active=0,timer,visible=true,disposed=false,pointer;
    if(slides.some(s=>s.asset.startsWith('trailer-')))hero.dataset.photo='true';
    const images=slides.map((slide,index)=>{const image=el('img',{class:'catalog-banner-image page-banner-frame'+(index===0?' is-active':''),src:slide.image || heroImages[slide.asset],alt:slide.imageAlt || banner.title || 'نمایشگر آوا','aria-hidden':String(index!==0),draggable:'false',...(index===0?{fetchpriority:'high'}:{loading:'lazy'})});hero.append(image);return image;});
    hero.append(el('div',{class:'catalog-banner-shade','aria-hidden':'true'}),heading);
    const abort=new AbortController(),options={signal:abort.signal};
    function schedule(){clearTimeout(timer);if(!disposed&&visible&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&slides.length>1)timer=setTimeout(()=>go(active+1),banner.interval);}
    function go(index){active=(index+slides.length)%slides.length;images.forEach((image,i)=>{image.classList.toggle('is-active',i===active);image.setAttribute('aria-hidden',String(i!==active));});$$('.page-banner-dot',hero).forEach((dot,i)=>dot.setAttribute('aria-current',String(i===active)));schedule();}
    if(slides.length>1){const controls=el('div',{class:'page-banner-controls'}),dots=el('div',{class:'page-banner-dots','aria-label':'انتخاب عکس بنر'});
      for(const [step,label,symbol] of [[1,'عکس بعدی','›'],[-1,'عکس قبلی','‹']]){const arrow=el('button',{type:'button',class:'page-banner-arrow '+(step===1?'next':'previous'),'aria-label':label},symbol);arrow.addEventListener('click',()=>go(active+step),options);controls.append(arrow);}
      slides.forEach((slide,i)=>{const dot=el('button',{type:'button',class:'page-banner-dot','aria-label':'عکس ' + (i+1),'aria-current':String(i===0)});dot.addEventListener('click',()=>go(i),options);dots.append(dot);});controls.append(dots);hero.append(controls);
      hero.addEventListener('pointerdown',event=>{if(event.target.closest('a,button,input')||event.button!==0)return;pointer={x:event.clientX,y:event.clientY,id:event.pointerId};},options);
      hero.addEventListener('pointerup',event=>{if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)go(active+(dx<0?1:-1));pointer=null;schedule();},options);
      hero.addEventListener('pointercancel',()=>{pointer=null;schedule();},options);
    }
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();});observer.observe(hero);
    document.addEventListener('visibilitychange',schedule,options);const motion=matchMedia('(prefers-reduced-motion: reduce)');motion.addEventListener('change',schedule,options);schedule();
    pageBannerControllers.push(()=>{disposed=true;clearTimeout(timer);observer.disconnect();abort.abort();});
  }
  function appendPageBanner(root,banner,title) {
    const hero=el('section',{class:'catalog-banner page-banner','aria-label':'بنر '+title}),heading=el('section',{class:'catalog-heading'},el('span',{class:'catalog-kicker'},'AVA GROUP'),el('h2',{},banner.title || title),el('p',{},banner.description || ''));
    fillPageBanner(hero,banner,heading);root.append(hero);
  }
  function trailerServiceFeature(item) {
    const feature=el('article',{class:'trailer-service-feature'}),visual=el('div',{class:'trailer-feature-visual'},el('img',{src:productImage(item),alt:'نمونهٔ تریلر LED سیار در فضای باز',loading:'lazy'}));
    const copy=el('div',{class:'trailer-feature-copy'},el('span',{class:'catalog-kicker'},'AVA / MOBILE LED'),el('h3',{},item.title),el('p',{},item.summary),el('span',{class:'trailer-feature-meta'},item.meta),el('div',{class:'trailer-feature-actions'},el('a',{href:'#service/'+item.id,class:'button'},'معرفی و استعلام اجاره ←'),el('a',{href:'#category/led-trailers',class:'trailer-model-link'},'بررسی مدل‌های تریلر')));
    feature.append(visual,copy);return feature;
  }
  function bannerDestinations() {
    return [{id:'products',name:'همهٔ محصولات'},...data.productCategories.map(c=>({id:'category:'+c.id,name:'دسته: '+categoryLabel(c)})),...CONTENT_KEYS.filter(k=>k!=='products').map(k=>({id:k,name:'بخش '+data.modules[k].name})),...['products','services','equipment'].flatMap(k=>data.modules[k].items.map(i=>({id:(k==='products'?'product':k==='services'?'service':'equipment')+':'+i.id,name:(k==='products'?'محصول: ':'صفحه: ')+i.title})))];
  }
  function readPageBanner(id) {
    if(id==='products')return data.modules.products.banner;
    if(id.startsWith('category:'))return data.productCategories.find(c=>c.id===id.slice(9))?.banner;
    const [prefix,itemId]=id.split(':'),module=prefix==='product'?'products':prefix==='service'?'services':prefix;
    return data.pageBanners[id] || data.modules[module]?.items.find(i=>i.id===itemId)?.banner || {show:false,image:'',asset:'wall',title:'',description:'',imageAlt:'',slides:[],interval:3000};
  }
  function writePageBanner(next,id,banner) {
    if(id==='products')next.modules.products.banner=banner;
    else if(id.startsWith('category:'))next.productCategories.find(c=>c.id===id.slice(9)).banner=banner;
    else next.pageBanners[id]=banner;
  }
  function renderBannersEditor(root) {
    root.innerHTML='<div class="notice">هر صفحه اسلایدر مستقل دارد؛ تا ۸ عکس، زمان نمایش و ترتیب دلخواه. عکس اول را در بالای ویرایشگر انتخاب کنید و عکس‌های بعدی را با دکمهٔ افزودن اضافه کنید.</div><div class="admin-panel"><label class="banner-page-picker">صفحهٔ موردنظر<select id="banner-page-select"></select></label><form class="admin-form" id="page-banner-form"><div id="page-banner-fields"></div><button class="admin-button" type="submit">ذخیرهٔ بنر این صفحه</button></form></div>';
    const select=$('#banner-page-select');select.replaceChildren(...bannerDestinations().map(page=>el('option',{value:page.id},page.name)));let id=select.value,editor;
    const paint=()=>{editor=mountBannerEditor($('#page-banner-fields'),readPageBanner(id));};paint();
    select.onchange=()=>{if(!discardAllowed()){select.value=id;return;}dirty=false;id=select.value;paint();};
    const form=$('#page-banner-form');watchForm(form);form.onsubmit=async event=>{event.preventDefault();const next=clone(data);writePageBanner(next,id,editor.read());if(await commit(next,'بنر این صفحه روی سایت ذخیره شد.'))paint();};
  }

  function currentHash(){if(location.hash)return location.hash;const path=location.pathname.replace(/\/$/,'');if(path==='/panel'||path==='/admin')return '#admin/dashboard';return !path||path==='/index.html'?'#home':'#'+path.slice(1);}
  function publicPath(){const hash=currentHash();return hash==='#home'||hash==='#' ? '/' : '/'+hash.slice(1);}
  function clickURL(value){value=text(value||'',2000);if(!value)return '';if(value.startsWith('#')&&!value.startsWith('#admin'))return value;if(/^\/(?!\/)/.test(value)&&!/^\/(panel|admin|api)(\/|$)/.test(value))return value;return httpURL(value);}
  function setMeta(name,content){let node=$('meta[name="'+name+'"]');if(!node){node=el('meta',{name});document.head.append(node);}node.content=content;}
  let lastTrackedPath='';
  function trackEvent(event){if(!serverMode||authenticated||adminVisible||currentHash().startsWith('#admin'))return;fetch('/api/track',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:publicPath(),event}),keepalive:true}).catch(()=>{});}
  const searchDefaults=JSON.parse($('#ava-search-content')?.textContent||'{}');
  function searchModel(path){
    const [kind,id]=path.slice(1).split('/');let item,category;
    if(kind==='product')item=publicProducts().find(i=>i.id===id);
    if(kind==='service')item=published('services').find(i=>i.id===id);
    if(kind==='equipment'&&id)item=published('equipment').find(i=>i.id===id);
    if(kind==='category')category=publicCategories().find(c=>c.id===id);
    const fallback=path==='/about'?{title:'دربارهٔ '+data.header.nameFa,heading:'دربارهٔ '+data.header.nameFa,description:companyDescription()}:path==='/'?{title:data.header.nameFa,description:data.hero.description,heading:data.header.nameFa}:path==='/contact'?{title:data.contact.title,heading:data.contact.title,description:data.contact.description}:item?{title:item.title,heading:item.title,description:item.summary}:category?{title:category.name,heading:category.banner?.title||category.name,description:category.description}:{title:data.modules[kind]?.name||data.header.nameFa,heading:data.modules[kind]?.name||data.header.nameFa,description:data.modules[kind]?.description||data.hero.description};
    const defaults=searchDefaults[path]||{},custom=data.pageSeo?.[path]||{},copy={...defaults,...Object.fromEntries(Object.entries(custom).filter(([key])=>!['title','description'].includes(key)))};
    const indexable=path==='/'||path==='/contact'||path==='/about'||!!item||(category?categoryCount(category.id)>0:CONTENT_KEYS.includes(kind)&&published(kind).length>0);
    return {kind,item,category,title:item?.seoTitle||custom.title||defaults.title||fallback.title,description:(item?.seoDescription||custom.description||defaults.description||fallback.description).slice(0,320),heading:path==='/'&&copy.showContent!==false&&copy.heading?copy.heading:fallback.heading,copy:copy.showContent!==false&&(copy.intro||copy.sections?.length)?copy:null,indexable};
  }
  function searchTrail(path,model){
    const trail=[{name:'خانه',path:'/'}];if(path==='/')return trail;
    if(model.category||model.kind==='product'){
      trail.push({name:data.modules.products.name,path:'/products'});const category=model.category||categoryFor(model.item);
      const parent=data.productCategories.find(c=>c.id===category?.parentId);if(parent)trail.push({name:parent.name,path:'/category/'+parent.id});
      if(category&&'/category/'+category.id!==path)trail.push({name:category.name,path:'/category/'+category.id});
    }else if(model.kind==='service')trail.push({name:data.modules.services.name,path:'/services'});
    trail.push({name:model.heading,path});return trail;
  }
  function searchSchema(path,model,origin){
    const org=origin+'/#organization',url=origin+path;
    const graph=[{'@type':'Organization','@id':org,name:data.header.nameEn||data.header.nameFa,alternateName:data.header.nameFa,url:origin+'/'},{'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:data.header.nameFa,inLanguage:'fa-IR',publisher:{'@id':org}},{'@type':path==='/about'?'AboutPage':path==='/products'||path.startsWith('/category/')?'CollectionPage':'WebPage','@id':url+'#webpage',url,name:model.title+' | AvA Groups',description:model.description,inLanguage:'fa-IR',isPartOf:{'@id':origin+'/#website'}},{'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:searchTrail(path,model).map((c,n)=>({'@type':'ListItem',position:n+1,name:c.name,item:origin+c.path}))}];
    graph[0].description=companyDescription();if(data.company?.serviceArea)graph[0].areaServed=data.company.serviceArea;const contact={};if(data.contact.phone?.trim())contact.telephone=data.contact.phone.trim();if(data.contact.email?.trim())contact.email=data.contact.email.trim();if(Object.keys(contact).length)graph[0].contactPoint={'@type':'ContactPoint',contactType:'فروش و پشتیبانی',...contact};if(path==='/about')graph[2].mainEntity={'@id':org};
    if(model.item&&['product','service'].includes(model.kind)){const item=model.item,entity={'@type':model.kind==='product'?'Product':'Service','@id':url+'#entity',name:item.title,description:item.summary,url,mainEntityOfPage:{'@id':url+'#webpage'}};if(model.kind==='product'){entity.sku=item.id;if(item.model)entity.model=item.model;}else entity.provider={'@id':org};graph.push(entity);}
    return {'@context':'https://schema.org','@graph':graph};
  }
  function renderSearchCopy(path,model){
    $$('.search-copy').forEach(node=>node.remove());const copy=model.copy;if(!copy)return;
    const primary=path==='/'||$('#catalog-page').hidden;const section=el('section',{class:'content search-copy','aria-label':copy.heading||model.heading});
    section.append(el(primary?'h1':'h2',{},copy.heading||model.heading),el('p',{class:'search-copy-intro'},copy.intro||''));
    const columns=el('div',{class:'search-copy-sections'});for(const item of copy.sections||[])columns.append(el('section',{},el(primary?'h2':'h3',{},item.heading),el('p',{},item.body)));section.append(columns);
    const links=el('nav',{'aria-label':'صفحات مرتبط',class:'search-copy-links'});for(const link of copy.links||[]){const target=searchModel(link.path);if(!target.indexable)continue;links.append(el('a',{href:serverMode?link.path:'#'+(link.path==='/'?'home':link.path.slice(1))},link.label));}if(links.children.length)section.append(links);
    if(path==='/'){$('#home-page-heading')?.remove();$('#managed-sections').before(section);}else if(!$('#catalog-page').hidden){const layout=$('.catalog-layout',$('#catalog-page'));if(layout)layout.before(section);else $('#catalog-page').append(section);}else{const destination=document.getElementById(path.slice(1));if(destination)destination.before(section);}
  }
  function finishPublicPage(){
    $('#ava-seo-content')?.remove();
    if(adminVisible||currentHash().startsWith('#admin')){setMeta('robots','noindex,nofollow');return;}
    const path=publicPath(),model=searchModel(path),origin=JSON.parse($('#ava-site-origin')?.textContent||'null')||location.origin;
    document.title=model.title+' | AvA Groups';setMeta('description',model.description);setMeta('robots',model.indexable?'index,follow':'noindex,follow');
    let canonical=$('link[rel=canonical]');if(!canonical){canonical=el('link',{rel:'canonical'});document.head.append(canonical);}canonical.href=origin+path;
    for(const [property,content]of [['og:title',document.title],['og:description',model.description],['og:url',origin+path],['og:locale','fa_IR'],['og:type','website']]){let meta=$('meta[property="'+property+'"]');if(!meta){meta=el('meta',{property});document.head.append(meta);}meta.content=content;}
    let schema=$('#ava-structured-data');if(!schema){schema=el('script',{id:'ava-structured-data',type:'application/ld+json'});document.head.append(schema);}schema.textContent=JSON.stringify(searchSchema(path,model,origin));
    renderSearchCopy(path,model);
    if(!$('#home-content').hidden){if($('.search-copy h1'))$('#home-page-heading')?.remove();else {let heading=$('#home-page-heading');if(!heading){heading=el('h1',{id:'home-page-heading',class:'sr-only'});$('#home-content').prepend(heading);}heading.textContent=model.heading;}}
    if(serverMode)history.replaceState(null,'',path);
    if(lastTrackedPath!==path){trackEvent('pageview');lastTrackedPath=path;}
  }
  async function renderStats(root){
    root.innerHTML='<div class="notice">در حال دریافت آمار…</div>';if(!serverMode){root.textContent='آمار در نسخهٔ سروری ثبت می‌شود؛ فایل آفلاین آمار ساختگی نمایش نمی‌دهد.';return;}
    try{const stats=await api('/api/stats');if(currentPage!=='stats')return;root.replaceChildren(el('div',{class:'notice'},stats.startedAt?'شروع ثبت واقعی: '+new Date(stats.startedAt).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'}):'هنوز هیچ بازدیدی ثبت نشده است؛ آمار تاریخی وجود ندارد.'),el('p',{},'زمان تهران؛ هفته = ۷ روز اخیر، ماه = ۳۰ روز اخیر. بازدیدکننده تخمینی بر اساس شناسهٔ مرورگر است، نه شخص قطعی. بازدید مدیر ثبت نمی‌شود.'));
      for(const [key,label]of [['today','امروز'],['week','۷ روز اخیر'],['month','۳۰ روز اخیر']])root.append(el('div',{class:'admin-panel'},el('h2',{},label),el('p',{},'بازدید صفحات: '+stats.periods[key].views.toLocaleString('fa-IR')+' — بازدیدکنندگان تخمینی: '+stats.periods[key].visitors.toLocaleString('fa-IR'))));
      for(const [key,label]of [['topPages','صفحات پربازدید؛ از شروع ثبت'],['topProducts','محصولات پربازدید؛ از شروع ثبت'],['contactClicks','کلیک‌های تماس؛ از شروع ثبت']]){const list=el('div',{class:'admin-panel'},el('h2',{},label));for(const row of stats[key])list.append(el('p',{},(row.path||{'contact-phone':'تلفن','contact-email':'ایمیل','contact-request':'فرم تماس','contact-link':'رفتن به تماس'}[row.event]||row.event)+' — '+(row.views||row.clicks).toLocaleString('fa-IR')));if(!stats[key].length)list.append(el('p',{},'داده‌ای ثبت نشده است.'));root.append(list);}
    }catch(e){root.textContent=e.message;}
  }
  function companyDescription(){return data.company?.description||'گروه آوا در زمینهٔ فروش و اجارهٔ نمایشگر LED و تلویزیون شهری فعالیت می‌کند. محصولات و خدمات مرتبط را بررسی کنید و برای انتخاب متناسب با محل نصب یا رویداد، درخواست مشاوره و استعلام بفرستید.';}
  function renderAbout(){const root=$('#catalog-page');root.replaceChildren();const section=el('section',{class:'content company-profile'},el('h1',{},'دربارهٔ '+data.header.nameFa),el('p',{},companyDescription()));if(data.company?.serviceArea)section.append(el('h2',{},'محدودهٔ خدمات'),el('p',{},data.company.serviceArea));const contacts=el('section',{},el('h2',{},'راه‌های ارتباطی'));if(data.contact.phone)contacts.append(el('p',{},el('a',{href:'tel:'+data.contact.phone,'data-contact-event':'contact-phone'},data.contact.phone)));if(data.contact.email)contacts.append(el('p',{},el('a',{href:'mailto:'+data.contact.email,'data-contact-event':'contact-email'},data.contact.email)));if(data.contact.address)contacts.append(el('p',{},data.contact.address));section.append(contacts,el('nav',{class:'search-copy-links'},el('a',{href:serverMode?'/products':'#products'},'محصولات نمایشگر LED'),el('a',{href:serverMode?'/services':'#services'},'خدمات و اجاره'),el('a',{href:serverMode?'/contact':'#contact'},'تماس با آوا')));root.append(section);}
  function renderCompanyEditor(root){root.innerHTML='<div class="admin-panel"><form id="company-form" class="admin-form">'+field('معرفی شرکت؛ فقط اطلاعات قابل انتشار','description',companyDescription(),{max:2500,multiline:true,rows:6})+field('محدودهٔ خدمات تأییدشده؛ در صورت مشخص‌نبودن خالی بماند','serviceArea',data.company?.serviceArea||'',{max:200})+saveButton()+'</form></div><div class="notice">نام فارسی و انگلیسی از بخش هدر و تلفن و نشانی از بخش تماس با ما خوانده می‌شوند. سابقه، گواهی، پروژه یا شهر تأییدنشده وارد نکنید.</div>';const form=$('#company-form');watchForm(form);form.onsubmit=async event=>{event.preventDefault();const next=clone(data);next.company=formValues(form);await commit(next);};}

  function renderFooterEditor(root){const footer=data.footer;root.innerHTML='<div class="admin-panel"><form id="footer-form" class="admin-form">'+field('متن معرفی پایین سایت','text',footer.text,{max:1000,multiline:true})+field('متن حقوق و کپی‌رایت','copyright',footer.copyright,{max:1000})+saveButton()+'</form></div>';const form=$('#footer-form');watchForm(form);form.onsubmit=async event=>{event.preventDefault();const next=clone(data);next.footer=formValues(form);await commit(next);};}
  function renderSeoEditor(root){
    root.innerHTML='<div class="admin-panel"><form class="admin-form" id="seo-form"><label>صفحه<select id="seo-page"></select></label><div id="seo-fields"></div>'+saveButton('ذخیرهٔ متن و سئوی صفحه')+'</form></div><div class="notice">متن معرفی به بازدیدکننده هم نمایش داده می‌شود. عنوان و توضیح سئوی محصول در ویرایش همان محصول قرار دارد. عنوان‌ها و متن‌های سفارشی قبلی حفظ می‌شوند.</div>';
    const select=$('#seo-page'),choices=[{id:'/',name:'صفحهٔ اصلی'},{id:'/about',name:'معرفی شرکت'},...CONTENT_KEYS.map(k=>({id:'/'+k,name:data.modules[k].name})),...data.productCategories.map(c=>({id:'/category/'+c.id,name:c.name})),...data.modules.services.items.map(i=>({id:'/service/'+i.id,name:i.title}))];
    select.replaceChildren(...choices.map(c=>el('option',{value:c.id},c.name)));let path=select.value;
    const paint=()=>{const seo={...searchDefaults[path],...data.pageSeo[path]};$('#seo-fields').innerHTML=field('عنوان سئو','title',seo.title||'',{max:160})+field('توضیحات سئو','description',seo.description||'',{max:320,multiline:true})+checkbox('نمایش متن معرفی و راهنمای انتخاب در صفحه','showContent',seo.showContent!==false)+field('عنوان متن معرفی','heading',seo.heading||'',{max:200})+field('متن معرفی','intro',seo.intro||'',{max:2500,multiline:true})+field('بخش‌های راهنما؛ هر خط: عنوان | توضیح','sections',(seo.sections||[]).map(c=>c.heading+' | '+c.body).join('\n'),{max:32000,multiline:true,rows:9});};paint();
    select.onchange=()=>{if(!discardAllowed()){select.value=path;return;}dirty=false;path=select.value;paint();};const form=$('#seo-form');watchForm($('#seo-fields'));
    form.onsubmit=async event=>{event.preventDefault();try{const next=clone(data),sections=form.elements.sections.value.split('\n').filter(line=>line.trim()).map(line=>{const n=line.indexOf('|');if(n<1||!line.slice(n+1).trim())throw new Error('هر بخش را در یک خط به شکل «عنوان | توضیح» بنویسید.');return {heading:line.slice(0,n).trim(),body:line.slice(n+1).trim()};});next.pageSeo[path]={title:form.elements.title.value,description:form.elements.description.value,heading:form.elements.heading.value,intro:form.elements.intro.value,showContent:form.elements.showContent.checked,sections};await commit(next);}catch(e){toast(e.message,true);}};
  }


  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function text(value, max = 2000) {
    if (typeof value !== 'string' || value.length > max) throw new Error('نوع یا طول یکی از متن‌ها معتبر نیست.');
    return value;
  }
  function httpURL(value) {
    if (!value) return '';
    text(value, 2000);
    let url;
    try { url = new URL(value); } catch { throw new Error('پیوند باید با http:// یا https:// شروع شود.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('پیوند واردشده معتبر نیست.');
    return value;
  }
  function imageData(value) {
    if (!value) return '';
    if (typeof value !== 'string' || value.length > Math.ceil(5 * 1024 * 1024 / 3) * 4 + 200 || !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) throw new Error('فایل تصویر معتبر نیست یا بیش از اندازه بزرگ است.');
    return value;
  }
  function pdfData(value) {
    if (!value) return '';
    if (typeof value !== 'string' || value.length > 2850000 || !/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=\r\n]*$/.test(value)) throw new Error('فایل PDF معتبر نیست.');
    return value;
  }
  function validateBanner(value) {
    if (!isObject(value)) throw new Error('تنظیم بنر معتبر نیست.');
    const frame = row => ({image:imageData(row.image),asset:Object.hasOwn(heroImages,row.asset) ? row.asset : 'wall',imageAlt:text(row.imageAlt || '',200)});
    const result = {show:value.show !== false,...frame(value),title:text(value.title || '',160),description:text(value.description || '',1000),interval:Number(value.interval || 3000)};
    if (!Number.isInteger(result.interval) || result.interval < 1000 || result.interval > 15000) throw new Error('زمان بنر باید بین ۱ تا ۱۵ ثانیه باشد.');
    if (value.slides !== undefined && (!Array.isArray(value.slides) || value.slides.length > 8)) throw new Error('حداکثر هشت عکس برای بنر هر صفحه مجاز است.');
    result.slides = (value.slides?.length ? value.slides : [result]).map(frame);
    return result;
  }
  function validate(raw) {
    if (!isObject(raw) || raw.version !== 1 || !isObject(raw.header) || !isObject(raw.hero) || !isObject(raw.modules) || !isObject(raw.contact) || !Array.isArray(raw.navigation)) throw new Error('ساختار فایل پشتیبان معتبر نیست.');
    const out = clone(seed);const company=raw.company||{};out.company={description:text(company.description||'',2500),serviceArea:text(company.serviceArea||'',200)};
    const footer=raw.footer||{text:'آوا؛ فروش و اجارهٔ نمایشگر.',copyright:''};out.footer={text:text(footer.text||'',1000),copyright:text(footer.copyright||'',1000)};out.pageSeo={};
    if(raw.pageSeo && !isObject(raw.pageSeo))throw new Error('سئو معتبر نیست.');for(const [key,value] of Object.entries(raw.pageSeo||{})){if(!/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(key)||!isObject(value))throw new Error('صفحهٔ سئو معتبر نیست.');const seo={title:text(value.title||'',160),description:text(value.description||'',320)};
      for(const name of ['heading','intro'])if(value[name]!==undefined)seo[name]=text(value[name],name==='heading'?200:2500);
      if(value.showContent!==undefined){if(typeof value.showContent!=='boolean')throw new Error('تنظیم نمایش متن معتبر نیست.');seo.showContent=value.showContent;}
      if(value.sections!==undefined){if(!Array.isArray(value.sections)||value.sections.length>12)throw new Error('بخش‌های متن معتبر نیست.');seo.sections=value.sections.map(row=>({heading:text(row.heading,200),body:text(row.body,2500)}));}
      out.pageSeo[key]=seo;}
    if (raw.trailerRevision !== 1) {
      raw = clone(raw);
      raw.productCategories = raw.productCategories || clone(seed.productCategories);
      if (!raw.productCategories.some(c => c.id === 'led-trailers')) raw.productCategories.push(clone(seed.productCategories.find(c => c.id === 'led-trailers')));
      for (const key of ['products','services']) for (const item of seed.modules[key].items.filter(i => i.id.startsWith('trailer-') || i.id === 'led-trailer-rental')) if (!raw.modules[key].items.some(i => i.id === item.id)) raw.modules[key].items.push(clone(item));
      if (!raw.hero.slides?.some(i => i.id === 'mobile-led-trailer') && raw.hero.slides?.length < 8) raw.hero.slides.push(clone(seed.hero.slides.find(i => i.id === 'mobile-led-trailer')));
      raw.pageBanners = {...clone(seed.pageBanners),...raw.pageBanners};
    }
    out.trailerRevision = 1;
    out.pageBanners = {};
    if (raw.pageBanners !== undefined && (!isObject(raw.pageBanners) || Object.keys(raw.pageBanners).length > 600)) throw new Error('بنر صفحات معتبر نیست.');
    for (const [key,value] of Object.entries(raw.pageBanners || {})) {if (!/^[a-zA-Z0-9_:-]{1,170}$/.test(key)) throw new Error('شناسهٔ صفحه معتبر نیست.');out.pageBanners[key] = validateBanner(value);}
    let categories = raw.productCategories === undefined ? clone(seed.productCategories) : clone(raw.productCategories);
    if (!Array.isArray(categories) || categories.length > 100) throw new Error('دسته‌بندی محصولات معتبر نیست.');
    if (raw.taxonomyRevision !== 2) {
      const requested = seed.productCategories.filter(category => category.menu || category.parentId);
      const ids = new Set(requested.map(category => category.id));
      categories = [...requested.map(category => ({...category,...categories.find(old => old.id === category.id)})),...categories.filter(category => !ids.has(category.id)).map(category => ['displays','controllers','accessories','uncategorized'].includes(category.id) ? {...category,menu:false} : category)];
    }
    // Introduce the supplied catalogue once, retaining custom records and edits.
    if (raw.catalogRevision !== 1) {
      const required = new Set(['urban','urban-indoor','urban-outdoor','urban-flexible','transparent']);
      for (const category of seed.productCategories.filter(c => required.has(c.id))) if (!categories.some(c => c.id === category.id)) categories.push(clone(category));
    }
    if (categories.length > 100) throw new Error('تعداد دسته‌ها بیش از حد مجاز است.');
    out.taxonomyRevision = 2;
    const categoryIds = new Set();
    out.productCategories = categories.map(category => {
      if (!isObject(category) || !/^[a-zA-Z0-9_-]{1,80}$/.test(category.id) || categoryIds.has(category.id)) throw new Error('شناسهٔ دسته معتبر یا یکتا نیست.');
      categoryIds.add(category.id);
      let name = text(category.name,80).trim();
      if (category.id === 'rental-flexible' && ['فلکسیبل (منعطف)','فلکسیبل','منعطف'].includes(name)) name = 'Flexible';
      if (!name) throw new Error('نام دسته نمی‌تواند خالی باشد.');
      const banner = category.banner || seed.productCategories.find(c => c.id === category.id)?.banner || {show:true,image:'',asset:'wall',title:'',description:'',imageAlt:''};
      return {id:category.id,name,description:text(category.description,1000),visible:category.visible === true,parentId:text(category.parentId || '',80),menu:category.menu !== false,banner:validateBanner(banner)};
    });
    if (!categoryIds.has('uncategorized')) {
      out.productCategories.push({id:'uncategorized',name:'دسته‌بندی‌نشده',description:'',visible:true,parentId:'',menu:false});
      categoryIds.add('uncategorized');
    }
    for (const category of out.productCategories) {
      if (!category.parentId) continue;
      const parent = out.productCategories.find(item => item.id === category.parentId);
      if (!parent || parent.parentId || parent.id === category.id || category.id === 'uncategorized' || parent.id === 'uncategorized') throw new Error('زیرگروه باید به یک دستهٔ اصلی معتبر وصل باشد؛ حداکثر دو سطح مجاز است.');
    }
    out.updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
    for (const key of ['nameEn','nameFa','sloganEn','sloganFa']) out.header[key] = text(raw.header[key], 180);
    for (const key of ['showLogo','showNameEn','showNameFa','showSloganEn','showSloganFa']) {
      if (typeof raw.header[key] !== 'boolean') throw new Error('تنظیم نمایش هدر معتبر نیست.');
      out.header[key] = raw.header[key];
    }
    out.header.logo = imageData(raw.header.logo);
    for (const key of ['eyebrow','title','highlight','description','imageAlt','primaryLabel','secondaryLabel']) out.hero[key] = text(raw.hero[key], key === 'description' ? 2500 : 200);
    out.hero.image = imageData(raw.hero.image);
    out.hero.show = raw.hero.show === true;
    for (const key of ['primaryTarget','secondaryTarget']) {
      if (![...CONTENT_KEYS, 'hero','vision','process'].includes(raw.hero[key])) throw new Error('مقصد دکمهٔ هیرو معتبر نیست.');
      out.hero[key] = raw.hero[key];
    }
    const slides = raw.hero.slides === undefined ? clone(seed.hero.slides) : raw.hero.slides;
    if (!Array.isArray(slides) || !slides.length || slides.length > 8) throw new Error('هیرو باید بین یک تا هشت اسلاید داشته باشد.');
    if (raw.hero.slides === undefined) Object.assign(slides[0],Object.fromEntries(['eyebrow','title','highlight','description','image','imageAlt','primaryLabel','primaryTarget','secondaryLabel','secondaryTarget'].map(key => [key,out.hero[key]])));
    const slideIds = new Set();
    out.hero.slides = slides.map(slide => {
      if (!isObject(slide) || !/^[a-zA-Z0-9_-]{1,80}$/.test(slide.id) || slideIds.has(slide.id)) throw new Error('شناسهٔ اسلاید معتبر یا یکتا نیست.');
      slideIds.add(slide.id);
      const result = {id:slide.id,clickUrl:clickURL(slide.clickUrl)};
      for (const key of ['eyebrow','title','highlight','description','imageAlt','primaryLabel','secondaryLabel']) result[key] = text(slide[key],key === 'description' ? 2500 : 200);
      if (!result.title.trim()) throw new Error('عنوان اسلاید نمی‌تواند خالی باشد.');
      result.image = imageData(slide.image);
      result.asset = Object.hasOwn(heroImages,slide.asset) ? slide.asset : 'wall';
      result.categoryId = text(slide.categoryId || '',80);
      for (const key of ['primaryTarget','secondaryTarget']) {
        if (![...CONTENT_KEYS,'hero','vision','process'].includes(slide[key])) throw new Error('مقصد دکمهٔ اسلاید معتبر نیست.');
        result[key] = slide[key];
      }
      return result;
    });
    out.hero.motionRevision = 2;
    out.hero.showMotionLogo = raw.hero.showMotionLogo !== false;
    out.hero.autoplay = true;
    out.hero.interval = raw.hero.motionRevision === 2 && raw.hero.interval !== undefined ? Number(raw.hero.interval) : 2000;
    if (!Number.isInteger(out.hero.interval) || out.hero.interval < 1000 || out.hero.interval > 15000) throw new Error('زمان هر اسلاید باید بین ۱ تا ۱۵ ثانیه باشد.');
    const seen = new Set();
    if (raw.navigation.length !== KEYS.length) throw new Error('تعداد گزینه‌های منو معتبر نیست.');
    out.navigation = raw.navigation.map(row => {
      if (!isObject(row) || !KEYS.includes(row.id) || seen.has(row.id) || ![...CONTENT_KEYS,'hero','vision','process','external'].includes(row.target)) throw new Error('اتصال گزینه‌های منو معتبر نیست.');
      seen.add(row.id);
      const label = text(row.label, 45).trim();
      if (!label) throw new Error('نام گزینهٔ منو نمی‌تواند خالی باشد.');
      const url = httpURL(row.url || '');
      if (row.target === 'external' && !url) throw new Error('برای مقصد بیرونی، پیوند را وارد کن.');
      return {id:row.id,label,target:row.target,visible:row.visible === true,url};
    });
    for (const key of CONTENT_KEYS) {
      let module = key === 'equipment' && raw.modules[key] === undefined ? seed.modules.equipment : raw.modules[key];
      if (!isObject(module) || !Array.isArray(module.items) || module.items.length > 500) throw new Error('اطلاعات یکی از بخش‌ها معتبر نیست.');
      if (key === 'products' && raw.catalogRevision !== 1) {
        const old = module.items.filter(item => !(item.id === 'initial-display' && item.title === 'فروش نمایشگر' && !item.image && !item.model && !item.body));
        module = {...module,items:[...old,...seed.modules.products.items.filter(item => !old.some(existing => existing.id === item.id))]};
        if (module.items.length > 500) throw new Error('تعداد محصولات بیش از حد مجاز است.');
      }
      const ids = new Set();
      out.modules[key] = {name:text(module.name, 80),description:text(module.description, 1000),items:module.items.map(item => {
        if (!isObject(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id) || !['draft','published'].includes(item.status)) throw new Error('شناسه یا وضعیت محتوا معتبر نیست.');
        ids.add(item.id);
        const title = text(item.title, 160).trim();
        if (!title) throw new Error('عنوان محتوا را وارد کن.');
        const result = {id:item.id,title,summary:text(item.summary,700),body:text(item.body,20000),meta:text(item.meta,200),image:imageData(item.image),url:httpURL(item.url),file:pdfData(item.file || ''),fileName:text(item.fileName || '',160),status:item.status,seoTitle:text(item.seoTitle||'',160),seoDescription:text(item.seoDescription||'',320),imageAsset:Object.hasOwn(productImages,item.imageAsset) ? item.imageAsset : ''};
        if (item.banner) result.banner = validateBanner(item.banner);
        if (key === 'products') {
          if (item.categoryId !== undefined && !categoryIds.has(item.categoryId)) throw new Error('دستهٔ یکی از محصولات وجود ندارد.');
          result.categoryId = item.categoryId || 'uncategorized';
          result.model = text(item.model || '',120);
          result.featured = item.featured === undefined ? true : item.featured === true;
          result.datasheetUrl = httpURL(item.datasheetUrl || '');
          result.manualUrl = httpURL(item.manualUrl || '');
          result.imageAsset = Object.hasOwn(productImages,item.imageAsset) ? item.imageAsset : '';
          result.imageCaption = text(item.imageCaption || '',200);
          result.imageStyle = ['datasheet','illustration','photo'].includes(item.imageStyle) ? item.imageStyle : '';
          if (raw.productVisualRevision !== 3 && !result.image) {
            const latest = seed.modules.products.items.find(p => p.id === item.id);
            if (latest && result.imageAsset === latest.imageAsset) {
              if (['تصویر مرجع','تصویر دیتاشیت'].includes(result.imageCaption)) result.imageCaption = latest.imageCaption;
              if (result.body === legacyProductVisuals[item.id]?.body) result.body = latest.body;
              result.imageStyle = latest.imageStyle;
            }
          }
          result.priceAmount = item.priceAmount === undefined || item.priceAmount === null || item.priceAmount === '' ? null : item.priceAmount;
          if (result.priceAmount !== null && (!Number.isSafeInteger(result.priceAmount) || result.priceAmount < 0 || result.priceAmount > 9000000000000)) throw new Error('قیمت باید یک عدد صحیح معتبر به تومان باشد.');
          result.priceKind = item.priceKind || (result.priceAmount === null ? 'quote' : 'reference');
          if (!['reference','sale','quote'].includes(result.priceKind)) throw new Error('نوع قیمت معتبر نیست.');
          result.priceUnit = text(item.priceUnit || 'هر ماژول',80);
          result.priceDate = text(item.priceDate || '',10);
          if (result.priceDate && !/^\d{4}-\d{2}-\d{2}$/.test(result.priceDate)) throw new Error('تاریخ قیمت معتبر نیست.');
          const specs = item.specifications || [];
          if (!Array.isArray(specs) || specs.length > 60) throw new Error('حداکثر ۶۰ ردیف مشخصات فنی قابل ثبت است.');
          result.specifications = specs.map(spec => {
            if (!isObject(spec)) throw new Error('ردیف مشخصات فنی معتبر نیست.');
            const label = text(spec.label,150).trim();const value = text(spec.value,400).trim();
            if (!label || !value) throw new Error('نام و مقدار هر مشخصه را وارد کن.');
            return {label,value};
          });
        }
        return result;
      })};
      if (key === 'products') out.modules[key].banner = validateBanner(module.banner || seed.modules.products.banner);
    }
    if (raw.servicesRevision !== 1) {
      const services = out.modules.services.items;
      for (const service of seed.modules.services.items) {
        const old = services.find(item => item.id === service.id);
        if (!old) services.push(clone(service));
        else if ((old.id === 'initial-rental' && old.title === 'اجارهٔ نمایشگر') || (old.id === 'initial-consulting' && old.title === 'مشاورهٔ انتخاب')) {
          old.title = service.title;
          if (!old.body) old.body = service.body;
        }
      }
      if (services.length > 500) throw new Error('تعداد محتواهای خدمات بیش از حد مجاز است.');
    }
    out.servicesRevision = 1;
    out.catalogRevision = 1;
    out.productVisualRevision = 3;
    for (const key of ['title','description','phone','email','address']) out.contact[key] = text(raw.contact[key], key === 'description' ? 2500 : 500);
    return out;
  }

  try {
    const stored = serverMode ? null : localStorage.getItem(storageKey);
    if (stored && !serverMode) {
      const parsed = validate(JSON.parse(stored));
      if (parsed.updatedAt >= seed.updatedAt) data = parsed;
    }
  } catch (error) {
    if (error.name === 'SecurityError') {
      persistence = false;
      loadWarning = 'مرورگر اجازهٔ ذخیرهٔ محلی نمی‌دهد. تغییرات تا زمان بستن صفحه موقت هستند؛ پیش از خروج، نسخهٔ کامل یا پشتیبان را دریافت کن.';
    } else {
      loadWarning = 'اطلاعات ذخیره‌شدهٔ مرورگر قابل خواندن نبود؛ نسخهٔ داخل فایل باز شد. اطلاعات قبلی بازنویسی نشده‌اند.';
    }
  }

  function toast(message, error = false) {
    clearTimeout(toastTimer);
    const node = $('#cms-toast');
    node.textContent = message;
    node.classList.toggle('error', error);
    node.hidden = false;
    toastTimer = setTimeout(() => { node.hidden = true; }, 6500);
  }
  async function commit(next, message = 'تغییرات ذخیره شد.') {
    if (saving) {toast('ذخیرهٔ قبلی در حال انجام است.',true);return false;}
    saving = true;
    const locked = $$('#admin-app input,#admin-app button,#admin-app select,#admin-app textarea,#entry-editor input,#entry-editor button,#entry-editor select,#entry-editor textarea,#category-editor input,#category-editor button,#category-editor select,#category-editor textarea').filter(node=>!node.disabled);
    locked.forEach(node=>node.disabled=true);
    $('#save-state').textContent=serverMode?'در حال ذخیره روی سرور…':'در حال ذخیره…';
    try {
      const checked = validate(next);
      checked.updatedAt = Date.now();
      if (serverMode) {const result = await api('/api/content',{data:checked,revision:serverRevision});serverRevision = result.revision;}
      else if (persistence) localStorage.setItem(storageKey, JSON.stringify(checked));
      data = checked;
      dirty = false;
      $('#save-state').textContent = persistence ? 'ذخیره شد ✓' : 'ذخیرهٔ موقت؛ خروجی بگیر';
      renderPublic();
      renderSidebar();
      toast(persistence ? message : 'تغییرات موقت اعمال شد؛ برای نگهداری، خروجی بگیر.');
      return true;
    } catch (error) {
      $('#save-state').textContent='ذخیره انجام نشد؛ تغییرات فرم حفظ شده‌اند';
      toast(error.name === 'QuotaExceededError' ? 'فضای ذخیرهٔ مرورگر کافی نیست؛ تصویرها یا PDFهای بزرگ را کم کن و دوباره ذخیره کن. تغییرات قبلی حفظ شده‌اند.' : error.message, true);
      return false;
    } finally {saving = false;locked.forEach(node=>{if(node.isConnected)node.disabled=false;});}
  }
  function markDirty() { dirty = true; $('#save-state').textContent = 'تغییرات ذخیره‌نشده'; }
  function discardAllowed() { if(saving){toast('ذخیره در حال انجام است؛ چند لحظه صبر کنید.',true);return false;}return !dirty || confirm('تغییرات این فرم هنوز ذخیره نشده‌اند. بدون ذخیره ادامه می‌دهی؟'); }
  function download(name, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], {type}));
    const a = el('a', {href:url,download:name});
    document.body.append(a);a.click();a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function exportSite() {
    if (!discardAllowed()) return;
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    let output = bootHTML.replace(/<script id="ava-server-mode" type="application\/json">[\s\S]*?<\/script>/,'').replace(/(<script id="ava-initial-data" type="application\/json">)[\s\S]*?(<\/script>)/, (_, open, close) => open + json + close);
    if(serverMode){try{for(const path of new Set(output.match(/\/assets\/[a-f0-9]{32}\.(?:webp|jpg|woff2)/g)||[])){const response=await fetch(path);if(!response.ok)throw new Error('دریافت فایل خروجی انجام نشد.');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));output=output.replaceAll(path,'data:'+response.headers.get('Content-Type').split(';')[0]+';base64,'+btoa(binary));}}catch(error){toast(error.message,true);return;}}
    download('ava-site-and-panel.html', output, 'text/html;charset=utf-8');
    toast('نسخهٔ کامل سایت و پنل، همراه با محتوای ذخیره‌شده، آماده شد.');
  }
  function published(key) { return data.modules[key].items.filter(item => item.status === 'published'); }
  function categoryVisible(category) {return category.visible && (!category.parentId || data.productCategories.some(parent => parent.id === category.parentId && parent.visible));}
  function publicProducts() {return published('products').filter(item => data.productCategories.some(category => category.id === item.categoryId && categoryVisible(category)));}
  function publicCategories() {return data.productCategories.filter(category => categoryVisible(category) && (category.id !== 'uncategorized' || publicProducts().some(item => item.categoryId === category.id)));}
  function menuCategories(parentId = '') {return publicCategories().filter(category => (category.parentId || '') === parentId && category.menu !== false);}
  function categoryContains(categoryId,item) {return !categoryId || item.categoryId === categoryId || categoryFor(item)?.parentId === categoryId;}
  function categoryCount(categoryId) {return publicProducts().filter(item => categoryContains(categoryId,item)).length;}
  function categoryLabel(category) {if (!category) return '';const parent = data.productCategories.find(item => item.id === category.parentId);return (parent ? parent.name + ' / ' : '') + category.name;}
  function categoryCrumbs(category) {const parent = data.productCategories.find(item => item.id === category.parentId);return [...(parent ? [{label:parent.name,href:'#category/' + parent.id}] : []),{label:category.name,href:'#category/' + category.id}];}
  function categoryFor(item) {return data.productCategories.find(category => category.id === item.categoryId);}
  function visibleLink(name, url, downloadName = '') {
    const link = el('a',{class:'button',href:url},name,el('span',{'aria-hidden':'true'},' ↗'));
    if (downloadName) link.download = downloadName;
    else {link.target = '_blank';link.rel = 'noopener noreferrer';}
    return link;
  }
  function openDetail(key, item) {
    if (key === 'products') {location.hash = 'product/' + item.id;return;}
    if (key === 'services') {location.hash = 'service/' + item.id;return;}
    if (key === 'equipment') {location.hash = 'equipment/' + item.id;return;}
    const root = $('#detail-body');
    root.replaceChildren(el('span',{class:'kicker'},data.modules[key].name),el('h2',{id:'detail-title'},item.title));
    if (item.image) root.append(el('img',{src:item.image,alt:item.title}));
    if (item.meta) root.append(el('p',{class:'kicker'},item.meta));
    if (item.summary) root.append(el('p',{class:'detail-text'},item.summary));
    if (item.body) root.append(el('div',{class:'detail-text'},item.body));
    if (item.file) root.append(visibleLink('دریافت کاتالوگ',item.file,item.id + '.pdf'));
    else if (item.url) root.append(visibleLink(['software','catalog'].includes(key) ? 'دریافت فایل' : 'پیوند مرتبط',item.url));
    $('#content-detail').showModal();
  }
  function emptyModule(key) {
    $('#detail-body').replaceChildren(el('span',{class:'kicker'},'گروه آوا'),el('h2',{id:'detail-title'},data.modules[key].name),el('p',{},'هنوز محتوایی برای این بخش منتشر نشده است.'));
    $('#content-detail').showModal();
  }
  function followTarget(target, url = '') {
    closeNavigationMenus();
    if ($('#site-menu').open) $('#site-menu').close();
    if (target === 'external') {window.open(url, '_blank', 'noopener,noreferrer');return;}
    if (['products','equipment'].includes(target)) {if (currentHash() === '#' + target) renderCatalogRoute();else location.hash = target;return;}
    const wasCatalog = !$('#catalog-page').hidden;
    if (wasCatalog) {$('#home-content').hidden = false;$('#catalog-page').hidden = true;}
    const node = document.getElementById(target);
      if (node) {location.hash = target;node.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});}
    else if (KEYS.includes(target)) emptyModule(target);
  }
  function wireTarget(node, target, url = '') {
    node.href = target === 'external' ? url : '#' + target;
    if (target === 'external') {node.target = '_blank';node.rel = 'noopener noreferrer';}
    node.addEventListener('click', event => {event.preventDefault();followTarget(target,url);});
  }
  const detachedMenus = new Map();
  function closeNavigationMenus() {
    for (const [popup, entry] of detachedMenus) {
      popup.hidden=true;entry.placeholder.replaceWith(popup);
    }
    detachedMenus.clear();
    $$('.header-menu-popup,.products-submenu,.equipment-submenu').forEach(node => {node.hidden = true;});
    $$('.header-menu-trigger,.subcategory-toggle').forEach(node => node.setAttribute('aria-expanded','false'));
  }
  function toggleNavigationMenu(trigger,dropdown) {
    const open = dropdown.hidden;closeNavigationMenus();if (!open) return;
    const viewportWidth = document.documentElement.clientWidth;
    const anchor = dropdown.parentElement.getBoundingClientRect();
    const preferredWidth = parseFloat(getComputedStyle(dropdown).width) || 350;
    const width = Math.min(preferredWidth,viewportWidth-24);
    const left = Math.max(12,Math.min(anchor.right-width,viewportWidth-width-12));
    dropdown.style.width = width + 'px';dropdown.style.transform = 'none';
    const compact=innerWidth<=700;dropdown.style.position=compact?'fixed':'absolute';dropdown.style.left=compact?left+'px':'';dropdown.style.top=compact?($('.site-header').getBoundingClientRect().bottom+6)+'px':'';
    dropdown.style.right = compact?'auto':(anchor.right-left-width)+'px';
    dropdown.hidden = false;trigger.setAttribute('aria-expanded','true');
    if(compact) {
      const placeholder=document.createComment('navigation popup');dropdown.before(placeholder);
      detachedMenus.set(dropdown,{placeholder,trigger});document.body.append(dropdown);
      dropdown.classList.add('detached-navigation-popup');
    } else dropdown.classList.remove('detached-navigation-popup');
    const rect = dropdown.getBoundingClientRect();
    dropdown.style.maxHeight = Math.max(100,document.documentElement.clientHeight-rect.top-16) + 'px';
  }
  function servicesMenu(row) {
    const wrap = el('div',{class:'services-nav-item header-menu-item'});
    const id = 'services-dropdown-' + row.id;
    const trigger = el('button',{type:'button',class:'services-menu-trigger header-menu-trigger','aria-expanded':'false','aria-controls':id},row.label,el('span',{'aria-hidden':'true',class:'dropdown-chevron'},'⌄'));
    const dropdown = el('div',{class:'services-dropdown header-menu-popup',id,hidden:'','aria-label':'خدمات آوا'});
    dropdown.append(el('p',{class:'dropdown-eyebrow'},'همراه پروژهٔ شما، از انتخاب تا اجرا'));
    for (const item of published('services')) {
      const link = el('a',{href:'#service/' + item.id},el('span',{},item.title),el('span',{'aria-hidden':'true',class:'service-menu-arrow'},'←'));
      link.addEventListener('click',closeNavigationMenus);dropdown.append(link);
    }
    if (!published('services').length) dropdown.append(el('p',{class:'service-menu-empty'},'هنوز خدمتی منتشر نشده است.'));
    trigger.addEventListener('click',() => toggleNavigationMenu(trigger,dropdown));
    wrap.addEventListener('keydown',event => {if (event.key === 'Escape') {closeNavigationMenus();trigger.focus();event.stopPropagation();}});
    wrap.addEventListener('focusout',event => {if (!wrap.contains(event.relatedTarget) && !dropdown.contains(event.relatedTarget)) closeNavigationMenus();});
    wrap.append(trigger,dropdown);return wrap;
  }
  function partnersMenu(row) {
    const wrap = el('div',{class:'partners-nav-item header-menu-item'});
    const id = 'partners-dropdown-' + row.id;
    const trigger = el('button',{type:'button',class:'partners-menu-trigger header-menu-trigger','aria-expanded':'false','aria-controls':id},row.label,el('span',{'aria-hidden':'true',class:'dropdown-chevron'},'⌄'));
    const dropdown = el('div',{class:'partners-dropdown header-menu-popup',id,hidden:'','aria-label':'همکاران و تجهیزات'});
    dropdown.append(el('p',{class:'dropdown-eyebrow'},'همکاری و تأمین تجهیزات نمایش'));
    const submenuId = id + '-equipment';
    const branch = el('button',{type:'button',class:'equipment-category-trigger subcategory-toggle','aria-expanded':'false','aria-controls':submenuId},el('span',{},data.modules.equipment.name),el('span',{class:'equipment-chevron','aria-hidden':'true'},'⌄'));
    const submenu = el('div',{class:'equipment-submenu',id:submenuId,hidden:'','aria-label':data.modules.equipment.name});
    for (const item of published('equipment')) {
      const link = el('a',{href:'#equipment/' + item.id},item.title);link.addEventListener('click',closeNavigationMenus);submenu.append(link);
    }
    if (!submenu.children.length) submenu.append(el('p',{class:'service-menu-empty'},'هنوز تجهیزی منتشر نشده است.'));
    branch.addEventListener('click',() => {const open = submenu.hidden;submenu.hidden = !open;branch.setAttribute('aria-expanded',String(open));});
    dropdown.append(branch,submenu);
    if (published('partners').length) {const link = el('a',{class:'partners-directory-link'},'معرفی همکاران');wireTarget(link,'partners');dropdown.append(link);}
    trigger.addEventListener('click',() => toggleNavigationMenu(trigger,dropdown));
    wrap.addEventListener('keydown',event => {
      if (event.key !== 'Escape') return;event.stopPropagation();
      if (!submenu.hidden) {submenu.hidden = true;branch.setAttribute('aria-expanded','false');branch.focus();}
      else {closeNavigationMenus();trigger.focus();}
    });
    wrap.addEventListener('focusout',event => {if (!wrap.contains(event.relatedTarget) && !dropdown.contains(event.relatedTarget)) closeNavigationMenus();});
    wrap.append(trigger,dropdown);return wrap;
  }
  function productMenu(row) {
    const wrap = el('div',{class:'products-nav-item header-menu-item'});
    const id = 'products-dropdown-' + row.id;
    const trigger = el('button',{type:'button',class:'products-menu-trigger header-menu-trigger','aria-expanded':'false','aria-controls':id},row.label,el('span',{'aria-hidden':'true',class:'dropdown-chevron'},'⌄'));
    const dropdown = el('div',{class:'products-dropdown header-menu-popup',id,hidden:'','aria-label':'دسته‌بندی محصولات'});
    dropdown.append(el('p',{class:'dropdown-eyebrow'},'محصول مناسب پروژهٔ شما'));
    const closeSubmenus = () => {
      $$('.products-submenu',dropdown).forEach(node => {node.hidden = true;});
      $$('.subcategory-toggle',dropdown).forEach(node => node.setAttribute('aria-expanded','false'));
    };
    const categoryLink = (category,className = '') => {
      const link = el('a',{href:'#category/' + category.id,class:className,'data-category':category.id},el('span',{class:'product-category-name',dir:'auto'},category.name),el('small',{},categoryCount(category.id).toLocaleString('fa-IR') + ' محصول'));
      link.addEventListener('click',closeNavigationMenus);return link;
    };
    for (const category of menuCategories()) {
      const group = el('div',{class:'product-category-group','data-category-group':category.id});
      const top = el('div',{class:'product-category-row'});
      const children = menuCategories(category.id);
      if (children.length) {
        const submenuId = id + '-' + category.id;
        const toggle = el('button',{type:'button',class:'subcategory-toggle','aria-expanded':'false','aria-controls':submenuId,'aria-label':'زیرگروه‌های ' + category.name},el('span',{'aria-hidden':'true',class:'subcategory-chevron'},'⌄'));
        const submenu = el('div',{class:'products-submenu',id:submenuId,hidden:'','aria-label':'زیرگروه‌های ' + category.name});
        children.forEach(child => submenu.append(categoryLink(child,'product-subcategory-link')));
        const expand = () => {closeSubmenus();submenu.hidden = false;toggle.setAttribute('aria-expanded','true');};
        toggle.addEventListener('click',() => {const open = submenu.hidden;closeSubmenus();if (open) expand();});
        group.addEventListener('keydown',event => {if (event.key === 'Escape' && !submenu.hidden) {event.stopPropagation();submenu.hidden = true;toggle.setAttribute('aria-expanded','false');toggle.focus();}});
        top.append(categoryLink(category),toggle);group.append(top,submenu);
      } else {
        top.append(categoryLink(category));group.append(top);
      }
      dropdown.append(group);
    }
    trigger.addEventListener('click',() => toggleNavigationMenu(trigger,dropdown));
    wrap.addEventListener('keydown',event => {if (event.key === 'Escape') {closeNavigationMenus();trigger.focus();event.stopPropagation();}});
    wrap.addEventListener('focusout',event => {if (!wrap.contains(event.relatedTarget) && !dropdown.contains(event.relatedTarget)) closeNavigationMenus();});
    wrap.append(trigger,dropdown);return wrap;
  }
  function productImage(item) {return item.image || productImages[item.imageAsset] || '';}
  function productPrice(item) {
    const block = el('div',{class:'product-price-block'});
    if (item.priceAmount === null || item.priceAmount === undefined || item.priceKind === 'quote') {
      block.classList.add('is-quote');block.append(el('strong',{class:'product-price-value'},'استعلام قیمت'));return block;
    }
    block.append(el('span',{class:'product-price-label'},(item.priceKind === 'sale' ? 'قیمت فروش' : 'قیمت مرجع') + (item.priceUnit ? ' ' + item.priceUnit : '')),el('strong',{class:'product-price-value'},item.priceAmount.toLocaleString('fa-IR'),el('small',{},' تومان')));
    return block;
  }
  function productCard(item) {
    const category = categoryFor(item);
    const link = el('a',{class:'product-card',href:'#product/' + item.id});
    const media = el('div',{class:'product-card-media','data-image-style':item.imageStyle || ''});
    if (productImage(item)) media.append(el('img',{src:productImage(item),alt:item.title,loading:'lazy'}));
    else media.append(el('div',{class:'product-no-image','aria-hidden':'true'},el('span',{},'▦'),el('small',{},'تصویر محصول')));
    const content = el('div',{class:'product-card-content'},el('span',{class:'product-category-label'},category?.name || ''),el('h3',{},item.title));
    if (item.model) content.append(el('span',{class:'product-model',dir:'auto'},item.model));
    if (item.imageCaption) media.append(el('span',{class:'product-image-caption'},item.imageCaption));
    content.append(el('p',{},item.summary),productPrice(item),el('span',{class:'product-card-link'},'مشخصات و جزئیات',el('span',{'aria-hidden':'true'},'←')));
    link.append(media,content);return link;
  }
  function breadcrumbs(parts) {
    const nav = el('nav',{class:'catalog-breadcrumbs','aria-label':'مسیر صفحه'});
    parts.forEach((part,index) => {if (index) nav.append(el('span',{'aria-hidden':'true'},'/'));nav.append(part.href ? el('a',{href:part.href},part.label) : el('span',{'aria-current':'page'},part.label));});
    return nav;
  }
  function catalogueEmpty(message) {return el('div',{class:'catalog-empty'},el('span',{'aria-hidden':'true'},'▦'),el('h2',{},message),el('p',{},'می‌توانی دستهٔ دیگری انتخاب کنی یا برای راهنمایی با آوا تماس بگیری.'),el('a',{href:'#contact',class:'button'},'تماس با آوا'));
  }
  function renderCatalogue(categoryId = '') {
    const root = $('#catalog-page');root.replaceChildren();
    const category = categoryId ? publicCategories().find(item => item.id === categoryId) : null;
    if (categoryId && !category) {renderCatalogueNotFound();return;}
    const heading = el('section',{class:'catalog-heading'});
    const banner = category?.banner || data.modules.products.banner;
    const trail = category ? categoryCrumbs(category).map((part,index,all) => index === all.length-1 ? {label:part.label} : part) : [];
    heading.append(breadcrumbs([{label:'خانه',href:'#home'},{label:data.modules.products.name,href:category ? '#products' : ''},...trail]),el('span',{class:'catalog-kicker'},'AVA GROUP / PRODUCTS'),el('h1',{},banner?.title || category?.name || data.modules.products.name),el('p',{},banner?.description || category?.description || data.modules.products.description));
    const count = categoryCount(categoryId);
    heading.append(el('span',{class:'catalog-total'},count.toLocaleString('fa-IR') + ' محصول برای بررسی'));
    if (banner?.show !== false) {
      const hero = el('section',{class:'catalog-banner','aria-label':'بنر ' + (category?.name || data.modules.products.name)});
      fillPageBanner(hero,banner,heading);
      const browse = el('button',{type:'button',class:'catalog-browse'},'مشاهدهٔ محصولات',el('span',{'aria-hidden':'true'},'↓'));
      browse.addEventListener('click',() => $('.catalog-layout',root).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'}));
      heading.append(browse);root.append(hero);
    } else root.append(heading);
    const categoryCards = menuCategories(category?.id || '');
    if (categoryCards.length) {
      const grid = el('div',{class:'category-overview'});
      for (const c of categoryCards) {
        const number = categoryCount(c.id);
        grid.append(el('a',{href:'#category/' + c.id,class:'category-overview-card'},el('span',{class:'category-symbol','aria-hidden':'true'},'◈'),el('strong',{},c.name),el('p',{},c.description),el('span',{class:'category-count'},number.toLocaleString('fa-IR') + ' محصول',el('span',{'aria-hidden':'true'},'←'))));
      }
      if (grid.children.length) root.append(grid);
    }
    const layout = el('div',{class:'catalog-layout'});
    const side = el('aside',{class:'catalog-sidebar','aria-label':'فیلتر دستهٔ محصول'},el('h2',{},'دسته‌بندی محصولات'));
    const filters = [['','همهٔ محصولات'],...publicCategories().map(c => [c.id,(c.parentId ? 'ـ ' : '') + c.name])];
    for (const [id,name] of filters) {
      const link = el('a',{href:id ? '#category/' + id : '#products',class:id === categoryId ? 'selected' : ''},el('span',{},name),el('small',{},categoryCount(id).toLocaleString('fa-IR')));
      if (id === categoryId) link.setAttribute('aria-current','page');side.append(link);
    }
    const main = el('div',{class:'catalog-results'});
    const tools = el('div',{class:'catalog-tools'});
    const search = el('input',{type:'search',placeholder:'جستجوی نام یا مدل محصول…','aria-label':'جستجوی محصولات',class:'catalog-search',maxlength:'160'});
    const sort = el('select',{'aria-label':'مرتب‌سازی محصولات'},el('option',{value:'original'},'ترتیب نمایش'),el('option',{value:'title'},'نام: الف تا ی'),el('option',{value:'title-desc'},'نام: ی تا الف'),el('option',{value:'price'},'قیمت: کم به زیاد'),el('option',{value:'price-desc'},'قیمت: زیاد به کم'));
    tools.append(search,sort);
    const counter = el('p',{class:'catalog-result-count','aria-live':'polite'});
    const grid = el('div',{class:'product-grid'});
    function paint() {
      const query = search.value.trim().toLocaleLowerCase('fa-IR');
      let items = publicProducts().filter(item => categoryContains(categoryId,item) && (item.title + ' ' + (item.model || '') + ' ' + item.summary).toLocaleLowerCase('fa-IR').includes(query));
      if (sort.value.startsWith('price')) items.sort((a,b) => {
        const av = a.priceKind === 'quote' ? null : a.priceAmount,bv = b.priceKind === 'quote' ? null : b.priceAmount;
        if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
        if (bv === null || bv === undefined) return -1;
        return (av-bv) * (sort.value === 'price-desc' ? -1 : 1);
      });
      else if (sort.value !== 'original') items.sort((a,b) => a.title.localeCompare(b.title,'fa') * (sort.value === 'title-desc' ? -1 : 1));
      counter.textContent = items.length.toLocaleString('fa-IR') + ' محصول' + (query ? ' در نتیجهٔ جستجو' : ' در این فهرست');
      grid.replaceChildren(...items.map(productCard));
      if (!items.length) grid.append(catalogueEmpty(query ? 'محصولی با این عبارت پیدا نشد.' : 'هنوز محصولی در این دسته منتشر نشده است.'));
    }
    search.addEventListener('input',paint);sort.addEventListener('change',paint);paint();
    main.append(tools,counter,grid);layout.append(side,main);root.append(layout);
    document.title = (category?.name || data.modules.products.name) + ' | ' + (data.header.nameFa || 'آوا');
  }
  function renderCatalogueNotFound() {
    $('#catalog-page').replaceChildren(el('div',{class:'product-not-found'},el('span',{class:'catalog-kicker'},'AVA GROUP / 404'),el('h1',{},'این صفحه در دسترس نیست.'),el('p',{},'ممکن است محصول یا دسته حذف شده باشد یا هنوز منتشر نشده باشد.'),el('a',{href:'#products',class:'button'},'بازگشت به محصولات')));
    document.title = 'صفحه پیدا نشد | آوا';
  }
  function renderProduct(id) {
    const item = publicProducts().find(product => product.id === id);
    if (!item) {renderCatalogueNotFound();return;}
    const category = categoryFor(item);const root = $('#catalog-page');root.replaceChildren();
    const pageBanner = data.pageBanners['product:' + id] || item.banner;
    if (pageBanner?.show !== false && pageBanner) appendPageBanner(root,pageBanner,item.title);
    const container = el('div',{class:'product-page'});
    container.append(breadcrumbs([{label:'خانه',href:'#home'},{label:data.modules.products.name,href:'#products'},...categoryCrumbs(category),{label:item.title}]));
    const hero = el('section',{class:'product-hero'});
    const media = el('div',{class:'product-main-image'});
    if (productImage(item)) {
      const openImage = el('button',{type:'button',class:'product-image-open','aria-label':'بزرگ‌نمایی تصویر ' + item.title},el('img',{src:productImage(item),alt:item.title}));
      openImage.append(el('span',{class:'product-zoom-hint','aria-hidden':'true'},'＋'));
      openImage.addEventListener('click',() => {$('#product-image-full').src = productImage(item);$('#product-image-full').alt = item.title;$('#product-image-dialog').showModal();});media.append(openImage);
    }
    else media.append(el('div',{class:'product-no-image'},el('span',{'aria-hidden':'true'},'▦'),el('small',{},'تصویر این محصول هنوز اضافه نشده است.')));
    if (item.imageCaption) media.append(el('span',{class:'product-image-caption'},item.imageCaption));
    const info = el('div',{class:'product-introduction'},el('a',{class:'product-category-label',href:'#category/' + category.id},category.name),el('h1',{},item.title));
    if (item.model) info.append(el('p',{class:'product-model',dir:'auto'},item.model));
    info.append(el('p',{class:'product-summary'},item.summary));
    info.append(productPrice(item));
    if (item.priceKind === 'reference' && item.priceAmount !== null) info.append(el('p',{class:'product-price-note'},'قیمت مرجع ' + item.priceUnit + '؛ هزینهٔ حمل، واردات و مالیات در آن لحاظ نشده است. قیمت نهایی را استعلام کنید.'));
    if (item.priceDate) info.append(el('p',{class:'product-price-date'},'تاریخ لیست قیمت: ' + item.priceDate.replace(/\d/g,n => '۰۱۲۳۴۵۶۷۸۹'[n])));
    if (item.meta) info.append(el('p',{class:'product-extra'},item.meta));
    const actions = el('div',{class:'product-main-actions'});
    const consult = el('a',{href:'#contact',class:'button'},'استعلام این محصول');
    consult.addEventListener('click',() => {
      $('#request-form').elements.project.value = 'درخواست مشاوره دربارهٔ محصول «' + item.title + '»' + (item.model ? ' — ' + item.model : '');
    });
    actions.append(consult);info.append(actions);hero.append(media,info);container.append(hero);
    const tablist = el('div',{class:'product-tabs',role:'tablist','aria-label':'اطلاعات محصول'});
    const panels = el('div',{class:'product-tab-panels'});
    const names = [['overview','معرفی محصول'],['specs','مشخصات فنی'],['downloads','فایل‌ها و دانلودها']];
    function activate(key) {
      $$('[role=tab]',tablist).forEach(tab => {const active = tab.dataset.panel === key;tab.setAttribute('aria-selected',String(active));tab.tabIndex = active ? 0 : -1;});
      $$('[role=tabpanel]',panels).forEach(panel => {panel.hidden = panel.id !== 'product-panel-' + key;});
    }
    names.forEach(([key,name],index) => {
      const tab = el('button',{type:'button',role:'tab',id:'product-tab-' + key,'aria-controls':'product-panel-' + key,'aria-selected':String(index === 0),tabindex:index === 0 ? '0' : '-1','data-panel':key},name);
      tab.addEventListener('click',() => activate(key));
      tab.addEventListener('keydown',event => {const tabs = $$('[role=tab]',tablist);let next;if (event.key === 'ArrowLeft') next = (index+1)%tabs.length;if (event.key === 'ArrowRight') next = (index+tabs.length-1)%tabs.length;if (event.key === 'Home') next = 0;if (event.key === 'End') next = tabs.length-1;if (next !== undefined) {event.preventDefault();activate(names[next][0]);tabs[next].focus();}});
      tablist.append(tab);
      const panel = el('section',{role:'tabpanel',id:'product-panel-' + key,'aria-labelledby':'product-tab-' + key,tabindex:'0'});panel.hidden = index !== 0;
      if (key === 'overview') panel.append(el('h2',{},'دربارهٔ ' + item.title),el('p',{class:'product-body'},item.body || item.summary || 'توضیحات این محصول هنوز تکمیل نشده است.'));
      if (key === 'specs') {
        panel.append(el('h2',{},'مشخصات فنی'));
        if (item.specifications?.length) {
          const table = el('table',{class:'product-specifications'},el('caption',{class:'sr-only'},'مشخصات فنی ' + item.title));
          const tbody = el('tbody');for (const spec of item.specifications) tbody.append(el('tr',{},el('th',{scope:'row'},spec.label),el('td',{},spec.value)));table.append(tbody);panel.append(table);
        } else panel.append(el('p',{class:'product-empty-text'},'مشخصات فنی این محصول هنوز ثبت نشده است. برای اطلاعات دقیق با آوا تماس بگیر.'));
      }
      if (key === 'downloads') {
        panel.append(el('h2',{},'فایل‌ها و دانلودها'));const files = el('div',{class:'product-downloads'});
        if (item.file) files.append(visibleLink(item.fileName || 'دریافت PDF محصول',item.file,item.id + '.pdf'));
        if (item.datasheetUrl) files.append(visibleLink('برگهٔ مشخصات',item.datasheetUrl));
        if (item.manualUrl) files.append(visibleLink('راهنمای کاربر',item.manualUrl));
        if (item.url) files.append(visibleLink('پیوند مرتبط',item.url));
        if (!files.children.length) panel.append(el('p',{class:'product-empty-text'},'هنوز فایلی برای این محصول اضافه نشده است.'));else panel.append(files);
      }
      panels.append(panel);
    });
    container.append(tablist,panels);
    const related = publicProducts().filter(product => product.categoryId === item.categoryId && product.id !== item.id).slice(0,3);
    if (related.length) container.append(el('section',{class:'related-products'},el('h2',{},'محصولات همین دسته'),el('div',{class:'product-grid'},related.map(productCard))));
    root.append(container);document.title = item.title + (item.model ? ' ' + item.model : '') + ' | ' + (data.header.nameFa || 'آوا');
  }
  function renderCatalogRoute() {
    const [name,id] = currentHash().slice(1).split('/');
    const isCatalog = ['about','products','category','product','service','equipment'].includes(name);
    $('#home-content').hidden = isCatalog;$('#catalog-page').hidden = !isCatalog;
    if (!isCatalog) return false;
    if(name==='about')renderAbout();else if (name === 'products') renderCatalogue();else if (name === 'category') renderCatalogue(id || '__missing__');else if (name === 'service') renderOffering('services',id || '__missing__');else if (name === 'equipment') {if (id) renderOffering('equipment',id);else renderEquipmentList();}else renderProduct(id || '__missing__');
    return true;
  }
  function renderOffering(key,id) {
    const equipment = key === 'equipment';
    const root = $('#catalog-page');root.replaceChildren();
    const item = published(key).find(record => record.id === id);
    if (!item) {
      root.append(el('div',{class:'product-not-found'},el('span',{class:'catalog-kicker'},'AVA GROUP / ' + (equipment ? 'EQUIPMENT' : 'SERVICES')),el('h1',{},equipment ? 'این تجهیز در دسترس نیست.' : 'این خدمت در دسترس نیست.'),el('p',{},'ممکن است این مورد حذف شده یا هنوز منتشر نشده باشد.'),el('a',{href:'#' + key,class:'button'},equipment ? 'بازگشت به تجهیزات' : 'بازگشت به خدمات')));
      document.title = 'صفحه در دسترس نیست | آوا';return;
    }
    const pageBanner = data.pageBanners[(equipment ? 'equipment:' : 'service:') + id] || item.banner;
    if (pageBanner?.show !== false && pageBanner) appendPageBanner(root,pageBanner,item.title);
    const container = el('div',{class:'service-page' + (equipment ? ' equipment-page' : '')});
    container.append(breadcrumbs([{label:'خانه',href:'#home'},...(equipment ? [{label:data.modules.partners.name}] : []),{label:data.modules[key].name,href:'#' + key},{label:item.title}]));
    const heading = el('section',{class:'service-page-heading'},el('span',{class:'catalog-kicker'},'AVA GROUP / ' + (equipment ? 'EQUIPMENT' : 'SERVICES')),el('h1',{},item.title),el('p',{},item.summary));
    if (item.meta) heading.append(el('span',{class:'service-meta'},item.meta));
    const layout = el('div',{class:'service-page-layout'});
    const body = el('section',{class:'service-page-body'},el('h2',{},equipment ? 'معرفی و نکات انتخاب تجهیز' : 'دربارهٔ این خدمت'));
    if (productImage(item) && (!pageBanner || pageBanner.show === false)) body.append(el('img',{src:productImage(item),alt:item.title}));
    body.append(el('p',{class:'product-body'},item.body || item.summary));
    if (item.url) body.append(visibleLink('اطلاعات بیشتر',item.url));
    const aside = el('aside',{class:'service-request-card'},el('span',{class:'catalog-kicker'},equipment ? 'انتخاب بر اساس سازگاری' : 'از نیاز پروژه شروع کنیم'),el('h2',{},(equipment ? 'استعلام ' : 'درخواست ') + item.title),el('p',{},equipment ? 'مدل یا برند، تعداد و مشخصات تجهیزات فعلی را بنویسید تا سازگاری و شرایط تأمین بررسی شوند.' : 'محل اجرا، زمان موردنیاز و توضیح کوتاهی از پروژه را آماده کنید تا دربارهٔ شرایط انجام کار هماهنگی شود.'));
    const request = el('a',{href:'#contact',class:'button'},equipment ? 'استعلام قیمت و موجودی' : 'درخواست این خدمت');
    request.addEventListener('click',() => {$('#request-form').elements.project.value = equipment ? 'استعلام تجهیز «' + item.title + '»\nمدل یا برند: \nتعداد: \nمشخصات تجهیزات فعلی: \nشهر و زمان موردنیاز: ' : 'درخواست خدمت «' + item.title + '»\nمحل اجرا: \nزمان موردنیاز: \nتوضیح پروژه: ';});
    aside.append(request,el('small',{},equipment ? 'قیمت و موجودی پس از بررسی مدل و تعداد مشخص می‌شوند.' : 'شرایط، هزینه و زمان‌بندی پس از بررسی پروژه مشخص می‌شوند.'));
    layout.append(body,aside);container.append(heading,layout);root.append(container);document.title = item.title + ' | ' + (data.header.nameFa || 'آوا');
  }
  function renderEquipmentList() {
    const module = data.modules.equipment;const root = $('#catalog-page');root.replaceChildren();
    const heading = el('section',{class:'catalog-heading'},breadcrumbs([{label:'خانه',href:'#home'},{label:data.modules.partners.name},{label:module.name}]),el('span',{class:'catalog-kicker'},'AVA GROUP / EQUIPMENT'),el('h1',{},module.name),el('p',{},module.description));
    const overviewBanner=data.pageBanners.equipment;if(overviewBanner && overviewBanner.show!==false)appendPageBanner(root,overviewBanner,module.name);
    const list = el('div',{class:'equipment-list cards'});
    for (const item of published('equipment')) {
      const card = el('article',{class:'card managed-card'});
      if (item.image) card.append(el('img',{src:item.image,alt:item.title,loading:'lazy'}));else card.append(el('div',{class:'icon','aria-hidden':'true'},'▦'));
      card.append(el('span',{class:'entry-meta',dir:'auto'},item.meta),el('h3',{},item.title),el('p',{},item.summary),el('a',{href:'#equipment/' + item.id,class:'card-action'},'معرفی و استعلام تجهیز ←'));list.append(card);
    }
    if (!list.children.length) list.append(el('p',{class:'managed-empty'},'هنوز تجهیزی در این بخش منتشر نشده است.'));
    root.append(heading,list);document.title = module.name + ' | ' + (data.header.nameFa || 'آوا');
  }
  function renderHero() {
    heroController?.dispose();
    const hero = data.hero,root = $('#hero'),viewport = $('#hero-viewport');
    root.hidden = !hero.show;root.classList.remove('is-dragging');
    viewport.replaceChildren();$('.hero-controls',root)?.remove();
    viewport.tabIndex = 0;viewport.setAttribute('aria-label','اسلایدهای آوا؛ با کشیدن تصویر یا کلیدهای جهت جابه‌جا شوید');
    const signalController = new AbortController(),signal = signalController.signal;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0,timer,animations = [],inView = false,disposed = false;
    let transitionVisit = 0,pointer = null,previewIndex = null;
    let motionAnimations = [],motionReady = false,motionWaiting = false,motionVisit = 0,motionFrame;
    const hasMotion = hero.showMotionLogo !== false,nodes = [],count = hero.slides.length + Number(hasMotion);
    function slideNode(number,motion = false) {
      const node = el('div',{class:'hero-slide' + (motion ? ' hero-motion-slide' : ''),role:'group','aria-roledescription':'اسلاید','aria-label':motion ? 'موشن‌لوگوی آوا؛ دو بار پخش' : (number+1) + ' از ' + count,'aria-hidden':String(number !== 0)});
      node.hidden = number !== 0;node.inert = number !== 0;nodes.push(node);viewport.append(node);return node;
    }
    if (hasMotion) {
      const frame = el('iframe',{class:'hero-motion-frame',title:'موشن‌لوگوی آوا',sandbox:'allow-same-origin',tabindex:'-1'});
      motionFrame = frame;
      frame.addEventListener('load',() => {
        if (disposed) return;
        refreshMotion(reducedMotion.matches ? 3500 : 0);
        schedule();
      },{signal});
      frame.srcdoc = heroMotionDocument;slideNode(0,true).append(frame);
    }
    hero.slides.forEach((slide,number) => {const node=slideNode(number+Number(hasMotion));node.append(el('img',{class:'hero-scene',src:slide.image || heroImages[slide.asset],alt:slide.imageAlt,draggable:'false',decoding:'async',fetchpriority:number===0?'high':'low',loading:number===0?'eager':'lazy'}));if(slide.clickUrl){node.append(el('a',{class:'hero-image-link',draggable:'false',href:slide.clickUrl,'aria-label':slide.title}));}});
    const controls = el('div',{class:'hero-controls'});
    const previous = el('button',{type:'button',class:'hero-arrow hero-previous','aria-label':'اسلاید قبلی'});
    const next = el('button',{type:'button',class:'hero-arrow hero-next','aria-label':'اسلاید بعدی'});
    previous.innerHTML = '<svg viewBox="0 0 32 64" aria-hidden="true"><path d="M25 7 7 32l18 25"/></svg>';
    next.innerHTML = '<svg viewBox="0 0 32 64" aria-hidden="true"><path d="m7 7 18 25L7 57"/></svg>';
    const pagination = el('div',{class:'hero-pagination','aria-label':'انتخاب اسلاید'}),dots = el('div',{class:'hero-dots',dir:'ltr'});
    const dotButtons = nodes.map((node,number) => {
      const name = hasMotion && number === 0 ? 'موشن‌لوگوی آوا' : hero.slides[number-Number(hasMotion)].imageAlt;
      const button = el('button',{type:'button',class:'hero-dot','aria-label':'اسلاید ' + (number+1) + ': ' + name});
      button.addEventListener('click',() => go(number,number > index ? 1 : -1,true),{signal});dots.append(button);return button;
    });
    const status = el('span',{class:'sr-only','aria-live':'polite','aria-atomic':'true'});
    pagination.append(dots);controls.append(previous,next,pagination,status);controls.hidden = count < 2;root.append(controls);
    function paint(manual = false) {
      dotButtons.forEach((button,number) => button.setAttribute('aria-current',String(number === index)));
      if (manual) status.textContent = 'اسلاید ' + (index+1).toLocaleString('fa-IR') + ' از ' + count.toLocaleString('fa-IR');
    }
    const stop = () => clearTimeout(timer);
    function refreshMotion(time) {
      if (!motionFrame?.contentDocument) return;
      // Showing a previously hidden frame can recreate its CSS animations.
      // Read the visible frame before seeking/playing, rather than stale handles.
      motionFrame.getBoundingClientRect();
      const current = motionFrame.contentDocument.getAnimations();
      if (current.length !== motionAnimations.length || current.some((animation,n) => animation !== motionAnimations[n])) {
        motionAnimations = current;motionReady = current.length > 0;motionVisit++;motionWaiting = false;
      }
      if (time !== undefined) for(const animation of motionAnimations){animation.pause();animation.currentTime = time;}
    }
    function canPlay() {return !disposed && count > 1 && !pointer && !reducedMotion.matches && inView && !document.hidden && !root.hidden && !$('#home-content').hidden && !$('#public-site').hidden;}
    function schedule() {
      stop();const playing = canPlay();
      if (playing && hasMotion && index === 0) refreshMotion();
      for (const animation of motionAnimations) {
        if (playing && hasMotion && index === 0) {if (animation.currentTime < animation.effect.getComputedTiming().endTime) animation.play();}
        else animation.pause();
      }
      if (!playing) return;
      if (hasMotion && index === 0) {
        if (!motionReady || motionWaiting) return;
        motionWaiting = true;const visit = motionVisit;
        Promise.all(motionAnimations.map(animation => animation.finished)).then(() => {
          if (disposed || visit !== motionVisit || index !== 0) return;
          motionWaiting = false;if (canPlay()) go((index+1)%count,1,false);
        }).catch(() => {});
      } else timer = setTimeout(() => go((index+1)%count,1,false),hero.interval);
    }
    function normalize() {
      transitionVisit++;animations.forEach(animation => animation.cancel());animations = [];
      nodes.forEach((node,number) => {node.style.transform = '';node.hidden = number !== index;node.inert = number !== index;node.setAttribute('aria-hidden',String(number !== index));});previewIndex = null;
    }
    function go(nextIndex,direction,manual,offset = 0) {
      normalize();
      if (nextIndex === index) {paint(manual);schedule();return;}
      motionVisit++;motionWaiting = false;
      const old = nodes[index];index = (nextIndex+count)%count;const incoming = nodes[index];
      old.inert = true;old.setAttribute('aria-hidden','true');incoming.hidden = false;incoming.inert = false;incoming.setAttribute('aria-hidden','false');paint(manual);
      if (hasMotion && index === 0) refreshMotion(reducedMotion.matches ? 3500 : 0);
      if (reducedMotion.matches) {old.hidden = true;schedule();return;}
      const visit = transitionVisit,width = viewport.clientWidth,options = {duration:500,easing:'cubic-bezier(.22,.7,.2,1)'};
      animations = [old.animate([{transform:'translateX('+offset+'px)'},{transform:'translateX('+(-direction*100)+'%)'}],options),incoming.animate([{transform:'translateX('+(direction*width+offset)+'px)'},{transform:'translateX(0)'}],options)];
      Promise.all(animations.map(animation => animation.finished)).then(() => {if(disposed || visit !== transitionVisit) return;old.hidden = true;animations = [];}).catch(() => {});
      schedule();
    }
    previous.addEventListener('click',() => go((index+count-1)%count,-1,true),{signal});next.addEventListener('click',() => go((index+1)%count,1,true),{signal});
    root.addEventListener('keydown',event => {
      if (event.target !== viewport) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {event.preventDefault();const direction = event.key === 'ArrowRight' ? 1 : -1;go((index+count+direction)%count,direction,true);}
      if(event.key === 'Home' || event.key === 'End'){event.preventDefault();go(event.key === 'Home' ? 0 : count-1,event.key === 'Home' ? -1 : 1,true);}
    },{signal});
    function clearDrag() {root.classList.remove('is-dragging');nodes[index].style.transform = '';if(previewIndex !== null && previewIndex !== index){nodes[previewIndex].style.transform = '';nodes[previewIndex].hidden = true;}previewIndex = null;}
    viewport.addEventListener('pointerdown',event => {
      if (count < 2 || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      normalize();pointer = {id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0,horizontal:false};schedule();
    },{signal});
    viewport.addEventListener('pointermove',event => {
      if(!pointer || pointer.id !== event.pointerId) return;
      pointer.dx = event.clientX-pointer.x;pointer.dy = event.clientY-pointer.y;
      if(!pointer.horizontal && Math.abs(pointer.dx)>12 && Math.abs(pointer.dx)>Math.abs(pointer.dy)*1.3){pointer.horizontal = true;root.classList.add('is-dragging');try{viewport.setPointerCapture(event.pointerId);}catch{}}
      if(!pointer.horizontal) return;
      event.preventDefault();const direction = pointer.dx < 0 ? 1 : -1,newPreview = (index+count+direction)%count;
      if(previewIndex !== null && previewIndex !== newPreview){nodes[previewIndex].hidden = true;nodes[previewIndex].style.transform = '';}
      const previousPreview = previewIndex;previewIndex = newPreview;nodes[index].style.transform = 'translateX('+pointer.dx+'px)';nodes[previewIndex].hidden = false;
      if(hasMotion && newPreview === 0 && previousPreview !== 0) refreshMotion(3500);
      nodes[previewIndex].style.transform = 'translateX('+(direction*viewport.clientWidth+pointer.dx)+'px)';
    },{signal,passive:false});
    let suppressHeroClick=false;
    viewport.addEventListener('click',event=>{if(suppressHeroClick){event.preventDefault();event.stopPropagation();suppressHeroClick=false;}},{signal,capture:true});
    viewport.addEventListener('pointerup',event => {
      if(!pointer || pointer.id !== event.pointerId) return;
      const drag = pointer;suppressHeroClick=drag.horizontal;setTimeout(()=>{suppressHeroClick=false;},400);pointer = null;clearDrag();
      if(viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      if(drag.horizontal && Math.abs(drag.dx)>Math.min(100,viewport.clientWidth*.16)){const direction = drag.dx < 0 ? 1 : -1;go((index+count+direction)%count,direction,true,drag.dx);}else schedule();
    },{signal});
    function cancelDrag(){if(!pointer)return;pointer = null;clearDrag();schedule();}
    viewport.addEventListener('pointercancel',cancelDrag,{signal});
    viewport.addEventListener('lostpointercapture',event => {if(pointer?.id === event.pointerId && event.target === viewport && !viewport.hasPointerCapture(event.pointerId)) cancelDrag();},{signal});
    window.addEventListener('resize',cancelDrag,{signal});
    document.addEventListener('visibilitychange',schedule,{signal});window.addEventListener('hashchange',schedule,{signal});
    const motionChange = () => {normalize();if(reducedMotion.matches){for(const animation of motionAnimations){animation.pause();if(index===0)animation.currentTime=3500;}}paint();schedule();};
    reducedMotion.addEventListener('change',motionChange);
    const observer = new IntersectionObserver(entries => {inView = entries[0].isIntersecting;schedule();},{threshold:.15});observer.observe(root);
    const measureHeader = () => {const height = Math.ceil($('.site-header').getBoundingClientRect().height)+'px';root.style.setProperty('--header-height',height);document.documentElement.style.setProperty('--site-header-height',height);};
    const headerObserver = new ResizeObserver(measureHeader);headerObserver.observe($('.site-header'));measureHeader();
    heroController = {dispose:() => {disposed=true;stop();signalController.abort();observer.disconnect();headerObserver.disconnect();reducedMotion.removeEventListener('change',motionChange);animations.forEach(animation=>animation.cancel());motionAnimations.forEach(animation=>animation.cancel());}};
    paint();
  }
  function renderPublic() {
    closeNavigationMenus();
    disposePageBanners();
    const h = data.header;
    $('.ava-brand').href=serverMode?'/':'#home';$('footer>a:first-child').href=serverMode?'/':'#home';$('footer>a:last-child').href='#home';
    let logo = $('.ava-brand .ava-mark');
    const replacement = h.logo ? el('img',{class:'ava-mark uploaded-logo',src:h.logo,alt:'لوگوی ' + h.nameFa}) : (() => {const t = document.createElement('template');t.innerHTML = defaultLogo;return t.content.firstElementChild;})();
    replacement.hidden = !h.showLogo;
    logo.replaceWith(replacement);
    $('.ava-name').textContent = h.nameEn;
    $('.ava-name').hidden = !h.showNameEn;
    $('.ava-wordmark small').textContent = h.nameFa;
    $('.ava-wordmark small').hidden = !h.showNameFa;
    $('.ava-wordmark').hidden = !h.showNameEn && !h.showNameFa;
    $('.ava-brand').setAttribute('aria-label',(h.nameFa || h.nameEn || 'آوا') + '، صفحه نخست');
    const slogan = $('.brand-motto strong');
    const split = h.sloganEn.indexOf(' ');
    slogan.replaceChildren(...(split < 0 ? [h.sloganEn] : [h.sloganEn.slice(0,split+1),el('span',{},h.sloganEn.slice(split+1))]));
    slogan.hidden = !h.showSloganEn;
    $('.brand-motto p').textContent = h.sloganFa;
    $('.brand-motto p').hidden = !h.showSloganFa;
    const nav = $('#navigation');
    const drawer = $('#drawer-links');
    nav.replaceChildren();drawer.replaceChildren();
    for (const row of data.navigation.filter(row => row.visible)) {
      if (row.target === 'products') nav.append(productMenu(row));
      else if (row.target === 'services') nav.append(servicesMenu(row));
      else if (row.target === 'partners') nav.append(partnersMenu(row));
      else {
        const a = el('a',row.id === 'catalog' ? {class:'catalog-link'} : {},row.label);
        wireTarget(a,row.target,row.url);nav.append(a);
      }
      const second = el('a',{},row.label,el('span',{'aria-hidden':'true'},'←'));
      wireTarget(second,row.target,row.url);drawer.append(second);
    }
    nav.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.min(innerWidth <= 600 ? 4 : 8,nav.children.length)) + ',minmax(0,1fr))';
    renderHero();
    const sections = $('#managed-sections');sections.replaceChildren();
    for (const key of KEYS.filter(key => key !== 'contact')) {
      const items = key === 'products' ? publicProducts().filter(item => item.featured).slice(0,6) : published(key);if (!items.length) continue;
      const m = data.modules[key];
      const section = el('section',{class:'content managed-module',id:key === 'products' ? 'featured-products' : key});
      const heading = el('div',{class:'section-head'},el('div',{},el('span',{class:'kicker'},'گروه آوا / ' + LABELS[key]),el('h2',{},m.name + (key === 'products' ? ' منتخب' : ''))),el('p',{},m.description));
      const sectionBanner = data.pageBanners[key];if (sectionBanner?.show !== false && sectionBanner) appendPageBanner(section,sectionBanner,m.name);
      const cards = el('div',{class:'cards'});
      if (key === 'products') {
        cards.className = 'product-grid';cards.append(...items.map(productCard));
        section.append(heading,cards,el('a',{href:'#products',class:'all-products-link'},'مشاهدهٔ همهٔ محصولات ←'));sections.append(section);continue;
      }
      for (const item of items) {
        if (key === 'services' && item.id === 'led-trailer-rental') {section.append(trailerServiceFeature(item));continue;}
        const card = el('article',{class:'card managed-card'});
        if (item.image) card.append(el('img',{src:item.image,alt:item.title,loading:'lazy'}));
        else card.append(el('div',{class:'icon','aria-hidden':'true'},key === 'products' ? '▦' : '◈'));
        if (item.meta) card.append(el('span',{class:'entry-meta'},item.meta));
        card.append(el('h3',{},item.title),el('p',{},item.summary));
        const button = el('button',{type:'button',class:'card-action'},'مشاهدهٔ جزئیات ↖');
        button.addEventListener('click',() => openDetail(key,item));card.append(button);cards.append(card);
      }
      section.prepend(heading);section.append(cards);sections.append(section);
    }
    if(!$('#about-link'))$('footer>p').after(el('a',{id:'about-link',href:serverMode?'/about':'#about'},'دربارهٔ '+data.header.nameFa));
    $('#about-link').textContent='دربارهٔ '+data.header.nameFa;
    $('footer>p').textContent=(data.footer?.text||'')+(data.footer?.copyright?' — '+data.footer.copyright:'');
    $('.contact h2').textContent = data.contact.title;
    $('.contact>div>p').textContent = data.contact.description;
    let contacts = $('.contact-links');if (!contacts) {$('.contact>div').append(el('div',{class:'contact-links'}));contacts = $('.contact-links');}
    contacts.replaceChildren();
    if (data.contact.phone) contacts.append(el('a',{href:'tel:'+data.contact.phone,'data-contact-event':'contact-phone'},'تلفن: '+data.contact.phone));
    if (data.contact.email) contacts.append(el('a',{href:'mailto:'+data.contact.email,'data-contact-event':'contact-email'},'ایمیل: '+data.contact.email));
    if (data.contact.address) contacts.append(el('span',{},'نشانی: ',data.contact.address));
    $('.contact>.contact-page-banner')?.remove();
    if(data.pageBanners.contact?.show) {const holder=el('section',{class:'contact-page-banner'});appendPageBanner(holder,data.pageBanners.contact,data.modules.contact.name);$('.contact').prepend(holder);}
    if(!$('#home-page-heading'))$('#home-content').prepend(el('h1',{id:'home-page-heading',class:'sr-only'},data.header.nameFa+'؛ '+data.hero.title+' '+data.hero.highlight));
    if (!adminVisible) renderCatalogRoute();
  }

  function field(label, name, value, options = {}) {
    const tag = options.multiline ? 'textarea' : 'input';
    const attrs = options.multiline ? `rows="${options.rows || 3}" maxlength="${options.max || 2500}"` : `type="${options.type || 'text'}" maxlength="${options.max || 180}" value="${escapeHTML(value)}"`;
    return `<label>${escapeHTML(label)}<${tag} name="${name}" ${attrs} ${options.ltr ? 'dir="ltr"' : ''} ${options.required ? 'required' : ''}>${tag === 'textarea' ? escapeHTML(value) + '</textarea>' : ''}</label>`;
  }
  function checkbox(label, name, value) {return `<label class="checkbox"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}>${escapeHTML(label)}</label>`;}
  function targetOptions(value, external = false) {
    return [...CONTENT_KEYS.map(key => [key,data.modules[key].name || LABELS[key]]),['hero','هیرو / ابتدای صفحه'],['vision','نگاه آوا'],['process','مسیر همکاری'],...(external ? [['external','پیوند بیرونی']] : [])].map(([key,name]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('');
  }
  function saveButton(label = 'ذخیرهٔ تغییرات') {return `<div class="form-actions"><button class="admin-button" type="submit">${label}</button><span style="font-size:10px;color:#8c99af">پس از ذخیره، تغییرات در سایت دیده می‌شوند.</span></div>`;}
  function formValues(form) {return Object.fromEntries(new FormData(form));}
  function watchForm(form) {form.addEventListener('input',markDirty);form.addEventListener('change',markDirty);}
  function renderSidebar() {
    const root = $('#module-sidebar');root.replaceChildren();
    for (const key of KEYS) {
      const a = el('a',{href:'#admin/' + key,'data-page':key},el('span',{'aria-hidden':'true'},'·'),data.modules[key].name || LABELS[key]);
      root.append(a);
      if (key === 'partners') root.append(el('a',{href:'#admin/equipment','data-page':'equipment',class:'sidebar-subitem'},el('span',{'aria-hidden':'true'},'↳'),data.modules.equipment.name));
      if (key === 'products') root.append(el('a',{href:'#admin/categories','data-page':'categories',class:'sidebar-subitem'},el('span',{'aria-hidden':'true'},'↳'),'دسته‌بندی محصولات'));
    }
    $$('.admin-sidebar a').forEach(a => a.classList.toggle('active',a.dataset.page === currentPage));
  }
  function notice() {if (serverMode) return '<div class="notice">ورود مدیر فعال است؛ تغییرات پس از ذخیره روی سرور برای همهٔ کاربران منتشر می‌شوند.</div>';return '<div class="notice">این پنل نسخهٔ محلی و بدون ورود است؛ اطلاعات در همین مرورگر نگهداری می‌شوند. برای استفادهٔ عمومی و دسترسی چند نفر، اتصال به سرور و ورود امن لازم است.</div>';}
  function renderDashboard(root) {
    const all = CONTENT_KEYS.flatMap(key => data.modules[key].items);
    root.innerHTML = notice() + (loadWarning ? `<div class="notice">${escapeHTML(loadWarning)}</div>` : '') + `
      <div class="dashboard-welcome"><div><h2>هر بخش، محتوای خودش.</h2><p>از نام و لوگوی بالای سایت تا آخرین محصول و مقاله؛ همه را از همین‌جا مدیریت کن.</p></div><a class="admin-button" href="#admin/header">تنظیم هویت سایت ←</a></div>
      <div class="stats-grid"><div class="stat"><span>کل محتواها</span><strong>${all.length.toLocaleString('fa-IR')}</strong></div><div class="stat"><span>منتشرشده</span><strong>${all.filter(i => i.status === 'published').length.toLocaleString('fa-IR')}</strong></div><div class="stat"><span>پیش‌نویس</span><strong>${all.filter(i => i.status === 'draft').length.toLocaleString('fa-IR')}</strong></div></div>
      <h2 style="font-size:17px;margin:0 0 17px">بخش‌های سایت</h2><div class="module-grid">${CONTENT_KEYS.map(key => `<a class="module-tile" href="#admin/${key}"><span class="module-arrow">↖</span><strong>${escapeHTML(data.modules[key].name)}</strong><span>${key === 'contact' ? 'اطلاعات تماس و نشانی' : data.modules[key].items.length.toLocaleString('fa-IR') + ' محتوا · ' + published(key).length.toLocaleString('fa-IR') + ' منتشرشده'}</span></a>`).join('')}</div>`;
  }
  async function readImage(file) {
    if (!file) return '';
    if (!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'].includes(file.type)) throw new Error('یک فایل تصویر PNG، JPG، WebP، GIF یا SVG انتخاب کن.');
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم تصویر باید حداکثر ۵ مگابایت باشد.');
    const encoded = await new Promise((resolve,reject) => {const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(new Error('خواندن فایل تصویر ممکن نشد.'));reader.readAsDataURL(file);});
    const decoded = await new Promise((resolve,reject) => {const image = new Image();image.onload = () => resolve(image);image.onerror = () => reject(new Error('فایل انتخاب‌شده تصویر قابل خواندن نیست.'));image.src = encoded;});
    if (file.size <= 1024 * 1024 || ['image/gif','image/svg+xml'].includes(file.type)) return imageData(encoded);
    // Keep large camera images usable in local browser storage. Animated/vector
    // uploads retain their original format; raster photos get a web-sized copy.
    const canvas = document.createElement('canvas'),context = canvas.getContext('2d');
    if (!context) throw new Error('آماده‌سازی تصویر ممکن نشد.');
    let side = Math.min(3200,Math.max(decoded.naturalWidth,decoded.naturalHeight)),optimized = encoded;
    while (side >= 600) {
      const scale = Math.min(1,side/Math.max(decoded.naturalWidth,decoded.naturalHeight));
      canvas.width = Math.max(1,Math.round(decoded.naturalWidth*scale));canvas.height = Math.max(1,Math.round(decoded.naturalHeight*scale));
      context.drawImage(decoded,0,0,canvas.width,canvas.height);
      for (const quality of [.92,.85,.78]) {
        optimized = canvas.toDataURL('image/webp',quality);
        if (optimized.length <= 1230000) return imageData(optimized);
      }
      side = Math.round(side*.78);
    }
    return imageData(optimized);
  }
  function imagePreview(node, image, fallback = 'تصویری انتخاب نشده') {
    node.replaceChildren(image ? el('img',{src:image,alt:'پیش‌نمایش تصویر انتخاب‌شده'}) : document.createTextNode(fallback));
  }
  function mountBannerEditor(root, initial) {
    const banner = clone(initial || {show:true,image:'',asset:'wall',title:'',description:'',imageAlt:''});if (banner.slides?.length) Object.assign(banner,banner.slides[0]);let image = banner.image;let extras = clone(banner.slides?.slice(1) || []);
    root.innerHTML = `<h3 class="banner-editor-title">بنر اختصاصی این صفحه</h3>${checkbox('نمایش بنر بالای صفحه','bannerShow',banner.show !== false)}<div class="banner-media-editor"><div class="media-preview"></div><div><label class="upload-button">انتخاب عکس بنر<input data-banner-upload type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></label><button type="button" class="text-button" data-banner-reset>بازگشت به تصویر پیش‌فرض</button><small>عکس افقی و باکیفیت؛ حداکثر ۵ مگابایت.</small></div></div><label>تصویر پیش‌فرض<select name="bannerAsset">${[['wall','نمایشگر LED'],['flex','نمایشگر Flexible'],['film','نمایشگر شفاف'],['floor','کف LED'],...Object.keys(heroImages).filter(k=>k.startsWith('trailer-')).map(k=>[k,'تریلر ' + k.slice(-2)])].map(([id,name])=>`<option value="${id}" ${banner.asset===id?'selected':''}>${name}</option>`).join('')}</select></label>${field('عنوان روی بنر','bannerTitle',banner.title,{max:160})}${field('توضیح بنر','bannerDescription',banner.description,{multiline:true,max:1000})}${field('توضیح تصویر برای دسترس‌پذیری','bannerImageAlt',banner.imageAlt,{max:200})}`;
    const preview = () => imagePreview($('.media-preview',root),image || heroImages[$('[name=bannerAsset]',root).value]);preview();
    $('[data-banner-upload]',root).addEventListener('change',async event => {try {const selected = await readImage(event.target.files[0]);if(!selected) return;image = selected;markDirty();preview();}catch(error){toast(error.message,true);}event.target.value = '';});
    $('[data-banner-reset]',root).addEventListener('click',() => {image = '';markDirty();preview();});
    $('[name=bannerAsset]',root).addEventListener('change',() => {image = '';markDirty();preview();});
    const extraRoot = el('div',{class:'banner-slide-list'}), add = el('button',{type:'button',class:'admin-button secondary','data-add-banner-slide':''},'＋ افزودن عکس به اسلایدر این صفحه');
    const timing = el('label',{},'زمان نمایش هر عکس (ثانیه)',el('input',{type:'number',name:'bannerInterval',min:'1',max:'15',step:'0.1',value:String((banner.interval || 3000)/1000),required:''}));root.append(timing,extraRoot,add);
    function paintExtras() {
      extraRoot.replaceChildren();
      extras.forEach((frame,index)=>{
        const row = el('div',{class:'banner-extra-slide'}), preview = el('div',{class:'media-preview'});imagePreview(preview,frame.image || heroImages[frame.asset]);
        const caption = el('input',{value:frame.imageAlt || '',maxlength:'200','aria-label':'توضیح عکس ' + (index+2)});caption.addEventListener('input',()=>{frame.imageAlt=caption.value;markDirty();});
        const upload = el('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/gif,image/svg+xml','aria-label':'عکس اسلاید ' + (index+2)});
        upload.addEventListener('change',async()=>{try {const selected=await readImage(upload.files[0]);if(!selected)return;frame.image=selected;imagePreview(preview,selected);markDirty();}catch(e){toast(e.message,true);}upload.value='';});
        row.append(el('strong',{},'عکس ' + (index+2).toLocaleString('fa-IR')),preview,upload,caption);
        for(const [step,label] of [[-1,'↑'],[1,'↓']]) {const button=el('button',{type:'button',class:'admin-button secondary','aria-label':label==='↑'?'انتقال عکس به بالا':'انتقال عکس به پایین'},label);button.disabled=index+step<0 || index+step>=extras.length;button.onclick=()=>{[extras[index],extras[index+step]]=[extras[index+step],extras[index]];markDirty();paintExtras();};row.append(button);}
        const remove=el('button',{type:'button',class:'admin-button danger'},'حذف عکس');remove.onclick=()=>{extras.splice(index,1);markDirty();paintExtras();};row.append(remove);extraRoot.append(row);
      });add.disabled=extras.length>=7;
    }
    add.onclick=()=>{if(extras.length>=7)return;extras.push({image:'',asset:$('[name=bannerAsset]',root).value,imageAlt:''});markDirty();paintExtras();};paintExtras();
    return {read:() => {const first={image,asset:$('[name=bannerAsset]',root).value,imageAlt:$('[name=bannerImageAlt]',root).value};return {show:$('[name=bannerShow]',root).checked,...first,title:$('[name=bannerTitle]',root).value,description:$('[name=bannerDescription]',root).value,interval:Math.round(Number($('[name=bannerInterval]',root).value)*1000),slides:[first,...extras]};}};

  }
  function renderHeaderEditor(root) {
    const h = data.header;let logo = h.logo;
    root.innerHTML = `<div class="admin-editor-layout"><div class="admin-panel"><form class="admin-form" id="header-form">
      <h2>نشان و نام گروه</h2><div class="media-field"><div class="media-preview" id="logo-preview"></div><div><label class="upload-button">انتخاب لوگو<input type="file" id="logo-input" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></label><button class="text-button" type="button" id="reset-logo">لوگوی اصلی آوا</button><small>حداکثر ۵ مگابایت؛ تصویر شفاف بهترین نتیجه را می‌دهد.</small></div></div>
      ${checkbox('نمایش نشان لوگو','showLogo',h.showLogo)}
      <div class="admin-form-grid"><div>${field('نام انگلیسی — بالا','nameEn',h.nameEn,{ltr:true})}${checkbox('نمایش نام انگلیسی','showNameEn',h.showNameEn)}</div><div>${field('نام فارسی — پایین','nameFa',h.nameFa)}${checkbox('نمایش نام فارسی','showNameFa',h.showNameFa)}</div></div>
      <h2>شعارهای هدر</h2><div class="admin-form-grid"><div>${field('شعار انگلیسی','sloganEn',h.sloganEn,{ltr:true})}${checkbox('نمایش شعار انگلیسی','showSloganEn',h.showSloganEn)}</div><div>${field('شعار فارسی','sloganFa',h.sloganFa)}${checkbox('نمایش شعار فارسی','showSloganFa',h.showSloganFa)}</div></div>
      ${saveButton()}</form></div><aside class="admin-panel admin-preview"><p class="preview-label">پیش‌نمایش هویت سایت</p><div class="header-preview"><div><div id="identity-logo"></div><div class="preview-en" id="identity-en" dir="ltr"></div><div class="preview-fa" id="identity-fa"></div></div><div><div class="preview-slogan" id="identity-slogan" dir="ltr"></div><p id="identity-tagline"></p></div></div><p style="font-size:10px;margin-top:15px">لوگو سمت راست و شعار در بخش میانی هدر نمایش داده می‌شود.</p></aside></div>`;
    const form = $('#header-form');watchForm(form);
    function preview() {
      const v = formValues(form);
      $('#logo-preview').innerHTML = logo ? '' : previewLogo('upload-preview');
      if (logo) imagePreview($('#logo-preview'),logo);
      $('#identity-logo').innerHTML = logo ? '' : previewLogo('identity-preview');
      if (logo) $('#identity-logo').append(el('img',{src:logo,alt:'لوگو'}));
      $('#identity-logo').hidden = !form.elements.showLogo.checked;
      for (const [id,key,flag] of [['identity-en','nameEn','showNameEn'],['identity-fa','nameFa','showNameFa'],['identity-slogan','sloganEn','showSloganEn'],['identity-tagline','sloganFa','showSloganFa']]) {$('#' + id).textContent = v[key];$('#' + id).hidden = !form.elements[flag].checked;}
    }
    form.addEventListener('input',preview);
    $('#logo-input').addEventListener('change',async event => {try {const image = await readImage(event.target.files[0]);if (!image) return;logo = image;markDirty();preview();} catch(error) {toast(error.message,true);}event.target.value = '';});
    $('#reset-logo').addEventListener('click',() => {logo = '';markDirty();preview();});
    form.addEventListener('submit',async event => {event.preventDefault();const next = clone(data);const v = formValues(form);for (const key of ['nameEn','nameFa','sloganEn','sloganFa']) next.header[key] = v[key];for (const key of ['showLogo','showNameEn','showNameFa','showSloganEn','showSloganFa']) next.header[key] = form.elements[key].checked;next.header.logo = logo;await commit(next);});
    preview();
  }
  function renderHeroEditor(root) {
    const h = data.hero;let slides = clone(h.slides);
    root.innerHTML = `<div class="admin-panel"><form class="admin-form" id="hero-form"><h2>اسلایدر تمام‌صفحه</h2>${checkbox('نمایش هیرو در سایت','show',h.show)}${checkbox('نمایش موشن‌لوگوی آوا در آغاز؛ دو دور پخش','showMotionLogo',h.showMotionLogo !== false)}<div class="admin-form-grid"><label>زمان نمایش هر اسلاید (ثانیه)<input type="number" name="interval" min="1" max="15" step="1" value="${h.interval/1000}" required></label></div><small>موشن‌لوگو ابتدا دو دور، حدود ۱۴ ثانیه، پخش می‌شود؛ سپس عکس‌ها با زمان انتخابی به چپ حرکت می‌کنند. تصاویر اولیه مفهومی هستند و قابل تعویض‌اند.</small><div class="hero-editor-slides" id="hero-editor-slides"></div><div><button class="admin-button secondary" id="add-hero-slide" type="button">افزودن اسلاید</button></div>${saveButton('ذخیرهٔ اسلایدر')}</form></div>`;
    const form = $('#hero-form');watchForm(form);
    const textFields = ['title','imageAlt','clickUrl'];
    function collect() {
      for (const slide of slides) {
        const row = $('[data-slide-id="' + slide.id + '"]',form);
        for (const key of textFields) slide[key] = $('[name="' + key + '"]',row).value;
      }
    }
    function paint() {
      const list = $('#hero-editor-slides');list.replaceChildren();
      slides.forEach((slide,index) => {
        const row = el('details',{class:'hero-editor-slide','data-slide-id':slide.id});if(index === 0) row.open = true;
        const summary = el('summary',{},'اسلاید ' + (index+1).toLocaleString('fa-IR') + ' — ' + slide.title);row.append(summary);
        const body = el('div',{class:'hero-editor-slide-body'});
        body.innerHTML = `<div class="hero-editor-media"><div class="media-preview"></div><div><label class="upload-button">انتخاب عکس این اسلاید<input type="file" data-slide-image accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></label><button type="button" class="text-button" data-reset-image>بازگشت به تصویر مفهومی</button><small>حداکثر ۵ مگابایت؛ عکس افقی و عریض بهترین نتیجه را می‌دهد.</small></div></div>${field('مقصد کلیک عکس؛ مثل /product/indoor-125 یا https://…','clickUrl',slide.clickUrl||'',{max:2000,ltr:true})}${field('نام اسلاید در پنل','title',slide.title,{max:200,required:true})}${field('توضیح تصویر برای دسترس‌پذیری','imageAlt',slide.imageAlt,{max:200})}<div class="hero-editor-order"><button class="admin-button secondary" type="button" data-move-slide="-1" ${index === 0 ? 'disabled' : ''}>↑ زودتر</button><button class="admin-button secondary" type="button" data-move-slide="1" ${index === slides.length-1 ? 'disabled' : ''}>↓ دیرتر</button><button class="admin-button danger" type="button" data-delete-slide ${slides.length === 1 ? 'disabled' : ''}>حذف اسلاید</button></div>`;
        row.append(body);list.append(row);imagePreview($('.media-preview',row),slide.image || heroImages[slide.asset]);
        $('[name=title]',row).addEventListener('input',() => {summary.textContent = 'اسلاید ' + (index+1).toLocaleString('fa-IR') + ' — ' + $('[name=title]',row).value;});
        $('[data-slide-image]',row).addEventListener('change',async event => {try {const image = await readImage(event.target.files[0]);if(!image) return;slide.image = image;markDirty();imagePreview($('.media-preview',row),image);}catch(error){toast(error.message,true);}event.target.value = '';});
        $('[data-reset-image]',row).addEventListener('click',() => {slide.image = '';markDirty();imagePreview($('.media-preview',row),heroImages[slide.asset]);});
        $$('[data-move-slide]',row).forEach(button => button.addEventListener('click',() => {collect();const to = index + Number(button.dataset.moveSlide);if(to < 0 || to >= slides.length) return;[slides[index],slides[to]] = [slides[to],slides[index]];markDirty();paint();}));
        $('[data-delete-slide]',row).addEventListener('click',() => {if(slides.length < 2 || !confirm('این اسلاید حذف شود؟')) return;collect();slides.splice(index,1);markDirty();paint();});
      });
      $('#add-hero-slide').disabled = slides.length >= 8;
    }
    $('#add-hero-slide').addEventListener('click',() => {if(slides.length >= 8) return;collect();slides.push({...clone(seed.hero.slides[0]),id:'slide-' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()),title:'اسلاید تازه',highlight:'',image:'',categoryId:''});markDirty();paint();const last = $('.hero-editor-slide:last-child',form);last.open = true;last.scrollIntoView({block:'center',behavior:'instant'});});
    form.addEventListener('submit',async event => {event.preventDefault();collect();const next = clone(data);next.hero.slides = slides;next.hero.show = form.elements.show.checked;next.hero.showMotionLogo = form.elements.showMotionLogo.checked;next.hero.autoplay = true;next.hero.interval = Number(form.elements.interval.value)*1000;for (const key of ['eyebrow','title','highlight','description','image','imageAlt','primaryLabel','primaryTarget','secondaryLabel','secondaryTarget']) next.hero[key] = slides[0][key];if(await commit(next,'اسلایدر ذخیره شد.')) {slides = clone(data.hero.slides);paint();}});
    paint();
  }
  function renderNavigationEditor(root) {
    let rows = clone(data.navigation);
    root.innerHTML = '<div class="admin-panel"><h2>نقشهٔ منوی اصلی</h2><p>هر ردیف یک گزینه از نوار بالای سایت است. مقصد می‌تواند یک بخش دیگر یا یک پیوند بیرونی باشد.</p><form class="admin-form" id="navigation-form"><div id="navigation-rows"></div>' + saveButton() + '</form></div>';
    const form = $('#navigation-form');watchForm(form);
    function collect() {for (const row of rows) {const node = $('[data-nav-id="' + row.id + '"]',form);row.label = $('[name=label]',node).value;row.target = $('[name=target]',node).value;row.visible = $('[name=visible]',node).checked;row.url = $('[name=url]',node).value;}}
    function paint() {
      $('#navigation-rows').innerHTML = rows.map((row,index) => `<div class="nav-editor-row" data-nav-id="${row.id}"><label>نام گزینه <span class="connection-key">${row.id.toUpperCase()}</span><input name="label" maxlength="45" value="${escapeHTML(row.label)}" required></label><label>متصل به بخش<select name="target">${targetOptions(row.target,true)}</select></label>${checkbox('نمایش','visible',row.visible)}<div class="nav-order-buttons"><button type="button" data-move="-1" aria-label="جابجایی ${escapeHTML(row.label)} به راست" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="1" aria-label="جابجایی ${escapeHTML(row.label)} به چپ" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button></div><label class="external-link-field" ${row.target !== 'external' ? 'hidden' : ''}>پیوند بیرونی<input name="url" type="url" dir="ltr" placeholder="https://…" maxlength="2000" value="${escapeHTML(row.url)}" ${row.target === 'external' ? 'required' : ''}></label></div>`).join('');
      $$('.nav-editor-row',form).forEach(node => {
        $('[name=target]',node).addEventListener('change',event => {const external = event.target.value === 'external';$('.external-link-field',node).hidden = !external;$('[name=url]',node).required = external;});
        $$('[data-move]',node).forEach(button => button.addEventListener('click',() => {collect();const index = rows.findIndex(row => row.id === node.dataset.navId);const next = index + Number(button.dataset.move);if (next < 0 || next >= rows.length) return;[rows[index],rows[next]] = [rows[next],rows[index]];markDirty();paint();}));
      });
    }
    form.addEventListener('submit',async event => {event.preventDefault();collect();const next = clone(data);next.navigation = rows;if (await commit(next)) rows = clone(data.navigation);});paint();
  }
  function renderContactEditor(root) {
    const c = data.contact;
    root.innerHTML = `<div class="admin-panel"><form class="admin-form" id="contact-form"><h2>اطلاعات تماس</h2>${field('نام بخش','moduleName',data.modules.contact.name,{max:80})}${field('عنوان بخش تماس','title',c.title,{multiline:true,max:500,rows:2})}${field('توضیحات','description',c.description,{multiline:true})}<div class="admin-form-grid">${field('شمارهٔ تماس','phone',c.phone,{ltr:true,max:500})}${field('ایمیل','email',c.email,{type:'email',ltr:true,max:500})}</div>${field('نشانی','address',c.address,{multiline:true,max:500,rows:2})}${saveButton()}</form></div><div class="notice">فرم عمومی سایت در این نسخه خلاصهٔ درخواست را آماده می‌کند؛ هنوز به سامانهٔ دریافت پیام متصل نیست.</div>`;
    const form = $('#contact-form');watchForm(form);
    form.addEventListener('submit',async event => {event.preventDefault();const v = formValues(form);const next = clone(data);next.modules.contact.name = v.moduleName;for (const key of ['title','description','phone','email','address']) next.contact[key] = v[key];await commit(next);});
  }
  function renderModule(root, key) {
    const module = data.modules[key];
    root.innerHTML = `<div class="admin-panel"><form class="admin-form" id="module-settings"><div class="admin-form-grid">${field('نام بخش در سایت','name',module.name,{max:80,required:true})}${field('معرفی کوتاه بخش','description',module.description,{max:1000})}</div>${key === 'products' ? '<div class="banner-editor-fields" id="products-banner-fields"></div>' : ''}${saveButton('ذخیرهٔ مشخصات بخش')}</form></div>
      <div class="module-tools"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input type="search" id="entry-search" aria-label="جستجو در محتوا" placeholder="جستجو در عنوان محتوا…"><select id="entry-filter" aria-label="فیلتر وضعیت" style="font:inherit;border:1px solid #dce4f1;background:white;color:#657692;padding:9px;border-radius:8px"><option value="all">همهٔ وضعیت‌ها</option><option value="published">منتشرشده</option><option value="draft">پیش‌نویس</option></select></div><button type="button" class="admin-button" id="add-entry">＋ افزودن ${escapeHTML(LABELS[key])}</button></div><div class="admin-entry-list" id="entry-list"></div>`;
    const form = $('#module-settings');watchForm(form);
    const bannerEditor = key === 'products' ? mountBannerEditor($('#products-banner-fields'),module.banner) : null;
    form.addEventListener('submit',async event => {event.preventDefault();const v = formValues(form);const next = clone(data);next.modules[key].name = v.name.trim();next.modules[key].description = v.description;if (bannerEditor) next.modules[key].banner = bannerEditor.read();await commit(next);});
    if (key === 'products') {
      const tools = $('.module-tools');const categoryLink = el('a',{href:'#admin/categories',class:'admin-button secondary'},'مدیریت دسته‌بندی‌ها');tools.append(categoryLink);
      const categoryFilter = el('select',{id:'entry-category-filter','aria-label':'فیلتر دستهٔ محصول'},el('option',{value:''},'همهٔ دسته‌ها'),data.productCategories.map(category => el('option',{value:category.id},categoryLabel(category))));
      tools.firstElementChild.append(categoryFilter);categoryFilter.addEventListener('change',paintList);
    }
    if (key === 'equipment') $('.module-tools').append(el('a',{href:'#equipment',class:'admin-button secondary'},'مشاهدهٔ بخش تجهیزات'));
    $('#add-entry').addEventListener('click',() => openEditor(key));
    $('#entry-search').addEventListener('input',paintList);$('#entry-filter').addEventListener('change',paintList);
    function paintList() {
      const query = $('#entry-search').value.trim().toLocaleLowerCase('fa-IR');
      const filter = $('#entry-filter').value;
      const category = key === 'products' ? $('#entry-category-filter').value : '';
      const items = data.modules[key].items.filter(item => (item.title + ' ' + (item.model || '')).toLocaleLowerCase('fa-IR').includes(query) && (filter === 'all' || item.status === filter) && (!category || categoryContains(category,item)));
      const list = $('#entry-list');list.replaceChildren();
      if (!items.length) {list.append(el('div',{class:'admin-empty'},el('strong',{},query || filter !== 'all' ? 'محتوایی با این فیلتر پیدا نشد.' : 'اولین محتوای این بخش را اضافه کن.'),el('p',{},'عنوان، تصویر و توضیحات را وارد کن؛ سپس آن را به‌صورت پیش‌نویس یا منتشرشده ذخیره کن.')));return;}
      items.forEach(item => {
        const row = el('article',{class:'admin-entry','data-entry-id':item.id});
        const thumbnail = key === 'products' ? productImage(item) : item.image;
        row.append(thumbnail ? el('img',{class:'entry-thumbnail',src:thumbnail,alt:''}) : el('div',{class:'entry-thumbnail','aria-hidden':'true'},'AVA'));
        row.append(el('div',{class:'admin-entry-info'},el('h3',{},item.title),el('p',{},item.summary || 'بدون توضیح کوتاه'),el('span',{class:'entry-status' + (item.status === 'draft' ? ' draft' : '')},item.status === 'draft' ? 'پیش‌نویس' : 'منتشرشده')));
        if (key === 'products') {
          $('.admin-entry-info',row).append(el('span',{class:'entry-category-badge'},categoryLabel(categoryFor(item)) || 'دسته‌بندی‌نشده'));
          if (item.featured) $('.admin-entry-info',row).append(el('span',{class:'entry-category-badge'},'منتخب صفحهٔ اصلی'));
          const preview = el('a',{href:'#product/' + item.id,class:'admin-button secondary'},'صفحهٔ محصول');
          if (item.status === 'published' && categoryFor(item) && categoryVisible(categoryFor(item))) row.append(preview);
        }
        const actions = el('div',{class:'entry-actions'});
        const edit = el('button',{type:'button',class:'admin-button secondary'},'ویرایش');edit.addEventListener('click',() => openEditor(key,item));
        const toggle = el('button',{type:'button',class:'admin-button secondary'},item.status === 'published' ? 'پیش‌نویس' : 'انتشار');toggle.addEventListener('click',async () => {if (!discardAllowed()) return;const next = clone(data);const target = next.modules[key].items.find(i => i.id === item.id);target.status = target.status === 'published' ? 'draft' : 'published';if (await commit(next)) paintList();});
        const remove = el('button',{type:'button',class:'admin-button danger'},'حذف');remove.addEventListener('click',async () => {if (!discardAllowed() || !confirm('«' + item.title + '» حذف شود؟')) return;const next = clone(data);next.modules[key].items = next.modules[key].items.filter(i => i.id !== item.id);if (await commit(next,'محتوا حذف شد.')) paintList();});
        actions.append(edit,toggle,remove);row.append(actions);list.append(row);
      });
    }
    paintList();
  }
  function openEditor(key, item = null) {
    if (!discardAllowed()) return;
    if (dirty) renderPage(currentPage);
    dirty = false;
    editingModule = key;entryImage = item?.image || '';entryImageAsset = item?.imageAsset || '';entryImageStyle = item?.imageStyle || '';entryFile = item?.file || '';
    const form = $('#entry-form');form.reset();form.elements.seoTitle.value=item?.seoTitle||'';form.elements.seoDescription.value=item?.seoDescription||'';
    for (const name of ['id','title','summary','body','meta','url','status']) form.elements[name].value = item ? item[name] : name === 'status' ? 'draft' : '';
    $('#entry-editor-title').textContent = item ? 'ویرایش محتوا' : 'افزودن محتوا';
    $('#entry-editor-module').textContent = data.modules[key].name;
    $('#entry-meta-label').textContent = META_LABELS[key];
    const isProduct = key === 'products';
    $('#product-entry-fields').hidden = !isProduct;$('#product-technical-fields').hidden = !isProduct;
    $('#entry-category').replaceChildren(...data.productCategories.map(category => el('option',{value:category.id},categoryLabel(category) + (categoryVisible(category) ? '' : ' — پنهان'))));
    form.elements.categoryId.value = item?.categoryId || 'uncategorized';
    form.elements.model.value = item?.model || '';
    form.elements.fileName.value = item?.fileName || '';
    form.elements.priceAmount.value = item?.priceAmount ?? '';
    form.elements.priceKind.value = item?.priceKind || 'quote';
    form.elements.priceUnit.value = item?.priceUnit || 'هر ماژول';
    form.elements.priceDate.value = item?.priceDate || '';
    form.elements.imageCaption.value = item?.imageCaption || '';
    form.elements.featured.checked = item?.featured === true;
    form.elements.specifications.value = (item?.specifications || []).map(spec => spec.label + ': ' + spec.value).join('\n');
    form.elements.datasheetUrl.value = item?.datasheetUrl || '';form.elements.manualUrl.value = item?.manualUrl || '';
    $('#catalog-upload-row').hidden = !['catalog','products'].includes(key);
    $('#entry-pdf-label').textContent = isProduct ? 'بارگذاری PDF محصول' : 'انتخاب فایل PDF کاتالوگ';
    $('#product-file-heading').textContent = isProduct ? 'فایل‌های این محصول' : 'فایل کاتالوگ';
    $('#pdf-filename').textContent = entryFile ? 'یک فایل PDF به این محتوا پیوست شده است.' : 'حداکثر ۲ مگابایت؛ فایل در بخش دانلودها نمایش داده می‌شود.';
    $('#entry-error').textContent = '';
    imagePreview($('#entry-image-preview'),entryImage || (key === 'products' ? productImages[entryImageAsset] : ''),'تصویر محتوا');
    entryBannerEditor = mountBannerEditor($('#entry-banner-fields'),data.pageBanners[(key==='products'?'product':key==='services'?'service':key)+':'+item?.id] || item?.banner || {show:false,image:'',asset:'wall',title:'',description:'',imageAlt:''});
    $('#entry-editor').showModal();
  }
  function renderCategories(root) {
    root.innerHTML = '<div class="notice">پنهان‌کردن دسته، محصولات و زیرگروه‌هایش را از سایت پنهان می‌کند. گزینهٔ «نمایش در منو» فقط حضور در منو را کنترل می‌کند. هنگام حذف دسته و زیرگروه‌ها، محصولات حفظ و به «دسته‌بندی‌نشده» منتقل می‌شوند.</div><div class="module-tools"><a href="#admin/products" class="admin-button secondary">بازگشت به محصولات</a><button class="admin-button" type="button" id="add-category">＋ افزودن دسته</button></div><div id="category-admin-list" class="admin-entry-list"></div>';
    $('#add-category').addEventListener('click',() => openCategory());
    const list = $('#category-admin-list');
    data.productCategories.forEach((category,index) => {
      const count = data.modules.products.items.filter(item => categoryContains(category.id,item)).length;
      const row = el('article',{class:'admin-entry' + (category.parentId ? ' admin-subcategory' : ''),'data-category-id':category.id});
      const info = el('div',{class:'admin-entry-info'},el('h3',{},category.name),el('p',{},category.description || 'بدون معرفی'),el('span',{class:'entry-category-badge'},count.toLocaleString('fa-IR') + ' محصول'),el('span',{class:'entry-status' + (category.visible ? '' : ' draft')},category.visible ? 'نمایان' : 'پنهان'));
      if (category.parentId) info.append(el('span',{class:'entry-category-badge'},'زیرگروه ' + data.productCategories.find(parent => parent.id === category.parentId).name));
      if (!category.menu) info.append(el('span',{class:'entry-category-badge'},'بدون نمایش در منو'));
      const actions = el('div',{class:'entry-actions'});
      const edit = el('button',{type:'button',class:'admin-button secondary'},'ویرایش');edit.addEventListener('click',() => openCategory(category));actions.append(edit);
      for (const [step,label] of [[-1,'بالاتر'],[1,'پایین‌تر']]) {
        const move = el('button',{type:'button',class:'admin-button secondary','aria-label':label + ' بردن ' + category.name},step === -1 ? '↑' : '↓');move.disabled = index + step < 0 || index + step >= data.productCategories.length;
        move.addEventListener('click',async () => {const next = clone(data);[next.productCategories[index],next.productCategories[index+step]] = [next.productCategories[index+step],next.productCategories[index]];if (await commit(next)) renderPage('categories');});actions.append(move);
      }
      if (category.id !== 'uncategorized') {
        const remove = el('button',{type:'button',class:'admin-button danger'},'حذف');
        remove.addEventListener('click',async () => {const ids = new Set([category.id,...data.productCategories.filter(child => child.parentId === category.id).map(child => child.id)]);if (!confirm('دستهٔ «' + category.name + '»' + (ids.size > 1 ? ' و زیرگروه‌هایش' : '') + ' حذف شود؟ ' + count.toLocaleString('fa-IR') + ' محصول به «دسته‌بندی‌نشده» منتقل می‌شوند.')) return;const next = clone(data);next.productCategories = next.productCategories.filter(c => !ids.has(c.id));for (const item of next.modules.products.items) if (ids.has(item.categoryId)) item.categoryId = 'uncategorized';if (await commit(next,'دسته حذف شد؛ محصولات حفظ شدند.')) renderPage('categories');});actions.append(remove);
      }
      row.append(info,actions);list.append(row);
    });
  }
  function openCategory(category = null) {
    const form = $('#category-form');form.reset();form.elements.id.value = category?.id || '';form.elements.name.value = category?.name || '';form.elements.description.value = category?.description || '';form.elements.visible.checked = category ? category.visible : true;
    const parents = data.productCategories.filter(parent => !parent.parentId && parent.id !== category?.id && parent.id !== 'uncategorized');
    form.elements.parentId.replaceChildren(el('option',{value:''},'دستهٔ اصلی — بدون والد'),...parents.map(parent => el('option',{value:parent.id},parent.name)));
    form.elements.parentId.value = category?.parentId || '';
    const hasChildren = !!category && data.productCategories.some(child => child.parentId === category.id);
    form.elements.parentId.disabled = hasChildren || category?.id === 'uncategorized';
    $('#category-parent-note').textContent = hasChildren ? 'این دسته زیرگروه دارد؛ برای تبدیلش به زیرگروه، ابتدا زیرگروه‌های فعلی را منتقل کن.' : 'دستهٔ اصلی را انتخاب کن تا این گزینه زیر آن باز شود؛ حداکثر دو سطح.';
    form.elements.menu.checked = category ? category.menu !== false : true;
    categoryBannerEditor = mountBannerEditor($('#category-banner-fields'),category?.banner);
    $('#category-error').textContent = '';$('#category-editor-title').textContent = category ? 'ویرایش دسته' : 'افزودن دسته';$('#category-editor').showModal();
  }
  function renderBackup(root) {
    root.innerHTML = notice() + `<div class="admin-panel"><h2>نسخهٔ کامل سایت و پنل</h2><p>یک فایل HTML شامل سایت، پنل و همهٔ محتوای ذخیره‌شده دریافت کن. آن را با مرورگر باز کن؛ در منوی سایت، «مدیریت سایت» را بزن.</p><div class="notice">این خروجی برای بررسی و انتقال کار است و محتوای پیش‌نویس را هم در خود دارد. برای انتشار عمومی، پنل باید به سرور و ورود امن متصل شود.</div><button type="button" class="admin-button" id="export-site">دریافت فایل کامل سایت و پنل ↓</button></div><div class="admin-panel"><h2>پشتیبان اطلاعات</h2><p>فایل JSON شامل نام‌ها، متن‌ها، تصاویر و محتواهاست. آن را در جای مطمئن نگه دار.</p><div class="backup-actions"><button type="button" class="admin-button secondary" id="export-backup">دریافت پشتیبان JSON</button><label class="upload-button">بازیابی پشتیبان<input type="file" id="import-backup" accept="application/json,.json"></label></div><p style="font-size:11px;margin-top:18px">بازیابی، اطلاعات فعلی این مرورگر را جایگزین می‌کند؛ پیش از آن پشتیبان بگیر.</p></div>`;
    $('#export-site').addEventListener('click',exportSite);
    $('#export-backup').addEventListener('click',() => download('ava-content-backup.json',JSON.stringify(data,null,2),'application/json;charset=utf-8'));
    $('#import-backup').addEventListener('change',async event => {
      const file = event.target.files[0];if (!file) return;
      try {if (file.size > 32 * 1024 * 1024) throw new Error('حجم فایل پشتیبان بیش از حد مجاز است.');const next = validate(JSON.parse(await file.text()));if (!confirm('اطلاعات این پشتیبان جایگزین همهٔ اطلاعات فعلی شود؟')) return;if (await commit(next,'پشتیبان با موفقیت بازیابی شد.')) {renderPage('backup');}}
      catch (error) {toast(error instanceof SyntaxError ? 'فایل انتخاب‌شده JSON معتبر نیست.' : error.message,true);}
      finally {event.target.value = '';}
    });
  }
  function renderPage(page) {
    currentPage = page;dirty = false;
    $('#admin-page-title').textContent = TITLES[page] || data.modules[page]?.name || 'پیشخوان';
    $('#admin-page-description').textContent = DESCRIPTIONS[page] || (page === 'contact' ? 'شمارهٔ تماس، ایمیل، نشانی و متن بخش ارتباط با آوا.' : 'مشخصات بخش و محتوای آن را مدیریت کن؛ فقط محتوای منتشرشده در سایت دیده می‌شود.');
    $('#save-state').textContent = persistence ? 'آمادهٔ ویرایش' : 'ذخیرهٔ موقت؛ خروجی بگیر';
    renderSidebar();
    const root = $('#admin-content');
    if (page === 'dashboard') renderDashboard(root);
    else if (page === 'header') renderHeaderEditor(root);
    else if (page === 'hero') renderHeroEditor(root);
    else if (page === 'navigation') renderNavigationEditor(root);
    else if (page === 'banners') renderBannersEditor(root);
    else if(page==='stats')renderStats(root);
    else if(page==='company')renderCompanyEditor(root);
    else if(page==='footer')renderFooterEditor(root);
    else if(page==='seo')renderSeoEditor(root);
    else if (page === 'security') renderSecurity(root);
    else if (page === 'backup') renderBackup(root);
    else if (page === 'contact') renderContactEditor(root);
    else if (page === 'categories') renderCategories(root);
    else renderModule(root,page);
  }
  function route() {
    const nextHash = currentHash();
    if (!discardAllowed()) {history.replaceState(null,'',lastHash || location.pathname + location.search);return;}
    if (!$('#catalog-page').hidden || /^#(products|category|product|service|equipment)(\/|$)/.test(nextHash) || nextHash.startsWith('#admin')) disposePageBanners();
    closeNavigationMenus();
    for (const dialog of [$('#entry-editor'),$('#category-editor'),$('#product-image-dialog')]) if (dialog.open) dialog.close();
    lastHash = nextHash;dirty = false;
    $('#admin-login').hidden=true;
    const requested = nextHash.startsWith('#admin') ? (nextHash.split('/')[1] || 'dashboard') : '';
    if(requested&&serverMode&&location.pathname!=='/panel')history.replaceState(null,'','/panel'+nextHash);
    if (requested && serverMode && (!serverReady || !authenticated)) {renderLogin();return;}
    if (requested) {
      adminVisible = true;
      $('#public-site').hidden = true;$('#admin-app').hidden = false;
      const page = [...Object.keys(TITLES),...CONTENT_KEYS].includes(requested) ? requested : 'dashboard';
      renderPage(page);window.scrollTo(0,0);document.title = 'مدیریت ' + (data.header.nameFa || 'آوا');
    } else {
      const wasAdmin = adminVisible;const wasCatalog = !$('#catalog-page').hidden;
      adminVisible = false;$('#public-site').hidden = false;$('#admin-app').hidden = true;
      if (wasAdmin || wasCatalog) renderPublic();
      if (renderCatalogRoute()) {window.scrollTo(0,0);$('#catalog-page').focus({preventScroll:true});}
      else {
        document.title = (data.header.nameFa || 'آوا') + ' | دنیای تصویر و نور';
        const target = document.getElementById(nextHash.slice(1));
        if (target && nextHash !== '#home') requestAnimationFrame(() => target.scrollIntoView({block:'start'}));
        else if (wasAdmin || wasCatalog || !nextHash || nextHash === '#home') window.scrollTo(0,0);
      }
    }
    finishPublicPage();
  }
  let pageTransition;
  function transitionRoute() {
    const update = () => {route();document.documentElement.dataset.avaRoute = currentHash() || '#home';};
    const publicRoute = !adminVisible && !currentHash().startsWith('#admin') && !dirty;
    if (!publicRoute || matchMedia('(prefers-reduced-motion: reduce)').matches) {pageTransition?.skipTransition();update();return;}
    const finish = () => $('#public-site').removeAttribute('aria-busy');
    if (document.startViewTransition) {
      pageTransition?.skipTransition();$('#public-site').setAttribute('aria-busy','true');
      const transition = document.startViewTransition(update);pageTransition = transition;
      transition.finished.then(() => {if(pageTransition === transition){pageTransition = null;finish();}},() => {if(pageTransition === transition){pageTransition = null;finish();}});
    } else {
      update();const content = $('#catalog-page').hidden ? $('#home-content') : $('#catalog-page');
      content.animate([{opacity:0},{opacity:1}],{duration:420,easing:'ease-out'});
    }
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const entry=[...detachedMenus.values()][0];if(entry){event.preventDefault();closeNavigationMenus();entry.trigger.focus();}}});
  document.addEventListener('focusin',event=>{if(detachedMenus.size && !event.target.closest('.header-menu-item,.header-menu-popup'))closeNavigationMenus();});
  $('#navigation').addEventListener('scroll',closeNavigationMenus,{passive:true});
  $('.site-menu-toggle').addEventListener('click',() => $('#site-menu').showModal());
  document.addEventListener('click',event => {if (!event.target.closest('.header-menu-item,.header-menu-popup')) closeNavigationMenus();});

  $('#admin-logout').addEventListener('click',async()=>{if(!discardAllowed())return;try{await api('/api/logout',{});authenticated=false;csrf='';dirty=false;const result=await api('/api/content');data=validate(result.data);serverRevision=result.revision;renderLogin();}catch(e){toast(e.message,true);}});
  $('#view-site').addEventListener('click',() => {location.hash = 'home';});
  $$('[data-close]').forEach(button => button.addEventListener('click',() => document.getElementById(button.dataset.close).close()));
  for (const dialog of [$('#site-menu'),$('#content-detail'),$('#product-image-dialog')]) dialog.addEventListener('click',event => {const rect = dialog.getBoundingClientRect();if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();});
  function closeEditor() {if (!discardAllowed()) return;dirty = false;$('#entry-editor').close();$('#save-state').textContent = 'آمادهٔ ویرایش';}
  $('#close-entry').addEventListener('click',closeEditor);$('#cancel-entry').addEventListener('click',closeEditor);
  $('#entry-editor').addEventListener('cancel',event => {event.preventDefault();closeEditor();});
  watchForm($('#entry-form'));
  $('#entry-image').addEventListener('change',async event => {try {const result = await readImage(event.target.files[0]);if (!result) return;entryImage = result;entryImageAsset = '';entryImageStyle = '';$('#entry-form').elements.imageCaption.value = '';imagePreview($('#entry-image-preview'),entryImage);markDirty();} catch(error) {$('#entry-error').textContent = error.message;}event.target.value = '';});
  $('#entry-image-remove').addEventListener('click',() => {entryImage = '';entryImageAsset = '';entryImageStyle = '';$('#entry-form').elements.imageCaption.value = '';imagePreview($('#entry-image-preview'),'','تصویر محتوا');markDirty();});
  $('#entry-pdf').addEventListener('change',async event => {try {const file = event.target.files[0];if (!file) return;if (file.size > 2 * 1024 * 1024) throw new Error('حجم PDF باید حداکثر ۲ مگابایت باشد.');if (new TextDecoder().decode(await file.slice(0,5).arrayBuffer()) !== '%PDF-') throw new Error('یک فایل PDF معتبر انتخاب کن.');entryFile = await new Promise((resolve,reject) => {const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(new Error('خواندن PDF ممکن نشد.'));reader.readAsDataURL(new Blob([file],{type:'application/pdf'}));});pdfData(entryFile);$('#entry-form').elements.fileName.value = file.name.slice(0,160);$('#pdf-filename').textContent = file.name;markDirty();} catch(error) {$('#entry-error').textContent = error.message;}event.target.value = '';});
  $('#entry-pdf-remove').addEventListener('click',() => {entryFile = '';$('#entry-form').elements.fileName.value = '';$('#pdf-filename').textContent = 'فایل PDF حذف شد.';markDirty();});
  watchForm($('#category-form'));
  function closeCategory() {if (!discardAllowed()) return;dirty = false;$('#category-editor').close();$('#save-state').textContent = 'آمادهٔ ویرایش';}
  $('#close-category').addEventListener('click',closeCategory);$('#cancel-category').addEventListener('click',closeCategory);
  $('#category-editor').addEventListener('cancel',event => {event.preventDefault();closeCategory();});
  $('#category-form').addEventListener('submit',async event => {
    event.preventDefault();const values = formValues(event.currentTarget);const category = {id:values.id || 'cat-' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2,9)),name:values.name.trim(),description:values.description,visible:event.currentTarget.elements.visible.checked,parentId:event.currentTarget.elements.parentId.value,menu:event.currentTarget.elements.menu.checked,banner:categoryBannerEditor.read()};
    const next = clone(data);const index = next.productCategories.findIndex(c => c.id === category.id);if (index < 0) next.productCategories.splice(Math.max(0,next.productCategories.length-1),0,category);else next.productCategories[index] = category;
    if (await commit(next,'دسته ذخیره شد.')) {$('#category-editor').close();renderPage('categories');}else $('#category-error').textContent = 'دسته ذخیره نشد؛ نام و اطلاعات را بررسی کن.';
  });
  $('#entry-form').addEventListener('submit',async event => {
    event.preventDefault();const values = formValues(event.currentTarget);
    const item = {id:values.id || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'entry-' + Date.now() + '-' + Math.random().toString(36).slice(2,9)),title:values.title.trim(),summary:values.summary,body:values.body,meta:values.meta,url:values.url.trim(),status:values.status,seoTitle:values.seoTitle,seoDescription:values.seoDescription,image:entryImage,imageAsset:entryImageAsset,banner:entryBannerEditor.read(),file:['catalog','products'].includes(editingModule) ? entryFile : '',fileName:['catalog','products'].includes(editingModule) ? values.fileName : ''};
    if (editingModule === 'products') {
      const specifications = [];
      for (const line of values.specifications.split('\n').map(line => line.trim()).filter(Boolean)) {
        const separator = line.indexOf(':');
        if (separator <= 0 || !line.slice(separator+1).trim()) {$('#entry-error').textContent = 'هر مشخصه را در یک خط به شکل «نام: مقدار» وارد کن.';return;}
        specifications.push({label:line.slice(0,separator).trim(),value:line.slice(separator+1).trim()});
      }
      Object.assign(item,{imageAsset:entryImageAsset,imageStyle:entryImageStyle,imageCaption:values.imageCaption,priceAmount:values.priceAmount === '' ? null : Number(values.priceAmount),priceKind:values.priceKind,priceUnit:values.priceUnit,priceDate:values.priceDate,categoryId:values.categoryId,model:values.model.trim(),featured:event.currentTarget.elements.featured.checked,specifications,datasheetUrl:values.datasheetUrl.trim(),manualUrl:values.manualUrl.trim()});
    }
    const next = clone(data);
    if (['products','services','equipment'].includes(editingModule)) writePageBanner(next,(editingModule==='products'?'product':editingModule==='services'?'service':'equipment')+':'+item.id,item.banner);
    const index = next.modules[editingModule].items.findIndex(i => i.id === item.id);
    if (index < 0) next.modules[editingModule].items.unshift(item);else next.modules[editingModule].items[index] = item;
    if (await commit(next,'محتوا ذخیره شد.')) {$('#entry-editor').close();renderPage(editingModule);}
    else $('#entry-error').textContent = 'ذخیره انجام نشد؛ پیام خطا را بررسی کن. فرم و تغییراتت حفظ شده‌اند.';
  });
  window.addEventListener('hashchange',transitionRoute);
  window.addEventListener('popstate',transitionRoute);
  document.addEventListener('click',event=>{const link=event.target.closest('a');if(!link)return;const kind=link.dataset.contactEvent||(link.getAttribute('href')==='#contact'?'contact-link':'');if(kind)trackEvent(kind);});
  $('#request-form').addEventListener('submit',()=>trackEvent('contact-request'));
  window.addEventListener('beforeunload',event => {if (dirty) {event.preventDefault();event.returnValue = '';}});
  window.addEventListener('resize',() => {closeNavigationMenus();const nav = $('#navigation');nav.style.gridTemplateColumns = 'repeat(' + Math.max(1,Math.min(innerWidth <= 600 ? 4 : 8,nav.children.length)) + ',minmax(0,1fr))';});
  boot();
})();
