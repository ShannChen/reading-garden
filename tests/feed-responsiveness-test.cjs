const vm=require('vm'),fs=require('fs'),assert=require('assert/strict'),prefs=require('../feed-preferences.js');
const nodes={},store={},family=['nature','cell','science','est'].map(value=>({value,checked:true})),events={};let saves=0,requests=[];
const node=id=>nodes[id]||=({id,value:'',textContent:'',innerHTML:'',hidden:false,dataset:{},classList:{toggle(){}},addEventListener:(name,fn)=>events[id+':'+name]=fn,showModal(){this.open=true},close(){this.open=false},getBoundingClientRect:()=>({left:0,right:500,top:0,bottom:500}),querySelectorAll(selector){const match=selector.match(/^\[data-([\w-]+)\]$/);if(!match)return [];this.buttonCache||={};if(this.buttonCache[selector]?.html===this.innerHTML)return this.buttonCache[selector].buttons;const attr='data-'+match[1],key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());const buttons=[...this.innerHTML.matchAll(new RegExp(attr+'="([^"]+)"','g'))].map(m=>({dataset:{[key]:m[1]},classList:{toggle(){}},querySelector(){return this.span||={textContent:''}},value:'',addEventListener(name,fn){this[name]=fn}}));this.buttonCache[selector]={html:this.innerHTML,buttons};return buttons;}});
const f=node('subscriptionForm');f.elements={name:{value:''},keywords:{value:''},journals:{value:''}};f.reset=()=>{for(const x of Object.values(f.elements))x.value='';family.forEach(x=>x.checked=false)};f.querySelectorAll=s=>s.includes(':checked')?family.filter(x=>x.checked):family;
const work={DOI:'10.1038/test',title:['Lipidomics profiling'],'container-title':['Nature Metabolism'],'published-online':{'date-parts':[[2026,10,1]]},author:[{given:'A',family:'Scientist'}]};
const context={ReadingGardenFeedPreferences:prefs,document:{getElementById:node,querySelectorAll:s=>node(s.split(' ')[0].slice(1)).querySelectorAll(s.split(' ')[1]),addEventListener(){}},storageKey:k=>k,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},view:'papers',papers:[],render(){},esc:s=>String(s),crypto:require('crypto').webcrypto,toast(){},confirm:()=>true,navigator:{onLine:true},addEventListener(){},setInterval(){},queueMicrotask,AbortSignal,URL,fetch:async u=>{requests.push(String(u));return {ok:true,json:async()=>String(u).includes('crossref')?{message:{items:[work],'total-results':1}}:{version:1,checkedAt:'2026-10-05T00:00:00Z',papers:[]}}}};
context.window=context;const ctx=vm.createContext(context);ctx.persist=()=>{saves++;vm.runInContext("localStorage.setItem('reading-garden-paper-colors-v1',JSON.stringify(paperColors))",ctx);ctx.ReadingGardenFeeds.saveLocal();ctx.render()};const helpers=fs.readFileSync('index.html','utf8').split('const PAPER_COLORS=')[1].split('function render(){')[0];vm.runInContext('const PAPER_COLORS='+helpers,ctx);vm.runInContext(fs.readFileSync('paper-feed.js','utf8'),ctx);
const tick=()=>new Promise(r=>setImmediate(r));

(async()=>{
 await tick();
 const timers=new Map(),frames=[];let timerId=0,searches=[];
 ctx.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId};ctx.clearTimeout=id=>timers.delete(id);ctx.requestAnimationFrame=fn=>frames.push(fn);
 ctx.fetch=async()=>({ok:false});
 const p={doi:'10.1016/stable',title:'Indexed study',journal:'Cell',published:'2026-10-01',tags:['Epitranscriptomics'],groups:['epi']};
 ctx.ReadingGardenPubMed={papers:async(s,today,options)=>{searches.push([...s.journals]);options.onBatch({papers:[p],partial:true});options.onBatch({papers:[p],partial:true});return {papers:[p],partial:false};}};
 const sub={id:'epi',name:'Epitranscriptomics',keywords:['epitranscriptomics'],journals:[],families:[],enabled:true};
 ctx.ReadingGardenFeeds.setState([{id:'feed-settings',subscriptions:[sub],journals:[],updated:1}]);
 ctx.ReadingGardenFeeds.addJournal('Cell');ctx.ReadingGardenFeeds.addJournal('Nature');ctx.ReadingGardenFeeds.addJournal('Science');
 assert.equal(searches.length,0);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,1200);
 const fn=[...timers.values()][0].fn;timers.clear();fn();for(let i=0;i<30;i++)await tick();
 assert.deepEqual(searches,[['Cell','Nature','Science']]);assert.equal(frames.length,1,'multiple result batches share a paint');frames.shift()();
 let writes=0,html=node('feedNav').innerHTML;Object.defineProperty(node('feedNav'),'innerHTML',{get:()=>html,set:v=>{writes++;html=v},configurable:true});
 for(let i=0;i<5;i++)ctx.render();assert.equal(writes,0,'unchanged sidebar buttons stay mounted');
 assert.equal(node('feedNav').querySelectorAll('[data-feed]')[0].querySelector('span').textContent,'1');ctx.ReadingGardenFeeds.addJournal('Nature Methods');assert.equal(writes,0,'adding a journal retains the old indexed result count');
 assert(prefs.terms(sub).includes('RNA methylation'));assert(prefs.terms(sub).includes('pseudouridylation'));assert(prefs.terms(sub).includes('N6-methyladenosine'));assert(prefs.matches('RNA modifications affect translation',sub));assert(!prefs.matches('m6A alone',sub));
 assert(prefs.terms({...sub,keywords:['microbiome']}).includes('metagenomics'));assert(prefs.terms({...sub,keywords:['multiomics']}).includes('integrated omics'));
 console.log('PASS: rapid journal additions debounce to one latest-settings search; result batches coalesce; sidebar DOM remains mounted; previous indexed counts survive journal expansion; restored domain synonyms.');
})().catch(e=>{console.error(e);process.exitCode=1});
