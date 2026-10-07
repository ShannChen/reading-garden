(function(root){
  'use strict';
  const endpoint='https://oonwggwdcywukwshwbxx.supabase.co/functions/v1/swift-handler';
  function piName(value){
    const name=String(value||'').trim().replace(/\s+/g,' ');
    if(!name)return null;
    if(name.includes(',')){const [last,first]=name.split(',').map(s=>s.trim());return first?{last_name:last,first_name:first.split(' ')[0]}:{any_name:last};}
    const parts=name.split(' ');return parts.length>1?{first_name:parts[0],last_name:parts.at(-1)}:{any_name:name};
  }
  function payload(query,offset=0){
    const keywords=String(query.keywords||'').trim(),name=String(query.name||'').trim();
    if(!keywords&&!name)throw Error('Enter keywords, a PI name, or both.');
    if(keywords.length>250||name.length>150)throw Error('Use up to 250 characters for keywords and 150 for a PI name.');
    const criteria={exclude_subprojects:true};
    if(keywords){criteria.advanced_text_search={operator:'and',search_field:'all',search_text:keywords};criteria.use_relevance=true;}
    if(name)criteria.pi_names=[piName(name)];
    if(query.period==='active'||!query.period)criteria.include_active_projects=true;
    else if(query.period==='all')criteria.fiscal_years=[];
    else if(/^20\d{2}$/.test(query.period))criteria.fiscal_years=[Number(query.period)];
    else throw Error('Choose an active-project or fiscal-year filter.');
    if(!Number.isInteger(offset)||offset<0||offset>14999)throw Error('Open the complete results on NIH RePORTER to continue beyond this page.');
    return {criteria,offset,limit:20};
  }
  const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  function project(w){
    const id=String(w.appl_id||''),title=plain(w.project_title);
    if(!/^\d+$/.test(id)||!title)return null;
    return {id,title,number:plain(w.project_num||w.core_project_num),core:plain(w.core_project_num),
      investigators:(w.principal_investigators||[]).map(p=>plain(p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' '))).filter(Boolean),
      organization:plain(w.organization?.org_name),fiscalYear:w.fiscal_year,
      amount:typeof w.award_amount==='number'&&Number.isFinite(w.award_amount)&&w.award_amount>=0?w.award_amount:null,
      start:String(w.project_start_date||'').slice(0,10),end:String(w.project_end_date||'').slice(0,10),
      activity:plain(w.activity_code),agency:plain(w.agency_ic_admin?.name||w.agency_ic_admin?.abbreviation),
      abstract:plain(w.abstract_text),active:w.is_active===true,url:'https://reporter.nih.gov/project-details/'+id};
  }
  let nextRequest=0;
  async function search(query,offset=0,options={}){
    const body=payload(query,offset),wait=Math.max(0,nextRequest-Date.now());nextRequest=Math.max(Date.now(),nextRequest)+1100;
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    if(options.signal?.aborted)throw Error('Search cancelled');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:options.signal||AbortSignal.timeout(25000)});
    if(response.status===404)throw Error('NIH search needs its Supabase function deployed. See the setup guide linked above.');
    if(!response.ok)throw Error(response.status===429?'NIH is busy. Please wait a moment and try again.':'NIH RePORTER could not be reached. Please try again.');
    const data=await response.json();if(!Array.isArray(data.results)||!Number.isFinite(Number(data.meta?.total)))throw Error('Unexpected NIH response. Please try again.');
    const url=String(data.meta?.search_url||data.meta?.url||'');
    return {projects:data.results.map(project).filter(Boolean),total:Number(data.meta.total),offset,returned:data.results.length,
      url:/^https:\/\/reporter\.nih\.gov\//.test(url)?url:'https://reporter.nih.gov/advanced-search'};
  }
  const api={payload,piName,project,search};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReadingGardenNIH=api;
})(typeof globalThis!=='undefined'?globalThis:this);

