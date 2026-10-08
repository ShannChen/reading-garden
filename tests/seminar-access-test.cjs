const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {webcrypto,createHash}=require('crypto');
const email='owner@example.test',hash=createHash('sha256').update(email).digest('hex');
const source=fs.readFileSync('seminar-access.js','utf8').replace(/const ownerEmailHash='[a-f0-9]+';/,"const ownerEmailHash='"+hash+"';");
let allowed=null;const ctx={crypto:webcrypto,TextEncoder,Uint8Array,ReadingGardenSeminars:{setAllowed(value){allowed=value;}}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
 assert.equal(allowed,false);const api=ctx.ReadingGardenSeminarAccess;
 await api.setUser({id:'owner',email:' OWNER@example.test ',email_confirmed_at:'2026-01-01'});assert.equal(allowed,true);let calls=0;ctx.ReadingGardenSeminars.setAllowed=value=>{calls++;allowed=value;};await api.setUser({id:'owner',email,email_confirmed_at:'2026-01-01'});assert.equal(calls,0);assert.equal(allowed,true);
 await api.setUser({id:'other',email:'friend@example.test',email_confirmed_at:'2026-01-01'});assert.equal(allowed,false);
 await api.setUser({id:'owner',email,email_confirmed_at:null});assert.equal(allowed,false);
 const pending=api.setUser({id:'owner',email,email_confirmed_at:'2026-01-01'});await api.setUser(null);await pending;assert.equal(allowed,false);
 console.log('PASS: owner, other account, unconfirmed email, signed out and stale identity checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
