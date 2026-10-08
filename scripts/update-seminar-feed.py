"""Public Stanford STEM talks: central calendar plus departmental schedules."""
import concurrent.futures as futures
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
API = 'https://events.stanford.edu/api/2/'
TZ = ZoneInfo('America/Los_Angeles')
STEM = re.compile(r'biolog|biochem|biomed|bioengineer|genetic|genomic|microb|immun|neuro|chemistry|chemical|physics|mathematics|statistics|computer science|engineering|earth|geophys|geolog|oceans|energy|environment|sustainab|medicine|medical|cancer|oncolog|patholog|radiolog|pediatr|pharmacol|cardiovasc|stem cell|developmental|data science|artificial intelligence|human-centered artificial|human performance|bio-x|chem-h|slac|materials science', re.I)
TALK = re.compile(r'seminar|colloqui|lecture|grand rounds|research talk|presentation', re.I)
EXCLUDE = re.compile(r'library|career|recreation|wellness|alumni|admissions|student services|humanities|contemplation|continuing medical education|environmental health and safety', re.I)
NON_RESEARCH = re.compile(r'CPR|first aid|certification class|guided meditation|guided practice|yoga|fitness|retreat|contemplation by design|CBD \d{4}|teaching statement|information session|info session',re.I)
DEPARTMENT_PAGES = [
    {'id':'page-chemistry','name':'Chemistry','url':'https://chemistry.stanford.edu/events/upcoming-events'},
    {'id':'page-biology','name':'Biology','url':'https://biology.stanford.edu/news-events/upcoming-events'},
    {'id':'page-physics','name':'Physics / Applied Physics','url':'https://physics.stanford.edu/news-events/upcoming-events'},
    {'id':'page-biochemistry','name':'Biochemistry','url':'https://biochemistry.stanford.edu/events'},
    {'id':'page-microimmuno','name':'Microbiology & Immunology','url':'https://med.stanford.edu/microimmuno/seminars-and-events/wed-seminars.html','table':True},
    {'id':'page-mathematics','name':'Mathematics','url':'https://mathematics.stanford.edu/events/upcoming-events'},
    {'id':'page-statistics','name':'Statistics','url':'https://statistics.stanford.edu/seminars-events/all-upcoming-events'},
    {'id':'page-cs','name':'Computer Science','url':'https://www.cs.stanford.edu/events'},
]

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', str(value or '')))).strip()

def safe_url(value):
    value=str(value or '').strip()
    p=urllib.parse.urlparse(value)
    return value if p.scheme=='https' and p.hostname and not p.username and not p.password else ''

def get(url, as_json=True):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'ReadingGarden/1.0 (public academic event aggregation)','Accept':'application/json' if as_json else 'text/html'})
            with urllib.request.urlopen(req,timeout=25) as response:
                body=response.read(10000000).decode('utf-8','replace')
            return json.loads(body) if as_json else body
        except Exception:
            if attempt==2:raise
            time.sleep(attempt+1)

def paged(path, key, params=None, loader=get):
    params=dict(params or {}, pp=100)
    def read(page):return loader(API+path+'?'+urllib.parse.urlencode(dict(params,page=page)))
    first=read(1)
    if not isinstance(first.get(key),list):raise ValueError('Unexpected calendar response')
    total=int(first.get('page',{}).get('total',1))
    if total>80:raise ValueError('Calendar pagination exceeds safety limit')
    rows=list(first[key])
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        for data in pool.map(read,range(2,total+1)):
            if not isinstance(data.get(key),list):raise ValueError('Incomplete calendar pagination')
            rows.extend(data[key])
    return rows

def event_rows(event, now, horizon):
    e=event.get('event',event)
    if e.get('private') or e.get('status') in ['canceled','cancelled','deleted'] or e.get('publish_status','published')!='published':return []
    filters=e.get('filters') or {}
    subjects=[x.get('name','') for x in filters.get('event_subject',[])]
    types=[x.get('name','') for x in filters.get('event_types',[])]
    departments=[plain(x.get('name')) for x in e.get('departments',[]) if x.get('name')]
    title=plain(e.get('title'))
    science=any(STEM.search(x) and not EXCLUDE.search(x) for x in departments) or (not departments and any(x in ['Science','Engineering/Technology','Medicine','Environment/Sustainability'] for x in subjects))
    talk=any(x in ['Class/Seminar','Lecture/Presentation/Talk'] for x in types) or bool(TALK.search(title))
    if not science or not talk or not title or NON_RESEARCH.search(title):return []
    url=safe_url(e.get('localist_url'))
    if urllib.parse.urlparse(url).hostname!='events.stanford.edu':return []
    result=[]
    for wrapper in e.get('event_instances',[]):
        instance=wrapper.get('event_instance',wrapper)
        try:
            start=dt.datetime.fromisoformat(instance['start'])
            if not start.tzinfo:start=start.replace(tzinfo=TZ)
            end=dt.datetime.fromisoformat(instance['end']) if instance.get('end') else start
            if not end.tzinfo:end=end.replace(tzinfo=TZ)
        except (ValueError,KeyError,TypeError):continue
        # Keep in-progress talks and undated-time events through the local date.
        if (end<now and not (instance.get('all_day') and start.astimezone(TZ).date()==now.date())) or start>horizon:continue
        result.append({'id':str(e.get('id'))+':'+str(instance.get('id',instance['start'])),'title':title,'start':start.isoformat(),'end':instance.get('end') or '',
          'allDay':bool(instance.get('all_day')),'departments':departments or subjects,'subjects':subjects,'kind':next((x for x in types if x in ['Class/Seminar','Lecture/Presentation/Talk']),'Seminar'),
          'location':plain(e.get('location_name') or e.get('location')),'room':plain(e.get('room_number')),'experience':e.get('experience') or '',
          'url':url,'registrationUrl':safe_url(e.get('ticket_url')),'calendarUrl':safe_url(e.get('localist_ics_url')),'sourceId':'stanford-calendar','sourceStatus':'checked'})
    return result

