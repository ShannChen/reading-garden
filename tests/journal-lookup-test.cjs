const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),prefs=require('../feed-preferences.js');
const nodes={},timers=new Map();let timerId=0,requests=[],pending=[],workRequests=[],abbreviationWorks=[];
function node(id){return nodes[id]||=( {value:'',textContent:'',innerHTML:'',hidden:false,attributes:{},events:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.events[k]=f;},focus(){this.focused=true;},querySelectorAll(){return [...this.innerHTML.matchAll(/data-journal-index="(\d+)"/g)].map(m=>({dataset:{journalIndex:m[1]},classList:{toggle(){}}}));}} );}
node('subscriptionForm').elements={journals:{value:''}};
const ctx={ReadingGardenFeeds:{addJournal(title){const list=field.value.split('\n').filter(Boolean);if(list.some(j=>prefs.norm(j)===prefs.norm(title)))return 'This journal is already selected.';if(list.length>=200)return 'Use up to 200 journals.';field.value=[...list,title].join('\n');return '';}},ReadingGardenFeedPreferences:prefs,document:{getElementById:node},URL,AbortController,setTimeout:(f,ms)=>{const id=++timerId;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,opts)=>{if(new URL(url).pathname==='/works'){workRequests.push(String(url));return Promise.resolve({ok:true,json:async()=>({message:{items:abbreviationWorks}})});}requests.push({url:String(url),signal:opts.signal});return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('journal-lookup.js','utf8'),ctx);
const input=node('journalSearch'),field=node('subscriptionForm').elements.journals;
const type=q=>{input.value=q;input.events.input();};
const fire=()=>{for(const [id,t] of [...timers])if(t.ms===350){timers.delete(id);t.f();}};
const reply=(i,items)=>pending[i].resolve({ok:true,json:async()=>({message:{items}})});
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
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
 type('offlineerror');fire();pending[5].reject(Error('offline'));await settle();assert.match(node('journalSearchStatus').textContent,/unavailable/);
 type('late');fire();node('subscriptionForm').events.reset();reply(6,[{title:'Late result'}]);await settle();assert.equal(input.value,'');assert.equal(node('journalSuggestions').hidden,true);assert.equal(node('journalSearchStatus').textContent,'');
 field.value=Array.from({length:200},(_,i)=>'Journal '+i).join('\n');type('extra');fire();reply(7,[{title:'Extra'}]);await settle();key('Enter');assert.equal(field.value.split('\n').length,200);assert.match(node('journalSearchStatus').textContent,/up to 200/);key('Escape');assert.equal(node('journalSuggestions').hidden,true);
 field.value='';type('nature');fire();assert.match(node('journalSuggestions').innerHTML,/>Nature</);assert.equal(field.value,'');
 reply(8,[{title:'NatureJobs'},{title:'Naturen'},{title:'Nature Genetics'}]);await settle();assert.match(node('journalSuggestions').innerHTML,/data-journal-index="0"><strong>Nature</);assert.match(node('journalSuggestions').innerHTML,/0028-0836/);key('Enter');assert.equal(field.value,'Nature');
 type('cell');fire();reply(9,[]);await settle();assert.match(node('journalSuggestions').innerHTML,/data-journal-index="0"><strong>Cell</);assert.match(node('journalSuggestions').innerHTML,/0092-8674/);assert.equal(field.value,'Nature');
 type('science');fire();pending[10].reject(Error('offline'));await settle();assert.match(node('journalSuggestions').innerHTML,/>Science</);assert.match(node('journalSearchStatus').textContent,/verified journal/);
 type('Generic');fire();reply(11,[{title:'Generic Biology'},{title:'Unrelated'},{title:'Generic'}]);await settle();assert.match(node('journalSuggestions').innerHTML,/data-journal-index="0"><strong>Generic</);assert.equal(new URL(requests[11].url).searchParams.get('rows'),'100');
 field.value='';type('pnas');fire();assert.match(node('journalSuggestions').innerHTML,/Proceedings of the National Academy of Sciences/);assert.match(node('journalSuggestions').innerHTML,/0027-8424/);assert.equal(field.value,'');
 assert.equal(new URL(requests[12].url).searchParams.get('query'),'Proceedings of the National Academy of Sciences');
 reply(12,[{title:'PNAS Nexus',ISSN:['2752-6542']}]);await settle();assert.match(node('journalSuggestions').innerHTML,/data-journal-index="0"><strong>Proceedings/);assert.match(node('journalSuggestions').innerHTML,/PNAS Nexus/);key('Enter');assert.equal(field.value,'Proceedings of the National Academy of Sciences');
 abbreviationWorks=[{'container-title':['Journal of Example Science'],'short-container-title':['JES'],ISSN:['1234-5678']},{'container-title':['Wrong Journal'],'short-container-title':['WJ']}];
 type('jes');fire();reply(13,[]);await settle();assert.match(node('journalSuggestions').innerHTML,/Journal of Example Science/);assert.doesNotMatch(node('journalSuggestions').innerHTML,/Wrong Journal/);assert.ok(workRequests.length);key('Enter');assert.equal(field.value,'Proceedings of the National Academy of Sciences\nJournal of Example Science');
 field.value='';input.value='PNAS';node('addJournalManual').onclick();assert.equal(field.value,'Proceedings of the National Academy of Sciences');
 console.log('PASS: PNAS alias expansion and generic abbreviation fallback, debounce, metadata suggestions, escaped titles, explicit selection, multiple journals, duplicate and limit guards, keyboard selection, stale response cancellation, form reset, no matches and offline fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});



