(function(root){
  'use strict';
  const families={nature:{name:'Nature Portfolio',prefix:'10.1038'},cell:{name:'Cell Press',prefix:'10.1016'},science:{name:'Science family',prefix:'10.1126'},est:{name:'ES&T / ES&T Letters',prefix:'10.1021'}};
  const defaults=[
    ['metabolomics','Metabolomics & Microbiome',['metabolomics','metabolomic','microbiome','microbiota']],
    ['proteomics','Proteomics',['proteomics','proteomic']],
    ['exposomics','Exposome & Exposomics',['exposome','exposomics','exposomic']],
    ['epitranscriptomics','Epitranscriptomics',['epitranscriptomics','epitranscriptomic','RNA methylation','RNA modification','m6A']],
    ['multiomics','Multiomics',['multiomics','multi-omics','multiomic','multi-omic']]
  ].map(([id,name,keywords])=>({id,name,keywords,families:Object.keys(families),journals:[],enabled:true}));
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[‐‑–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function valid(s){return s&&typeof s.id==='string'&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=80&&Array.isArray(s.keywords)&&s.keywords.length>0&&s.keywords.length<=8&&s.keywords.every(k=>typeof k==='string'&&k.trim()&&k.length<=100)&&Array.isArray(s.families)&&s.families.every(k=>k in families)&&Array.isArray(s.journals)&&s.journals.length<=10&&s.journals.every(j=>typeof j==='string'&&j.trim()&&j.length<=150)&&(s.families.length+s.journals.length)>0&&typeof s.enabled==='boolean';}
  function validState(rows){return Array.isArray(rows)&&rows.length<=1&&rows.every(r=>r?.id==='feed-settings'&&Array.isArray(r.subscriptions)&&r.subscriptions.length<=20&&r.subscriptions.every(valid)&&new Set(r.subscriptions.map(s=>s.id)).size===r.subscriptions.length&&Number.isFinite(r.updated));}
  const signature=s=>JSON.stringify({name:s.name,keywords:s.keywords.map(norm).sort(),families:[...s.families].sort(),journals:s.journals.map(norm).sort()});
  const standard=s=>{const d=defaults.find(d=>d.id===s.id);return d&&signature(s)===signature(d);};
  function scoped(p,s){
    if(s.journals.some(j=>norm(j)===norm(p.journal)))return true;
    const j=norm(p.journal);
    return s.families.some(f=>p.doi.startsWith(families[f].prefix+'/')&&(f==='nature'?/^(nature(?: |$)|npj |communications |scientific reports$|scientific data$)/.test(j):f==='science'?['science','science advances','science immunology','science translational medicine','science robotics','science signaling'].includes(j):f==='est'?['environmental science technology','environmental science technology letters'].includes(j):/^(cell(?: |$)|molecular cell$|cancer cell$|developmental cell$|trends in |molecular therapy)/.test(j)||['immunity','neuron','current biology','iscience','med','joule','matter','chem','chem catalysis','one earth','device','patterns','structure','heliyon','biophysical journal','the american journal of human genetics','molecular plant','plant communications','stem cell reports'].includes(j)));
  }
  function matches(text,s){const t=' '+norm(text)+' ';return s.keywords.some(k=>t.includes(' '+norm(k)+' '));}
  function date(work){for(const k of ['published-online','published','issued','published-print']){const p=work[k]?.['date-parts']?.[0];if(p?.length){const y=Number(p[0]),m=Number(p[1]||1),d=Number(p[2]||1);const test=new Date(Date.UTC(y,m-1,d));if(y>=1500&&y<=2200&&test.getUTCFullYear()===y&&test.getUTCMonth()===m-1&&test.getUTCDate()===d)return test.toISOString().slice(0,p.length>=3?10:p.length===2?7:4);}}return '';}
  const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#\d+;|&\w+;/g,' ');
  function fromWork(w,s,today=new Date().toISOString().slice(0,10)){
    const doi=String(w.DOI||'').toLowerCase(),title=plain(w.title?.[0]),journal=plain(w['container-title']?.[0]),published=date(w);
    if(!/^10\.\d{4,9}\/\S+$/.test(doi)||!title||!journal||!published||published>today)return null;
    const min=new Date(today+'T00:00:00Z');min.setUTCDate(min.getUTCDate()-90);if(published<min.toISOString().slice(0,10))return null;
    if(!matches([title,plain(w.abstract),...(w.subject||[]),...(Array.isArray(w.keyword)?w.keyword:[])].join(' '),s))return null;
    return {doi,title,journal,published,year:published.slice(0,4),authors:(w.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')||a.name||'').join(', '),link:'https://doi.org/'+doi,tags:[s.name],groups:[s.id]};
  }
  const api={families,defaults,norm,valid,validState,signature,standard,scoped,matches,fromWork};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReadingGardenFeedPreferences=api;
})(typeof globalThis!=='undefined'?globalThis:this);
