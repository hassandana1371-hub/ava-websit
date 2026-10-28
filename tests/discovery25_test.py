import json
import unittest
from urllib.robotparser import RobotFileParser
import server_test as fixture

class DiscoveryTests(fixture.ServerTest):
    def test_public_crawler_rules_and_private_boundaries(self):
        response=self.request('/robots.txt');self.assertEqual(response[0],200)
        parser=RobotFileParser();parser.parse(response[2].decode().splitlines())
        for agent in ['Googlebot','OAI-SearchBot','ChatGPT-User']:
            self.assertTrue(parser.can_fetch(agent,self.server.origin+'/about'))
            self.assertTrue(parser.can_fetch(agent,self.server.origin+'/product/indoor-125'))
            for path in ['/panel','/admin','/api/content']:
                self.assertFalse(parser.can_fetch(agent,self.server.origin+path))
        self.assertEqual(self.request('/api/stats')[0],401)
    def test_company_profile_uses_only_public_real_information(self):
        self.login();content=json.loads(self.request('/api/content')[2]);data=content['data']
        data['company']={'description':'معرفی اختصاصی شرکت تست','serviceArea':'محدودهٔ خدمات تأییدشده تست'}
        data['contact']['phone']='02100000000';data['contact']['email']='public@example.test'
        self.assertEqual(self.request('/api/content',content)[0],200)
        self.cookie='';self.csrf=''
        raw=self.request('/about')[2].decode();self.assertIn('معرفی اختصاصی شرکت تست',raw)
        self.assertIn('محدودهٔ خدمات تأییدشده تست',raw)
        self.assertIn('/about',self.request('/sitemap.xml')[2].decode())
        self.assertNotIn('aggregateRating',raw)
        before=json.loads(self.request('/api/content')[2])['data']
        self.assertEqual(len(before['modules']['products']['items']),24)

if __name__=='__main__':unittest.main()
