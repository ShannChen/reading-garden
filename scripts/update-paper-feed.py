"""Public bibliographic feed. Never reads private Reading Garden records."""
import json, re, time, html, os
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

OUTPUT = Path('data/paper-feed.json')
QUERIES = ['metabolomics', 'metabolomic', 'microbiome', 'microbiota', 'proteomics', 'proteomic', 'exposome', 'exposomics', 'exposomic', 'epitranscriptomics', 'epitranscriptomic', 'RNA methylation', 'RNA modification', 'm6A', 'pseudouridylation', 'multiomics', 'multi-omics', 'multiomic', 'multi-omic', 'integrated omics']
PREFIXES = ['10.1038', '10.1016', '10.1021', '10.1126']
CELL = {'cell', 'cancer cell', 'developmental cell', 'molecular cell', 'cell metabolism', 'cell host & microbe', 'cell stem cell', 'cell systems', 'cell chemical biology', 'cell reports', 'cell reports medicine', 'cell reports methods', 'cell reports physical science', 'cell reports sustainability', 'cell genomics', 'cell biomaterials', 'cell'+'ular and molecular gastroenterology and hepatology', 'immunity', 'neuron', 'current biology', 'iscience', 'med', 'joule', 'matter', 'chem', 'chem catalysis', 'one earth', 'device', 'patterns', 'structure', 'heliyon', 'biophysical journal', 'the american journal of human genetics', 'molecular plant', 'molecular therapy', 'molecular therapy nucleic acids', 'molecular therapy methods & clinical development', 'molecular therapy oncology', 'plant communications', 'stem cell reports', 'trends in biochemical sciences', 'trends in biotechnology', 'trends in cell biology', 'trends in chemistry', 'trends in cognitive sciences', 'trends in ecology & evolution', 'trends in endocrinology & metabolism', 'trends in genetics', 'trends in immunology', 'trends in microbiology', 'trends in molecular medicine', 'trends in neurosciences', 'trends in parasitology', 'trends in pharmacological sciences', 'trends in plant science'}

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(value or '')))).strip()

def journal_allowed(journal, doi):
    name = plain(journal).lower().replace(' and ', ' & ').replace(':', '')
    if doi.lower().startswith('10.1038/'):
        return name == 'nature' or name.startswith(('nature ', 'npj ', 'communications ')) or name in {'scientific reports', 'scientific data'}
    if doi.lower().startswith('10.1016/'):
        return name in CELL or name.startswith('cell reports ') or name.startswith('molecular therapy ')
    if doi.lower().startswith('10.1126/'):
        return name in {'science', 'science advances', 'science immunology', 'science translational medicine', 'science robotics', 'science signaling'}
    if doi.lower().startswith('10.1021/'):
        return name in {'environmental science & technology', 'environmental science & technology letters'}
    return False

def topics(work):
    text = plain(' '.join(work.get('title', []) + [work.get('abstract', '')] + work.get('subject', []) + (work.get('keyword', []) if isinstance(work.get('keyword', []), list) else [work.get('keyword', '')]))).lower()
    tags = []
    for label, pattern in [('Metabolomics', r'\bmetabolom\w*'), ('Microbiome', r'\b(microbiom\w*|microbiota|metagenom\w*)'), ('Proteomics', r'\bproteom\w*'), ('Exposomics', r'\bexposom\w*')]:
        if re.search(pattern, text): tags.append(label)
    if re.search(r'\bepitranscriptom\w*|\brna (?:methylation|modification\w*)|\bpseudouridylation\b|\bn6[ -]methyladenosine\b', text) or (re.search(r'\bm[156]a\b|\bm5c\b',text) and re.search(r'\b(?:rna|mrna|trna|rrna)\b',text)):
        tags.append('Epitranscriptomics')
    if re.search(r'\bmulti[\s\-‐‑–]?omic\w*|\bintegrat\w* (?:\w+ ){0,2}omics\b', text):
        tags.append('Multiomics')
    return tags

def publication_date(work):
    # Online publication takes precedence over a future print issue.
    for key in ['published-online', 'published', 'issued', 'published-print']:
        parts = work.get(key, {}).get('date-parts', [[]])[0]
        if parts:
            try:
                validated=date(parts[0],parts[1] if len(parts)>1 else 1,parts[2] if len(parts)>2 else 1).isoformat()
                return validated[:10 if len(parts)>=3 else 7 if len(parts)==2 else 4]
            except (ValueError, TypeError): pass
    return None

