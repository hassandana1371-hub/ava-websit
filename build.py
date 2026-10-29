"""Build the self-contained, downloadable AVA site and content editor."""
from pathlib import Path
import json
import base64

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
page = (SRC / 'site-template.html').read_text()
data = json.loads((SRC / 'defaults.json').read_text())
encoded = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c')
font = base64.b64encode((SRC / 'assets/Vazirmatn-variable.woff2').read_bytes()).decode('ascii')
font_css = '/*\n' + (SRC / 'assets/OFL-Vazirmatn.txt').read_text() + '\n*/\n'
font_css += "@font-face{font-family:'Vazirmatn';src:url(data:font/woff2;base64," + font + ") format('woff2');font-style:normal;font-weight:100 900;font-display:swap;}\n"
estedad = base64.b64encode((SRC / 'assets/Estedad-variable.woff2').read_bytes()).decode('ascii')
font_css += '/*\n' + (SRC / 'assets/OFL-Estedad.txt').read_text() + '\n*/\n'
font_css += "@font-face{font-family:'Estedad';src:url(data:font/woff2;base64," + estedad + ") format('woff2');font-style:normal;font-weight:100 900;font-display:swap;}\n"
hero_images = {name: 'data:image/webp;base64,' + base64.b64encode((SRC / ('assets/hero-' + name + '.webp')).read_bytes()).decode('ascii') for name in ['wall','film','flex','floor']}
hero_images.update({'trailer-' + path.stem[-2:]: 'data:image/webp;base64,' + base64.b64encode(path.read_bytes()).decode('ascii') for path in sorted((SRC / 'assets/trailers').glob('*.webp'))})
product_images = {path.stem: 'data:image/jpeg;base64,' + base64.b64encode(path.read_bytes()).decode('ascii') for path in sorted((SRC / 'assets/products').glob('*.jpg'))}
visual_history = (SRC / 'assets/products/V17-VISUALS.json').read_text().replace('<', '\\u003c')
motion_svg = (SRC / 'assets/ava-motion-logo.svg').read_text()
# The uploaded SVG has only local shapes, text and CSS animations. Keep its
# styles isolated from the header and prevent script/network access in its frame.
motion_document = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#03050a}svg{display:block;width:100%;height:100%}svg *{animation-iteration-count:2!important;animation-play-state:paused!important}</style></head><body>' + motion_svg + '</body></html>'
replacements = {
    '<!--CMS_CSS-->': font_css + (SRC / 'cms.css').read_text() + '\n' + (SRC / 'products.css').read_text() + '\n' + (SRC / 'services.css').read_text() + '\n' + (SRC / 'partners.css').read_text() + '\n' + (SRC / 'theme.css').read_text() + '\n' + (SRC / 'hero.css').read_text() + '\n' + (SRC / 'catalog-upgrade.css').read_text() + '\n' + (SRC / 'interaction-polish.css').read_text() + '\n' + (SRC / 'release20.css').read_text(),
    '<!--CMS_SHELL-->': (SRC / 'cms-shell.html').read_text(),
    '<!--CMS_DATA-->': '<script id="ava-contact-defaults" type="application/json">' + (SRC/'contact-defaults.json').read_text().replace('<','\\u003c') + '</script>\n' + '<script id="ava-search-content" type="application/json">' + (SRC/'seo-content.json').read_text().replace('<','\\u003c') + '</script>\n' + '<script id="ava-initial-data" type="application/json">' + encoded + '</script>\n<script id="ava-hero-images" type="application/json">' + json.dumps(hero_images) + '</script>\n<script id="ava-product-images" type="application/json">' + json.dumps(product_images) + '</script>\n<script id="ava-product-visual-history" type="application/json">' + visual_history + '</script>\n<script id="ava-hero-motion" type="application/json">' + json.dumps(motion_document).replace('<', '\\u003c') + '</script>',
    '<!--CMS_SCRIPT-->': '<script>\n' + (SRC / 'cms.js').read_text() + '\n</script>',
}
replacements['<!--CMS_DATA-->'] = '<script id="ava-software-catalog" type="application/json">' + (SRC/'software-catalog.json').read_text().replace('<','\\u003c') + '</script>\n' + replacements['<!--CMS_DATA-->']
for marker, content in replacements.items():
    if page.count(marker) != 1:
        raise ValueError('Expected exactly one ' + marker)
    page = page.replace(marker, content)
(ROOT / 'index.html').write_text(page)
print('Built index.html (site + local content manager)')
