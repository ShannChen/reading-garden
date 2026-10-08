import importlib.util
from pathlib import Path
import unittest
import datetime as dt

spec=importlib.util.spec_from_file_location('seminars',Path(__file__).resolve().parents[1]/'scripts/update-seminar-feed.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=dt.datetime(2026,10,8,12,tzinfo=m.TZ)

class TestSeminars(unittest.TestCase):
    def event(self,**changes):
        e={'id':1,'title':'Biochemistry Seminar: Reading','departments':[{'name':'Biochemistry'}],'localist_url':'https://events.stanford.edu/event/test','filters':{'event_types':[{'name':'Class/Seminar'}]},'event_instances':[{'event_instance':{'id':2,'start':'2026-10-09T12:00:00-07:00','end':'2026-10-09T13:00:00-07:00'}}]};e.update(changes);return e
    def test_science_talk_filter_and_cancelled(self):
        self.assertEqual(len(m.event_rows(self.event(),NOW,NOW+dt.timedelta(days=90))),1)
        for changes in [{'private':True},{'status':'canceled'},{'title':'Reception','filters':{'event_types':[{'name':'Social Event/Reception'}]}},{'departments':[{'name':'History'}]}]:self.assertEqual(m.event_rows(self.event(**changes),NOW,NOW+dt.timedelta(days=90)),[])
    def test_past_date_and_unsafe_url(self):
        self.assertEqual(m.event_rows(self.event(event_instances=[{'event_instance':{'start':'2025-01-01T12:00:00-08:00'}}]),NOW,NOW+dt.timedelta(days=90)),[])
        self.assertEqual(m.event_rows(self.event(localist_url='javascript:alert(1)'),NOW,NOW+dt.timedelta(days=90)),[])
    def test_multi_instances_and_dst(self):
        e=self.event(event_instances=[{'event_instance':{'id':i,'start':date}} for i,date in enumerate(['2026-10-09T12:00:00-07:00','2026-11-09T12:00:00-08:00'])]);rows=m.event_rows(e,NOW,NOW+dt.timedelta(days=90));self.assertEqual(len(rows),2);self.assertNotEqual(rows[0]['id'],rows[1]['id'])
    def test_dedup_preserves_joint_departments(self):
        rows=m.event_rows(self.event(),NOW,NOW+dt.timedelta(days=90));other=dict(rows[0],departments=['Chemistry'],sourceId='page-chemistry');out=m.deduplicate(rows+[other]);self.assertEqual(len(out),1);self.assertEqual(out[0]['departments'],['Biochemistry','Chemistry'])
        another=dict(rows[0],start='2026-10-09T16:00:00-07:00');self.assertEqual(len(m.deduplicate(rows+[another])),2)
    def test_table_does_not_invent_time(self):
        source=m.DEPARTMENT_PAGES[-1];rows,count=m.parse_page(source,'<table><tr><td>October 21, 2026</td><td>Aaron Whiteley</td><td>Colorado</td><td>Clark</td></tr></table>',NOW,NOW+dt.timedelta(days=90));self.assertEqual(count,1);self.assertEqual(rows[0]['start'],'2026-10-21');self.assertTrue(rows[0]['allDay'])
    def test_department_article_and_pagination(self):
        rows,count=m.parse_page(m.DEPARTMENT_PAGES[0],'<article><h2><a href="/events/talk">Chemical Biology Seminar</a></h2><time datetime="2026-10-09T12:00:00-07:00"></time></article>',NOW,NOW+dt.timedelta(days=90));self.assertEqual(count,1);self.assertEqual(len(rows),1)
        calls=[]
        def loader(url):
            page=int(m.urllib.parse.parse_qs(m.urllib.parse.urlparse(url).query)['page'][0]);calls.append(page);return {'events':[page],'page':{'total':3}}
        self.assertEqual(sorted(m.paged('events','events',loader=loader)),[1,2,3]);self.assertEqual(sorted(calls),[1,2,3])
    def test_failure_retains_last_known_instead_of_false_empty(self):
        def loader(*args):raise OSError('offline')
        previous={'events':m.event_rows(self.event(),NOW,NOW+dt.timedelta(days=90))}
        data=m.collect(NOW,loader,previous);self.assertTrue(data['partial']);self.assertEqual(data['events'][0]['sourceStatus'],'saved')

if __name__=='__main__':unittest.main()
