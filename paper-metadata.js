/* Fill missing bibliographic details without replacing reading notes or user edits. */
(function(){
  'use strict';
  const norm=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/&(?:#x[a-f0-9]+|#\d+|nbsp|amp);/gi,' ').replace(/[^a-z0-9]+/g,' ').trim();
  const doiOf=p=>{const m=String(p.link||p.doi||'').match(/(?:doi\.org\/|doi:\s*|^)(10\.\d{4,9}\/[^\s?#]+)/i);return m?m[1].replace(/[.,;]+$/,''):'';};
  const owner=()=>typeof storageNamespace==='string'?storageNamespace:'';
  function extract(w){
    if(!w||!w.DOI)return null;
    const title=String(w.title?.[0]||'').replace(/<[^>]+>/g,' ').trim();
    return {title,authors:(w.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')||a.name||'').filter(Boolean).join(', '),journal:String(w['container-title']?.[0]||'').trim(),year:String(w.published?.['date-parts']?.[0]?.[0]||w.issued?.['date-parts']?.[0]?.[0]||''),link:'https://doi.org/'+w.DOI};
  }
  function titleMatch(a,b){
    const x=norm(a),y=norm(b);if(!x||!y)return false;
    if(x===y)return true;
    const words=v=>new Set(v.split(' ').filter(Boolean));
    const first=words(x),second=words(y),hits=[...first].filter(w=>second.has(w)).length;
    return hits/Math.max(first.size,second.size)>=0.88&&Math.min(x.length,y.length)/Math.max(x.length,y.length)>=0.7;
  }
  async function lookup(p){
    const doi=doiOf(p);
    const u=doi?'https://api.crossref.org/works/'+encodeURIComponent(doi):'https://api.crossref.org/works?query.title='+encodeURIComponent(p.title)+'&rows=3&select=DOI,title,author,container-title,published,issued';
    const response=await fetch(u,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Crossref request failed');
    const data=(await response.json()).message;
    const matches=doi?[data]:data.items||[];
    const work=matches.find(w=>titleMatch(p.title,w.title?.[0])||(doi&&String(w.DOI||'').toLowerCase()===doi.toLowerCase()&&norm(p.title).slice(0,18)===norm(w.title?.[0]).slice(0,18)));
    return work?extract(work):null;
  }
  let running=false;
  async function fill(ids=null){
    if(running)return;
    const account=owner(), candidates=papers.filter(p=>p.kind!=='book'&&(!ids||ids.includes(p.id))&&(!p.authors||!p.journal||!p.year||!p.link)).slice(0,40);
    if(!candidates.length){toast('No missing paper details found.');return;}
    running=true;
    const button=document.getElementById('fillPaperDetails');
    if(button)button.disabled=true;
    let fixed=0,unmatched=0;
    try{
      for(const p of candidates){
        if(owner()!==account)break;
        try{
          const data=await lookup(p);
          if(!data){unmatched++;continue;}
          const current=papers.find(x=>x.id===p.id);
          if(!current||current.kind==='book'||owner()!==account)continue;
          const patch={};
          for(const field of ['authors','journal','year','link'])if(!String(current[field]||'').trim()&&data[field])patch[field]=data[field];
          if(Object.keys(patch).length){Object.assign(current,patch,{updated:Date.now()});persist();fixed++;}
        }catch{unmatched++;}
      }
      if(owner()===account)toast('Filled details for '+fixed+' papers; '+unmatched+' need manual verification.');
    }finally{running=false;if(button)button.disabled=false;}
  }
  function setup(){
    const toolbar=document.querySelector('#paperView .toolbar');
    if(!toolbar)return;
    const b=document.createElement('button');
    b.id='fillPaperDetails';b.className='secondary';b.type='button';
    b.textContent='Fill missing details';
    b.title='Find missing authors, journal, year and DOI via Crossref';
    b.onclick=()=>fill();
    toolbar.append(b);
    window.ReadingGardenMetadata={fill};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
