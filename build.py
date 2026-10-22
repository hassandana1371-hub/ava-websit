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
hero_images = {name: 'data:image/webp;base64,' + base64.b64encode((SRC / ('assets/hero-' + name + '.webp')).read_bytes()).decode('ascii') for name in ['wall','film','flex','floor']}
replacements = {
    '<!--CMS_CSS-->': font_css + (SRC / 'cms.css').read_text() + '\n' + (SRC / 'products.css').read_text() + '\n' + (SRC / 'services.css').read_text() + '\n' + (SRC / 'partners.css').read_text() + '\n' + (SRC / 'theme.css').read_text() + '\n' + (SRC / 'hero.css').read_text(),
    '<!--CMS_SHELL-->': (SRC / 'cms-shell.html').read_text(),
    '<!--CMS_DATA-->': '<script id="ava-initial-data" type="application/json">' + encoded + '</script>\n<script id="ava-hero-images" type="application/json">' + json.dumps(hero_images) + '</script>',
    '<!--CMS_SCRIPT-->': '<script>\n' + (SRC / 'cms.js').read_text() + '\n</script>',
}
for marker, content in replacements.items():
    if page.count(marker) != 1:
        raise ValueError('Expected exactly one ' + marker)
    page = page.replace(marker, content)
(ROOT / 'index.html').write_text(page)
print('Built index.html (site + local content manager)')
