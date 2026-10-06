(function(){
  'use strict';
  const form=document.getElementById('paperForm'),dialog=document.getElementById('editor'),title=form.elements.title,status=document.getElementById('lookupStatus'),results=document.getElementById('lookupResults');
  let timer,controller,generation=0;
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function cancel(){clearTimeout(timer);controller?.abort();controller=null;generation++;if(form.dataset.kind==='book'){results.replaceChildren();status.textContent='Book title lookup runs automatically when you stop typing.';}}
  function metadata(book){const id=String(book.key||'').replace(/^\/works\//,'');return {title:typeof book.title==='string'?book.title:'',authors:Array.isArray(book.author_name)?book.author_name.filter(a=>typeof a==='string').join(', '):'',year:Number.isInteger(book.first_publish_year)?String(book.first_publish_year):'',journal:Array.isArray(book.publisher)&&book.publisher.length===1&&typeof book.publisher[0]==='string'?book.publisher[0]:'',link:/^OL\d+W$/.test(id)?'https://openlibrary.org/works/'+id:''};}
  function fill(book,explicit){
    const m=metadata(book),fields=['authors','journal','year','link'];
    if(explicit&&fields.some(k=>m[k]&&form.elements[k].value.trim()&&form.elements[k].value.trim()!==m[k])&&!confirm('Replace the existing author, publisher, year or book link with this book’s metadata?'))return;
    for(const k of fields)if(m[k]&&(explicit||!form.elements[k].value.trim()))form.elements[k].value=m[k];
    if(explicit&&m.title)title.value=m.title;
    document.getElementById('openLink').hidden=!/^https?:\/\//.test(form.elements.link.value);
    results.replaceChildren();status.textContent='Book details filled from Open Library. The year is its first publication year; check the edition and publisher before saving.';
  }
  async function lookup(query,token){
    const current=new AbortController();controller=current;const timeout=setTimeout(()=>current.abort(),15000);status.textContent='Looking up book details…';
    try{
      const u=new URL('https://openlibrary.org/search.json');u.searchParams.set('title',query);u.searchParams.set('limit','6');u.searchParams.set('fields','key,title,author_name,first_publish_year,publisher');
      const r=await fetch(u,{signal:current.signal});if(!r.ok)throw Error();const json=await r.json();
      if(token!==generation||!dialog.open||form.dataset.kind!=='book'||title.value.trim()!==query)return;
      if(!Array.isArray(json.docs))throw Error();const rows=json.docs.filter(b=>metadata(b).title&&metadata(b).link);const exact=rows.filter(b=>norm(b.title)===norm(query));
      if(exact.length===1&&metadata(exact[0]).authors){fill(exact[0],false);return;}
      if(!rows.length){status.textContent='No matching book found. Try its full title, or enter the author and details manually.';return;}
      status.textContent='Select the correct book to fill its details:';
      results.innerHTML=rows.map((b,i)=>{const m=metadata(b);return '<button type="button" class="lookup-choice" data-book-result="'+i+'"><strong>'+esc(m.title)+'</strong><span>'+esc([m.authors,m.year?'First published '+m.year:''].filter(Boolean).join(' · '))+'</span></button>';}).join('');
      results.querySelectorAll('[data-book-result]').forEach(b=>b.onclick=()=>{if(token===generation&&dialog.open&&form.dataset.kind==='book'&&title.value.trim()===query)fill(rows[Number(b.dataset.bookResult)],true);});
    }catch{if(token===generation&&dialog.open&&form.dataset.kind==='book')status.textContent='Book lookup is unavailable right now. You can still enter the details manually.';}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  title.addEventListener('input',()=>{cancel();const query=title.value.trim(),token=generation;if(form.dataset.kind==='book'&&query.length>=3)timer=setTimeout(()=>lookup(query,token),800);});
  title.addEventListener('compositionstart',cancel);form.addEventListener('reset',cancel);dialog.addEventListener('close',cancel);dialog.addEventListener('cancel',cancel);
})();