class Schedule(HTMLParser):
    def __init__(self):
        super().__init__();self.articles=[];self.current=None;self.level=0;self.head=0;self.link=None;self.table=[];self.row=None;self.cell=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='article':self.current={'title':[],'url':'','times':[],'text':[]};self.level=1
        elif self.current and tag not in ['input','br','hr','img','meta','link','source','wbr']:self.level+=1
        if self.current:
            if tag in ['h2','h3']:self.head+=1
            if tag=='a' and self.head and a.get('href'):self.current['url']=a['href']
            if a.get('datetime'):self.current['times'].append(a['datetime'])
            elif a.get('property')=='schema:startDate' and a.get('content'):self.current['times'].append(a['content'])
        if tag=='tr':self.row=[]
        if tag in ['td','th'] and self.row is not None:self.cell=[]
    def handle_endtag(self,tag):
        if tag in ['td','th'] and self.cell is not None:self.row.append(plain(' '.join(self.cell)));self.cell=None
        if tag=='tr' and self.row is not None:self.table.append(self.row);self.row=None
        if self.current:
            if tag in ['h2','h3']:self.head=max(0,self.head-1)
            if tag not in ['input','br','hr','img','meta','link','source','wbr']:self.level-=1
            if self.level==0:self.articles.append(self.current);self.current=None
    def handle_data(self,data):
        if self.current:
            self.current['text'].append(data)
            if self.head:self.current['title'].append(data)
        if self.cell is not None:self.cell.append(data)

def parse_page(source, body, now, horizon):
    parsed=Schedule();parsed.feed(body);rows=[]
    if source.get('table'):
        for cells in parsed.table:
            if len(cells)<3:continue
            try:day=dt.datetime.strptime(cells[0],'%B %d, %Y').date()
            except ValueError:continue
            if not now.date()<=day<=horizon.date():continue
            rows.append({'title':'Wednesday Seminar Series — '+cells[1],'start':day.isoformat(),'allDay':True,'speaker':cells[1],'institution':cells[2],'location':cells[3] if len(cells)>3 else '', 'url':source['url']})
    else:
        for article in parsed.articles:
            title=plain(' '.join(article['title']));times=article['times'];url=safe_url(urllib.parse.urljoin(source['url'],article['url']))
            # Stanford's departmental Drupal listings sometimes render dates as
            # ordinary text instead of time/datetime attributes.
            if not times:
                value=plain(' '.join(article['text']))
                match=re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})',value)
                if match:
                    day=dt.datetime.strptime(' '.join(match.groups()),'%B %d %Y')
                    clock=re.search(r'(\d{1,2}):(\d{2})\s*(am|pm)?(?:\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm))?',value[match.end():],re.I)
                    meridiem=(clock[3] or clock[6]) if clock else None
                    if clock and meridiem:
                        hour=int(clock[1])%12+(12 if meridiem.lower()=='pm' else 0)
                        day=day.replace(hour=hour,minute=int(clock[2] or 0),tzinfo=TZ)
                        times.append(day.isoformat())
                        if clock[4] and clock[6]:
                            finish=day.replace(hour=int(clock[4])%12+(12 if clock[6].lower()=='pm' else 0),minute=int(clock[5] or 0))
                            if finish<day:finish+=dt.timedelta(days=1)
                            times.append(finish.isoformat())
                    else:times.append(day.date().isoformat())
            if not title or not times or not url:continue
            # Department event listings also include receptions/defenses; only research talks.
            if not TALK.search(title+' '+' '.join(article['text'])):continue
            try:
                start=dt.datetime.fromisoformat(times[0].replace('Z','+00:00'))
                if not start.tzinfo:start=start.replace(tzinfo=TZ)
                end=dt.datetime.fromisoformat(times[1].replace('Z','+00:00')) if len(times)>1 else start
                if not end.tzinfo:end=end.replace(tzinfo=TZ)
            except ValueError:continue
            if (end<now and not (len(times[0])==10 and start.date()==now.date())) or start>horizon:continue
            rows.append({'title':title,'start':start.isoformat(),'end':end.isoformat(),'allDay':len(times[0])==10,'location':'','url':url})
    for r in rows:
        r.update(id=source['id']+':'+hashlib.sha256((r['url']+r['start']+r['title']).encode()).hexdigest()[:20],departments=[source['name']],subjects=['Science'],kind='Seminar',room='',experience='',sourceId=source['id'],sourceStatus='checked',registrationUrl='',calendarUrl='')
    recognized=sum(bool(a['times'] and a['title']) for a in parsed.articles)
    return rows, recognized if not source.get('table') else len(parsed.table)

