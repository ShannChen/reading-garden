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
function node(id){id=id.replace(/^#/,'');if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,dataset:{},style:{},disabled:false,classList:{toggle(){}},addEventListener(){},querySelector(){return node('span')},elements:new Proxy({},{get:(t,k)=>node('field-'+id+'-'+k)}),reset(){for(const [key,n] of nodes)if(key.startsWith('field-'+id+'-'))n.value='';this.elements.status.value='todo';},close(){this.open=false},showModal(){this.open=true}});return nodes.get(id)}
let authCallback,session=null,server=null,writes=0,allow=true,error=null,writeHook=null,readHook=null;
const FRIEND='11111111-2222-4333-8444-555555555555';let nextLogin=OWNER,friendServer=null,capable=true,signupCount=0,signupConfirmed=false,signupError=null;
const token=id=>'token-'+id;
function scoped(id){return {from:()=>({select:()=>({eq:(field,uid)=>({maybeSingle:async()=>{assert.equal(field,'owner_id');assert.equal(uid,id);const response={data:JSON.parse(JSON.stringify(id===OWNER?server:friendServer)),error};if(readHook){const hook=readHook;readHook=null;await hook();}return response;}})})}),rpc:async(name,args)=>{
 if(name==='reading_garden_capabilities')return capable?{data:{multiUser:true}}:{error:{code:'PGRST202'}};
 if(writeHook){const hook=writeHook;writeHook=null;hook();}
 let record=id===OWNER?server:friendServer;
 if(args.expected_revision!==(record?.revision||0))return {error:{code:'40001'}};
 writes++;record={payload:JSON.parse(JSON.stringify(args.new_payload)),revision:(record?.revision||0)+1};if(id===OWNER)server=record;else friendServer=record;
 return {data:[JSON.parse(JSON.stringify(record))]};
}};}

const api={auth:{onAuthStateChange:f=>authCallback=f,getSession:async()=>({data:{session}}),signInWithPassword:async()=>{session={user:{id:nextLogin},access_token:token(nextLogin)};authCallback('SIGNED_IN',session);return {data:{user:session.user,session}};},signUp:async args=>{signupCount++;assert.equal(args.options.emailRedirectTo,'https://shannchen.github.io/reading-garden/');if(signupError)return {error:signupError};if(signupConfirmed){session={user:{id:FRIEND},access_token:token(FRIEND)};authCallback('SIGNED_IN',session);return {data:{session}};}return {data:{session:null}};},signOut:async()=>{session=null;authCallback('SIGNED_OUT',null);return {error:null}}},rpc:async()=>capable?{data:{multiUser:true}}:{error:{code:'PGRST202'}}};
const swatches=['red','orange','yellow','green','blue','purple'].map(color=>({dataset:{recordColor:color},attributes:{},setAttribute(k,v){this.attributes[k]=v;},classList:{toggle(){}}}));
const document={getElementById:node,querySelector:node,querySelectorAll:s=>s==='[data-record-color]'?swatches:[],addEventListener:(k,f)=>(listeners[k]??=[]).push(f),dispatchEvent:e=>(listeners[e.type]||[]).forEach(f=>f()),hidden:false,createElement:()=>({}),head:{appendChild:s=>Promise.resolve().then(()=>s.onload())}};
const ctx={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},FormData:class{constructor(form){this.form=form;}get(key){const field=this.form.elements[key];return key==='toShare'?(field.checked?'on':null):field.value;}},navigator:{onLine:true},location:{origin:'https://shannchen.github.io',pathname:'/reading-garden/',hash:'',search:''},console,URL,Blob,crypto:{randomUUID:()=> 'new'},Event:class{constructor(type){this.type=type}},setTimeout:(f,ms)=>{if(!ms)Promise.resolve().then(f);return 1},setInterval(){},clearTimeout(){},addEventListener(){},confirm:()=>allow,window:{supabase:{createClient:(_u,_k,opts)=>opts?.global?.headers?.Authorization?scoped(opts.global.headers.Authorization.slice('Bearer token-'.length)):api}}};
vm.createContext(ctx);
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],ctx);
vm.runInContext(fs.readFileSync('sync-core.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('cloud-sync.js','utf8'),ctx);
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
(async()=>{
  node('cloudForm').elements.email.value='owner@example.test';node('cloudForm').elements.password.value='test-only';
  error={code:'PGRST205'};
  await node('cloudForm').onsubmit({preventDefault(){},target:node('cloudForm')});await settle();
  assert(node('syncStatus').textContent.includes('Cloud setup is not ready'));assert.equal(vm.runInContext('papers.length',ctx),0);assert.equal(JSON.parse(storage.get('reading-garden-v1')).length,1);assert.equal(writes,0);
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

  // Registration is gated by database capability, validates matching passwords,
  // and explains email confirmation without activating an unconfirmed account.
  node('cloudLogin').onclick();node('cloudToggle').onclick();
  const form=node('cloudForm');form.elements.email.value='friend@example.test';form.elements.password.value='strong-test-only';form.elements.confirmPassword.value='different';
  await form.onsubmit({preventDefault(){},target:form});assert.equal(signupCount,0);
  form.elements.confirmPassword.value='strong-test-only';capable=false;await form.onsubmit({preventDefault(){},target:form});assert.equal(signupCount,0);assert.match(node('cloudMessage').textContent,/not open/);
  capable=true;await form.onsubmit({preventDefault(){},target:form});assert.equal(signupCount,1);assert.match(node('cloudMessage').textContent,/confirmation link/);assert.equal(form.elements.password.value,'');assert.equal(vm.runInContext('storageNamespace',ctx),'');
  // A second user gets an empty private account, no owner's cached records.
  nextLogin=FRIEND;form.elements.password.value='strong-test-only';await form.onsubmit({preventDefault(){},target:form});await settle();
  assert.equal(vm.runInContext('storageNamespace',ctx),'reading-garden-owner-'+FRIEND);assert.equal(vm.runInContext('papers.length',ctx),0);
  vm.runInContext("setPaperColor('doi:10.1234/private','blue')",ctx);
  vm.runInContext("papers.push({id:'friend-paper',title:'Friend private paper',tags:[],status:'todo',updated:2});persist()",ctx);await node('cloudNow').onclick();
  assert.equal(friendServer.payload.paperColors[0].color,'blue');assert.equal(server.payload.paperColors?.length||0,0);assert.equal(friendServer.payload.papers[0].id,'friend-paper');assert(!server.payload.papers.some(p=>p.id==='friend-paper'));
  // An in-flight response for A cannot apply to B. Switching immediately clears
  // the old account's visible records before B's first network request completes.
  nextLogin=OWNER;await form.onsubmit({preventDefault(){},target:form});await settle();assert(vm.runInContext("papers.some(p=>p.id==='guest')",ctx));
  let release;readHook=()=>new Promise(r=>release=r);const oldSync=node('cloudNow').onclick();await settle();
  nextLogin=FRIEND;await form.onsubmit({preventDefault(){},target:form});await settle();assert.equal(vm.runInContext('papers[0].id',ctx),'friend-paper');release();await oldSync;await settle();assert.equal(vm.runInContext('papers[0].id',ctx),'friend-paper');
  // An old write remains bound to A's captured token even if the authenticated
  // account changes during its request, and cannot overwrite B's library.
  nextLogin=OWNER;await form.onsubmit({preventDefault(){},target:form});await settle();vm.runInContext("papers[0].notes='Owner pending';persist()",ctx);
  writeHook=()=>{session={user:{id:FRIEND},access_token:token(FRIEND)};authCallback('SIGNED_IN',session);};await node('cloudNow').onclick();await settle();
  assert.equal(server.payload.papers[0].notes,'Owner pending');assert.equal(friendServer.payload.papers[0].id,'friend-paper');assert.equal(vm.runInContext('papers[0].id',ctx),'friend-paper');
  await node('cloudLogout').onclick();await settle();assert.equal(vm.runInContext('papers[0].id',ctx),'guest');
  // A stale first activation must not replace the next account's merge base.
  nextLogin=OWNER;await form.onsubmit({preventDefault(){},target:form});await settle();
  for(const k of [...storage.keys()])if(k.startsWith('reading-garden-owner-'+FRIEND+':'))storage.delete(k);
  let initialRelease;readHook=()=>new Promise(r=>initialRelease=r);nextLogin=FRIEND;const activatingFriend=form.onsubmit({preventDefault(){},target:form});await settle();
  session={user:{id:OWNER},access_token:token(OWNER)};authCallback('SIGNED_IN',session);await settle();assert.equal(vm.runInContext('papers[0].id',ctx),'guest');initialRelease();await activatingFriend;await settle();
  vm.runInContext("papers[0].notes='Still owner';persist()",ctx);await node('cloudNow').onclick();assert.equal(server.payload.papers[0].notes,'Still owner');assert.equal(friendServer.payload.papers[0].id,'friend-paper');
  await node('cloudLogout').onclick();await settle();
  // Signup can also activate immediately when email confirmation is disabled
  // by the project administrator; both API responses are supported.
  node('cloudLogin').onclick();node('cloudToggle').onclick();form.elements.password.value='strong-test-only';form.elements.confirmPassword.value='strong-test-only';signupConfirmed=true;
  await form.onsubmit({preventDefault(){},target:form});await settle();assert.equal(vm.runInContext('papers[0].id',ctx),'friend-paper');
  assert(storage.has(prefix+':reading-garden-v1'));assert(storage.has('reading-garden-owner-'+FRIEND+':reading-garden-v1'));
  // Backup import keeps color marks, and rejects malformed marks before mutation.
  vm.runInContext("setPaperColor('doi:10.1234/backup','purple')",ctx);const marks=JSON.parse(vm.runInContext('JSON.stringify(paperColors)',ctx));vm.runInContext('paperColors=[];persist()',ctx);
  const backup={version:8,papers:[],ideas:[],tasks:[],paperColors:marks};await node('file').onchange({target:{files:[{size:200,text:async()=>JSON.stringify(backup)}],value:'backup'}});assert.equal(vm.runInContext("paperColor({doi:'10.1234/backup'})",ctx),'purple');
  const prior=vm.runInContext('JSON.stringify(paperColors)',ctx);await node('file').onchange({target:{files:[{size:200,text:async()=>JSON.stringify({...backup,paperColors:[{id:'doi:10.1234/backup',color:'invalid',updated:1}]})}],value:'bad'}});assert.equal(vm.runInContext('JSON.stringify(paperColors)',ctx),prior);
  node('bookStatusFilter').value='all';node('booksNav').onclick();assert.equal(node('libraryTitle').textContent,'Your bookshelf.');assert(!node('cards').innerHTML.includes('Friend private paper'));
  node('add').onclick();swatches[4].onclick();assert.equal(swatches[4].attributes['aria-pressed'],'true');assert.equal(swatches[0].attributes['aria-pressed'],'false');assert.equal(node('paperForm').elements.color.value,'blue');node('clearRecordColor').onclick();assert.equal(node('paperForm').elements.color.value,'');const bookForm=node('paperForm');assert.equal(bookForm.dataset.kind,'book');assert.equal(node('dialogTitle').textContent,'Add Book');bookForm.elements.title.value='A Book';bookForm.elements.authors.value='Book Author';bookForm.elements.status.value='todo';bookForm.elements.tags.value='Science';vm.runInContext("selectRecordColor('green');",ctx);bookForm.elements.year.value='2020';bookForm.elements.link.value='https://openlibrary.org/works/OL123W';bookForm.onsubmit({preventDefault(){},target:bookForm});
  assert.equal(vm.runInContext("papers.find(p=>p.title==='A Book').kind",ctx),'book');assert.match(node('cards').innerHTML,/A Book/);assert.doesNotMatch(node('cards').innerHTML,/data-paper-color=/);assert.equal(node('booksCount').textContent,1);assert.equal(vm.runInContext("filterCount('all')",ctx),1);
  vm.runInContext("updatePaperStatus(papers.find(p=>p.kind==='book').id,'done')",ctx);node('bookStatusFilter').value='todo';vm.runInContext('render()',ctx);assert.doesNotMatch(node('cards').innerHTML,/A Book/);node('bookStatusFilter').value='done';vm.runInContext('render()',ctx);assert.match(node('cards').innerHTML,/A Book/);
  await node('cloudNow').onclick();assert.equal(friendServer.payload.papers.find(p=>p.title==='A Book').kind,'book');assert.equal(vm.runInContext("paperColor(papers.find(p=>p.title==='A Book'))",ctx),'green');vm.runInContext("edit(papers.find(p=>p.kind==='book').id);selectRecordColor('purple',true)",ctx);assert.equal(vm.runInContext("paperColor(papers.find(p=>p.kind==='book'))",ctx),'purple');node('clearRecordColor').onclick();assert.equal(vm.runInContext("paperColor(papers.find(p=>p.kind==='book'))",ctx),'');vm.runInContext("selectRecordColor('green',true)",ctx);
  const bookRows=JSON.parse(vm.runInContext('JSON.stringify(papers)',ctx));await node('file').onchange({target:{files:[{size:500,text:async()=>JSON.stringify({papers:bookRows})}],value:'books'}});assert.equal(vm.runInContext("papers.find(p=>p.title==='A Book').kind",ctx),'book');
  vm.runInContext("edit(papers.find(p=>p.title==='A Book').id)",ctx);node('delete').onclick();assert.equal(vm.runInContext('papers.length',ctx),1);assert.equal(vm.runInContext('papers[0].id',ctx),'friend-paper');
  node('booksNav').onclick();node('add').onclick();assert.equal(bookForm.dataset.kind,'book');vm.runInContext("view='papers';render()",ctx);node('add').onclick();assert.equal(bookForm.dataset.kind,'paper');
  assert.equal(vm.runInContext('paperColors.some(r=>r.color===\"green\")',ctx),true);
  console.log('PASS: registration gate and validation, confirmed/unconfirmed signup, legacy owner cache, per-account isolation, account switching, stale reads and token-bound writes, sync/merge/delete/races, logout and local mode');

})().catch(e=>{console.error(e);process.exit(1)});
