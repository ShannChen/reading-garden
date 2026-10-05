(function(){
  'use strict';
  const groups={metabolomics:'Metabolomics & Microbiome',proteomics:'Proteomics',exposomics:'Exposome & Exposomics',epitranscriptomics:'Epitranscriptomics',multiomics:'Multiomics'};
  const el=id=>document.getElementById(id), cacheKey='reading-garden-public-feed-v1';
  let feed=null,group='metabolomics',loading=false;
  const doi=value=>{try{return decodeURIComponent(String(value||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'')).toLowerCase();}catch{return '';}};
  const collected=p=>papers.some(saved=>doi(saved.link)===p.doi);
  function displayDate(value){const d=new Date(value);return isNaN(d)?'Not checked yet':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  function renderFeed(){
    el('feedView').hidden=view!=='feed';
    document.querySelectorAll('[data-feed]').forEach(button=>{button.classList.toggle('active',view==='feed'&&button.dataset.feed===group);button.querySelector('span').textContent=feed?feed.papers.filter(p=>p.groups.includes(button.dataset.feed)).length:'—';});
    if(view!=='feed')return;
    el('feedTitle').textContent=groups[group];
    el('feedChecked').textContent=feed?.checkedAt?'Last checked '+displayDate(feed.checkedAt)+(feed.partial?' · Some sources could not be checked':''):'The first automatic check is being prepared.';
    const query=el('feedSearch').value.trim().toLowerCase(),journal=el('feedJournal').value;
    const items=(feed?.papers||[]).filter(p=>p.groups.includes(group)&&[p.title,p.authors,p.journal,...p.tags].join(' ').toLowerCase().includes(query)&&(!journal||(journal==='nature'?/^10\.1038\//.test(p.doi):journal==='cell'?/^10\.1016\//.test(p.doi):/^10\.1021\//.test(p.doi))));
    el('feedCount').textContent=items.length+' papers · Latest publications first · Dates without a day reflect month-only publisher metadata';
    el('feedCards').innerHTML=items.length?items.map(p=>'<article class="card"><div class="cardtop"><span class="meta">'+esc(p.journal)+' · '+esc(p.published)+'</span></div><h2><a href="'+esc('https://doi.org/'+p.doi)+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a></h2><div class="meta">'+esc(p.authors||'Authors not listed')+'</div><div class="tags" style="margin-top:16px">'+p.tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div><div class="cardbottom"><a class="small" href="'+esc('https://doi.org/'+p.doi)+'" target="_blank" rel="noopener noreferrer">Open paper ↗</a><button type="button" class="'+(collected(p)?'secondary':'primary')+'" data-collect-doi="'+esc(p.doi)+'" '+(collected(p)?'disabled':'')+'>'+(collected(p)?'In your library':'＋ To Read')+'</button></div></article>').join(''):'<div class="empty"><h2>'+(feed?.checkedAt?'No matching papers':'Getting your new-paper feed ready')+'</h2><p>'+(feed?.checkedAt?'Try another filter. Recent articles will appear after the next automatic check.':'The daily checker is collecting recent publications. This list will load automatically.')+'</p></div>';
    el('feedCards').querySelectorAll('[data-collect-doi]').forEach(button=>button.onclick=()=>{
      const p=feed.papers.find(p=>p.doi===button.dataset.collectDoi);if(!p||collected(p))return;
      papers.push({id:crypto.randomUUID(),title:p.title,authors:p.authors,journal:p.journal,year:p.year,status:'todo',link:p.link,category:p.tags.length===1?p.tags[0]:'',tags:[...p.tags],question:'',findings:'',notes:'',toShare:false,updated:Date.now()});
      persist();toast('Added to To Read.');
    });
  }
  function accept(data){
    if(data?.version!==1||!Array.isArray(data.papers)||!data.papers.every(p=>typeof p.doi==='string'&&/^10\.\d{4,9}\/\S+$/.test(p.doi)&&typeof p.title==='string'&&Array.isArray(p.tags)&&p.tags.every(t=>typeof t==='string')&&Array.isArray(p.groups)&&p.groups.every(g=>g in groups)))throw Error('Invalid feed');
    feed=data;renderFeed();
  }
  async function refresh(){
    if(loading)return;loading=true;
    try{
      // The scheduled job commits public metadata. Fetch it directly so updates
      // are available even when a token-generated commit does not rebuild Pages.
      const response=await fetch('https://raw.githubusercontent.com/ShannChen/reading-garden/main/data/paper-feed.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('Feed unavailable');accept(await response.json());
      try{localStorage.setItem(cacheKey,JSON.stringify(feed));}catch{}
    }catch{if(view==='feed')el('feedChecked').textContent=feed?.checkedAt?'Showing saved results · Last checked '+displayDate(feed.checkedAt):'Waiting for the first daily update. Results will appear automatically.';}
    finally{loading=false;}
  }
  const previousRender=render;
  render=function(){previousRender();renderFeed();};
  document.querySelectorAll('[data-feed]').forEach(button=>button.onclick=()=>{view='feed';group=button.dataset.feed;el('feedSearch').value='';render();refresh();});
  el('feedSearch').addEventListener('input',renderFeed);el('feedJournal').addEventListener('change',renderFeed);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  addEventListener('online',refresh);setInterval(()=>{if(!document.hidden)refresh();},300000);
  try{const cached=localStorage.getItem(cacheKey);if(cached)accept(JSON.parse(cached));}catch{}
  renderFeed();refresh();
})();
