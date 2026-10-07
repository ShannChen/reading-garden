(function(){
  'use strict';
  const el=id=>document.getElementById(id),input=el('journalSearch'),results=el('journalSuggestions'),status=el('journalSearchStatus'),form=el('subscriptionForm');
  if(!input||!results||!status||!form)return;
  const norm=ReadingGardenFeedPreferences.norm,escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let timer,controller,ticket=0,choices=[],active=-1;
  function clear(){clearTimeout(timer);controller?.abort();controller=null;ticket++;choices=[];active=-1;results.innerHTML='';results.hidden=true;input.setAttribute('aria-expanded','false');}
  function reset(){clear();input.value='';status.textContent='';}
  window.ReadingGardenJournalLookup={reset};
  function choose(index){
    const journal=choices[index];if(!journal)return;
    const field=form.elements.journals,list=field.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(list.some(j=>norm(j)===norm(journal.title))){status.textContent='This journal is already selected.';return;}
    if(list.length>=10){status.textContent='You can add up to 10 journals per subscription.';return;}
    field.value=[...list,journal.title].join('\n');reset();status.textContent='Added '+journal.title+'. Search for another journal.';input.focus();
  }
  function highlight(index){active=index;results.querySelectorAll('[data-journal-index]').forEach((b,i)=>b.classList.toggle('journal-active',i===active));}
  async function search(query,request){
    controller=new AbortController();const current=controller;const timeout=setTimeout(()=>current.abort(),15000);
    try{
      const url=new URL('https://api.crossref.org/journals');url.searchParams.set('query',query);url.searchParams.set('rows','8');
      const response=await fetch(url,{signal:current.signal});if(!response.ok)throw Error();const data=await response.json();
      if(request!==ticket)return;if(!Array.isArray(data.message?.items))throw Error();
      const seen=new Set();choices=data.message.items.filter(j=>{if(typeof j.title!=='string'||!j.title.trim()||j.title.length>150||seen.has(norm(j.title)))return false;seen.add(norm(j.title));return true;}).map(j=>({title:j.title.trim(),publisher:typeof j.publisher==='string'?j.publisher:'',issn:Array.isArray(j.ISSN)?j.ISSN.filter(x=>typeof x==='string').join(', '):''}));
      results.innerHTML=choices.map((j,i)=>'<button type="button" class="journal-suggestion" data-journal-index="'+i+'"><strong>'+escape(j.title)+'</strong><span class="small">'+escape([j.publisher,j.issn?'ISSN '+j.issn:''].filter(Boolean).join(' · '))+'</span></button>').join('');
      results.hidden=!choices.length;input.setAttribute('aria-expanded',String(choices.length>0));
      results.querySelectorAll('[data-journal-index]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.journalIndex)));
      status.textContent=choices.length?'Choose a journal below.':'No matching journals found. Try the full title, or enter it manually below.';
    }catch{if(request===ticket){status.textContent='Journal search is unavailable. Try again, or enter the full title manually below.';}}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  input.addEventListener('input',()=>{clear();const query=input.value.trim();if(query.length<2){status.textContent=query?'Type at least 2 characters.':'';return;}if(query.length>150){status.textContent='Use a shorter journal name.';return;}status.textContent='Searching journals…';const request=ticket;timer=setTimeout(()=>search(query,request),350);});
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();clear();status.textContent='';return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!choices.length)return;e.preventDefault();highlight((active+(e.key==='ArrowDown'?1:active<0?0:-1)+choices.length)%choices.length);return;}
    if(e.key==='Enter'){e.preventDefault();if(choices.length)choose(active<0?0:active);}
  });
  form.addEventListener('reset',reset);el('feedSettingsDialog').addEventListener('close',reset);
})();
