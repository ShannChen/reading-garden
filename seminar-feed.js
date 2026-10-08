(function(){
  'use strict';
  const el=id=>document.getElementById(id),cacheKey='reading-garden-public-seminars-v1';
  let feed=null,failed=false,loading=false,lastAttempt=0,page=0;
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const valid=d=>d?.version===1&&Array.isArray(d.events)&&d.events.length<=20000&&Array.isArray(d.sources)&&Array.isArray(d.departments)&&d.events.every(e=>typeof e.title==='string'&&typeof e.start==='string'&&Number.isFinite(Date.parse(e.start))&&Array.isArray(e.departments)&&e.departments.every(x=>typeof x==='string')&&!!safe(e.url));
  const dateKey=d=>d.toLocaleDateString('sv-SE',{timeZone:'America/Los_Angeles'});
  function departmentKey(name){
    const key=String(name||'').trim().toLowerCase().replace(/^stanford\s+/,'').replace(/^department\s+of\s+/,'').replace(/\s+department$/,'').replace(/&/g,'and').replace(/\s+/g,' ');
    return ['physics','physics / applied physics','applied physics/physics colloquium'].includes(key)?'physics':key;
  }
  function upcoming(e,now,days){
    const today=dateKey(now),until=new Date(today+'T00:00:00Z');until.setUTCDate(until.getUTCDate()+days);const day=e.start.length===10?e.start:dateKey(new Date(e.start));
    return day>=today&&day<until.toISOString().slice(0,10)&&(e.allDay||Date.parse(e.end||e.start)>=now.getTime());
  }
  const lifeScience=/biolog|biochem|biomed|bioengineer|genetic|genomic|microb|immun|neuro|medicine|medical|cancer|oncolog|patholog|radiolog|pediatr|pharmacol|cardiovasc|stem cell|developmental|bio-x|chem-h|chemh|human performance|public health|global health|population health|health research|precision health|psychiatr|psycholog|surgery|surgical|dermatolog|anesthes|urolog|ophthalm|otolaryng|obstetric|gynecolog|metabol|proteom|exposom|drug discovery|chemical biology|structural biology/i;
  const inScope=e=>lifeScience.test([e.title,...e.departments].join(' '))&&!e.departments.some(d=>/faculty staff help|bewell|healthy living|wellness|continuing medical education/i.test(d));
  const relevantSource=s=>!s.id.startsWith('page-')||lifeScience.test(s.name)||s.id==='page-chemistry';
  const belongs=(e,name)=>e.departments.some(d=>departmentKey(d)===departmentKey(name));
  function rows(now=new Date()){
    const days=Number(el('seminarRange').value||30),q=el('seminarSearch').value.trim().toLowerCase(),department=el('seminarDepartment').value;
    return (feed?.events||[]).filter(e=>{
      return inScope(e)&&upcoming(e,now,days)&&(!department||belongs(e,department))&&[e.title,e.speaker,e.institution,e.location,...e.departments].join(' ').toLowerCase().includes(q);
    }).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
  }
  function updateDepartments(){
    const selected=departmentKey(el('seminarDepartment').value),options=new Map(),now=new Date(),days=Number(el('seminarRange').value||30);
    // A directory entry alone is not evidence that its seminars are collected.
    for(const name of [...(feed?.sources||[]).filter(s=>s.id.startsWith('page-')&&relevantSource(s)).map(s=>s.name),...(feed?.events||[]).filter(inScope).flatMap(e=>e.departments)])if(!options.has(departmentKey(name)))options.set(departmentKey(name),name);
    el('seminarDepartment').innerHTML='<option value="">All departments</option>'+[...options].sort((a,b)=>a[1].localeCompare(b[1])).map(([key,name])=>{
      const count=(feed?.events||[]).filter(e=>inScope(e)&&belongs(e,key)&&upcoming(e,now,days)).length;
      return '<option value="'+esc(key)+'">'+esc(name)+' ('+count+')</option>';
    }).join('');
    el('seminarDepartment').value=options.has(selected)?selected:'';
  }
  function emptyState(){
    if(loading&&!feed)return '<div class="empty"><h2>Loading Stanford seminars…</h2></div>';
    const selected=el('seminarDepartment').value,all=(feed?.events||[]).filter(e=>inScope(e)&&(!selected||belongs(e,selected))&&upcoming(e,new Date(),90));
    const source=(feed?.sources||[]).find(s=>departmentKey(s.name)===departmentKey(selected));
    if(selected&&!all.length&&source&&source.status!=='checked')return '<div class="empty"><h2>This department’s schedule is not available yet</h2><p>The official page could not be fully read. This does not mean there are no seminars. Use Department calendar above to check the official schedule.</p></div>';
    return '<div class="empty"><h2>No listed talks match these filters</h2><p>'+(all.length?'Talks are listed within the next 90 days. Widen the date range and clear the search to see them.':'No upcoming talks are currently collected here. Check the official calendar; additional talks may not be included.')+'</p>'+(all.length?'<button type="button" id="seminarWiden" class="secondary">Show next 90 days</button>':'')+'</div>';
  }
  function when(e){
    if(e.start.length===10||e.allDay)return e.start.slice(0,10)+' · Time to be confirmed';
    const start=new Date(e.start);return new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(start)+(e.allDay?' · Time to be confirmed':'');
  }
  function card(e){
    const location=[e.location,e.room].filter(Boolean).join(' · ')||(e.experience==='virtual'?'Online · See official event':'Location to be confirmed');
    return '<article class="card"><div class="cardtop"><span class="funding-badge">'+esc(e.kind||'Seminar')+'</span>'+(e.sourceStatus==='saved'?'<span class="small">Saved schedule · Recheck official page</span>':'')+'</div><h2><a href="'+esc(safe(e.url))+'" target="_blank" rel="noopener noreferrer">'+esc(e.title)+'</a></h2><p class="seminar-time">'+esc(when(e))+'</p><p class="meta">'+esc(e.departments.join(' · '))+'</p>'+(e.speaker?'<p class="meta">'+esc(e.speaker)+(e.institution?' · '+esc(e.institution):'')+'</p>':'')+'<p class="meta">'+esc(location)+'</p><div class="cardbottom"><a class="small" href="'+esc(safe(e.url))+'" target="_blank" rel="noopener noreferrer">Event details ↗</a>'+(safe(e.registrationUrl)?'<a class="small" href="'+esc(safe(e.registrationUrl))+'" target="_blank" rel="noopener noreferrer">Register ↗</a>':'')+(safe(e.calendarUrl)?'<a class="small" href="'+esc(safe(e.calendarUrl))+'" target="_blank" rel="noopener noreferrer">Add to calendar ↗</a>':'')+'</div></article>';
  }
  function renderSeminars(){
    const active=view==='seminars';el('seminarView').hidden=!active;el('seminarNav').classList.toggle('active',active);if(!active)return;
    const events=rows();page=Math.min(page,Math.max(0,Math.ceil(events.length/30)-1));
    el('seminarChecked').textContent=(!feed?.checkedAt?'Waiting for the first automatic source check.':'Last source check '+new Date(feed.checkedAt).toLocaleString('en-US'))+(failed?' · Latest feed unavailable; showing saved schedule.':'')+(feed?.partial?' · Some sources need checking; coverage is incomplete.':'');
    el('seminarCount').textContent=events.length+' upcoming talks · Stanford time (Pacific)';
    el('seminarCards').innerHTML=events.length?events.slice(page*30,(page+1)*30).map(card).join(''):emptyState();
    const widen=document.getElementById('seminarWiden');if(widen)widen.onclick=()=>{el('seminarRange').value='90';el('seminarSearch').value='';page=0;updateDepartments();renderSeminars();};
    el('seminarPage').textContent='Page '+(page+1)+' of '+Math.max(1,Math.ceil(events.length/30));el('seminarPagination').hidden=events.length<=30;el('seminarPrevious').disabled=page===0;el('seminarNext').disabled=(page+1)*30>=events.length;
    el('seminarSources').innerHTML=(feed?.sources||[]).filter(relevantSource).map(s=>'<li><a href="'+esc(safe(s.url))+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a> · <span>'+(s.status==='checked'?'Checked':'Source check incomplete')+'</span></li>').join('');
    const selected=el('seminarDepartment').value;
    el('seminarDepartmentLink').hidden=!selected;const entry=(feed?.departments||[]).find(d=>departmentKey(d.name)===departmentKey(selected)),source=(feed?.sources||[]).find(d=>departmentKey(d.name)===departmentKey(selected));
    el('seminarDepartmentLink').href=safe(source?.url||entry?.url)||'https://events.stanford.edu/';
  }
  async function refresh(){
    if(loading||Date.now()-lastAttempt<300000)return;loading=true;lastAttempt=Date.now();renderSeminars();
    try{
      let next;for(const source of ['https://raw.githubusercontent.com/ShannChen/reading-garden/main/data/seminar-feed.json','data/seminar-feed.json']){
        try{const response=await fetch(source,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)continue;const d=await response.json();if(valid(d)){next=d;break;}}catch{}
      }
      if(!next)throw Error();feed=next;failed=false;try{localStorage.setItem(cacheKey,JSON.stringify(feed));}catch{}updateDepartments();
    }catch{failed=true;}finally{loading=false;renderSeminars();}
  }
  try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(valid(cached))feed=cached;}catch{}
  updateDepartments();const previousRender=render;render=function(){previousRender();renderSeminars();};
  el('seminarNav').onclick=()=>{view='seminars';render();refresh();};
  for(const id of ['seminarSearch','seminarRange','seminarDepartment'])el(id).addEventListener(id==='seminarSearch'?'input':'change',()=>{page=0;if(id==='seminarRange')updateDepartments();renderSeminars();});
  el('seminarPrevious').onclick=()=>{page=Math.max(0,page-1);renderSeminars();};el('seminarNext').onclick=()=>{page++;renderSeminars();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&view==='seminars')refresh();});
  addEventListener('online',()=>{if(view==='seminars'){lastAttempt=0;refresh();}});setInterval(()=>{if(!document.hidden&&view==='seminars')refresh();},600000);
  window.ReadingGardenSeminars={valid,rows,departmentKey,inScope};renderSeminars();
})();
