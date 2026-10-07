"""Public funding metadata only; never reads personal Reading Garden data."""
import hashlib
import html
import json
import re
import time
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/funding-feed.json'
CATALOG = ROOT / 'data/funding-sources.json'
AREAS = json.loads((ROOT / 'data/funding-areas.json').read_text())
SEARCHES = [(keyword, area['name']) for area in AREAS for keyword in area['keywords']]
MONTHS = {m.lower(): i for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], 1)}
DATE_RE = re.compile(r'\b(' + '|'.join(MONTHS) + r')\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})\b', re.I)
DEADLINE_RE = re.compile(r'\b(deadline|applications? due|apply by|applications? close|open until|due on)\b', re.I)

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.lines = []
        self.parts = []
        self.links = []
        self.main_links = []
        self.anchor = None
        self.main = False
        self.main_seen = False
        self.main_lines = []
    def flush(self):
        text = re.sub(r'\s+', ' ', ' '.join(self.parts)).strip()
        if text:
            self.lines.append(text)
            if self.main:
                self.main_lines.append(text)
        self.parts = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
        if tag == 'main':
            self.flush(); self.main = True; self.main_seen = True
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'tr', 'br'):
            self.flush()
        if tag == 'a':
            self.anchor = [attrs.get('href', ''), [], self.main]
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'tr'):
            self.flush()
        if tag == 'main':
            self.flush(); self.main = False
        if tag == 'a' and self.anchor:
            link = (self.anchor[0], re.sub(r'\s+', ' ', ' '.join(self.anchor[1])).strip())
            self.links.append(link)
            if self.anchor[2]: self.main_links.append(link)
            self.anchor = None
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)
            if self.anchor:
                self.anchor[1].append(data)
    def text_lines(self):
        self.flush()
        return self.main_lines if self.main_seen and self.main_lines else self.lines

def deadline_candidates(lines):
    """Keep explicit-year dates near deadline labels. Never infer a recurring year or open status."""
    candidates = set()
    for i, line in enumerate(lines):
        if not DEADLINE_RE.search(line) or re.search(r'reference|recommendation|degree conferr|interview|supervisor.*letter', line, re.I):
            continue
        # A heading's next block often holds the date. Do not scan the whole page.
        next_line = lines[i + 1] if i + 1 < len(lines) else ''
        starts_date = re.match(r'^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:' + '|'.join(MONTHS) + r')\s+\d', next_line, re.I)
        nearby = line + (' ' + next_line if len(line) < 100 and starts_date and not DATE_RE.search(line) else '')
        dates = list(DATE_RE.finditer(nearby))
        for label in DEADLINE_RE.finditer(nearby):
            # Keep the date beside each deadline label, not degree or award-start dates elsewhere in a paragraph.
            after = [d for d in dates if d.start() >= label.end() and d.start() - label.end() < 100]
            before = [d for d in dates if d.end() <= label.start() and label.start() - d.end() < 35]
            chosen = min(after, key=lambda d: d.start() - label.end(), default=None) or min(before, key=lambda d: label.start() - d.end(), default=None)
            if chosen:
                month, day, year = chosen.groups()
                try:
                    candidates.add(date(int(year), MONTHS[month.lower()], int(day)).isoformat())
                except ValueError:
                    pass
    return sorted(candidates)

