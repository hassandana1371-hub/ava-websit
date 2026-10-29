"""One-time software additions preserve edits, media, analytics and credentials."""
import copy
import json
import unittest
import server_test as fixture

class Release28Tests(fixture.ServerTest):
    def stored(self):
        with fixture.app.connect() as db:
            r=db.execute('SELECT revision,data FROM content').fetchone()
            return r['revision'],json.loads(r['data'])

    def test_catalogue_migration_is_additive_and_runs_once(self):
        _,data=self.stored();data.pop('softwareRevision')
        custom=copy.deepcopy(data['modules']['software']['items'][0]);custom.update(title='تنظیم اختصاصی مدیر',status='draft',url='https://example.test/custom')
        data['modules']['software']['items']=[custom]
        snapshot=copy.deepcopy(data)
        with fixture.app.connect() as db:
            db.execute('UPDATE content SET revision=31,data=?',(json.dumps(data),))
            account=tuple(db.execute('SELECT * FROM account').fetchone())
            db.execute("INSERT INTO site_metrics VALUES ('2026-10-29','/','test-visitor','view',5)")
        preview=fixture.app.site_features.upgrade_software(data)
        self.assertEqual(data,snapshot)
        self.assertEqual(preview['modules']['software']['items'][0],custom)
        fixture.app.initialize();revision,upgraded=self.stored()
        self.assertEqual(revision,32);self.assertEqual(upgraded['softwareRevision'],1)
        self.assertEqual(len(upgraded['modules']['software']['items']),7)
        for field in ['contact','header','hero','pageSeo']:
            self.assertEqual(upgraded.get(field),snapshot.get(field))
        self.assertEqual(upgraded['modules']['products'],snapshot['modules']['products'])
        with fixture.app.connect() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM account').fetchone()),account)
            self.assertEqual(db.execute('SELECT total FROM site_metrics').fetchone()[0],5)
            # An intentional deletion after migration remains deleted.
            upgraded['modules']['software']['items'].pop()
            db.execute('UPDATE content SET data=?',(json.dumps(upgraded),))
        fixture.app.initialize();self.assertEqual(len(self.stored()[1]['modules']['software']['items']),6)
        self.assertEqual(self.stored()[0],32)

    def test_link_validation_and_software_round_trip(self):
        self.login();result=json.loads(self.request('/api/content')[2]);data=result['data']
        data['hero']['slides'][0].update(clickUrl='/service/led-trailer-rental',linkEnabled=False)
        status,_,body=self.request('/api/content',{'revision':result['revision'],'data':data})
        self.assertEqual(status,200,body)
        saved=json.loads(self.request('/api/content')[2])['data']
        self.assertFalse(saved['hero']['slides'][0]['linkEnabled'])
        self.assertEqual(saved['modules']['software'],data['modules']['software'])
        bad=copy.deepcopy(data);bad['hero']['slides'][0]['linkEnabled']='false'
        with self.assertRaises(ValueError):fixture.app.validate_content(bad)
        bad=copy.deepcopy(data);bad['hero']['slides'][0]['clickUrl']='javascript:alert(1)'
        with self.assertRaises(ValueError):fixture.app.validate_content(bad)
        self.assertEqual(self.request('/api/stats')[0],200)
        self.assertEqual(self.request('/api/logout',{})[0],200)
        self.assertEqual(self.request('/api/stats')[0],401)

if __name__=='__main__':unittest.main()
