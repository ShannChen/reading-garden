(function(){
  'use strict';
  const core=ReadingGardenPeopleCore,el=id=>document.getElementById(id),KEY='reading-garden-people-v1';
  let people=[],editing=null,candidate=null,results=[],controller=null,searchToken=0,editorToken=0;const flipped=new Set(),recent=new Map(),pendingRecent=new Set();let recentGeneration=0;
  const copy=x=>JSON.parse(JSON.stringify(x));
  function validate(rows){return Array.isArray(rows)&&rows.length<=10000&&rows.every(core.valid)&&new Set(rows.map(p=>p.id)).size===rows.length;}
  function setState(rows){if(!validate(rows))throw Error('Invalid people records');people=copy(rows);renderPeople();}
  function saveLocal(){localStorage.setItem(storageKey(KEY),JSON.stringify(people));}
  window.ReadingGardenPeople={exportState:()=>copy(people),setState,saveLocal,validateState:validate,importState:rows=>{if(!validate(rows))throw Error('Invalid people records');const map=new Map(people.map(p=>[p.id,p]));for(const p of rows){const old=map.get(p.id);if((!old||p.updated>old.updated)&&!core.duplicate([...map.values()],p,p.id))map.set(p.id,p);}setState([...map.values()]);},close:()=>{el('personEditor').close();editing=null;candidate=null;editorToken++;stopSearch();flipped.clear();recent.clear();pendingRecent.clear();recentGeneration++;}};
  function scholarSearch(p){const u=new URL('https://scholar.google.com/citations');u.searchParams.set('view_op','search_authors');const parts=String(p.name||'').trim().split(/\s+/);const name=parts.filter((part,i)=>i===0||i===parts.length-1||! /^[A-Za-z]\.?$/.test(part)).join(' ');u.searchParams.set('mauthors',name);u.searchParams.set('hl','en');return u.href;}
  function renderPeople(){
    el('peopleView').hidden=view!=='people';el('peopleNav').classList.toggle('active',view==='people');el('peopleCount').textContent=people.length;
    const q=el('peopleSearch').value.trim().toLowerCase();const rows=people.filter(p=>[p.name,p.institution,...p.fields,p.notes].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
    el('peopleCards').innerHTML=rows.length?rows.map(p=>'<article class="card person-card '+(flipped.has(p.id)?'is-flipped':'')+'" data-person-card="'+esc(p.id)+'"><div class="person-card-inner"><div class="person-front" '+(flipped.has(p.id)?'inert aria-hidden="true"':'')+'><h2><button type="button" class="person-name-button" data-flip-person="'+esc(p.id)+'" aria-label="Show recent papers by '+esc(p.name)+'">'+esc(p.name)+'</button></h2><p class="meta">'+esc(p.institution||'Institution not specified')+'</p><div class="tags">'+p.fields.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div>'+(p.notes?'<p class="meta">'+esc(p.notes.slice(0,160))+'</p>':'')+'<p class="small person-flip-hint">Click to turn over · Recent papers ↻</p><div class="cardbottom"><a href="'+esc(p.scholarUrl||scholarSearch(p))+'" target="_blank" rel="noopener noreferrer">'+(p.scholarUrl?'Google Scholar ↗':'Find on Scholar ↗')+'</a><button type="button" class="secondary" data-edit-person="'+esc(p.id)+'">Edit</button></div></div><div class="person-back" '+(!flipped.has(p.id)?'inert aria-hidden="true"':'')+'><div class="person-back-header"><div><span class="eyebrow">RECENT PAPERS</span><h3>'+esc(p.name)+'</h3></div><button type="button" class="secondary" data-back-person="'+esc(p.id)+'" aria-label="Turn back to '+esc(p.name)+'">↶ Back</button></div><div class="person-recent-papers">'+recentHtml(p)+'</div><div class="person-back-footer"><button type="button" class="secondary" data-edit-person="'+esc(p.id)+'">Edit person</button><span class="small">Latest indexed publications · OpenAlex</span></div></div></div></article>').join(''):'<div class="empty"><h2>'+(people.length?'No matching people':'Build your research network')+'</h2><p>Search for a researcher above, review their details, and add them here.</p></div>';
    el('peopleCards').querySelectorAll('[data-edit-person]').forEach(b=>b.onclick=e=>{e?.stopPropagation();edit(people.find(p=>p.id===b.dataset.editPerson));});
    el('peopleCards').querySelectorAll('[data-flip-person]').forEach(b=>b.onclick=e=>{e?.stopPropagation();turn(b.dataset.flipPerson,true);});
    el('peopleCards').querySelectorAll('[data-back-person]').forEach(b=>b.onclick=e=>{e?.stopPropagation();turn(b.dataset.backPerson,false);});
    el('peopleCards').querySelectorAll('[data-person-card]').forEach(card=>card.onclick=e=>{if(e.target.closest('a,button,input,select,textarea'))return;const id=card.dataset.personCard;turn(id,!flipped.has(id));});
    el('peopleCards').querySelectorAll('[data-recent-add]').forEach(b=>b.onclick=e=>{e?.stopPropagation();addRecent(b.dataset.recentAdd,b.dataset.recentPerson);});
  }
  function identity(p){return p.openalexId||p.orcid||'';}
  function paperLink(w){if(/^https:\/\/doi\.org\/10\.\d{4,9}\/\S+$/i.test(w.doi||''))return w.doi;const id=String(w.id||'').match(/(?:^|\/)(W\d+)$/)?.[1];return id?'https://openalex.org/'+id:'';}
  function alreadySaved(w){const link=paperLink(w),doi=String(w.doi||'').replace(/^https?:\/\/doi\.org\//i,'').toLowerCase();return papers.some(p=>doi?String(p.link||'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase()===doi:p.link===link);}
  function recentHtml(p){
    if(!identity(p))return '<p class="meta">Connect an academic profile to see this person’s publications. Search their name above and select the correct researcher, then save.</p>';
    const entry=recent.get(identity(p));
    if(!entry)return '<p class="meta" role="status">Loading recent publications…</p>';
    if(entry.error)return '<p class="meta" role="status">Recent papers could not be loaded. Turn back and reopen the card to try again.</p>';
    if(!entry.works.length)return '<p class="meta">No recent publications were found in the index.</p>';
    return '<ol class="recent-paper-list">'+entry.works.map((w,i)=>'<li><a href="'+esc(paperLink(w))+'" target="_blank" rel="noopener noreferrer">'+esc(w.display_name||w.title||'Untitled publication')+'</a><div class="small">'+esc(w.primary_location?.source?.display_name||'Source not listed')+' · '+esc(w.publication_date||String(w.publication_year||'Date not listed'))+'</div><button type="button" class="secondary recent-add" data-recent-add="'+i+'" data-recent-person="'+esc(p.id)+'" '+(alreadySaved(w)?'disabled':'')+'>'+(alreadySaved(w)?'In your library':'＋ To Read')+'</button></li>').join('')+'</ol><p class="small">Checked '+new Date(entry.checkedAt).toLocaleDateString('en-US')+'. Indexing may lag behind publication.</p>';
  }
  function turn(id,back){
    const p=people.find(p=>p.id===id);if(!p)return;
    if(back)flipped.add(id);else flipped.delete(id);
    const card=[...el('peopleCards').querySelectorAll('[data-person-card]')].find(c=>c.dataset.personCard===id);
    if(card){card.classList.toggle('is-flipped',back);const front=card.querySelector('.person-front'),rear=card.querySelector('.person-back');front.inert=back;rear.inert=!back;front.setAttribute('aria-hidden',String(back));rear.setAttribute('aria-hidden',String(!back));}
    const selector=back?'[data-back-person]':'[data-flip-person]',field=back?'backPerson':'flipPerson';
    [...el('peopleCards').querySelectorAll(selector)].find(b=>b.dataset[field]===id)?.focus?.();
    if(back)loadRecent(p);
  }
  async function loadRecent(p){
    const key=identity(p),cached=recent.get(key);if(!key||pendingRecent.has(key)||(cached&&!cached.error&&Date.now()-cached.checkedAt<86400000))return;
    pendingRecent.add(key);recent.delete(key);const token=recentGeneration,namespace=storageNamespace;
    try{
      let author=p.openalexId;
      if(!author&&p.orcid){const r=await fetch('https://api.openalex.org/authors/'+encodeURIComponent(p.orcid),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const a=core.author(await r.json());author=a.openalexId;}
      if(!/^A\d+$/.test(author))throw Error();
      const u=new URL('https://api.openalex.org/works');u.searchParams.set('filter','authorships.author.id:'+author+',to_publication_date:'+new Date().toISOString().slice(0,10));u.searchParams.set('sort','publication_date:desc');u.searchParams.set('per_page','8');
      const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const json=await r.json();if(!Array.isArray(json.results))throw Error();
      if(token!==recentGeneration||namespace!==storageNamespace||!people.some(person=>person.id===p.id&&identity(person)===key))return;
      const works=[...new Map(json.results.filter(w=>paperLink(w)&&(w.authorships||[]).some(a=>String(a.author?.id||'').endsWith('/'+author))).map(w=>[w.doi||w.id,w])).values()].sort((a,b)=>String(b.publication_date||'').localeCompare(String(a.publication_date||''))).slice(0,8);
      recent.set(key,{works,checkedAt:Date.now()});
    }catch{if(token===recentGeneration&&namespace===storageNamespace)recent.set(key,{error:true});}
    finally{if(token===recentGeneration){pendingRecent.delete(key);const current=people.find(person=>person.id===p.id&&identity(person)===key);const card=[...el('peopleCards').querySelectorAll('[data-person-card]')].find(c=>c.dataset.personCard===p.id);if(current&&card){card.querySelector('.person-recent-papers').innerHTML=recentHtml(current);card.querySelectorAll('[data-recent-add]').forEach(b=>b.onclick=e=>{e?.stopPropagation();addRecent(b.dataset.recentAdd,p.id);});}}}
  }
  function addRecent(index,personId){
    const p=people.find(p=>p.id===personId),work=p&&recent.get(identity(p))?.works?.[Number(index)];if(!work||alreadySaved(work))return;
    const authors=(work.authorships||[]).map(a=>a.author?.display_name).filter(Boolean).join(', ');
    papers.push({id:crypto.randomUUID(),title:work.display_name||work.title||'Untitled publication',authors,journal:work.primary_location?.source?.display_name||'',year:String(work.publication_year||''),status:'todo',link:paperLink(work),category:'',tags:p.fields.slice(0,6),question:'',findings:'',notes:'',toShare:false,updated:Date.now()});persist();toast('Added to To Read.');
  }
  function stopSearch(){searchToken++;if(controller)controller.abort();controller=null;}
  async function search(){
    stopSearch();const name=el('personLookup').value.trim(),token=searchToken;if(name.length<2){el('peopleLookupStatus').textContent='Enter at least two characters.';return;}
    controller=new AbortController();const current=controller,timeout=setTimeout(()=>current.abort(),15000);el('peopleLookupStatus').textContent='Searching researchers…';el('peopleLookupResults').replaceChildren();results=[];
    try{const u=new URL('https://api.openalex.org/authors');u.searchParams.set('search',name);u.searchParams.set('per_page','10');const response=await fetch(u,{signal:current.signal});if(!response.ok)throw Error(response.status===429?'rate':'unavailable');const data=await response.json();if(token!==searchToken||el('personLookup').value.trim()!==name||view!=='people')return;
      if(!Array.isArray(data.results))throw Error('unavailable');results=data.results.map(core.author).filter(a=>a.name&&a.openalexId);const school=core.norm(el('personSchool').value);if(school)results=results.filter(a=>core.norm(a.institution).includes(school));
      el('peopleLookupStatus').textContent=results.length?'Select the right researcher. Institutions are the latest recorded affiliations; research areas are inferred from publications.':'No matching researcher found. Try the name without an institution filter, or add the details manually.';
      el('peopleLookupResults').innerHTML=results.map((p,i)=>'<button type="button" class="lookup-choice" data-author-result="'+i+'"><strong>'+esc(p.name)+'</strong><span>'+esc(p.institution||'No affiliation available')+'</span><span>'+esc(p.fields.join(' · ')||'No research areas available')+'</span><span>'+p.worksCount+' indexed publications · '+esc(p.openalexId)+'</span></button>').join('');el('peopleLookupResults').querySelectorAll('[data-author-result]').forEach(b=>b.onclick=()=>edit(results[Number(b.dataset.authorResult)]));
    }catch(e){if(token===searchToken)el('peopleLookupStatus').textContent=e.message==='rate'?'Search limit reached. Try again later, or add a person manually.':'Researcher search is unavailable right now. You can still add a person manually.';}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  function edit(p){
    if(p&&!p.id){const existing=core.duplicate(people,p);if(existing){toast('This researcher is already in People.');p={...existing,openalexId:existing.openalexId||p.openalexId,orcid:existing.orcid||p.orcid,source:existing.openalexId?existing.source:'OpenAlex'};}}
    editing=p?.id||null;candidate=p?copy(p):{name:'',institution:'',fields:[],scholarUrl:'',notes:'',openalexId:'',orcid:'',source:'Manual'};const token=++editorToken;
    const f=el('personForm');f.reset();for(const key of ['name','institution','scholarUrl','notes'])f.elements[key].value=candidate[key]||'';f.elements.fields.value=(candidate.fields||[]).join(', ');
    el('personDialogTitle').textContent=editing?'Edit person':'Add person';el('deletePerson').hidden=!editing;el('personError').textContent='';el('personSource').textContent=candidate.source==='OpenAlex'?'Details from OpenAlex. Confirm affiliation and research areas before saving.':'Enter this researcher’s details.';
    el('personScholarSearch').href=scholarSearch(candidate);el('personScholarSearch').hidden=!candidate.name;el('personOpenAlex').hidden=!candidate.openalexId;if(candidate.openalexId)el('personOpenAlex').href='https://openalex.org/'+candidate.openalexId;
    el('personEditor').showModal();if(!candidate.scholarUrl&&candidate.orcid)lookupScholar(candidate.orcid,token);
  }
  async function lookupScholar(orcid,token){
    const id=orcid.split('/').pop();if(!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id))return;
    try{const q='SELECT DISTINCT ?scholar WHERE { ?person wdt:P496 "'+id+'"; wdt:P1960 ?scholar. } LIMIT 3';const u=new URL('https://query.wikidata.org/sparql');u.searchParams.set('query',q);u.searchParams.set('format','json');const r=await fetch(u,{signal:AbortSignal.timeout(8000)});if(!r.ok)return;const json=await r.json();if(token!==editorToken||!el('personEditor').open||el('personForm').elements.scholarUrl.value.trim())return;const ids=[...new Set((json.results?.bindings||[]).map(x=>x.scholar?.value).filter(x=>/^[\w-]{5,64}$/.test(x)))];if(ids.length===1){el('personForm').elements.scholarUrl.value='https://scholar.google.com/citations?user='+ids[0];el('personSource').textContent+=' Scholar link matched by ORCID in Wikidata; review before saving.';}}
    catch{}
  }
  el('personForm').onsubmit=e=>{e.preventDefault();const f=e.target,scholarUrl=core.scholar(f.elements.scholarUrl.value);if(scholarUrl===null){el('personError').textContent='Use a Google Scholar profile URL containing citations?user=… , or leave it empty.';return;}
    const p={id:editing||crypto.randomUUID(),name:f.elements.name.value.trim(),institution:f.elements.institution.value.trim(),fields:[...new Set(f.elements.fields.value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean))],scholarUrl,notes:f.elements.notes.value.trim(),openalexId:candidate?.openalexId||'',orcid:candidate?.orcid||'',source:candidate?.source||'Manual',updated:Date.now()};if(!core.valid(p)){el('personError').textContent='Enter a name and up to 20 research areas.';return;}if(core.duplicate(people,p,editing)){el('personError').textContent='This person is already saved. Open their existing card to edit it.';return;}people=editing?people.map(x=>x.id===editing?p:x):[...people,p];persist();el('personEditor').close();toast('Person saved.');};
  el('deletePerson').onclick=()=>{const p=people.find(p=>p.id===editing);if(p&&confirm('Delete '+p.name+' from People?')){people=people.filter(p=>p.id!==editing);persist();el('personEditor').close();toast('Person deleted.');}};
  el('personLookupForm').onsubmit=e=>{e.preventDefault();search();};el('personLookup').addEventListener('input',()=>{stopSearch();el('peopleLookupResults').replaceChildren();el('peopleLookupStatus').textContent='';});
  el('peopleNav').onclick=()=>{view='people';render();};el('addPerson').onclick=()=>edit();el('peopleSearch').addEventListener('input',renderPeople);el('closePerson').onclick=()=>el('personEditor').close();el('personEditor').addEventListener('close',()=>{editorToken++;});
  for(const field of ['name','institution'])el('personForm').elements[field].addEventListener('input',()=>{el('personScholarSearch').href=scholarSearch({name:el('personForm').elements.name.value,institution:el('personForm').elements.institution.value});el('personScholarSearch').hidden=!el('personForm').elements.name.value.trim();});
  el('personEditor').addEventListener('click',e=>{const d=e.currentTarget,r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});
  addEventListener('storage',e=>{if(!storageNamespace&&e.key===storageKey(KEY))try{setState(JSON.parse(e.newValue||'[]'));}catch{}});
  const previousRender=render;render=function(){previousRender();renderPeople();};try{setState(JSON.parse(localStorage.getItem(storageKey(KEY))||'[]'));}catch{setState([]);}renderPeople();
})();
