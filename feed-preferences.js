(function(root){
  'use strict';
  const families={nature:{name:'Nature Portfolio',prefix:'10.1038'},cell:{name:'Cell Press',prefix:'10.1016'},science:{name:'Science family',prefix:'10.1126'},est:{name:'ES&T / ES&T Letters',prefix:'10.1021'}};
  // PubMed title catalog supplements the broader Crossref family prefix queries.
  const familyJournals={"nature": ["Communications Biology", "Communications Health", "Communications Medicine", "Nature", "Nature Aging", "Nature Biomedical Engineering", "Nature Biotechnology", "Nature Cancer", "Nature Cardiovascular Research", "Nature Cell Biology", "Nature Chemical Biology", "Nature Cities", "Nature Communications", "Nature Genetics", "Nature Materials", "Nature Medicine", "Nature Mental Health", "Nature Metabolism", "Nature Methods", "Nature Microbiology", "Nature Protocols", "Nature Reviews Endocrinology", "Nature Reviews Gastroenterology & Hepatology", "Nature Reviews Genetics", "Nature Reviews Microbiology", "Nature Reviews Molecular Cell Biology", "Nature Reviews Neurology", "Nature Reviews Urology", "Scientific Data", "Scientific Reports", "npj Antimicrobials and Resistance", "npj Biofilms and Microbiomes", "npj Breast Cancer", "npj Clean Water", "npj Dementia", "npj Digital Medicine", "npj Emerging Contaminants", "npj Genomic Medicine", "npj Gut and Liver", "npj Mental Health Research", "npj Metabolic Health and Disease", "npj Microgravity", "npj Parkinson's Disease", "npj Precision Oncology", "npj Regenerative Medicine", "npj Science of Food", "npj Systems Biology and Applications", "npj Vaccines", "npj Women's Health"], "cell": ["biophysical journal", "cancer cell", "cell", "cell biomaterials", "cell chemical biology", "cell genomics", "cell host & microbe", "cell metabolism", "cell reports", "cell reports medicine", "cell reports methods", "cell reports physical science", "cell reports sustainability", "cell stem cell", "cell systems", "cellular and molecular gastroenterology and hepatology", "chem", "chem catalysis", "current biology", "developmental cell", "device", "heliyon", "immunity", "iscience", "joule", "matter", "med", "molecular cell", "molecular plant", "molecular therapy", "molecular therapy methods & clinical development", "molecular therapy nucleic acids", "molecular therapy oncology", "neuron", "one earth", "patterns", "plant communications", "stem cell reports", "structure", "the american journal of human genetics", "trends in biochemical sciences", "trends in biotechnology", "trends in cell biology", "trends in chemistry", "trends in cognitive sciences", "trends in ecology & evolution", "trends in endocrinology & metabolism", "trends in genetics", "trends in immunology", "trends in microbiology", "trends in molecular medicine", "trends in neurosciences", "trends in parasitology", "trends in pharmacological sciences", "trends in plant science"], "science": ["Science", "Science Advances", "Science Immunology", "Science Translational Medicine", "Science Robotics", "Science Signaling"], "est": ["Environmental Science & Technology", "Environmental Science & Technology Letters"]};
  const defaults=[
    ['metabolomics','Metabolomics & Microbiome',['metabolomics','metabolomic','microbiome','microbiota']],
    ['proteomics','Proteomics',['proteomics','proteomic']],
    ['exposomics','Exposome & Exposomics',['exposome','exposomics','exposomic']],
    ['epitranscriptomics','Epitranscriptomics',['epitranscriptomics','epitranscriptomic','RNA methylation','RNA modification','m6A']],
    ['multiomics','Multiomics',['multiomics','multi-omics','multiomic','multi-omic']]
  ].map(([id,name,keywords])=>({id,name,keywords,families:Object.keys(families),journals:[],enabled:true}));
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[‐‑–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function valid(s){return s&&typeof s.id==='string'&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=80&&Array.isArray(s.keywords)&&s.keywords.length>0&&s.keywords.length<=8&&s.keywords.every(k=>typeof k==='string'&&k.trim()&&k.length<=100)&&Array.isArray(s.families)&&s.families.every(k=>k in families)&&Array.isArray(s.journals)&&s.journals.length<=200&&s.journals.every(j=>typeof j==='string'&&j.trim()&&j.length<=150)&&typeof s.enabled==='boolean';}
  function validState(rows){return Array.isArray(rows)&&rows.length<=1&&rows.every(r=>r?.id==='feed-settings'&&Array.isArray(r.subscriptions)&&r.subscriptions.length<=20&&r.subscriptions.every(valid)&&new Set(r.subscriptions.map(s=>s.id)).size===r.subscriptions.length&&(r.journalFamilies===undefined||validFamilies(r.journalFamilies))&&(r.journals===undefined||validJournals(r.journals))&&Number.isFinite(r.updated));}
  function validFamilies(rows){return Array.isArray(rows)&&rows.length<=4&&rows.every(f=>Object.hasOwn(families,f))&&new Set(rows).size===rows.length;}
  function validJournals(rows){return Array.isArray(rows)&&rows.length<=200&&rows.every(j=>typeof j==='string'&&j.trim()&&j.length<=150)&&new Set(rows.map(norm)).size===rows.length;}
  function sharedState(row){
    const result=JSON.parse(JSON.stringify(row||{id:'feed-settings',subscriptions:[],updated:0}));
    const legacy=result.journals===undefined;
    result.journals=legacy?[...new Map(result.subscriptions.flatMap(s=>s.journals).map(j=>[norm(j),j])).values()]:result.journals;
    result.journalFamilies=result.journalFamilies??(result.journals.length?[]:[...new Set(result.subscriptions.flatMap(s=>s.families))]);
    result.subscriptions=result.subscriptions.map(s=>({...s,journals:[...result.journals],families:[...result.journalFamilies]}));
    return result;
  }
  const variantGroups=[
    ['metabolomics','metabolomic','metabolome'],
    ['proteomics','proteomic','proteome'],
    ['microbiome','microbiomes','microbiota','metagenomics','metagenomic','metagenome'],
    ['exposomics','exposomic','exposome'],
    ['epitranscriptomics','epitranscriptomic','RNA methylation','RNA modification','RNA modifications','pseudouridylation','N6-methyladenosine','m6A','m1A','m5C'],
    ['multiomics','multiomic','multi-omics','multi-omic','integrated omics']
  ];
  const variants=Object.fromEntries(variantGroups.flatMap(group=>group.map(word=>[norm(word),group])));
  const terms=s=>[...new Set(s.keywords.flatMap(k=>variants[norm(k)]||[k]))];

  const journalNorm=s=>norm(s).split(' ').filter(w=>w!=='and').join(' ');
  const journalISSN=j=>({
    'nature':'0028-0836','cell':'0092-8674','science':'0036-8075',
    'proceedings of the national academy of sciences':'0027-8424',
    'proceedings of the national academy of sciences of the united states of america':'0027-8424',
    'environmental science technology':'0013-936X'
  })[journalNorm(j)];
  const signature=s=>JSON.stringify({version:4,name:s.name,keywords:terms(s).map(norm).sort(),families:[...s.families].sort(),journals:s.journals.map(norm).sort()});
  const standard=s=>{const d=defaults.find(d=>d.id===s.id);return d&&signature(s)===signature(d);};
  function scoped(p,s){
    if(s.journals.some(j=>journalNorm(j)===journalNorm(p.journal)||(journalISSN(j)&&((p.issn||[]).includes(journalISSN(j))||journalISSN(j)===journalISSN(p.journal)))))return true;
    const j=journalNorm(p.journal);
    return s.families.some(f=>p.doi.startsWith(families[f].prefix+'/')&&(f==='nature'?/^(nature(?: |$)|npj |communications |scientific reports$|scientific data$)/.test(j):f==='science'?['science','science advances','science immunology','science translational medicine','science robotics','science signaling'].includes(j):f==='est'?['environmental science technology','environmental science technology letters'].includes(j):/^(cell(?: |$)|molecular cell$|cancer cell$|developmental cell$|trends in |molecular therapy)/.test(j)||familyJournals.cell.map(journalNorm).includes(j)));
  }
  function matches(text,s){const t=' '+norm(text)+' ';return terms(s).some(k=>t.includes(' '+norm(k)+' ')&&(!['m6a','m1a','m5c'].includes(norm(k))||/\b(?:rna|mrna|trna|rrna)\b/.test(t))); }
  function date(work){for(const k of ['published-online','published','issued','published-print']){const p=work[k]?.['date-parts']?.[0];if(p?.length){const y=Number(p[0]),m=Number(p[1]||1),d=Number(p[2]||1);const test=new Date(Date.UTC(y,m-1,d));if(y>=1500&&y<=2200&&test.getUTCFullYear()===y&&test.getUTCMonth()===m-1&&test.getUTCDate()===d)return test.toISOString().slice(0,p.length>=3?10:p.length===2?7:4);}}return '';}
  const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#\d+;|&\w+;/g,' ');
  function fromWork(w,s,today=new Date().toISOString().slice(0,10)){
    const doi=String(w.DOI||'').toLowerCase(),title=plain(w.title?.[0]),journal=plain(w['container-title']?.[0]),published=date(w);
    if(!/^10\.\d{4,9}\/\S+$/.test(doi)||!title||!journal||!published||published>today)return null;
    const min=new Date(today+'T00:00:00Z');min.setUTCDate(min.getUTCDate()-90);if(published<min.toISOString().slice(0,10))return null;
    if(!matches([title,plain(w.abstract),...(w.subject||[]),...(Array.isArray(w.keyword)?w.keyword:[])].join(' '),s))return null;
    return {doi,title,journal,published,year:published.slice(0,4),authors:(w.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')||a.name||'').join(', '),link:'https://doi.org/'+doi,tags:[s.name],groups:[s.id]};
  }
  const api={familyJournals,validFamilies,families,defaults,norm,terms,journalNorm,journalISSN,valid,validState,validJournals,sharedState,signature,standard,scoped,matches,fromWork};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReadingGardenFeedPreferences=api;
})(typeof globalThis!=='undefined'?globalThis:this);