def read(url, body=None):
    headers = {'User-Agent': 'ReadingGarden-PublicFundingMonitor/1.0', 'Accept': 'application/json' if body is not None else 'text/html'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urlopen(req, timeout=25) as response:
        data = response.read(4_000_001)
        if len(data) > 4_000_000:
            raise ValueError('Source exceeds size limit')
        return data.decode('utf-8', errors='replace')

def gov_date(value):
    try:
        return datetime.strptime(value, '%m/%d/%Y').date().isoformat()
    except (ValueError, TypeError):
        return ''

def stage(title):
    if re.search(r'\bF31\b|predoctoral.*fellowship|graduate.*fellowship', title, re.I):
        return 'phd'
    if re.search(r'\bF32\b|postdoctoral.*fellowship', title, re.I):
        return 'postdoc'
    return 'grant'

def government(fetch=read, today=None):
    today = today or datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat()
    found, failures = {}, []
    for keyword, field in SEARCHES:
        try:
            offset = 0
            for _ in range(5):
                result = json.loads(fetch('https://api.grants.gov/v1/api/search2', {'keyword': keyword, 'rows': 100, 'startRecordNum': offset, 'oppStatuses': 'posted|forecasted'}))
                if result.get('errorcode') != 0 or not isinstance(result.get('data', {}).get('oppHits'), list):
                    raise ValueError('Invalid Grants.gov response')
                data = result['data']; hits = data['oppHits']
                for hit in hits:
                    ident = str(hit.get('id', ''))
                    if not ident.isdigit() or not hit.get('title') or hit.get('oppStatus') not in ('posted', 'forecasted'):
                        continue
                    deadline = gov_date(hit.get('closeDate'))
                    if deadline and deadline < today:
                        continue
                    old = found.get(ident)
                    if old:
                        old['fields'] = sorted(set(old['fields'] + [field])); continue
                    title = html.unescape(hit['title'])
                    found[ident] = {'id': 'gov-' + ident, 'title': title, 'kind': stage(title), 'scope': 'national',
                        'provider': hit.get('agencyName') or hit.get('agencyCode') or 'Grants.gov',
                        'url': 'https://www.grants.gov/search-results-detail/' + ident, 'fields': [field],
                        'eligibility': 'See the official announcement for applicant type, citizenship, institution and career-stage requirements.',
                        'dates': [deadline] if deadline else [], 'dateType': 'official-closing-date',
                        'status': hit['oppStatus'], 'checkedAt': datetime.now(timezone.utc).isoformat(), 'sourceStatus': 'checked',
                        'source': 'Grants.gov', 'summary': 'Matched official funding search: ' + keyword + '.', 'updatedAt': datetime.now(timezone.utc).isoformat()}
                offset += len(hits)
                if not hits or offset >= int(data.get('hitCount', offset)):
                    break
            else:
                failures.append('Grants.gov: ' + keyword + ' (more results available)')
        except Exception as exc:
            failures.append('Grants.gov: ' + keyword + ' (' + type(exc).__name__ + ')')
        time.sleep(.2)
    return list(found.values()), failures

def monitor(source, previous, fetch=read):
    now = datetime.now(timezone.utc).isoformat()
    record = {**source, 'dates': [], 'dateType': 'page-dates', 'status': 'cycle-unconfirmed', 'sourceStatus': 'unavailable', 'checkedAt': None}
    try:
        page = None
        for url in [source['url'], *source.get('fallbackUrls', [])]:
            try:
                page = Page(); page.feed(fetch(url)); lines = page.text_lines()
                if len(' '.join(lines)) < 80: raise ValueError('Empty source')
                record['url'] = url
                break
            except Exception:
                page = None
        if page is None: raise ValueError('All source pages unavailable')
        if len(' '.join(lines)) < 80:
            raise ValueError('Empty or script-only source')
        digest = hashlib.sha256('\n'.join(lines).encode()).hexdigest()
        record.update(dates=[] if source.get('discover') else deadline_candidates(lines), checkedAt=now, sourceStatus='checked', fingerprint=digest,
            updatedAt=previous.get('updatedAt', now) if previous.get('fingerprint') == digest else now)
        return record, page
    except Exception:
        if previous:
            record.update({k: previous[k] for k in ('dates', 'checkedAt', 'fingerprint', 'updatedAt') if k in previous})
        return record, None

def discover(source, page):
    if not page or not source.get('discover'):
        return []
    if source.get('discover') in ('stanford-postdoc', 'stanford-mchri'):
        return discover_stanford_postdocs(source, page)
    results = []
    for href, title in page.main_links if page.main_seen else page.links:
        url = urljoin(source['url'], href)
        # Only public Stanford program pages on the specified official host/path.
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.netloc != urlparse(source['url']).netloc or parsed.query or parsed.fragment:
            continue
        if not parsed.path.startswith('/opportunities/') or url == source['url']:
            continue
        if not re.search(r'grant|funding|fellowship', title, re.I) or not re.search(r'chem|medicin|biolog|proteom|metabol|seed|alliance', title, re.I):
            continue
        results.append({'id': 'stanford-' + hashlib.sha256(url.encode()).hexdigest()[:16], 'title': title,
            'kind': 'grant', 'scope': 'stanford', 'provider': 'Stanford Sarafan ChEM-H', 'url': url,
            'fields': ['Chemical biology & Small molecules', 'Drug discovery & Pharmacology', 'Biochemistry & Structural biology', 'Biomedical & Translational research'], 'eligibility': 'See this Stanford program for affiliation, project and investigator requirements.',
            'summary': 'Discovered on the official Stanford ChEM-H funding directory.'})
    return list({r['url']: r for r in results}.values())[:20]

def discover_stanford_postdocs(source, page):
    """Follow program links from OPA's curated directory across official Stanford hosts."""
    results = {}
    for href, title in page.main_links if page.main_seen else page.links:
        url = urljoin(source['url'], href)
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or not host.endswith('.stanford.edu') or parsed.query or parsed.fragment or url == source['url']:
            continue
        mchri = source.get('discover') == 'stanford-mchri'
        if not mchri and host == 'postdocs.stanford.edu' and not parsed.path.startswith('/current/fellowship/'):
            continue
        if mchri and not parsed.path.startswith(('/mchri/funding_opportunities/', '/mchri/programs/')):
            continue
        if mchri and re.search(r"master.*tuition|return to", title, re.I):
            continue
        if not re.search(r'fellowship|postdoctoral|postdoc|scholar.*award|early career award|science fellows|data science fellows|mccormick|human performance.*funding|clinical.*trainee|research.to.impact|trainee pilot grant', title, re.I):
            continue
        if re.search(r'policy|budget|benefit|guide|rate sheet|proposal|funding guidelines', title, re.I):
            continue
        fields = ['Broad STEM / Interdisciplinary']
        if re.search(r'humanities|chinese studies|buddhist|asia|japan|democracy|ethics|impact labs|sparq|organizational|international security|young scholars|king center', title, re.I):
            fields = ['Humanities & Social sciences']
        elif re.search(r'neuro', title, re.I):
            fields = ['Neuroscience', 'Biomedical & Translational research']
        elif re.search(r'medic|berry|levy|mccormick|henzl|propel|biodesign|T32', title, re.I):
            fields = [a['name'] for a in AREAS if a['name'] not in ('Environmental health & Exposomics', 'Broad STEM / Interdisciplinary')]
        elif re.search(r'planetary|food security|sustainab|geophys|energy', title, re.I):
            fields = ['Environmental health & Exposomics', 'Broad STEM / Interdisciplinary']
        elif re.search(r'data science|HAI', title, re.I):
            fields = ['Computational biology & Bioinformatics', 'Broad STEM / Interdisciplinary']
        if mchri:
            fields = ['Biomedical & Translational research', 'Molecular & Cell biology', 'Genetics, Genomics & Epigenetics', 'Microbiome & Microbiology', 'Immunology & Cancer biology', 'Computational biology & Bioinformatics']
        results[url] = {'id':'stanford-opa-' + hashlib.sha256(url.encode()).hexdigest()[:16],
            'title':title, 'kind':'grant' if mchri and re.search(r'research.to.impact|pilot grant', title, re.I) else 'postdoc', 'scope':'stanford', 'provider':'Stanford MCHRI' if mchri else 'Stanford University',
            'url':url, 'fields':fields, 'sourceDirectory':source['url'],
            'summary':'Listed in the official Stanford '+('MCHRI' if mchri else 'OPA')+' funding directory. Verify the program type and current cycle; directory listing does not establish application availability.',
            'eligibility':'See the official program page for affiliation, degree timing, research-area, sponsor and other eligibility requirements. Directory listing does not confirm that applications are open.'}
    return list(results.values())[:60]

def url_key(url):
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower().removeprefix('www.')
    path = parsed.path.replace('/content/sm/', '/') if host == 'med.stanford.edu' else parsed.path
    return host + path.removesuffix('.html').rstrip('/')

def main():
    old = {}
    try:
        old = {r['id']: r for r in json.loads(OUTPUT.read_text())['opportunities']}
    except (OSError, ValueError, KeyError):
        pass
    sources = json.loads(CATALOG.read_text())
    records, failures, known = [], [], set()
    pending = list(sources)
    for source in pending:
        if url_key(source['url']) in known:
            continue
        known.add(url_key(source['url']))
        record, page = monitor(source, old.get(source['id'], {})); records.append(record)
        if record['sourceStatus'] != 'checked':
            failures.append(source['title'])
            if source.get('discover') in ('stanford-postdoc', 'stanford-mchri'):
                pending.extend({**r, 'sourceStatus':'unavailable'} for r in old.values() if r.get('sourceDirectory') == source['url'])
        pending.extend(discover(source, page))
        time.sleep(.2)
    grants, government_failures = government(); failures.extend(government_failures)
    if government_failures:
        ids = {r['id'] for r in grants}
        grants.extend({**r, 'sourceStatus': 'unavailable'} for r in old.values() if r['id'].startswith('gov-') and r['id'] not in ids)
    records.extend(grants)
    output = {'version': 1, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'partial': bool(failures),
        'failedSources': failures, 'opportunities': records}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f'Funding feed: {len(records)} opportunities; {len(failures)} incomplete source checks')

if __name__ == '__main__':
    main()
