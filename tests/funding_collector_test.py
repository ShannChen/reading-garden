import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('funding', Path(__file__).parents[1] / 'scripts/update-funding-feed.py')
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)

class FundingTest(unittest.TestCase):
    def test_dates(self):
        p = f.Page(); p.feed('<main><h2>Application Deadline:</h2><p>Monday, November 02, 2026</p><p>Reference letters deadline November 10, 2026</p><p>Deadline: October 1</p><p>Degree conferred September 3, 2020</p><p>Application deadline February 30, 2027</p><p>Application deadline November 02, 2026; award begins July 1, 2027.</p></main>')
        self.assertEqual(f.deadline_candidates(p.text_lines()), ['2026-11-02'])
    def test_keep_last_good_data(self):
        def fail(*args): raise OSError()
        previous={'dates':['2026-11-02'],'checkedAt':'2026-10-06','updatedAt':'2026-10-06'}
        record,_=f.monitor({'id':'x','url':'https://official.example/x'},previous,fail)
        self.assertEqual(record['dates'],previous['dates']);self.assertEqual(record['checkedAt'],previous['checkedAt']);self.assertEqual(record['sourceStatus'],'unavailable')
    def test_html_page_not_application_status(self):
        body='<main><h1>Program</h1><p>Application deadline: October 1, 2026</p><p>For scientists pursuing biomedical research; check your institutional requirements.</p></main>'
        record,_=f.monitor({'id':'x','url':'https://example.org'}, {}, lambda *_:body)
        self.assertEqual(record['status'],'cycle-unconfirmed');self.assertEqual(record['dates'],['2026-10-01'])
    def test_grantsgov_pagination_dedup_and_expiry(self):
        def fetch(url,params):
            offset=params['startRecordNum']
            hits=[{'id':str(i), 'title':'Biochemical research', 'agencyName':'NIH','oppStatus':'posted','closeDate':'11/02/2026'} for i in range(offset,min(offset+100,101))]
            if offset==100:hits.append({'id':'999','title':'Old research','oppStatus':'posted','closeDate':'10/01/2026'})
            return json.dumps({'errorcode':0,'data':{'hitCount':102,'oppHits':hits}})
        with patch.object(f.time,'sleep'):
            records,failures=f.government(fetch,'2026-10-07')
        self.assertEqual(len(records),101);self.assertEqual(failures,[]);self.assertEqual(len(records[0]['fields']),13);self.assertEqual(records[0]['dates'],['2026-11-02'])
    def test_partial_source_failure(self):
        def fetch(*args):raise OSError()
        with patch.object(f.time,'sleep'):
            records,failures=f.government(fetch,'2026-10-07')
        self.assertEqual(records,[]);self.assertEqual(len(failures),len(f.SEARCHES))
    def test_discovery_official_host_only(self):
        source={'url':'https://chemh.stanford.edu/opportunities/funding-opportunities','discover':True}
        p=f.Page();p.feed('<a href="/opportunities/2027-seed-grant">2027 ChEM-H Seed Grant</a><a href="https://evil.example/opportunities/seed-grant">Biochemistry seed grant</a><a href="javascript:alert(1)">Seed grant</a>')
        rows=f.discover(source,p);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['scope'],'stanford')
    def test_fellowship_stage(self):
        self.assertEqual(f.stage('NRSA Individual Predoctoral Fellowships (Parent F31)'), 'phd')
        self.assertEqual(f.stage('NRSA Individual Postdoctoral Fellowships (Parent F32)'), 'postdoc')
        self.assertEqual(f.stage('Pathway to Independence Award (K99/R00)'), 'grant')
    def test_stanford_directory_discovery(self):
        source={'url':'https://postdocs.stanford.edu/fellowships','discover':'stanford-postdoc'}
        p=f.Page();p.feed('<nav><a href="https://unrelated.stanford.edu/fellowship">Navigation Fellowship</a></nav><main><a href="https://neuroscience.stanford.edu/awards">Wu Tsai Neurosciences Postdoctoral Scholar Awards</a><a href="/current/fellowship/mccormick">Katharine McCormick Committee</a><a href="https://evil-stanford.edu/fellowship">Postdoctoral Fellowship</a><a href="/policy">Postdoc Policy on Fellowships</a><a href="/current/postdoc-resources">Postdoc Resources</a><a href="https://shc.stanford.edu/fellowship">Mellon Fellowship of Scholars in the Humanities</a></main>')
        rows=f.discover(source,p)
        self.assertEqual(len(rows),3)
        self.assertTrue(all(r['kind']=='postdoc' for r in rows))
        self.assertIn('Neuroscience',rows[0]['fields'])
        self.assertEqual(rows[2]['fields'],['Humanities & Social sciences'])
    def test_mchri_programs_and_url_dedup(self):
        source={'url':'https://med.stanford.edu/mchri/funding_opportunities/postdoctoral-and-fellowship-opportunities.html','discover':'stanford-mchri'}
        prefix='/mchri/funding_opportunities/postdoctoral-and-fellowship-opportunities/'
        p=f.Page();p.feed(f'<a href="{prefix}postdoctoral-support.html">Postdoctoral Support</a><a href="{prefix}impact.html">Research-to-Impact Awards</a><a href="{prefix}tuition.html">Master’s Tuition Program</a>')
        rows=f.discover(source,p);self.assertEqual([r['kind'] for r in rows],['postdoc','grant'])
        self.assertEqual(f.url_key('https://www.med.stanford.edu/content/sm/mchri/support.html'),f.url_key('https://med.stanford.edu/mchri/support.html'))
    def test_directory_dates_not_program_deadlines(self):
        body='<main><h1>Directory</h1><p>Application deadline November 2, 2026</p><p>Another program application deadline December 3, 2026</p></main>'
        record,_=f.monitor({'id':'directory','url':'https://example.org','discover':'stanford-postdoc'}, {}, lambda *_:body)
        self.assertEqual(record['dates'],[])

if __name__=='__main__':unittest.main()
