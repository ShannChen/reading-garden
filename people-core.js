(function(root){
  'use strict';
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function scholar(value){if(!String(value||'').trim())return '';try{const u=new URL(value);const id=u.searchParams.get('user');if(!/^scholar\.google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(u.hostname)||u.pathname!=='/citations'||!/^https?:$/.test(u.protocol)||!id||! /^[\w-]{5,64}$/.test(id))return null;return 'https://scholar.google.com/citations?user='+encodeURIComponent(id);}catch{return null;}}
  function author(a){
    const id=String(a.id||'').match(/(?:^|\/)A\d+$/)?.[0]?.replace('/','')||'';
    const institutions=a.last_known_institutions||(a.last_known_institution?[a.last_known_institution]:[]);
    const affiliation=institutions.map(i=>i.display_name).filter(s=>typeof s==='string').join('; ');
    const topics=(a.topics?.length?a.topics:a.x_concepts||[]).slice(0,6).map(t=>t.display_name).filter(s=>typeof s==='string');
    const orcid=String(a.orcid||'').match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)?.[0]||'';
    return {name:String(a.display_name||'').trim(),institution:affiliation,fields:[...new Set(topics)],openalexId:id,orcid:orcid?'https://orcid.org/'+orcid:'',scholarUrl:'',notes:'',source:'OpenAlex',worksCount:Number(a.works_count)||0};
  }
  function valid(p){return p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=160&&typeof p.institution==='string'&&p.institution.length<=500&&Array.isArray(p.fields)&&p.fields.length<=20&&p.fields.every(t=>typeof t==='string'&&t.length<=160)&&typeof p.scholarUrl==='string'&&scholar(p.scholarUrl)!==null&&typeof p.notes==='string'&&p.notes.length<=10000&&(!p.openalexId||/^A\d+$/.test(p.openalexId))&&(!p.orcid||/^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(p.orcid))&&(p.starred===undefined||typeof p.starred==='boolean')&&Number.isFinite(p.updated);}
  function duplicate(rows,p,exclude){return rows.find(r=>r.id!==exclude&&((p.openalexId&&r.openalexId===p.openalexId)||(p.orcid&&r.orcid===p.orcid)||(p.scholarUrl&&r.scholarUrl===p.scholarUrl)||(!(p.openalexId&&r.openalexId&&p.openalexId!==r.openalexId)&&!(p.orcid&&r.orcid&&p.orcid!==r.orcid)&&norm(r.name)===norm(p.name)&&norm(r.institution)===norm(p.institution))));}
  const api={norm,scholar,author,valid,duplicate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReadingGardenPeopleCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
