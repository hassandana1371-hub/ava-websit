"""Contact correction, migration, public markup and schema regressions."""
import copy
import html
import json
import re
import unittest

import server_test as fixture


MAIN = '02191095715'
MOBILE = '09121718024'
MOBILE_DISPLAY = '0912 17 18 024'
WAREHOUSE = 'خیابان آزادی، استاد معین، خیابان طوس، موسوی مطلق، پلاک ۵'
OFFICE = 'تهران، خیابان ولنجک، خیابان ۷، پلاک ۶'
CONTACT_FIELDS = ['mobile', 'mobileDisplay', 'phoneDisplay', 'phoneLabel',
                  'phoneNote', 'mobileLabel', 'mobileNote', 'locations']


class ContactTests(fixture.ServerTest):
    def stored(self):
        with fixture.app.connect() as db:
            row = db.execute('SELECT revision,data FROM content WHERE id=1').fetchone()
        return row['revision'], json.loads(row['data'])

    def store(self, revision, data):
        with fixture.app.connect() as db:
            db.execute('UPDATE content SET revision=?,data=? WHERE id=1',
                       (revision, json.dumps(data, ensure_ascii=False)))

    def assert_correct_contacts(self, data):
        self.assertEqual(data['contactRevision'], 2)
        contact = data['contact']
        self.assertEqual(contact['phone'], MAIN)
        self.assertEqual(contact['mobile'], MOBILE)
        self.assertEqual(contact['mobileDisplay'], MOBILE_DISPLAY)
        self.assertEqual(len(contact['locations']), 3)
        self.assertEqual(next(x['address'] for x in contact['locations'] if x['id']=='factory'),'تهران، چهاردانگه، شهرک صنعتی سهند، کوچهٔ اختر')
        by_title = {location['title']: location['address']
                    for location in contact['locations']}
        self.assertEqual(by_title['انبار مرکزی'], WAREHOUSE)
        self.assertEqual(by_title['دفتر فروش و نمایشگاه'], OFFICE)
        self.assertNotIn('تهران', by_title['انبار مرکزی'])
        points = fixture.app.site_features.contact_points(data)
        self.assertEqual([point['number'] for point in points], [MAIN, MOBILE])
        self.assertEqual([point['href'] for point in points],
                         ['tel:+982191095715', 'tel:+989121718024'])
        self.assertEqual(points[1]['display'], MOBILE_DISPLAY)

    def test_existing_database_upgrades_once_without_losing_custom_content(self):
        _, legacy = self.stored()
        legacy.pop('contactRevision', None)
        for field in CONTACT_FIELDS:
            legacy['contact'].pop(field, None)
        legacy['contact'].update(phone='02166048740', title='عنوان اختصاصی قبلی',
                                 description='متن اختصاصی قبلی',
                                 email='kept@example.test', address='نشانی تکمیلی قبلی')
        legacy['header']['nameFa'] = 'نام اختصاصی قبلی'
        product = legacy['modules']['products']['items'][0]
        product['body'] = 'متن محصول قبلی باید حفظ شود'
        product['image'] = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='
        product['priceAmount'] = 123456
        snapshot = copy.deepcopy(legacy)
        self.store(37, legacy)

        # Reading/deriving the upgraded representation must not mutate caller data.
        proposed = fixture.app.site_features.upgrade_contact(legacy)
        self.assertEqual(legacy, snapshot)
        self.assert_correct_contacts(proposed)

        fixture.app.initialize()
        revision, migrated = self.stored()
        self.assertEqual(revision, 38)
        self.assert_correct_contacts(migrated)
        self.assertEqual(migrated['modules'], snapshot['modules'])
        self.assertEqual(migrated['header'], snapshot['header'])
        for field in ['title', 'description', 'email', 'address']:
            self.assertEqual(migrated['contact'][field], snapshot['contact'][field])

        fixture.app.initialize()
        self.assertEqual(self.stored(), (revision, migrated))

    def test_later_edits_and_explicit_removal_survive_restart(self):
        fixture.app.initialize()
        self.login()
        payload = json.loads(self.request('/api/content')[2])
        payload['data']['contact'].update(phone='02112345678',
                                           phoneDisplay='021 12345678',
                                           phoneLabel='شمارهٔ ویرایش‌شده',
                                           mobile='', mobileDisplay='', locations=[])
        self.assertEqual(self.request('/api/content', payload)[0], 200)
        before_restart = self.stored()
        fixture.app.initialize()
        self.assertEqual(self.stored(), before_restart)
        contact = before_restart[1]['contact']
        self.assertEqual(contact['phone'], '02112345678')
        self.assertEqual(contact['mobile'], '')
        self.assertEqual(contact['locations'], [])
        points = fixture.app.site_features.contact_points(before_restart[1])
        self.assertEqual(len(points), 1)
        self.assertEqual(points[0]['href'], 'tel:+982112345678')

    def test_public_contact_and_about_show_correct_links_and_schema(self):
        fixture.app.initialize()
        self.assert_correct_contacts(self.stored()[1])
        for path in ['/contact', '/about']:
            status, _, body = self.request(path)
            self.assertEqual(status, 200)
            source = body.decode()
            visible = html.unescape(re.search(
                r'<main id="ava-seo-content"[^>]*>(.*?)</main>',
                source, re.S).group(1))
            self.assertIn('href="tel:+982191095715"', visible)
            self.assertIn('href="tel:+989121718024"', visible)
            self.assertIn(MOBILE_DISPLAY, visible)
            self.assertIn(WAREHOUSE, visible)
            self.assertIn(OFFICE, visible)
            self.assertIn('انبار مرکزی', visible)
            self.assertIn('دفتر فروش و نمایشگاه', visible)
            self.assertNotIn('02166048740', visible)

            schema = json.loads(re.search(
                r'<script id="ava-structured-data"[^>]*>(.*?)</script>',
                source, re.S).group(1))
            organization = next(node for node in schema['@graph']
                                if node['@type'] == 'Organization')
            points = organization['contactPoint']
            self.assertIsInstance(points, list)
            self.assertEqual([point['telephone'] for point in points],
                             ['+982191095715', '+989121718024'])
            self.assertNotIn('02166048740', json.dumps(organization))
            self.assertNotIn('openingHours', organization)
            self.assertNotIn('openingHoursSpecification', organization)

    def test_factory_revision_preserves_version26_edits_and_removals(self):
        _, previous=self.stored()
        previous['contactRevision']=1
        previous['contact']['phone']='02199990000'
        previous['contact']['phoneNote']='توضیح سفارشی حفظ شود'
        previous['contact']['mobile']=''
        previous['contact']['mobileDisplay']=''
        locations=[x for x in previous['contact']['locations'] if x['id']!='factory']
        locations.extend({'id':'custom-'+str(i),'title':'محل سفارشی '+str(i),'address':'نشانی سفارشی '+str(i)} for i in range(6))
        previous['contact']['locations']=locations
        self.store(73,previous)
        fixture.app.initialize()
        revision, upgraded=self.stored()
        self.assertEqual(revision,74)
        self.assertEqual(upgraded['contactRevision'],2)
        self.assertEqual(upgraded['contact']['phone'],'02199990000')
        self.assertEqual(upgraded['contact']['mobile'],'')
        self.assertEqual(upgraded['contact']['phoneNote'],'توضیح سفارشی حفظ شود')
        self.assertEqual(upgraded['contact']['locations'][:-1],locations)
        self.assertEqual(upgraded['contact']['locations'][-1]['id'],'factory')
        self.assertEqual(upgraded['modules'],previous['modules'])
        fixture.app.initialize()
        self.assertEqual(self.stored(),(revision,upgraded))
        self.login()
        payload=json.loads(self.request('/api/content')[2])
        payload['data']['contact']['locations']=[x for x in payload['data']['contact']['locations'] if x['id']!='factory']
        self.assertEqual(self.request('/api/content',payload)[0],200)
        fixture.app.initialize()
        self.assertFalse(any(x['id']=='factory' for x in self.stored()[1]['contact']['locations']))

    def test_contact_extension_validation_keeps_previous_content_on_error(self):
        self.login()
        initial = json.loads(self.request('/api/content')[2])
        malformed = copy.deepcopy(initial)
        malformed['data']['contact']['mobile'] = ['invalid']
        self.assertEqual(self.request('/api/content', malformed)[0], 400)
        malformed = copy.deepcopy(initial)
        malformed['data']['contact']['locations'] = [
            {'id':'location-'+str(i), 'title':'عنوان', 'address':'نشانی'}
            for i in range(13)]
        self.assertEqual(self.request('/api/content', malformed)[0], 400)
        malformed = copy.deepcopy(initial)
        malformed['data']['contact']['mobileDisplay'] = {'invalid':'type'}
        self.assertEqual(self.request('/api/content', malformed)[0], 400)
        self.assertEqual(json.loads(self.request('/api/content')[2]), initial)


if __name__ == '__main__':
    unittest.main()