def paper(work, today):
    doi = work.get('DOI', '').lower().strip()
    journal = (work.get('container-title') or [''])[0]
    tags = topics(work)
    published = publication_date(work)
    title = plain((work.get('title') or [''])[0])
    if not title or not tags or not journal_allowed(journal, doi) or not published or published > today.isoformat(): return None
    if published < (today-timedelta(days=90)).isoformat(): return None
    authors = ', '.join(plain(' '.join(filter(None, [a.get('given'), a.get('family')])) or a.get('name', '')) for a in work.get('author', []))
    return {'doi': doi, 'title': title, 'authors': authors, 'journal': plain(journal), 'published': published, 'year': published[:4], 'tags': tags, 'groups': [g for g, yes in [('metabolomics', bool(set(tags)&{'Metabolomics','Microbiome'})), ('proteomics', 'Proteomics' in tags), ('exposomics', 'Exposomics' in tags), ('epitranscriptomics', 'Epitranscriptomics' in tags), ('multiomics', 'Multiomics' in tags)] if yes], 'link': 'https://doi.org/'+doi, 'matchSource': 'Title, abstract and metadata subjects' if work.get('abstract') else 'Title and available metadata subjects'}

def get_json(url):
    for attempt in range(4):
        try:
            req=Request(url, headers={'User-Agent':'ReadingGarden/1.0 (https://github.com/ShannChen/reading-garden)', 'Accept':'application/json'})
            with urlopen(req, timeout=75) as response: return json.load(response)
        except Exception:
            if attempt == 3: raise
            time.sleep(2**attempt * 3)

def main():
    now=datetime.now(timezone.utc); today=now.date()
    old=json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'papers': []}
    records={p['doi']:p for p in old.get('papers', []) if p.get('published','') >= (today-timedelta(days=90)).isoformat()}
    errors=[]; successful=0; diagnostic=[]
    for prefix in PREFIXES:
        for query in QUERIES:
            cursor='*'; seen=set(); count=0
            try:
                while True:
                    params={'filter': f'prefix:{prefix},type:journal-article,from-pub-date:{(today-timedelta(days=120)).isoformat()},until-pub-date:{today.isoformat()}', 'query':query, 'select':'DOI,title,author,container-title,published,published-online,published-print,issued,abstract,subject', 'rows':1000, 'cursor':cursor}
                    message=get_json('https://api.crossref.org/works?'+urlencode(params))['message']
                    items=message.get('items', [])
                    for work in items:
                        if prefix=='10.1016' and journal_allowed((work.get('container-title') or [''])[0],work.get('DOI','')) and len(diagnostic)<5:
                            diagnostic.append({'journal':work.get('container-title'),'dates':{k:work.get(k) for k in ['published-online','published','issued','published-print']},'doi':work.get('DOI')})
                        p=paper(work, today)
                        if p:
                            p['firstSeen']=records.get(p['doi'], {}).get('firstSeen', now.isoformat())
                            records[p['doi']]=p
                    count+=len(items)
                    next_cursor=message.get('next-cursor')
                    if not items or count>=message.get('total-results',count) or not next_cursor or next_cursor in seen: break
                    if count>=3000: raise RuntimeError('Query exceeded 3000 candidates; results may be incomplete')
                    seen.add(next_cursor);cursor=next_cursor;time.sleep(.5)
                successful+=1
                print(prefix, query, count, 'candidates', flush=True)
            except Exception as error:
                errors.append(prefix+' / '+query+': '+str(error)); print(errors[-1], flush=True)
            time.sleep(.5)
    if not successful: raise RuntimeError('All source queries failed; preserving the existing feed.')
    data={'version':1, 'checkedAt':now.isoformat(), 'lastCompleteCheck':old.get('lastCompleteCheck') if errors else now.isoformat(), 'partial':bool(errors), 'failedQueries':len(errors), 'source':'Crossref', 'windowDays':90, 'papers':sorted(records.values(),key=lambda p:(p['published'],p['doi']),reverse=True)}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    tmp=OUTPUT.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(OUTPUT)
    print('Saved',len(records),'papers;',len(errors),'failed queries')
    print('Cell date diagnostics:',json.dumps(diagnostic))

if __name__ == '__main__': main()
