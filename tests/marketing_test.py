import copy
import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit,parse_qs
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('marketing',ROOT/'tools/marketing_pack.py');app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)
class MarketingTest(unittest.TestCase):
 def setUp(self):self.data=json.loads((ROOT/'src/defaults.json').read_text())
 def test_private_content_and_hidden_categories_are_not_promoted(self):
  self.data['modules']['products']['items'][0]['status']='draft'
  for c in self.data['productCategories']:
   if c['id']=='urban':c['visible']=False
  self.data['modules']['services']['items'][0]['status']='draft'
  before=copy.deepcopy(self.data);pack=app.generate(self.data)
  self.assertEqual(self.data,before)
  self.assertFalse(any(p['id']=='buy-guide' or p['id'].startswith('product-indoor') or p['id'].startswith('product-outdoor') for p in pack['posts']))
  self.assertFalse(any(p['id']=='service-led-trailer-rental' for p in pack['posts']))
 def test_real_destinations_and_distinct_campaign_tags(self):
  pack=app.generate({'data':self.data},channel='telegram');self.assertGreaterEqual(len(pack['posts']),5)
  links=[p['tracked_link'] for p in pack['posts']];self.assertEqual(len(links),len(set(links)))
  for p in pack['posts']:
   self.assertEqual(p['status'],'draft');self.assertEqual(parse_qs(urlsplit(p['tracked_link']).query)['utm_source'],['telegram'])
   self.assertEqual(urlsplit(p['tracked_link']).path,urlsplit(p['landing_page']).path)
   self.assertNotIn('۱۲٬۲۳۱',p['text'])
 def test_invalid_origins_and_tags_are_rejected(self):
  for origin in ['javascript:alert(1)','http://avagroups.ir','https://user:pass@avagroups.ir','https://avagroups.ir/other']:
   with self.assertRaises(ValueError):app.generate(self.data,origin=origin)
  with self.assertRaises(ValueError):app.generate(self.data,channel='bad channel')
if __name__=='__main__':unittest.main()
