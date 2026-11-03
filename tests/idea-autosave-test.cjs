const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function ideaPlainText()'),end=html.indexOf('function validTaskDate',start);
assert(start>0&&end>start);assert(!html.includes('>Save Idea</button>'));
let serial=0,saves=0,storageWorks=true;const timers=new Map(),globalEvents=new Map(),nodes=new Map();
function node(id){
 if(!nodes.has(id)){
  const handlers=new Map();let markup='';
  const n={value:'',textContent:'',hidden:false,open:false,elements:{title:{value:''}},dataset:{},
   addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},
   emit(type,event={}){for(const fn of handlers.get(type)||[])fn(event);},
   reset(){this.elements.title.value='';},showModal(){this.open=true;},close(){this.open=false;this.emit('close');},focus(){},
   getBoundingClientRect(){return {left:10,right:200,top:10,bottom:200};},
   get innerHTML(){return markup;},set innerHTML(value){markup=value;},
   get innerText(){return markup.replace(/<br\s*\/?\s*>/g,'\n').replace(/<[^>]*>/g,'');}
  };nodes.set(id,n);
 }return nodes.get(id);
}
const doc={hidden:false,querySelectorAll(){return [];},addEventListener(type,fn){if(!globalEvents.has(type))globalEvents.set(type,[]);globalEvents.get(type).push(fn);}};
const ctx={console,document:doc,$:selector=>node(selector.slice(1)),ideas:[],ideaEditing:null,view:'ideas',storageNamespace:'owner-a',storageOK:true,crypto:{randomUUID:()=>`idea-${++serial}`},Date,
 sanitizeIdeaHtml:value=>value,esc:value=>value,render(){},renderIdeas(){},toast(){},confirm:()=>true,
 persist(){saves++;ctx.storageOK=storageWorks;},setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
 addEventListener(type,fn){if(!globalEvents.has(type))globalEvents.set(type,[]);globalEvents.get(type).push(fn);}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const run=source=>vm.runInContext(source,ctx),title=node('ideaForm').elements.title,body=node('ideaRichBody'),dialog=node('ideaEditor'),form=node('ideaForm');
const tick=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
const emitGlobal=type=>{for(const fn of globalEvents.get(type)||[])fn();};
run('editIdea()');ctx.closeIdeaEditor();assert.equal(ctx.ideas.length,0,'opening and closing a blank note must not create it');
run('editIdea()');title.value='Experiment';body.innerHTML='<b>Test mechanism</b><br><span style="color:#b43b3b">Next step</span>';form.emit('input');assert.equal(saves,0);tick();
assert.equal(ctx.ideas.length,1);const id=ctx.ideas[0].id;assert.equal(ctx.ideas[0].body,'Test mechanism\nNext step');assert.match(ctx.ideas[0].bodyHtml,/<b>Test mechanism<\/b>/);assert.equal(dialog.open,true);assert.equal(node('ideaAutosaveStatus').textContent,'Saved automatically');
body.innerHTML='<i>Second version</i>';form.emit('input');tick();assert.equal(ctx.ideas.length,1);assert.equal(ctx.ideas[0].id,id);assert.equal(ctx.ideas[0].bodyHtml,'<i>Second version</i>');const saved=saves;ctx.saveIdeaSilently();assert.equal(saves,saved,'unchanged notes must not generate new sync writes');
body.innerHTML='Last words before closing';form.emit('input');node('closeIdea').onclick();assert.equal(ctx.ideas[0].body,'Last words before closing');assert.equal(timers.size,0);assert.equal(dialog.open,false);
ctx.editIdea(id);body.innerHTML='Click outside';form.emit('input');const outside={target:dialog,clientX:0,clientY:0};dialog.emit('pointerdown',outside);dialog.emit('click',outside);assert.equal(ctx.ideas[0].body,'Click outside');assert.equal(dialog.open,false);
ctx.editIdea(id);body.innerHTML='Escape';form.emit('input');dialog.emit('cancel');dialog.close();assert.equal(ctx.ideas[0].body,'Escape');
ctx.editIdea(id);body.innerHTML='Background';form.emit('input');doc.hidden=true;emitGlobal('visibilitychange');assert.equal(ctx.ideas[0].body,'Background');doc.hidden=false;
body.innerHTML='Page close';form.emit('input');emitGlobal('pagehide');assert.equal(ctx.ideas[0].body,'Page close');
form.emit('compositionstart');body.innerHTML='中文输入';form.emit('input');assert.equal(timers.size,0);form.emit('compositionend');tick();assert.equal(ctx.ideas[0].body,'中文输入');
body.innerHTML='Do not recreate after deleting';form.emit('input');node('deleteIdea').onclick();tick();assert.equal(ctx.ideas.length,0);assert.equal(dialog.open,false);
ctx.editIdea();title.value='Title only';form.emit('input');tick();assert.equal(ctx.ideas.length,1);assert.equal(ctx.ideas[0].title,'Title only');assert.equal(ctx.ideas[0].body,'');
body.innerHTML='Unsaved owner A';form.emit('input');ctx.storageNamespace='owner-b';tick();assert.equal(ctx.ideas[0].body,'','pending edits must not save under another account');ctx.ReadingGardenIdeas.discard();dialog.close();
ctx.editIdea();title.value='Storage retry';body.innerHTML='Keep me';storageWorks=false;form.emit('input');tick();assert.match(node('ideaAutosaveStatus').textContent,/unavailable/);storageWorks=true;ctx.saveIdeaSilently();assert.equal(node('ideaAutosaveStatus').textContent,'Saved automatically');
const deletedId=ctx.ideaEditing;ctx.ideas=ctx.ideas.filter(i=>i.id!==deletedId);body.innerHTML='Remote deleted';form.emit('input');tick();assert(!ctx.ideas.some(i=>i.id===deletedId));assert.match(node('ideaAutosaveStatus').textContent,/removed on another device/);
console.log('PASS: autosave, rich text, stable IDs, unchanged notes, close/backdrop/Escape/background/page close, Chinese composition, title-only drafts, deletion, account isolation and storage retry.');
