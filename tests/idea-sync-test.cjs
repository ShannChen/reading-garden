const fs=require('fs');
// Reuse the existing account, database and storage mocks; run only the idea scenarios.
const harness=fs.readFileSync('tests/multi-user-test.cjs','utf8').split('(async()=>{')[0];
new Function('require',harness+`
(async()=>{
 node('cloudForm').elements.email.value='owner@example.test';node('cloudForm').elements.password.value='test-only';
 await node('cloudForm').onsubmit({preventDefault(){},target:node('cloudForm')});await settle();
 vm.runInContext('sanitizeIdeaHtml=value=>String(value)',ctx);
 let pending=null,flushes=0;
 ctx.window.ReadingGardenIdeas={flush(){flushes++;if(pending){vm.runInContext('ideas.push('+JSON.stringify(pending)+');persist()',ctx);pending=null;}},discard(){}};
 pending={id:'owner-draft',title:'Title-only draft',body:'',bodyHtml:'',updated:2};
 nextLogin=FRIEND;await node('cloudForm').onsubmit({preventDefault(){},target:node('cloudForm')});await settle();
 assert(flushes>0);assert(JSON.parse(storage.get(prefix+':reading-garden-ideas-v1')).some(i=>i.id==='owner-draft'));
 assert(!vm.runInContext('ideas.some(i=>i.id===\"owner-draft\")',ctx));
 assert(!friendServer?.payload.ideas.some(i=>i.id==='owner-draft'));
 pending={id:'friend-draft',title:'Friend rich text',body:'Keep',bodyHtml:'<b>Keep</b>',updated:3};
 await node('cloudLogout').onclick();await settle();
 assert(JSON.parse(storage.get('reading-garden-owner-'+FRIEND+':reading-garden-ideas-v1')).some(i=>i.id==='friend-draft'&&i.bodyHtml==='<b>Keep</b>'));
 assert.equal(vm.runInContext('ideas.length',ctx),0);
 nextLogin=OWNER;await node('cloudForm').onsubmit({preventDefault(){},target:node('cloudForm')});await settle();await node('cloudNow').onclick();await settle();
 assert(server.payload.ideas.some(i=>i.id==='owner-draft'));assert(!server.payload.ideas.some(i=>i.id==='friend-draft'));
 const backup={papers:[],ideas:[{id:'title-backup',title:'Title only',body:'',updated:5}]};
 await node('file').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(backup)}],value:'backup'}});
 assert(vm.runInContext('ideas.some(i=>i.id===\"title-backup\")',ctx));
 console.log('PASS: pending idea saves before account switches and sign-out, account storage isolation, reconnect sync and title-only backup import.');
})().catch(e=>{console.error(e);process.exitCode=1;});
`)(require);
