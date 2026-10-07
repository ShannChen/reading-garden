(function(root){
  'use strict';
  const prefs=root.ReadingGardenFeedPreferences,base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const quote=s=>'"'+String(s).replace(/["\\\[\]]/g,' ').trim()+'"';
  const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&');
  let nextRequest=0;
  async function get(name,params){
    const wait=Math.max(0,nextRequest-Date.now());nextRequest=Math.max(nextRequest,Date.now())+400;
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    const url=new URL(base+name);for(const [key,value] of Object.entries({db:'pubmed',retmode:'json',...params}))url.searchParams.set(key,value);
    const long=url.href.length>1800,init={signal:AbortSignal.timeout(15000)};if(long){init.method='POST';init.headers={'Content-Type':'application/x-www-form-urlencoded'};init.body=url.searchParams.toString();}
    const r=await fetch(long?base+name:url,init);if(!r.ok)throw Error('PubMed unavailable');const data=await r.json();if(data.error)throw Error('PubMed unavailable');return data;
  }
  function publicationDate(value){
    const s=String(value||''),ymd=s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    if(ymd)return ymd.slice(1).join('-');
    const m=s.match(/^(\d{4})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s*(\d{1,2})?/i);
    if(m){const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase())+1;return m[1]+'-'+String(month).padStart(2,'0')+'-'+String(m[3]||1).padStart(2,'0');}
    return /^\d{4}$/.test(s)?s+'-01-01':'';
  }
  function fromSummary(w,s,today,start){
    const doi=String((w.articleids||[]).find(a=>a.idtype==='doi')?.value||'').toLowerCase(),title=plain(w.title),journal=plain(w.fulljournalname||w.source);
    const published=[w.epubdate,w.pubdate,w.sortpubdate].map(publicationDate).find(Boolean);
    if(!/^10\.\d{4,9}\/\S+$/.test(doi)||!title||!journal||!published||published<start||published>today)return null;
    const p={doi,title,journal,published,year:published.slice(0,4),authors:(w.authors||[]).map(a=>a.name).filter(Boolean).join(', '),link:'https://doi.org/'+doi,tags:[s.name],groups:[s.id],issn:[w.issn,w.essn].filter(Boolean),matchSource:'PubMed indexed metadata',pmid:String(w.uid||'')};
    return prefs.scoped(p,s)?p:null;
  }
  async function papers(s,today=new Date().toISOString().slice(0,10),options={}){
    if(!s.journals.length)return {papers:[],partial:false,skipped:true};
    const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-90);const start=date.toISOString().slice(0,10);
    const topic=prefs.terms(s).map(t=>quote(t)+'[All Fields]').join(' OR '),journals=s.journals.map(j=>quote(prefs.journalISSN(j)||j)+'[Journal]').join(' OR ');
    const term='('+topic+') AND ('+journals+') AND ('+quote(start.replaceAll('-','/'))+'[Date - Publication] : '+quote(today.replaceAll('-','/'))+'[Date - Publication])';
    const search=await get('esearch.fcgi',{term,retmax:'10000',sort:'pub_date'}),r=search.esearchresult;
    if(!r||!Array.isArray(r.idlist)||!r.idlist.every(id=>/^\d+$/.test(id)))throw Error('Invalid PubMed response');
    const partial=Number(r.count)>r.idlist.length;if(!r.idlist.length)return {papers:[],partial};
    const found=new Map();let missing=0;
    for(let offset=0;offset<r.idlist.length;offset+=200){
      if(options.isCurrent&&!options.isCurrent())throw Error('Search superseded');
      const ids=r.idlist.slice(offset,offset+200);
      try{
        const data=await get('esummary.fcgi',{id:ids.join(',')}),summary=data.result;if(!summary)throw Error('Invalid PubMed response');
        for(const id of ids){if(!summary[id]||summary[id].error){missing++;continue;}const p=fromSummary(summary[id],s,today,start);if(p)found.set(p.doi,p);}
      }catch{missing+=ids.length;}
      if(options.isCurrent&&!options.isCurrent())throw Error('Search superseded');
      options.onBatch?.({papers:[...found.values()],partial:true});
    }
    return {papers:[...found.values()],partial:partial||missing>0};
  }
  const api={papers,fromSummary,publicationDate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReadingGardenPubMed=api;
})(typeof globalThis!=='undefined'?globalThis:this);
