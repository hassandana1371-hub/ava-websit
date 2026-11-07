"""Regression: large customer galleries must not block login or initial HTML."""
import base64
import copy
import json
from pathlib import Path
import random
import re
import struct
import unittest
import zlib
import server_test as fixture


def photo():
    width,height=400,600;rng=random.Random(32)
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    pixels=b''.join(b'\0'+rng.randbytes(width*3) for _ in range(height))
    blob=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
    return blob,'data:image/png;base64,'+base64.b64encode(blob).decode()

class MediaTests(unittest.TestCase):
    setUp=fixture.ServerTest.setUp
    tearDown=fixture.ServerTest.tearDown
    request=fixture.ServerTest.request
    login=fixture.ServerTest.login
    def store_project(self,status='published',image=None):
        if image is None:_,image=photo()
        with fixture.app.connect() as db:
            data=json.loads(db.execute('SELECT data FROM content').fetchone()[0])
            data['modules']['projects']['items']=[dict(id='large-project',title='پروژهٔ حجیم',summary='',body='',meta='',url='',image=image,status=status,gallery=[dict(image=image,alt='نما') for _ in range(12)])]
            db.execute('UPDATE content SET revision=revision+1,data=?',(json.dumps(data),))
        return data
    def compact(self):
        status,_,body=self.request('/api/content',**{'X-AvA-Media':'references'});self.assertEqual(status,200);return json.loads(body),body
    def test_heavy_gallery_does_not_inflate_panel_or_public_metadata(self):
        original=self.store_project()
        panel=self.request('/panel');self.assertEqual(panel[0],200);self.assertLess(len(panel[2]),900000)
        self.assertEqual(self.request('/api/session')[0],200)
        compact,body=self.compact();legacy=self.request('/api/content')[2]
        self.assertGreater(len(legacy),10_000_000);self.assertLess(len(body),150000)
        self.assertLess(len(self.request('/')[2]),1000000)
        path=compact['data']['modules']['projects']['items'][0]['image'];self.assertRegex(path,r'^/media/[a-f0-9]{64}\.png$')
        self.assertEqual(self.request(path)[2],base64.b64decode(original['modules']['projects']['items'][0]['image'].split(',')[1]))
    def test_private_media_and_svg_active_content_are_protected(self):
        svg='data:image/svg+xml;base64,'+base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').decode()
        self.store_project('draft',svg);self.login();compact,_=self.compact();path=compact['data']['modules']['projects']['items'][0]['image']
        response=self.request(path);self.assertEqual(response[0],200);self.assertEqual(response[1]['Cache-Control'],'no-store');self.assertIn('sandbox',response[1]['Content-Security-Policy'])
        self.cookie=self.csrf='';self.assertEqual(self.request(path)[0],404)
        self.assertEqual(self.compact()[0]['data']['modules']['projects']['items'],[])
    def test_reference_roundtrip_keeps_original_photos_and_rejects_unknown_refs(self):
        original=self.store_project();self.login();compact,_=self.compact();compact['data']['header']['sloganFa']='ویرایش متن بدون حذف عکس'
        self.assertEqual(self.request('/api/content',compact)[0],200)
        with fixture.app.connect() as db:saved=json.loads(db.execute('SELECT data FROM content').fetchone()[0])
        self.assertEqual(saved['modules']['projects'],original['modules']['projects'])
        bad,_=self.compact();bad['data']['header']['logo']='/media/'+'0'*64+'.png'
        self.assertEqual(self.request('/api/content',bad)[0],400)
        fixture.app.initialize();self.assertEqual(self.compact()[0]['data']['header']['sloganFa'],'ویرایش متن بدون حذف عکس')
    def test_panel_response_does_not_load_customer_content(self):
        from unittest.mock import patch
        with patch.object(fixture.app.site_features,'content_snapshot',side_effect=AssertionError('Panel must not load galleries')):
            self.assertEqual(self.request('/panel')[0],200)
            self.assertEqual(self.request('/api/session')[0],200)

if __name__=='__main__':unittest.main()
