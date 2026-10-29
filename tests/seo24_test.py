"""HTTP-level SEO regressions; browser rendering is covered by seo24-smoke.cjs."""
import copy
from html.parser import HTMLParser
import json
import re
import unittest
import xml.etree.ElementTree as ET

import server_test as fixture


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.title_count = 0
        self.meta = {}
        self.canonical = []
        self.schema = []
        self._title = False
        self._schema = False
        self._schema_text = ''
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'title':
            self._title = True
            self.title_count += 1
        elif tag == 'meta':
            key = attrs.get('name') or attrs.get('property')
            if key:
                self.meta[key] = attrs.get('content', '')
        elif tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs.get('href'))
        elif tag == 'script' and attrs.get('id') == 'ava-structured-data':
            self._schema = True
            self._schema_text = ''

    def handle_endtag(self, tag):
        if tag == 'title':
            self._title = False
        elif tag == 'script' and self._schema:
            self.schema.append(json.loads(self._schema_text))
            self._schema = False

    def handle_data(self, value):
        if self._title:
            self.title += value
        if self._schema:
            self._schema_text += value


class VisibleContent(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.text = ''
        self.h1 = 0
        self.links = []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        if tag == 'h1':
            self.h1 += 1
        elif tag == 'a':
            self.links.append(dict(attributes).get('href', ''))

    def handle_data(self, value):
        self.text += value


class SEO24Test(unittest.TestCase):
    # Reuse the isolated real HTTP server, without inheriting/rerunning auth tests.
    setUp = fixture.ServerTest.setUp
    tearDown = fixture.ServerTest.tearDown
    request = fixture.ServerTest.request
    login = fixture.ServerTest.login

    TARGETS = (
        '/', '/products', '/category/urban', '/category/urban-indoor',
        '/category/urban-outdoor', '/services', '/service/initial-rental',
    )

    def get_document(self, path):
        status, _, body = self.request(path)
        self.assertEqual(status, 200, body[:300])
        source = body.decode()
        match = re.search(r'<main id="ava-seo-content"[^>]*>(.*?)</main>', source, re.S)
        self.assertIsNotNone(match, 'Server HTML must contain useful main content before JavaScript')
        return Document(source), VisibleContent(match[1]), source

    def sitemap_paths(self):
        status, _, body = self.request('/sitemap.xml')
        self.assertEqual(status, 200)
        namespace = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        return {node.text.removeprefix(self.server.origin)
                for node in ET.fromstring(body).findall('s:url/s:loc', namespace)}

    def test_target_pages_have_unique_metadata_and_visible_useful_copy(self):
        defaults = fixture.app.site_features.search_defaults()
        self.assertEqual(set(defaults), set(self.TARGETS))
        titles, descriptions = [], []
        for path in self.TARGETS:
            with self.subTest(path=path):
                document, visible, _ = self.get_document(path)
                config = defaults[path]
                self.assertEqual(document.title_count, 1)
                self.assertEqual(document.title, config['title'] + ' | AvA Groups')
                self.assertEqual(document.meta['description'], config['description'])
                self.assertEqual(document.meta['robots'], 'index,follow')
                self.assertEqual(document.canonical, [self.server.origin + path])
                self.assertEqual(document.meta['og:url'], self.server.origin + path)
                self.assertEqual(visible.h1, 1)
                self.assertIn(config['intro'], visible.text)
                self.assertGreater(len(config['intro']), 100)
                for section in config['sections']:
                    self.assertIn(section['heading'], visible.text)
                    self.assertIn(section['body'], visible.text)
                self.assertTrue(visible.links)
                self.assertTrue(all(link.startswith('/') and '#' not in link for link in visible.links))
                titles.append(document.title)
                descriptions.append(document.meta['description'])
        self.assertEqual(len(set(titles)), len(self.TARGETS))
        self.assertEqual(len(set(descriptions)), len(self.TARGETS))

    def test_schema_is_parseable_and_does_not_invent_commercial_claims(self):
        def check(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    self.assertNotIn(key, {'offers', 'aggregateRating', 'review', 'price',
                                           'priceCurrency', 'availability', 'ratingValue'})
                    check(child)
            elif isinstance(value, list):
                for child in value:
                    check(child)

        for path in (*self.TARGETS, '/product/indoor-125'):
            with self.subTest(path=path):
                document, _, _ = self.get_document(path)
                self.assertEqual(len(document.schema), 1)
                schema = document.schema[0]
                self.assertEqual(schema['@context'], 'https://schema.org')
                types = {entry['@type'] for entry in schema['@graph']}
                self.assertTrue({'Organization', 'WebSite', 'BreadcrumbList'} <= types)
                if path.startswith('/product/'):
                    self.assertIn('Product', types)
                if path.startswith('/service/'):
                    self.assertIn('Service', types)
                check(schema)

    def test_empty_sections_and_hidden_products_do_not_enter_the_sitemap(self):
        paths = self.sitemap_paths()
        self.assertTrue(set(self.TARGETS) <= paths)
        self.assertIn('/software', paths)  # The v28 catalogue is now populated.
        for empty in ['/articles', '/category/uncategorized']:
            self.assertNotIn(empty, paths)
        document, _, _ = self.get_document('/articles')
        self.assertEqual(document.meta['robots'], 'noindex,follow')

        self.login()
        content = json.loads(self.request('/api/content')[2])
        content['data']['modules']['software']['items'] = []
        product = next(item for item in content['data']['modules']['products']['items']
                       if item['id'] == 'indoor-125')
        product['status'] = 'draft'
        self.assertEqual(self.request('/api/content', content)[0], 200)
        self.cookie = self.csrf = ''
        self.assertNotIn('/software', self.sitemap_paths())
        empty_software, _, _ = self.get_document('/software')
        self.assertEqual(empty_software.meta['robots'], 'noindex,follow')
        self.assertNotIn('/product/indoor-125', self.sitemap_paths())
        self.assertEqual(self.request('/product/indoor-125')[0], 404)
        _, visible, _ = self.get_document('/category/urban-indoor')
        self.assertNotIn('/product/indoor-125', visible.links)

    def test_custom_copy_is_preserved_escaped_and_does_not_mutate_database(self):
        self.login()
        content = json.loads(self.request('/api/content')[2])
        title = 'عنوان اختصاصی <img src=x onerror=alert(1)>'
        intro = 'متن اختصاصی مسئول سایت <script>alert(2)</script>'
        description = 'توضیح اختصاصی مسئول سایت؛ انتخاب نمایشگر متناسب با پروژه.'
        content['data'].setdefault('pageSeo', {})['/'] = {
            'title': title, 'description': description, 'heading': 'راهنمای اختصاصی آوا',
            'intro': intro, 'sections': [{'heading': 'مشاوره <b>اختصاصی</b>',
                                         'body': 'متن بخش محفوظ می‌ماند.'}],
            'showContent': True,
        }
        self.assertEqual(self.request('/api/content', content)[0], 200)
        with fixture.app.connect() as db:
            original = db.execute('SELECT data FROM content').fetchone()[0]
        data = json.loads(original)
        snapshot = copy.deepcopy(data)
        record = fixture.app.site_features.pages(data)['/']
        self.assertEqual(record['title'], title)
        self.assertEqual(record['description'], description)
        self.assertEqual(record['copy']['intro'], intro)
        self.assertEqual(record['copy']['sections'], content['data']['pageSeo']['/']['sections'])
        self.assertEqual(data, snapshot, 'Reading SEO defaults must not mutate existing records')

        head, body = fixture.app.site_features.seo_html(data, '/', self.server.origin)
        self.assertNotIn('<img src=x onerror=alert(1)>', head + body)
        self.assertNotIn('<script>alert(2)</script>', head + body)
        self.assertIn('&lt;img', head)
        self.assertIn('&lt;script&gt;', body)
        self.assertIn('&lt;b&gt;', body)
        document, visible, _ = self.get_document('/')
        self.assertEqual(document.title, title + ' | AvA Groups')
        self.assertIn(intro, visible.text)
        self.assertEqual(len(document.schema), 1)
        with fixture.app.connect() as db:
            self.assertEqual(db.execute('SELECT data FROM content').fetchone()[0], original)


if __name__ == '__main__':
    unittest.main()
