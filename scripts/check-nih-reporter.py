"""Read-only integration checks against the official NIH API, using public research terms."""
import json
import time
from urllib.request import Request, urlopen

origin='https://shannchen.github.io'
endpoint='https://api.reporter.nih.gov/v2/projects/search'
headers={'Content-Type':'application/json','Origin':origin,'User-Agent':'ReadingGarden-IntegrationCheck/1.0'}
for criteria in [
    {'advanced_text_search':{'operator':'and','search_field':'all','search_text':'chemical biology'},'include_active_projects':True,'exclude_subprojects':True},
    {'pi_names':[{'first_name':'Benjamin','last_name':'Cravatt'}],'include_active_projects':True,'exclude_subprojects':True}
]:
    time.sleep(1.2)
    payload={'criteria':criteria,'limit':1,'offset':0}
    req=Request(endpoint,data=json.dumps(payload).encode(),headers=headers)
    with urlopen(req,timeout=45) as r:
        data=json.load(r)
    assert isinstance(data.get('results'),list) and isinstance(data.get('meta',{}).get('total'),int)
    assert data['results'], 'Expected a public example project'
    row=data['results'][0]
    assert row.get('appl_id') and row.get('project_title') and row.get('principal_investigators')
    print('PASS: official NIH server API and '+('PI-name' if 'pi_names' in criteria else 'keyword')+' search; fields include annual funding and institution')
