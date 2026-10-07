(function(){
  'use strict';
  const prefs=ReadingGardenFeedPreferences,el=id=>document.getElementById(id),key='reading-garden-feed-settings-v1',publicKey='reading-garden-public-feed-v1';
  const copy=x=>JSON.parse(JSON.stringify(x));
  let settings=prefs.sharedState(),feed=null,group='',loading=false,custom={},running=false,generation=0;
  const state=()=>[copy(settings)],localKey=()=>storageKey(key),resultsKey=()=>storageKey('reading-garden-custom-feed-results-v1');
  const collected=p=>papers.some(saved=>String(saved.link||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase()===p.doi);
  function localSave(){localStorage.setItem(localKey(),JSON.stringify(state()));}
  function useState(rows){if(!prefs.validState(rows))throw Error('Invalid feed settings');const next=prefs.sharedState(rows[0]);if(JSON.stringify(next)!==JSON.stringify(settings)){settings=next;generation++;}renderFeed();}
  function loadLocal(){try{const saved=localStorage.getItem(localKey());useState(saved?JSON.parse(saved):[]);}catch{useState([]);}try{custom=JSON.parse(localStorage.getItem(resultsKey())||'{}');}catch{custom={};}renderFeed();}
  window.ReadingGardenFeeds={exportState:state,saveLocal:localSave,setState:rows=>{useState(rows);custom={};try{custom=JSON.parse(localStorage.getItem(resultsKey())||'{}');}catch{}},getJournals:()=>[...settings.journals],addJournal:title=>{const journals=[...settings.journals];if(journals.some(j=>prefs.norm(j)===prefs.norm(title)))return 'This journal is already selected.';journals.push(title.trim());if(!prefs.validJournals(journals))return 'Use a full journal title (up to 150 characters / 200 journals).';setJournals(journals);return '';},validateState:prefs.validState,importState:rows=>{if(!prefs.validState(rows))throw Error('Invalid feed settings');if(rows[0]&&rows[0].updated>=settings.updated)useState(rows);}};
  function saveSettings(){settings.updated=Date.now();generation++;persist();renderSettings();renderFeed();checkCustom();}
  function setJournals(journals){settings.journals=[...journals];settings.subscriptions=settings.subscriptions.map(s=>({...s,journals:[...journals],families:[]}));saveSettings();}
  function renderJournals(){
    el('selectedJournals').innerHTML=settings.journals.length?settings.journals.map((j,i)=>'<div class="selected-journal"><span>'+esc(j)+'</span><button type="button" class="secondary" data-remove-journal="'+i+'" aria-label="'+esc('Remove '+j)+'">×</button></div>').join(''):'<p class="small">No journals selected. Add journals below to start checking your topics.</p>';
    el('selectedJournals').querySelectorAll('[data-remove-journal]').forEach(b=>b.onclick=()=>setJournals(settings.journals.filter((_,i)=>i!==Number(b.dataset.removeJournal))));
  }
  function subscription(){return settings.subscriptions.find(s=>s.id===group&&s.enabled);}
  function rowsFor(s){if(!s)return [];const today=new Date().toISOString().slice(0,10),start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-90);
    const base=(feed?.papers||[]).filter(p=>p.published>=start.toISOString().slice(0,10)&&p.published<=today&&prefs.matches([p.title,...p.tags].join(' '),s));const cached=custom[s.id];const extra=cached?.signature===prefs.signature(s)?cached.papers:[];return [...new Map([...base,...extra].filter(p=>p.published>=start.toISOString().slice(0,10)&&p.published<=today&&prefs.scoped(p,s)).map(p=>[p.doi,p])).values()].sort((a,b)=>b.published.localeCompare(a.published)||a.doi.localeCompare(b.doi));}
  function displayDate(value){return value?new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not checked yet';}
  function bindNav(){
    const box=el('feedNav');box.innerHTML=settings.subscriptions.filter(s=>s.enabled).map(s=>'<button type="button" data-feed="'+esc(s.id)+'">'+esc(s.name)+' <span>'+rowsFor(s).length+'</span></button>').join('');
    box.querySelectorAll('[data-feed]').forEach(b=>{b.classList.toggle('active',view==='feed'&&b.dataset.feed===group);b.onclick=()=>{view='feed';group=b.dataset.feed;el('feedSearch').value='';render();refresh();checkCustom();};});
  }
  function renderFeed(){
    el('feedView').hidden=view!=='feed';if(!subscription())group=settings.subscriptions.find(s=>s.enabled)?.id||'';bindNav();if(view!=='feed')return;
    const s=subscription();el('feedTitle').textContent=s?.name||'Your research subscriptions';
    const cache=s&&custom[s.id],isDefault=s&&prefs.standard(s);
    el('feedChecked').textContent=s&&!s.journals.length&&!s.families.length?'Add journals in Customize feed to check this topic.':!s?'Add or enable a subscription in Customize feed.':isDefault?'Last checked '+displayDate(feed?.checkedAt)+(feed?.partial?' · Some source queries were incomplete':''):cache?.signature===prefs.signature(s)?'Last checked '+displayDate(cache.checkedAt)+(cache.partial?' · Showing saved / partial results; automatic retry pending':''):'Checking this subscription automatically…';
    const all=rowsFor(s),incomplete=s&&cache?.signature===prefs.signature(s)&&cache.partial,checking=s&&!isDefault&&cache?.signature!==prefs.signature(s)&&s.journals.length,filter=el('feedJournal'),previous=filter.value;
    const journals=[...new Set([...(s?.journals||[]),...all.map(p=>p.journal)].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    filter.innerHTML='<option value="">All journals</option>'+journals.map(j=>'<option value="'+esc(j)+'">'+esc(j)+'</option>').join('');
    filter.value=journals.includes(previous)?previous:'';
    const query=el('feedSearch').value.trim().toLowerCase(),journal=filter.value;
    const items=all.filter(p=>[p.title,p.authors,p.journal,...p.tags].join(' ').toLowerCase().includes(query)&&(!journal||prefs.journalNorm(p.journal)===prefs.journalNorm(journal)));
    el('feedCount').textContent=items.length+' papers · Latest publications first · Dates may be month only';
    el('feedCards').innerHTML=items.length?items.map(p=>'<article class="card paper-colored color-'+paperColor(p)+'"><div class="cardtop"><span class="meta">'+esc(p.journal)+' · '+esc(p.published)+'</span></div><h2><a href="'+esc('https://doi.org/'+p.doi)+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a></h2><div class="meta">'+esc(p.authors||'Authors not listed')+'</div><div class="tags" style="margin-top:16px">'+p.tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div><div class="cardbottom"><a class="small" href="'+esc('https://doi.org/'+p.doi)+'" target="_blank" rel="noopener noreferrer">Open paper ↗</a><button type="button" class="'+(collected(p)?'secondary':'primary')+'" data-collect-doi="'+esc(p.doi)+'" '+(collected(p)?'disabled':'')+'>'+(collected(p)?'In your library':'＋ To Read')+'</button></div></article>').join(''):s?'<div class="empty"><h2>'+(incomplete?'Journal checks are incomplete':checking?'Checking recent papers…':'No matching papers yet')+'</h2><p>'+(incomplete?'Some journals could not be fully checked. Automatic retries will continue.':checking?'Results will appear as journal checks finish.':'Try another filter, or adjust your topics and journals in Customize feed.')+'</p></div>':'<div class="empty"><h2>Build your research feed</h2><p>Add your own topics and journals in Customize feed to get started.</p></div>';
    el('feedCards').querySelectorAll('[data-collect-doi]').forEach(b=>b.onclick=()=>{const p=all.find(p=>p.doi===b.dataset.collectDoi);if(!p||collected(p))return;papers.push({id:crypto.randomUUID(),title:p.title,authors:p.authors,journal:p.journal,year:p.year,status:'todo',link:p.link,category:p.tags.length===1?p.tags[0]:'',tags:[...p.tags],question:'',findings:'',notes:'',toShare:false,updated:Date.now()});persist();toast('Added to To Read.');});
  }
  function renderSettings(){
    renderJournals();
    el('subscriptionList').innerHTML=settings.subscriptions.map(s=>'<div class="subscription-row"><div><strong>'+esc(s.name)+'</strong></div><div class="subscription-actions"><button type="button" class="secondary" data-edit-sub="'+esc(s.id)+'">Edit</button><button type="button" class="secondary" data-toggle-sub="'+esc(s.id)+'">'+(s.enabled?'Pause':'Resume')+'</button><button type="button" class="secondary" data-remove-sub="'+esc(s.id)+'">Delete</button></div></div>').join('');
    el('subscriptionList').querySelectorAll('[data-edit-sub]').forEach(b=>b.onclick=()=>editSubscription(b.dataset.editSub));
    el('subscriptionList').querySelectorAll('[data-toggle-sub]').forEach(b=>b.onclick=()=>{const s=settings.subscriptions.find(s=>s.id===b.dataset.toggleSub);s.enabled=!s.enabled;saveSettings();});
    el('subscriptionList').querySelectorAll('[data-remove-sub]').forEach(b=>b.onclick=()=>{const s=settings.subscriptions.find(s=>s.id===b.dataset.removeSub);if(confirm('Delete the '+s.name+' subscription? Papers already in your library will be kept.')){settings.subscriptions=settings.subscriptions.filter(x=>x.id!==b.dataset.removeSub);saveSettings();}});
  }
  function editSubscription(id){const f=el('subscriptionForm'),s=settings.subscriptions.find(s=>s.id===id);f.reset();window.ReadingGardenJournalLookup?.reset();f.dataset.editing=id||'';f.elements.name.value=s?.name||'';el('subscriptionFormTitle').textContent=s?'Edit subscription':'New subscription';el('subscriptionError').textContent='';el('subscriptionSave').textContent=s?'Save changes':'Add subscription';}
  el('subscriptionForm').onsubmit=e=>{e.preventDefault();const f=e.target,id=f.dataset.editing||crypto.randomUUID();const old=settings.subscriptions.find(s=>s.id===id);const name=f.elements.name.value.trim(),keywords=old&&prefs.norm(old.name)===prefs.norm(name)?[...old.keywords]:[name],journals=[...settings.journals];const s={id,name,keywords,journals,families:[],enabled:old?old.enabled:true};if(!prefs.valid(s)||(!old&&settings.subscriptions.length>=20)){el('subscriptionError').textContent='Use a topic name of 1–80 characters (maximum 20 topics).';return;}if(old)settings.subscriptions=settings.subscriptions.map(x=>x.id===id?s:x);else settings.subscriptions.push(s);group=id;view='feed';saveSettings();editSubscription();toast('Subscription saved. Checking recent papers automatically.');};
  el('newSubscription').onclick=()=>editSubscription();
  function openSettings(){renderSettings();editSubscription();el('feedSettingsDialog').showModal();}
  el('customizeFeed').onclick=openSettings;el('customizeFeedTop').onclick=openSettings;el('closeFeedSettings').onclick=()=>el('feedSettingsDialog').close();
  el('feedSettingsDialog').addEventListener('click',e=>{const d=e.currentTarget,r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});
  async function refresh(){if(loading)return;loading=true;try{const r=await fetch('https://raw.githubusercontent.com/ShannChen/reading-garden/main/data/paper-feed.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const d=await r.json();if(d?.version!==1||!Array.isArray(d.papers)||!d.papers.every(p=>typeof p.doi==='string'&&/^10\.\d{4,9}\/\S+$/.test(p.doi)&&typeof p.title==='string'&&Array.isArray(p.tags)&&Array.isArray(p.groups)))throw Error();feed=d;try{localStorage.setItem(publicKey,JSON.stringify(feed));}catch{}renderFeed();}catch{}finally{loading=false;}}
  async function checkCustom(){
    if(running||navigator.onLine===false)return;running=true;const ticket=generation;
    try{for(const s of settings.subscriptions.filter(s=>s.enabled&&!prefs.standard(s)&&(s.journals.length||s.families.length))){
      const signature=prefs.signature(s),cached=custom[s.id];if(cached?.signature===signature&&Date.now()-Date.parse(cached.checkedAt)<(cached.partial?300000:86400000))continue;
      const found=new Map(cached?.signature===signature?cached.papers.map(p=>[p.doi,p]):[]);let failed=0,success=0;
      const today=new Date().toISOString().slice(0,10),start=new Date();start.setUTCDate(start.getUTCDate()-120);
      const sources=s.families.map(f=>'prefix:'+prefs.families[f].prefix).concat(s.journals.map(j=>prefs.journalISSN(j)?'issn:'+prefs.journalISSN(j):'container-title:'+j));
      for(const source of sources){for(const term of prefs.terms(s)){if(ticket!==generation)return;
        try{const u=new URL('https://api.crossref.org/works');u.searchParams.set('filter',source+',type:journal-article,from-pub-date:'+start.toISOString().slice(0,10)+',until-pub-date:'+today);u.searchParams.set('query',term);u.searchParams.set('rows','200');u.searchParams.set('select','DOI,title,author,container-title,published,published-online,published-print,issued,abstract,subject');
          const r=await fetch(u,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error();const json=await r.json();if(ticket!==generation)return;const message=json.message;if(!Array.isArray(message?.items))throw Error();for(const w of message.items){const p=prefs.fromWork(w,s,today);if(p&&prefs.scoped(p,s))found.set(p.doi,p);}success++;if(message['total-results']>200)failed++;
        }catch{failed++;}
      }}
      if(ticket!==generation)return;
      {custom[s.id]={signature,checkedAt:new Date().toISOString(),partial:failed>0||!success,papers:[...found.values()]};try{localStorage.setItem(resultsKey(),JSON.stringify(custom));}catch{}renderFeed();}
    }}finally{running=false;if(ticket!==generation)queueMicrotask(checkCustom);}
  }
  const previousRender=render;render=function(){previousRender();renderFeed();if(el('feedSettingsDialog').open)renderSettings();};
  el('feedSearch').addEventListener('input',renderFeed);el('feedJournal').addEventListener('change',renderFeed);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();checkCustom();}});addEventListener('online',()=>{refresh();checkCustom();});
  addEventListener('storage',e=>{if(e.key===localKey()){loadLocal();checkCustom();}});setInterval(()=>{if(!document.hidden){refresh();checkCustom();}},300000);
  try{const cached=JSON.parse(localStorage.getItem(publicKey)||'null');if(cached?.version===1&&Array.isArray(cached.papers))feed=cached;}catch{}loadLocal();refresh();checkCustom();
})();





