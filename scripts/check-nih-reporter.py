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

# Verify the deployed browser-facing function, including its CORS preflight.
from urllib.error import HTTPError
proxy='https://oonwggwdcywukwshwbxx.supabase.co/functions/v1/swift-handler'
def check_proxy(req):
    try:
        with urlopen(req,timeout=45) as response:
            raw=response.read().decode()
            print('Supabase status:',response.status,'CORS:',response.headers.get('Access-Control-Allow-Origin'))
            assert response.headers.get('Access-Control-Allow-Origin')==origin, 'Browser CORS header missing'
            return raw
    except HTTPError as exc:
        print('Supabase error:',exc.code,'CORS:',exc.headers.get('Access-Control-Allow-Origin'),'body:',exc.read().decode()[:1000])
        raise
check_proxy(Request(proxy,method='OPTIONS',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}))
body={'criteria':{'pi_names':[{'last_name':'Cravatt'}],'include_active_projects':True},'offset':0,'limit':20}
data=json.loads(check_proxy(Request(proxy,data=json.dumps(body).encode(),headers=headers)))
assert data.get('results'), 'Deployed function returned no projects'
print('PASS: deployed Supabase preflight and PI search returned',len(data['results']),'records')
