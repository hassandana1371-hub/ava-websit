"""Generate local marketing drafts and tagged links. No traffic or posts are sent."""
import argparse
import copy
import json
from pathlib import Path
import re
from urllib.parse import urlencode,urlsplit

ROOT=Path(__file__).resolve().parents[1]

def generate(content,origin='https://avagroups.ir',channel='social',campaign='ava-buy-guide'):
    parts=urlsplit(origin)
    if parts.scheme!='https' or not parts.hostname or parts.username or parts.password or parts.path not in ['', '/'] or parts.query or parts.fragment:
        raise ValueError('مبدأ باید آدرس HTTPS سایت، بدون مسیر یا اطلاعات ورود باشد.')
    for value in [channel,campaign]:
        if not re.fullmatch(r'[a-z0-9_-]{1,80}',value):raise ValueError('نام کانال و کمپین با حروف کوچک انگلیسی، عدد و خط تیره باشد.')
    data=copy.deepcopy(content.get('data',content));brand=data['header']['nameFa'];posts=[]
    categories={c['id']:c for c in data['productCategories']}
    visible={c['id'] for c in categories.values() if c.get('visible') and not c.get('parentId')}
    visible.update(c['id'] for c in categories.values() if c.get('visible') and c.get('parentId') in visible)
    products=[p for p in data['modules']['products']['items'] if p.get('status')=='published' and p.get('categoryId') in visible]
    services=[s for s in data['modules']['services']['items'] if s.get('status')=='published']
    def add(key,title,path,text):
        link=origin.rstrip('/')+path+'?'+urlencode({'utm_source':channel,'utm_medium':'organic_social','utm_campaign':campaign,'utm_content':key})
        posts.append({'id':key,'day':1+len(posts)*2,'title':title,'landing_page':origin.rstrip('/')+path,'tracked_link':link,'text':text+'\n\n'+brand+('\nجزئیات از لینک بیو یا استوری' if channel=='instagram' else '\nمشخصات و هماهنگی:\n'+link),'status':'draft'})
    if 'urban' in visible and any(p.get('categoryId') in {'urban-indoor','urban-outdoor','urban-flexible'} for p in products):
        add('buy-guide','قبل از خرید تلویزیون شهری','/category/urban','قبل از انتخاب تلویزیون شهری، این چهار مورد را مشخص کنید: محل نصب، ابعاد تصویر، فاصلهٔ مخاطب و نوع محتوا.\nقیمت یک ماژول، هزینهٔ نمایشگر کامل نیست؛ سازه، تجهیزات کنترل، تغذیه و نصب هم باید در پیشنهاد مشخص باشند. راهنمای انتخاب و مدل‌ها را ببینید.')
    chosen=set()
    for category in ['urban-indoor','urban-outdoor','transparent','urban-flexible']:
        item=next((p for p in products if p.get('categoryId')==category),None)
        if item and item['id'] not in chosen:
            chosen.add(item['id'])
            add('product-'+item['id'],item['title'],'/product/'+item['id'],item['title']+'\n'+item.get('summary','')+'\n\nبرای انتخاب متناسب با پروژه، ابعاد و شرایط محل نصب را مشخص کنید. جزئیات مدل و شرایط استعلام در صفحهٔ محصول آمده است.')
    for id in ['initial-rental','service-videowall','led-trailer-rental']:
        item=next((s for s in services if s['id']==id),None)
        if item:add('service-'+id,item['title'],'/service/'+id,item['title']+'\n'+item.get('summary','')+'\n\nبرای بررسی شرایط اجرا، محل، زمان و ابعاد موردنظر را در درخواست خود توضیح دهید.')
    return {'brand':brand,'channel':channel,'campaign':campaign,'publication':'drafts only; no account connection or automatic publication','measurement':'UTM tags label links; attribution requires an analytics system that records them. Existing site aggregate stats do not report campaign attribution.','posts':posts}

def write_pack(pack,destination):
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'campaign.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
    lines=['# پیش‌نویس کمپین '+pack['brand'],'','این متن‌ها منتشر نشده‌اند. روزها پیشنهاد نسبی‌اند و به معنی زمان‌بندی فعال نیستند.','لینک‌ها برچسب UTM دارند؛ گزارش منبع ورودی به ابزار تحلیلِ دارای پشتیبانی UTM نیاز دارد. آمار فعلی سایت این تفکیک را نمایش نمی‌دهد.','']
    for p in pack['posts']:
        lines.extend(['## روز '+str(p['day'])+' — '+p['title'],'',p['text'],'','پیش از انتشار، مشخصات و شرایط فعلی و تصویر مجاز همان محصول را بررسی کنید.',''])
    (destination/'posts-fa.md').write_text('\n'.join(lines))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,default=ROOT/'src/defaults.json');parser.add_argument('--output',type=Path,default=ROOT/'marketing/generated');parser.add_argument('--channel',default='social');parser.add_argument('--campaign',default='ava-buy-guide');parser.add_argument('--origin',default='https://avagroups.ir')
    args=parser.parse_args()
    try:pack=generate(json.loads(args.input.read_text()),args.origin,args.channel,args.campaign)
    except (ValueError,KeyError,TypeError) as error:parser.error(str(error))
    write_pack(pack,args.output);print(str(len(pack['posts']))+' drafts generated; nothing published.')