def deduplicate(rows):
    found={};result=[]
    for row in sorted(rows,key=lambda r:r.get('sourceId')!='stanford-calendar'):
        day=row['start'][:10];title=re.sub(r'[^a-z0-9]','',row['title'].lower())
        moment=dt.datetime.fromisoformat(row['start']).astimezone(dt.timezone.utc).isoformat() if len(row['start'])>10 else row['start']
        key=(title,moment)
        # A table schedule may omit the talk title and time. Prefer a matching dated
        # campus event when it explicitly names that speaker; do not invent a time.
        speaker=row.get('speaker','').lower()
        match=next((e for e in result if speaker and speaker in e['title'].lower() and e['start'][:10]==day),None)
        if match:
            match['departments']=list(dict.fromkeys(match['departments']+row['departments']));continue
        if key in found:
            prior=found[key];prior['departments']=list(dict.fromkeys(prior['departments']+row['departments']));continue
        found[key]=row;result.append(row)
    return sorted(result,key=lambda r:(r['start'],r['title']))

def collect(now=None,loader=get,previous=None):
    now=now or dt.datetime.now(TZ);horizon=now+dt.timedelta(days=90);previous=previous or {};rows=[];sources=[];departments=[]
    try:
        entries=paged('events','events',{'start':now.date().isoformat(),'days':90,'sort':'date'},loader)
        for entry in entries:rows.extend(event_rows(entry,now,horizon))
        sources.append({'id':'stanford-calendar','name':'Stanford Events Calendar','url':'https://events.stanford.edu/','status':'checked','count':len(rows)})
    except Exception as error:
        sources.append({'id':'stanford-calendar','name':'Stanford Events Calendar','url':'https://events.stanford.edu/','status':'unavailable','count':0})
        rows.extend(dict(r,sourceStatus='saved') for r in previous.get('events',[]) if r.get('sourceId')=='stanford-calendar')
        print('Calendar check incomplete:',type(error).__name__)
    try:
        entries=paged('departments','departments',loader=loader)
        departments=[{'id':str(e['department']['id']),'name':plain(e['department']['name']),'url':safe_url(e['department'].get('url'))} for e in entries if STEM.search(e['department'].get('name','')) and not EXCLUDE.search(e['department'].get('name',''))]
    except Exception:
        departments=previous.get('departments',[])
        sources.append({'id':'stanford-directory','name':'Stanford department directory','url':'https://events.stanford.edu/department','status':'unavailable','count':0})
    def read_page(source):
        try:
            data,count=parse_page(source,loader(source['url'],False),now,horizon)
            # Empty/unrecognized page is not evidence that there are no seminars.
            return dict(source,status='checked' if count else 'unparsed',count=len(data)),data
        except Exception:return dict(source,status='unavailable',count=0),[]
    with futures.ThreadPoolExecutor(max_workers=3) as pool:
        for source,data in pool.map(read_page,DEPARTMENT_PAGES):
            sources.append(source);rows.extend(data)
            if source['status']!='checked':rows.extend(dict(r,sourceStatus='saved') for r in previous.get('events',[]) if r.get('sourceId')==source['id'])
    events=deduplicate(rows)
    return {'version':1,'checkedAt':now.isoformat(),'windowDays':90,'timezone':'America/Los_Angeles','partial':any(s['status']!='checked' for s in sources),'sources':sources,'departments':departments,'events':events}

if __name__=='__main__':
    path=ROOT/'data/seminar-feed.json'
    previous=json.loads(path.read_text()) if path.exists() else {}
    data=collect(previous=previous);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Collected',len(data['events']),'upcoming STEM talks;',len(data['departments']),'directory entries')
    print('Sources:',json.dumps(data['sources']))
    print('Sample:',json.dumps([{k:e.get(k) for k in ['title','start','departments']} for e in data['events'][:6]]))
