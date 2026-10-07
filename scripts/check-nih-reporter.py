"""Read-only integration checks against the official NIH API, using public research terms."""
import json
import time
from urllib.request import Request, urlopen

origin='https://shannchen.github.io'
endpoint='https://api.reporter.nih.gov/v2/projects/search'
headers={'Content-Type':'application/json','Origin':origin,'User-Agent':'ReadingGarden-IntegrationCheck/1.0'}
preflight=Request(endpoint,headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},method='OPTIONS')
with urlopen(preflight,timeout=30) as r:
    allowed=r.headers.get('Access-Control-Allow-Origin','')
    if allowed not in ('*',origin):raise ValueError('NIH browser origin is not allowed')
    if 'POST' not in r.headers.get('Access-Control-Allow-Methods','').upper():raise ValueError('NIH browser POST is not allowed')
for criteria in [
    {'advanced_text_search':{'operator':'and','search_field':'all','search_text':'chemical biology'},'include_active_projects':True,'exclude_subprojects':True},
    {'pi_names':[{'first_name':'Benjamin','last_name':'Cravatt'}],'include_active_projects':True,'exclude_subprojects':True}
]:
    time.sleep(1.2)
    payload={'criteria':criteria,'limit':1,'offset':0}
    req=Request(endpoint,data=json.dumps(payload).encode(),headers=headers)
    with urlopen(req,timeout=45) as r:
        if r.headers.get('Access-Control-Allow-Origin','') not in ('*',origin):raise ValueError('NIH response origin is not allowed')
        data=json.load(r)
    assert isinstance(data.get('results'),list) and isinstance(data.get('meta',{}).get('total'),int)
    assert data['results'], 'Expected a public example project'
    row=data['results'][0]
    assert row.get('appl_id') and row.get('project_title') and row.get('principal_investigators')
    print('PASS: official NIH API browser access and '+('PI-name' if 'pi_names' in criteria else 'keyword')+' search; fields include annual funding and institution')