(function(){
  if(typeof document==='undefined')return;
  const el=id=>document.getElementById(id);
  let result=null,query=null,busy=false,generation=0,controller=null,error='';
  const money=value=>value===null?'Not reported':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const starKey=p=>'nih:'+(p.core||p.number||p.id);
  const isStarred=p=>window.ReadingGardenFunding?.exportState().some(r=>r.id===starKey(p)&&r.starred);
  function renderNIH(){
    const active=view==='nih';el('nihView').hidden=!active;el('nihNav').classList.toggle('active',active);if(!active)return;
    el('nihStatus').textContent=busy?'Searching NIH RePORTER…':error||(!result?'Search funded projects by research keywords, a PI name, or both.':'Showing '+(result.offset+1)+'–'+(result.offset+result.returned)+' of '+result.total+' fiscal-year award records'+(result.total>15000?' · API paging limit: open the complete search on NIH':'')+'.');
    if(result?.total===0&&!busy&&!error)el('nihStatus').textContent='No matching funded projects. Try a surname, fewer keywords, or All fiscal years.';
    el('nihSearchButton').disabled=busy;el('nihPagination').hidden=!result||result.total<=20;
    el('nihPrevious').disabled=busy||!result||result.offset===0;el('nihNext').disabled=busy||!result||result.offset+result.returned>=result.total||result.offset+20>14999;
    el('nihFullResults').href=result?.url||'https://reporter.nih.gov/advanced-search';
    const rows=result?.projects||[];
    el('nihCards').innerHTML=rows.length?rows.map(p=>'<article class="card"><div class="cardtop"><span class="funding-badge">'+(p.active?'Active funded project':'Funded project')+'</span><button type="button" class="person-star '+(isStarred(p)?'is-starred':'')+'" data-nih-star="'+esc(p.id)+'" aria-pressed="'+!!isStarred(p)+'" aria-label="'+esc((isStarred(p)?'Unstar ':'Star ')+p.title)+'">'+(isStarred(p)?'★':'☆')+'</button></div><h2><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a></h2><div class="meta">'+esc(p.number)+' · FY '+esc(p.fiscalYear||'not reported')+'</div><p class="meta" style="margin-top:12px"><strong>PI</strong> '+esc(p.investigators.join('; ')||'Not reported')+'<br>'+esc(p.organization||'Institution not reported')+'</p><div class="funding-date"><strong>FY '+esc(p.fiscalYear||'')+' funding: '+esc(money(p.amount))+'</strong><br><span class="small">Annual reported award amount · USD</span></div><p class="small">Project period: '+esc(p.start||'Not reported')+' – '+esc(p.end||'Not reported')+'</p><div class="tags" style="margin:12px 0">'+[p.activity,p.agency].filter(Boolean).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div>'+(p.abstract?'<p class="meta">'+esc(p.abstract.slice(0,260))+(p.abstract.length>260?'…':'')+'</p>':'')+'<div class="cardbottom"><a class="small" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">View NIH project ↗</a></div></article>').join(''):'<div class="empty"><h2>'+(busy?'Searching funded research…':result?'No matching funded projects':'Explore funded research')+'</h2><p>Enter a topic such as metabolomics or a PI name such as Benjamin Cravatt.</p></div>';
    el('nihCards').querySelectorAll('[data-nih-star]').forEach(b=>b.onclick=()=>{const p=rows.find(p=>p.id===b.dataset.nihStar);if(p)window.ReadingGardenFunding.toggleStar(starKey(p));});
  }
  async function search(offset=0){
    const ticket=++generation;controller?.abort();controller=new AbortController();const requestController=controller;busy=true;error='';renderNIH();
    const abortTimer=setTimeout(()=>requestController.abort(),25000);
    try{const next=await window.ReadingGardenNIH.search(query,offset,{signal:requestController.signal});if(ticket!==generation)return;result=next;}
    catch(e){if(ticket===generation)error=e.name==='AbortError'?'The NIH request timed out. Please try again.':e.message;}
    finally{clearTimeout(abortTimer);if(ticket===generation){busy=false;renderNIH();}}
  }
  el('nihForm').onsubmit=e=>{e.preventDefault();const next={keywords:el('nihKeywords').value.trim(),name:el('nihName').value.trim(),period:el('nihPeriod').value};try{window.ReadingGardenNIH.payload(next);}catch(e){error=e.message;renderNIH();return;}query=next;result=null;search();};
  el('nihPrevious').onclick=()=>{if(query&&result)search(Math.max(0,result.offset-20));};el('nihNext').onclick=()=>{if(query&&result)search(result.offset+20);};
  el('nihNav').onclick=()=>{view='nih';render();};
  const fy=new Date().getFullYear()+(new Date().getMonth()>=9?1:0);el('nihPeriod').innerHTML='<option value="active">Active projects</option><option value="all">All fiscal years</option>'+Array.from({length:8},(_,i)=>'<option value="'+(fy-i)+'">FY '+(fy-i)+'</option>').join('');
  el('nihPeriod').value='active';
  const previousRender=render;render=function(){previousRender();renderNIH();};renderNIH();
})();
