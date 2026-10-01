const fs=require('fs'),vm=require('vm'),assert=require('assert');
const core=require('../sync-core.js');
const row=(id,title)=>({id,title,status:'todo',tags:[],updated:1});
const data=(papers=[],ideas=[],tasks=[])=>({papers,ideas,tasks});
let base=data([row('a','Old'),row('b','Keep')]);
let result=core.merge(base,data([row('a','Edited here'),row('b','Keep')]),data([row('a','Old'),row('b','Edited there')]));
assert.equal(result.conflicts.length,0);assert.deepEqual(result.data.papers.map(r=>r.title),['Edited here','Edited there']);
result=core.merge(base,base,data([row('b','Keep')]));assert.deepEqual(result.data.papers.map(r=>r.id),['b']);
result=core.merge(base,data([row('a','Local'),row('b','Keep')]),data([row('b','Keep')]));assert.equal(result.conflicts.length,1);
assert(!core.merge(base,data([row('a','Local'),row('b','Keep')]),data([row('b','Keep')]),'remote').data.papers.some(r=>r.id==='a'));
assert.equal(core.merge(data(),data([row('new','Added')]),data([row('remote','Added remotely')])).data.papers.length,2);
const html=fs.readFileSync('index.html','utf8');
for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
new vm.Script(fs.readFileSync('cloud-sync.js','utf8'));new vm.Script(fs.readFileSync('sw.js','utf8'));
const OWNER='3ad0b62f-79e2-4cff-8b78-0352fd42e8f1',prefix='reading-garden-owner-'+OWNER;
const storage=new Map([['reading-garden-v1',JSON.stringify([row('guest','Local paper')])]]);
const nodes=new Map,listeners={};
function node(id){id=id.replace(/^#/,'');if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,style:{},disabled:false,classList:{toggle(){}},addEventListener(){},querySelector(){return node('span')},elements:new Proxy({},{get:(t,k)=>node('field-'+id+'-'+k)}),close(){this.open=false},showModal(){this.open=true}});return nodes.get(id)}
let authCallback,session=null,server=null,writes=0,allow=true,error=null,writeHook=null;
const api={auth:{onAuthStateChange:f=>authCallback=f,getSession:async()=>({data:{session}}),signInWithPassword:async()=>{session={user:{id:OWNER}};authCallback('SIGNED_IN',session);return {data:session}},signOut:async()=>{session=null;authCallback('SIGNED_OUT',null);return {error:null}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:server,error})})})}),rpc:async(_name,args)=>{
  if(writeHook){const hook=writeHook;writeHook=null;hook();}
  if(args.expected_revision!==(server?.revision||0))return {error:{code:'40001'}};
  writes++;server={payload:JSON.parse(JSON.stringify(args.new_payload)),revision:(server?.revision||0)+1};return {data:[JSON.parse(JSON.stringify(server))]};
}};
const document={getElementById:node,querySelector:node,querySelectorAll:()=>[],addEventListener:(k,f)=>(listeners[k]??=[]).push(f),dispatchEvent:e=>(listeners[e.type]||[]).forEach(f=>f()),hidden:false,createElement:()=>({}),head:{appendChild:s=>Promise.resolve().then(()=>s.onload())}};
const ctx={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{onLine:true},console,URL,Blob,crypto:{randomUUID:()=> 'new'},Event:class{constructor(type){this.type=type}},setTimeout:(f,ms)=>{if(!ms)Promise.resolve().then(f);return 1},setInterval(){},clearTimeout(){},addEventListener(){},confirm:()=>allow,window:{supabase:{createClient:()=>api}}};
vm.createContext(ctx);
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],ctx);
vm.runInContext(fs.readFileSync('sync-core.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('cloud-sync.js','utf8'),ctx);
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
(async()=>{
  node('cloudForm').elements.email.value='owner@example.test';node('cloudForm').elements.password.value='test-only';
  error={code:'PGRST205'};
  await node('cloudForm').onsubmit({preventDefault(){},target:node('cloudForm')});await settle();
  assert(node('syncStatus').textContent.includes('Cloud setup needed'));assert.equal(vm.runInContext('papers.length',ctx),1);assert.equal(writes,0);
  error=null;await node('cloudNow').onclick();await settle();
  assert.equal(vm.runInContext('papers.length',ctx),0);assert.equal(JSON.parse(storage.get('reading-garden-v1')).length,1);
  node('cloudImport').onclick();await node('cloudNow').onclick();await settle();
  assert.equal(server.payload.papers[0].id,'guest');assert.equal(writes,1);
  server.payload.papers.push(row('phone','From phone'));server.revision++;
  await node('cloudNow').onclick();assert.equal(vm.runInContext('papers.length',ctx),2);
  vm.runInContext("papers.find(p=>p.id==='guest').status='reading';persist()",ctx);
  await node('cloudNow').onclick();assert.equal(server.payload.papers.find(p=>p.id==='guest').status,'reading');
  // A record deleted on the phone must disappear on the unchanged Mac.
  server.payload.papers=server.payload.papers.filter(p=>p.id!=='phone');server.revision++;
  await node('cloudNow').onclick();assert.equal(vm.runInContext('papers.length',ctx),1);
  // Simulate another device winning a write while the request is in flight.
  vm.runInContext("ideas.push({id:'i',title:'Idea',body:'Keep',updated:1});persist()",ctx);
  writeHook=()=>{server.payload.tasks.push({id:'t',text:'Other device',date:'2026-10-01',done:false,updated:1});server.revision++};
  await node('cloudNow').onclick();assert.equal(server.payload.ideas.length,1);assert.equal(server.payload.tasks.length,1);
  // Preserve an edit made in this tab while its own write is in flight.
  vm.runInContext("papers[0].notes='First edit';persist()",ctx);
  writeHook=()=>vm.runInContext("papers[0].notes='Second edit';persist()",ctx);
  await node('cloudNow').onclick();assert.equal(vm.runInContext('papers[0].notes',ctx),'Second edit');
  await node('cloudNow').onclick();assert.equal(server.payload.papers[0].notes,'Second edit');
  await node('cloudLogout').onclick();await settle();assert.equal(vm.runInContext('storageNamespace',ctx),'');assert.equal(vm.runInContext('papers[0].status',ctx),'todo');assert(storage.has(prefix+':reading-garden-v1'));
  console.log('PASS: merge/add/delete conflicts, missing setup, explicit migration, sync both ways, revision races, in-flight edits, local-mode separation and logout');
})().catch(e=>{console.error(e);process.exit(1)});
