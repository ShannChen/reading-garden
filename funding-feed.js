(function(){
  'use strict';
  const el=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
  const publicKey='reading-garden-public-funding-v1',starsKey='reading-garden-funding-stars-v1';
  let stars=[],feed=null,section='grant',page=0,loading=false,lastAttempt=0,fetchFailed=false;
  const labels={grant:'Grants',postdoc:'Postdoc Fellowships',phd:'PhD Fellowships'};
  function validStars(rows){return Array.isArray(rows)&&rows.length<=10000&&rows.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=200&&typeof r.starred==='boolean'&&Number.isFinite(r.updated))&&new Set(rows.map(r=>r.id)).size===rows.length;}
  function validFeed(d){return d?.version===1&&Array.isArray(d.opportunities)&&d.opportunities.length<=5000&&d.opportunities.every(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&typeof r.provider==='string'&&['grant','postdoc','phd'].includes(r.kind)&&['stanford','national'].includes(r.scope)&&Array.isArray(r.fields)&&r.fields.every(f=>typeof f==='string')&&Array.isArray(r.dates)&&r.dates.every(date=>/^\d{4}-\d{2}-\d{2}$/.test(date))&&typeof r.url==='string'&&/^https:\/\//.test(r.url));}
  const starred=id=>stars.find(r=>r.id===id)?.starred===true;
  function saveLocal(){localStorage.setItem(storageKey(starsKey),JSON.stringify(stars));}
  function setState(rows){if(!validStars(rows))throw Error('Invalid funding stars');stars=copy(rows);renderFunding();}
  function loadStars(){try{const saved=JSON.parse(localStorage.getItem(storageKey(starsKey))||'[]');setState(validStars(saved)?saved:[]);}catch{setState([]);}}
  function toggleStar(id){const record={id,starred:!starred(id),updated:Date.now()};stars=stars.some(r=>r.id===id)?stars.map(r=>r.id===id?record:r):[...stars,record];persist();}
  window.ReadingGardenFunding={exportState:()=>copy(stars),saveLocal,setState,validateState:validStars,importState:rows=>{if(!validStars(rows))throw Error('Invalid funding stars');const map=new Map(stars.map(r=>[r.id,r]));for(const r of rows){const old=map.get(r.id);if(!old||r.updated>old.updated)map.set(r.id,copy(r));}stars=[...map.values()];},toggleStar};
  const checked=value=>value?new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not checked yet';
  function card(r,today){
    const isStarred=starred(r.id),dates=[...r.dates.filter(d=>d>=today),...r.dates.filter(d=>d<today)].slice(0,3),expired=r.dates.length&&r.dates.every(d=>d<today);
    const status=r.sourceStatus==='unavailable'?'Source check incomplete':r.sourceStatus==='pending'?'Source check pending':expired?'Listed dates have passed':r.status==='posted'?'Posted':r.status==='forecasted'?'Forecasted':'Application cycle to verify';
    return '<article class="card"><div class="cardtop"><span class="funding-badge '+(expired?'expired':'')+'">'+esc(status)+'</span><button type="button" class="person-star '+(isStarred?'is-starred':'')+'" data-funding-star="'+esc(r.id)+'" aria-label="'+esc((isStarred?'Unstar ':'Star ')+r.title)+'" aria-pressed="'+isStarred+'">'+(isStarred?'★':'☆')+'</button></div><h2><a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.title)+'</a></h2><div class="meta">'+esc(r.provider)+' · '+(r.scope==='stanford'?'Stanford':'National')+'</div><p class="meta" style="margin-top:12px">'+esc(r.summary||'Review the official announcement for project requirements.')+'</p><div class="tags" style="margin-top:12px">'+r.fields.map(f=>'<span class="tag">'+esc(f)+'</span>').join('')+'</div><div class="funding-date">'+(dates.length?(r.dateType==='official-closing-date'?'Closing date: ':'Dates listed on page: ')+dates.map(esc).join(' · '):'Dates: check the current official announcement')+'</div><p class="funding-eligibility"><strong>Eligibility</strong><br>'+esc(r.eligibility||'Check the official program’s current requirements.')+'</p><div class="cardbottom"><a class="small" href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">Official page ↗</a><span class="small">'+esc(checked(r.checkedAt))+'</span></div></article>';
  }
  function renderFunding(){
    const active=view==='funding';el('fundingView').hidden=!active;
    document.querySelectorAll('[data-funding]').forEach(b=>b.classList.toggle('active',active&&b.dataset.funding===section));
    if(!active)return;
    const [kind,scope]=section.split(':'),today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Los_Angeles'});
    el('fundingTitle').textContent=labels[kind]+(scope?' · '+(scope==='stanford'?'Stanford':'National'):'');el('fundingScope').hidden=!!scope;
    el('fundingChecked').textContent=(fetchFailed?'Could not fetch the latest feed · Showing saved programs · ':'')+(feed?.checkedAt?'Last source check '+checked(feed.checkedAt)+(feed.partial?' · Some sources could not be fully checked':''):loading?'Loading monitored programs…':'Initial automatic source check pending');
    const q=el('fundingSearch').value.trim().toLowerCase(),field=el('fundingField').value,scopeFilter=scope||el('fundingScope').value,status=el('fundingStatus').value,onlyStarred=el('fundingStarred').checked;
    const rows=(feed?.opportunities||[]).filter(r=>r.kind===kind&&(!scopeFilter||r.scope===scopeFilter)&&(!field||r.fields.includes(field))&&(!status||r.status===status)&&(!onlyStarred||starred(r.id))&&[r.title,r.provider,r.summary,r.eligibility,...r.fields].join(' ').toLowerCase().includes(q));
    // Prioritize stars and future dates; retain annual programs with past cycles for monitoring.
    const nextDate=r=>r.dates.filter(d=>d>=today).sort()[0]||'9999';
    rows.sort((a,b)=>Number(starred(b.id))-Number(starred(a.id))||nextDate(a).localeCompare(nextDate(b))||a.title.localeCompare(b.title));
    page=Math.min(page,Math.max(0,Math.ceil(rows.length/30)-1));const visible=rows.slice(page*30,(page+1)*30);el('fundingPrevious').disabled=page===0;el('fundingNext').disabled=(page+1)*30>=rows.length;el('fundingPagination').hidden=rows.length<=30;el('fundingPage').textContent='Page '+(page+1)+' of '+Math.max(1,Math.ceil(rows.length/30));
    el('fundingCount').textContent=rows.length+' opportunities'+(onlyStarred?' · Starred only':'');
    el('fundingCards').innerHTML=rows.length?visible.map(r=>card(r,today)).join(''):'<div class="empty"><h2>'+(loading&&!feed?'Loading funding opportunities…':onlyStarred?'No starred opportunities here yet':'No matching opportunities')+'</h2><p>'+(onlyStarred?'Click ☆ on a program to keep it in focus.':'Try another field or search. Automatic source checks will continue.')+'</p></div>';
    el('fundingCards').querySelectorAll('[data-funding-star]').forEach(b=>b.onclick=()=>toggleStar(b.dataset.fundingStar));
  }
  async function refresh(){
    if(loading||Date.now()-lastAttempt<300000)return;loading=true;lastAttempt=Date.now();
    try{
      let data;for(const source of ['https://raw.githubusercontent.com/ShannChen/reading-garden/main/data/funding-feed.json','data/funding-feed.json']){
        try{const response=await fetch(source,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();data=await response.json();if(!validFeed(data))throw Error();break;}catch{data=null;}
      }
      if(!data)throw Error();feed=data;fetchFailed=false;try{localStorage.setItem(publicKey,JSON.stringify(feed));}catch{}
    }catch{fetchFailed=true;}finally{loading=false;renderFunding();}
  }
  // Native details provide accessible keyboard folding. Remember folds on this device.
  document.querySelectorAll('[data-nav-group]').forEach(d=>{
    const key='reading-garden-nav-'+d.dataset.navGroup;try{const saved=localStorage.getItem(key);if(saved!==null)d.open=saved==='open';}catch{}
    d.addEventListener('toggle',()=>{try{localStorage.setItem(key,d.open?'open':'closed');}catch{}});
  });
  document.querySelectorAll('[data-funding]').forEach(b=>b.onclick=()=>{section=b.dataset.funding;page=0;view='funding';el('fundingSearch').value='';el('fundingScope').value='';render();refresh();});
  const filterChanged=()=>{page=0;renderFunding();};el('fundingPrevious').onclick=()=>{page=Math.max(0,page-1);renderFunding();};el('fundingNext').onclick=()=>{page++;renderFunding();};
  el('fundingSearch').addEventListener('input',filterChanged);['fundingField','fundingScope','fundingStatus','fundingStarred'].forEach(id=>el(id).addEventListener('change',filterChanged));
  const previousRender=render;render=function(){previousRender();renderFunding();};
  addEventListener('storage',e=>{if(e.key===storageKey(starsKey))loadStars();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});addEventListener('online',()=>{lastAttempt=0;refresh();});setInterval(()=>{if(!document.hidden)refresh();},600000);
  try{const saved=JSON.parse(localStorage.getItem(publicKey)||'null');if(validFeed(saved))feed=saved;}catch{}
  loadStars();refresh();
})();
