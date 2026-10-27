import copy
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location('ava_server', Path(__file__).resolve().parents[1] / 'server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        app.DB = Path(self.directory.name) / 'ava.sqlite3'
        app.initialize()
        with app.connect() as db:
            app.set_password(db, 'test-only-password-123')
        self.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        self.server.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.server.dev = True
        self.server.cookie_name = 'ava_session'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = ''
        self.csrf = ''

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def request(self, path, payload=None, **extra):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        headers = {'Origin': self.server.origin, 'Cookie': self.cookie, 'X-CSRF-Token': self.csrf}
        headers.update(extra)
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        connection.request('GET' if payload is None else 'POST', path, json.dumps(payload) if payload is not None else None, headers)
        response = connection.getresponse()
        body = response.read()
        result = (response.status, dict(response.getheaders()), body)
        connection.close()
        return result

    def login(self, password='test-only-password-123'):
        status, headers, body = self.request('/api/login', {'password':password})
        self.assertEqual(status, 200, body)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.csrf = json.loads(body)['csrf']
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])

    def test_content_auth_persistence_and_projection(self):
        self.assertEqual(self.request('/api/content', {})[0], 401)
        self.login()
        result = json.loads(self.request('/api/content')[2])
        data = result['data']
        self.assertEqual(len(data['modules']['products']['items']), 24)
        draft = copy.deepcopy(data['modules']['products']['items'][0])
        draft.update(id='private-draft', title='NEVER-PUBLISH-THIS-DRAFT', status='draft')
        data['modules']['products']['items'].append(draft)
        data['pageBanners']['product:private-draft'] = dict(show=True, title='PRIVATE-BANNER', image='', asset='wall')
        hidden = next(c for c in data['productCategories'] if c['id'] == 'urban-outdoor')
        hidden['visible'] = False
        payload = {'revision':result['revision'], 'data':data}
        self.assertEqual(self.request('/api/content', payload, **{'X-CSRF-Token':'wrong'})[0], 403)
        self.assertEqual(self.request('/api/content', payload, Origin='https://evil.example')[0], 403)
        self.assertEqual(self.request('/api/content', payload)[0], 200)
        self.assertEqual(self.request('/api/content', payload)[0], 409)
        with app.connect() as db:
            self.assertIn('NEVER-PUBLISH-THIS-DRAFT', db.execute('SELECT data FROM content').fetchone()[0])
            self.assertNotIn('test-only-password', db.execute('SELECT digest FROM account').fetchone()[0])
        self.request('/api/logout', {})
        self.assertEqual(self.request('/api/content', payload)[0], 401)
        self.cookie = self.csrf = ''
        public = self.request('/api/content')[2]
        html = self.request('/')[2]
        for body in [public, html]:
            self.assertNotIn(b'NEVER-PUBLISH-THIS-DRAFT', body)
            self.assertNotIn(b'PRIVATE-BANNER', body)
            self.assertNotIn(b'"id": "outdoor-4"', body)
        for path in ['/server.py','/private-data/ava.sqlite3','/src/defaults.json','/.git/config','/../server.py']:
            self.assertEqual(self.request(path)[0], 404)

    def test_password_rotation_revocation_and_limits(self):
        self.login()
        old_cookie = self.cookie
        self.assertEqual(self.request('/api/password', {'currentPassword':'wrong','password':'replacement-password-456'})[0], 403)
        self.assertEqual(self.request('/api/password', {'currentPassword':'test-only-password-123','password':'short'})[0], 400)
        self.assertEqual(self.request('/api/password', {'currentPassword':'test-only-password-123','password':'replacement-password-456'})[0], 200)
        self.cookie = old_cookie
        self.assertFalse(json.loads(self.request('/api/session')[2])['authenticated'])
        self.assertEqual(self.request('/api/login', {'password':'test-only-password-123'})[0], 401)
        self.login('replacement-password-456')
        self.request('/api/logout', {})
        for _ in range(5):
            self.assertEqual(self.request('/api/login', {'password':'invalid'})[0], 401)
        self.assertEqual(self.request('/api/login', {'password':'replacement-password-456'})[0], 429)

    def test_metrics_persist_without_changing_content(self):
        with app.connect() as db:before=db.execute('SELECT data FROM content').fetchone()[0]
        status, headers, body = self.request('/api/track', {'path':'/product/indoor-125','event':'pageview'})
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.assertEqual(self.request('/api/track', {'path':'/does-not-exist','event':'pageview'})[0],400)
        self.assertEqual(self.request('/api/stats')[0],401)
        self.assertEqual(self.request('/api/track',{'path':[],'event':'pageview'})[0],400)
        app.initialize()
        self.login()
        stats = json.loads(self.request('/api/stats')[2])
        self.assertEqual(stats['periods']['today'],{'views':1,'visitors':1})
        self.assertTrue(stats['startedAt'])
        self.request('/api/track', {'path':'/product/indoor-125','event':'pageview'})
        self.assertEqual(json.loads(self.request('/api/stats')[2])['periods']['today']['views'],1)
        with app.connect() as db:self.assertEqual(db.execute('SELECT data FROM content').fetchone()[0],before)

    def test_invalid_data_and_secure_cookie(self):
        self.login()
        result = json.loads(self.request('/api/content')[2])
        result['data']['modules']['products']['items'][0]['url'] = 'javascript:alert(1)'
        self.assertEqual(self.request('/api/content', result)[0], 400)
        self.server.dev = False
        self.server.cookie_name = '__Host-ava_session'
        self.server.origin = 'https://ava.example'
        status, headers, _ = self.request('/api/login', {'password':'test-only-password-123'}, Host='ava.example')
        self.assertEqual(status, 200)
        self.assertIn('__Host-ava_session=', headers['Set-Cookie'])
        self.assertIn('; Secure', headers['Set-Cookie'])


if __name__ == '__main__':
    unittest.main()
