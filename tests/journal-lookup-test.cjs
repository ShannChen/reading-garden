const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),prefs=require('../feed-preferences.js');
const nodes={},timers=new Map();let timerId=0,requests=[],pending=[];
function node(id){return nodes[id]||=( {value:'',textContent:'',innerHTML:'',hidden:false,attributes:{},events:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.events[k]=f;},focus(){this.focused=true;},querySelectorAll(){return [...this.innerHTML.matchAll(/data-journal-index="(\d+)"/g)].map(m=>({dataset:{journalIndex:m[1]},classList:{toggle(){}}}));}} );}
node('subscriptionForm').elements={journals:{value:''}};
const ctx={ReadingGardenFeedPreferences:prefs,document:{getElementById:node},URL,AbortController,setTimeout:(f,ms)=>{const id=++timerId;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,opts)=>{requests.push({url:String(url),signal:opts.signal});return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('journal-lookup.js','utf8'),ctx);
const input=node('journalSearch'),field=node('subscriptionForm').elements.journals;
const type=q=>{input.value=q;input.events.input();};
const fire=()=>{for(const [id,t] of [...timers])if(t.ms===350){timers.delete(id);t.f();}};
const reply=(i,items)=>pending[i].resolve({ok:true,json:async()=>({message:{items}})});
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const key=k=>{let prevented=false;input.events.keydown({key:k,preventDefault(){prevented=true;},stopPropagation(){}});return prevented;};
(async()=>{
 assert.equal(field.value,'');type('N');fire();assert.equal(requests.length,0);
 type('Nat');type('Nature Meta');fire();assert.equal(requests.length,1);assert.equal(new URL(requests[0].url).pathname,'/journals');assert.equal(new URL(requests[0].url).searchParams.get('query'),'Nature Meta');
 reply(0,[{title:'Nature Metabolism',publisher:'Springer Nature',ISSN:['2522-5812']},{title:'Nature Metabolism'},{title:'Metabolism & Science',publisher:'<Publisher>'},{title:null}]);await settle();
 assert.equal(node('journalSuggestions').hidden,false);assert.match(node('journalSuggestions').innerHTML,/2522-5812/);assert.match(node('journalSuggestions').innerHTML,/&lt;Publisher&gt;/);assert.equal(node('journalSuggestions').querySelectorAll().length,2);assert.equal(field.value,'');
 assert(key('ArrowDown'));assert(key('Enter'));assert.equal(field.value,'Nature Metabolism');assert.equal(input.value,'');assert.equal(node('journalSuggestions').hidden,true);
 type('metabolism');fire();reply(1,[{title:'Nature Metabolism'}]);await settle();key('Enter');assert.equal(field.value,'Nature Metabolism');assert.match(node('journalSearchStatus').textContent,/already selected/);
 type('Science');fire();type('Cell');fire();assert.equal(requests[2].signal.aborted,true);reply(3,[{title:'Cell'}]);await settle();reply(2,[{title:'Science'}]);await settle();assert.match(node('journalSuggestions').innerHTML,/>Cell</);assert.doesNotMatch(node('journalSuggestions').innerHTML,/>Science</);key('Enter');assert.equal(field.value,'Nature Metabolism\nCell');
 type('missing');fire();reply(4,[]);await settle();assert.match(node('journalSearchStatus').textContent,/manually/);assert.equal(node('journalSuggestions').hidden,true);assert(key('Enter'));
 type('error');fire();pending[5].reject(Error('offline'));await settle();assert.match(node('journalSearchStatus').textContent,/unavailable/);
 type('late');fire();node('subscriptionForm').events.reset();reply(6,[{title:'Late result'}]);await settle();assert.equal(input.value,'');assert.equal(node('journalSuggestions').hidden,true);assert.equal(node('journalSearchStatus').textContent,'');
 field.value=Array.from({length:10},(_,i)=>'Journal '+i).join('\n');type('extra');fire();reply(7,[{title:'Extra'}]);await settle();key('Enter');assert.equal(field.value.split('\n').length,10);assert.match(node('journalSearchStatus').textContent,/up to 10/);key('Escape');assert.equal(node('journalSuggestions').hidden,true);
 console.log('PASS: debounce, metadata suggestions, escaped titles, explicit selection, multiple journals, duplicate and limit guards, keyboard selection, stale response cancellation, form reset, no matches and offline fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
