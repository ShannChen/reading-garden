const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),prefs=require('../feed-preferences.js');
const requests=[];let count=201,failBatch=false;
const ids=()=>Array.from({length:Math.min(count,201)},(_,i)=>String(42000000+i));
const subscription={id:'metabolomics',name:'Metabolomics',keywords:['metabolomics'],journals:['Proceedings of the National Academy of Sciences','Cell'],families:[],enabled:true};
const record=id=>({uid:id,title:'A new biomarker study',fulljournalname:'Proceedings of the National Academy of Sciences of the United States of America',issn:'0027-8424',pubdate:'2026 Oct 6',epubdate:'2026 Oct 1',authors:[{name:'Scientist A'}],articleids:[{idtype:'doi',value:'10.1073/pnas.'+id}]});
const ctx={ReadingGardenFeedPreferences:prefs,URL,AbortSignal,Date,setTimeout:f=>{f();return 1;},fetch:async(url,opts)=>{const u=new URL(url),p=opts.method==='POST'?new URLSearchParams(opts.body):u.searchParams;requests.push({u,p,opts});if(u.pathname.endsWith('esearch.fcgi'))return {ok:true,json:async()=>({esearchresult:{count:String(count),idlist:ids()}})};if(failBatch&&p.get('id').split(',').length===1)throw Error('batch unavailable');return {ok:true,json:async()=>({result:Object.fromEntries(p.get('id').split(',').map(id=>[id,record(id)]))})};}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('pubmed-feed.js','utf8'),ctx);
(async()=>{
 let batches=0;let r=await ctx.ReadingGardenPubMed.papers(subscription,'2026-10-07',{onBatch:()=>batches++});assert.equal(r.papers.length,201);assert.equal(batches,2);assert.equal(r.partial,false);assert.equal(r.papers[0].published,'2026-10-01');assert.equal(r.papers[0].authors,'Scientist A');
 const q=requests[0].p.get('term');assert.match(q,/metabolomics.*All Fields/);assert.match(q,/metabolomic.*All Fields/);assert.match(q,/0027-8424.*Journal/);assert.match(q,/0092-8674.*Journal/);assert.match(q,/2026\/07\/09/);assert.doesNotMatch(q,/Nature|Cell Metabolism/);assert.equal(requests[0].p.get('retmax'),'10000');
 assert.equal(ctx.ReadingGardenPubMed.fromSummary({...record('1'),issn:'',fulljournalname:'Cell Metabolism'},subscription,'2026-10-07','2026-07-09'),null);
 assert.equal(ctx.ReadingGardenPubMed.fromSummary({...record('2'),epubdate:'2025 Dec 1'},subscription,'2026-10-07','2026-07-09'),null);
 assert.equal(ctx.ReadingGardenPubMed.fromSummary({...record('3'),articleids:[]},subscription,'2026-10-07','2026-07-09'),null);
 failBatch=true;r=await ctx.ReadingGardenPubMed.papers(subscription,'2026-10-07');assert.equal(r.papers.length,200);assert.equal(r.partial,true);failBatch=false;
 count=10001;r=await ctx.ReadingGardenPubMed.papers(subscription,'2026-10-07');assert.equal(r.partial,true);
 const before=requests.length;await assert.rejects(ctx.ReadingGardenPubMed.papers(subscription,'2026-10-07',{isCurrent:()=>false}),/superseded/);assert.equal(requests.length,before+1);
 r=await ctx.ReadingGardenPubMed.papers({...subscription,journals:[]},'2026-10-07');assert.equal(r.skipped,true);
 console.log('PASS: PubMed indexed-match records without title keywords, complete retrieval beyond 100 records, date parsing, ISSN and journal scope, batched summaries, partial failures, large-result warning and stale-search cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
