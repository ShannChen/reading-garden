const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const nodes={},store={},selects=[],events={};
function node(id){if(/dailyNav|dailyView|taskDate|taskForm/.test(id))throw Error('Removed checklist accessed');return nodes[id]||=( {value:'',innerHTML:'',textContent:'',style:{},classList:{toggle(){}},dataset:{},elements:{color:{addEventListener:(name,fn)=>events['color:'+name]=fn},status:{addEventListener:(name,fn)=>events['status:'+name]=fn},toShare:{}},addEventListener(){},click(){},reset(){},showModal(){},close(){}} );}
node('#sort').value='new';
const nav=['all','todo','reading','done','share'].map(status=>({dataset:{status},classList:{toggle(){}},querySelector:()=>node('count:'+status)}));
const ctx=vm.createContext({window:{},document:{querySelector:node,querySelectorAll:s=>s==='[data-status]'?nav:s==='[data-paper-status]'?selects:[],dispatchEvent(){}},localStorage:{getItem:k=>store[k]||'[]',setItem:(k,v)=>store[k]=v},crypto:require('node:crypto').webcrypto,URL,Event,confirm:()=>true,setTimeout:()=>1,clearTimeout(){}});
vm.runInContext([...fs.readFileSync('index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],ctx);
const paper={id:'one',status:'todo',title:'Status test',authors:'Manual author',notes:'Keep my notes',tags:[],updated:1};
vm.runInContext('papers='+JSON.stringify([paper])+';render()',ctx);
nav[1].onclick();assert.match(node('#cards').innerHTML,/Status test/);
vm.runInContext("editing='one'",ctx);
events['status:change']({target:{value:'done'}});
assert.doesNotMatch(node('#cards').innerHTML,/Status test/);assert.equal(node('count:todo').textContent,0);assert.equal(node('count:done').textContent,1);
let saved=JSON.parse(store['reading-garden-v1']);assert.equal(saved[0].status,'done');assert.equal(saved[0].authors,paper.authors);assert.equal(saved[0].notes,paper.notes);
node('#editor').close();nav[3].onclick();assert.match(node('#cards').innerHTML,/Status test/);
let change;selects.push({dataset:{paperStatus:'one'},value:'todo',addEventListener:(name,fn)=>{if(name==='change')change=fn;}});
vm.runInContext('render()',ctx);change({stopPropagation(){}});assert.doesNotMatch(node('#cards').innerHTML,/Status test/);
nav[1].onclick();assert.match(node('#cards').innerHTML,/Status test/);
vm.runInContext('editing=null',ctx);events['status:change']({target:{value:'done'}});assert.equal(JSON.parse(store['reading-garden-v1'])[0].status,'todo');
vm.runInContext("updatePaperStatus('one','invalid')",ctx);assert.equal(JSON.parse(store['reading-garden-v1'])[0].status,'todo');
vm.runInContext("setPaperColor('paper:one','red')",ctx);assert.match(node('#cards').innerHTML,/color-red/);assert.equal(JSON.parse(store['reading-garden-paper-colors-v1'])[0].color,'red');vm.runInContext("setPaperColor('paper:one','purple');updatePaperStatus('one','done')",ctx);assert.equal(vm.runInContext("paperColor(papers[0])",ctx),'purple');vm.runInContext("setPaperColor('paper:one','');setPaperColor('paper:one','invalid')",ctx);assert.equal(vm.runInContext("paperColor(papers[0])",ctx),'');assert.equal(vm.runInContext("paperColorKey({doi:'10.1234/ABC'})===paperColorKey({id:'saved',link:'https://doi.org/10.1234/abc'})",ctx),true);vm.runInContext("setPaperColor('doi:10.1234/abc','blue')",ctx);assert.equal(vm.runInContext("paperColor({doi:'10.1234/ABC'})",ctx),'blue');assert.equal(vm.runInContext("paperColor({id:'saved',link:'https://doi.org/10.1234/abc'})",ctx),'blue');console.log('PASS: color persistence, changing/removing colors, invalid color rejection, DOI-shared colors and status preservation;')
console.log('PASS: modal To Read → Read saves immediately and updates lists/counts, closing retains status, card Read → To Read, metadata preservation, new-record protection, invalid-status rejection.');
