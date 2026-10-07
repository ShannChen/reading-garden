(function(){
  'use strict';
  const el=id=>document.getElementById(id),input=el('journalSearch'),results=el('journalSuggestions'),status=el('journalSearchStatus'),form=el('subscriptionForm');
  if(!input||!results||!status||!form)return;
  const norm=ReadingGardenFeedPreferences.norm,escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Verified short-title records supplement fuzzy search only when explicitly searched.
  // Journal information: nature.com/nature/journal-information; shop.elsevier.com/journals/cell/0092-8674; portal.issn.org/resource/ISSN/1095-9203
  const exactJournals=[
    {title:'Nature',publisher:'Springer Nature',ISSN:['0028-0836','1476-4687']},
    {title:'Cell',publisher:'Elsevier / Cell Press',ISSN:['0092-8674','1097-4172']},
    {title:'Science',publisher:'AAAS',ISSN:['0036-8075','1095-9203']},
    {title:'Proceedings of the National Academy of Sciences',aliases:['PNAS','Proc Natl Acad Sci','Proceedings of the National Academy of Sciences of the United States of America'],publisher:'National Academy of Sciences',ISSN:['0027-8424','1091-6490']}
  ];
  const isExact=(j,query)=>[j.title,...(j.aliases||[])].some(name=>norm(name)===norm(query));
  const known=query=>exactJournals.filter(j=>isExact(j,query));
  function show(items,query){
    const seen=new Set(),q=norm(query);
    const rank=j=>isExact(j,query)?0:norm(j.title).startsWith(q+' ')?1:norm(j.title).includes(q)?2:3;
    choices=items.filter(j=>{if(typeof j.title!=='string'||!j.title.trim()||j.title.length>150||seen.has(norm(j.title)))return false;seen.add(norm(j.title));return true;})
      .sort((a,b)=>rank(a)-rank(b)).slice(0,12).map(j=>({title:j.title.trim(),publisher:typeof j.publisher==='string'?j.publisher:'',aliases:j.aliases||[],issn:Array.isArray(j.ISSN)?j.ISSN.filter(x=>typeof x==='string').join(', '):''}));
    results.innerHTML=choices.map((j,i)=>'<button type="button" class="journal-suggestion" data-journal-index="'+i+'"><strong>'+escape(j.title)+'</strong><span class="small">'+escape([j.aliases?.[0],j.publisher,j.issn?'ISSN '+j.issn:''].filter(Boolean).join(' · '))+'</span></button>').join('');
    results.hidden=!choices.length;input.setAttribute('aria-expanded',String(choices.length>0));
    results.querySelectorAll('[data-journal-index]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.journalIndex)));
  }
  let timer,controller,ticket=0,choices=[],active=-1;
  function clear(){clearTimeout(timer);controller?.abort();controller=null;ticket++;choices=[];active=-1;results.innerHTML='';results.hidden=true;input.setAttribute('aria-expanded','false');}
  function reset(){clear();input.value='';status.textContent='';}
  window.ReadingGardenJournalLookup={reset};
  function choose(index){
    const journal=choices[index];if(!journal)return;
    const error=window.ReadingGardenFeeds?.addJournal(journal.title);
    if(error===undefined){status.textContent='Feed settings are still loading. Try again.';return;}
    if(error){status.textContent=error;return;}
    reset();status.textContent='Added '+journal.title+' to all your topics. Search for another journal.';input.focus();
  }
  function highlight(index){active=index;results.querySelectorAll('[data-journal-index]').forEach((b,i)=>b.classList.toggle('journal-active',i===active));}
  async function search(query,request){
    if(request!==ticket)return;show(known(query),query);
    controller=new AbortController();const current=controller;const timeout=setTimeout(()=>current.abort(),15000);
    try{
      const match=known(query),url=new URL('https://api.crossref.org/journals');
      url.searchParams.set('query',match[0]?.title||query);url.searchParams.set('rows','100');
      const jobs=[fetch(url,{signal:current.signal}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.message?.items))throw Error();return data.message.items;})];
      // For short names not in the verified alias list, inspect publisher-supplied journal abbreviations.
      if(!match.length&&/^[a-z. &-]{2,12}$/i.test(query)&&query.replace(/[^a-z]/gi,'').length<=6){
        const works=new URL('https://api.crossref.org/works');works.searchParams.set('query',query);works.searchParams.set('filter','type:journal-article');works.searchParams.set('rows','30');works.searchParams.set('select','container-title,short-container-title,ISSN,publisher');
        jobs.push(fetch(works,{signal:current.signal}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.message?.items))throw Error();return data.message.items.filter(w=>[...(w['short-container-title']||[]),...(w['container-title']||[])].some(t=>norm(t)===norm(query))).flatMap(w=>(w['container-title']||[]).map(title=>({title,aliases:w['short-container-title']||[],publisher:w.publisher,ISSN:w.ISSN})));}));
      }
      const responses=await Promise.allSettled(jobs);if(request!==ticket)return;
      const good=responses.filter(r=>r.status==='fulfilled');if(!good.length)throw Error();
      show([...match,...good.flatMap(r=>r.value)],query);
      status.textContent=choices.length?'Choose a journal below.':'No matching journals found. Try the full title, or enter it manually below.';
    }catch{if(request===ticket){status.textContent=choices.length?'Showing the verified journal match. Other search results are temporarily unavailable.':'Journal search is unavailable. Try again, or enter the full title manually below.';}}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  input.addEventListener('input',()=>{clear();const query=input.value.trim();if(query.length<2){status.textContent=query?'Type at least 2 characters.':'';return;}if(query.length>150){status.textContent='Use a shorter journal name.';return;}status.textContent='Searching journals…';const request=ticket;timer=setTimeout(()=>search(query,request),350);});
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();clear();status.textContent='';return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!choices.length)return;e.preventDefault();highlight((active+(e.key==='ArrowDown'?1:active<0?0:-1)+choices.length)%choices.length);return;}
    if(e.key==='Enter'){e.preventDefault();if(choices.length)choose(active<0?0:active);}
  });
  el('addJournalManual').onclick=()=>{const title=input.value.trim();if(!title){status.textContent='Enter a full journal title first.';return;}choices=[known(title)[0]||{title}];choose(0);};
  form.addEventListener('reset',reset);el('feedSettingsDialog').addEventListener('close',reset);
})();



