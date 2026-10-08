(function(){
  'use strict';
  const el=id=>document.getElementById(id),cacheKey='reading-garden-public-seminars-v1';
  let feed=null,failed=false,loading=false,lastAttempt=0,page=0;
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const valid=d=>d?.version===1&&Array.isArray(d.events)&&d.events.length<=20000&&Array.isArray(d.sources)&&Array.isArray(d.departments)&&d.events.every(e=>typeof e.title==='string'&&typeof e.start==='string'&&Number.isFinite(Date.parse(e.start))&&Array.isArray(e.departments)&&e.departments.every(x=>typeof x==='string')&&!!safe(e.url));
  const dateKey=d=>d.toLocaleDateString('sv-SE',{timeZone:'America/Los_Angeles'});
  function rows(now=new Date()){
    const today=dateKey(now),until=new Date(today+'T00:00:00Z');until.setUTCDate(until.getUTCDate()+Number(el('seminarRange').value||30));const last=until.toISOString().slice(0,10),q=el('seminarSearch').value.trim().toLowerCase(),department=el('seminarDepartment').value;
    return (feed?.events||[]).filter(e=>{
      const day=e.start.length===10?e.start:dateKey(new Date(e.start));
      const stillUpcoming=e.allDay||Date.parse(e.end||e.start)>=now.getTime();
      return day>=today&&day<last&&stillUpcoming&&(!department||e.departments.includes(department))&&[e.title,e.speaker,e.institution,e.location,...e.departments].join(' ').toLowerCase().includes(q);
    }).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
  }
  function updateDepartments(){
    const selected=el('seminarDepartment').value,names=[...new Set([...(feed?.departments||[]).map(d=>d.name),...(feed?.events||[]).flatMap(e=>e.departments)])].sort();
    el('seminarDepartment').innerHTML='<option value="">All departments</option>'+names.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
    el('seminarDepartment').value=names.includes(selected)?selected:'';
  }
  function when(e){
    if(e.start.length===10)return e.start+' · Time to be confirmed';
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
    el('seminarCards').innerHTML=events.length?events.slice(page*30,(page+1)*30).map(card).join(''):'<div class="empty"><h2>'+(loading&&!feed?'Loading Stanford seminars…':'No listed talks match these filters')+'</h2><p>Try all departments or a wider date range. An empty result does not mean a department has no seminars; check its official calendar.</p></div>';
    el('seminarPage').textContent='Page '+(page+1)+' of '+Math.max(1,Math.ceil(events.length/30));el('seminarPagination').hidden=events.length<=30;el('seminarPrevious').disabled=page===0;el('seminarNext').disabled=(page+1)*30>=events.length;
    el('seminarSources').innerHTML=(feed?.sources||[]).map(s=>'<li><a href="'+esc(safe(s.url))+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a> · <span>'+(s.status==='checked'?'Checked':'Source check incomplete')+'</span></li>').join('');
    const selected=el('seminarDepartment').value;
    el('seminarDepartmentLink').hidden=!selected;const entry=(feed?.departments||[]).find(d=>d.name===selected),source=(feed?.sources||[]).find(d=>d.name===selected);
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
  for(const id of ['seminarSearch','seminarRange','seminarDepartment'])el(id).addEventListener(id==='seminarSearch'?'input':'change',()=>{page=0;renderSeminars();});
  el('seminarPrevious').onclick=()=>{page=Math.max(0,page-1);renderSeminars();};el('seminarNext').onclick=()=>{page++;renderSeminars();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&view==='seminars')refresh();});
  addEventListener('online',()=>{if(view==='seminars'){lastAttempt=0;refresh();}});setInterval(()=>{if(!document.hidden&&view==='seminars')refresh();},600000);
  window.ReadingGardenSeminars={valid,rows};renderSeminars();
})();
