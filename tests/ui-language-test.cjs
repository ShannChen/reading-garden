const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
class Element{
 constructor(tag='div',id='',classes=[]){this.nodeType=1;this.tag=tag;this.id=id;this.classes=classes;this.childNodes=[];this.attrs={};this.events={};this.isConnected=true;}
 append(child){child.parentElement=this;this.childNodes.push(child);return child;}
 matches(selector){return selector.split(',').some(raw=>{const s=raw.trim();if(s==='button:not(.person-name-button)')return this.tag==='button'&&!this.classes.includes('person-name-button');if(s.startsWith('#'))return s==='#'+this.id;if(s.startsWith('.'))return this.classes.includes(s.slice(1));return s===this.tag;});}
 closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
 getAttribute(k){return this.attrs[k];}hasAttribute(k){return k in this.attrs;}setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,v){this.events[k]=v;}
 set textContent(v){this.childNodes=[];this.append(text(v));}get textContent(){return this.childNodes.map(c=>c.nodeType===3?c.data:c.textContent).join('');}
}
const text=data=>({nodeType:3,data,isConnected:true});
function run(saved='en',blockedStorage=false){
 const body=new Element(),button=body.append(new Element('button','languageToggle')),nav=body.append(new Element('summary'));nav.textContent='All Papers';
 const search=body.append(new Element('input'));search.setAttribute('placeholder','Enter the paper title');search.value='Reading';
 const title=body.append(new Element('article','',['card'])).append(new Element('h2'));title.textContent='Reading';
 const action=title.parentElement.append(new Element('button'));action.textContent='Delete';
 const researcher=title.parentElement.append(new Element('button','',['person-name-button']));researcher.textContent='Reading';
 const note=title.parentElement.append(new Element('p'));note.textContent='Save';
 const results=body.append(new Element('div','lookupResults')).append(new Element('button'));results.textContent='All Papers';
 const hint=body.append(new Element());hint.textContent='Research areas · 3 selected';
 let callback,writes=0,confirmed='';const store=new Map([['reading-garden-ui-language',saved]]);
 const ctx={document:{body,documentElement:{lang:'en'},getElementById:()=>button},MutationObserver:class{constructor(fn){callback=fn;}disconnect(){}observe(){}},localStorage:{getItem(k){if(blockedStorage)throw Error();return store.get(k);},setItem(k,v){if(blockedStorage)throw Error();store.set(k,v);writes++;}},confirm(s){confirmed=s;return true;}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('ui-language.js','utf8'),ctx);
 return {ctx,button,nav,search,title,action,researcher,note,results,hint,store,get writes(){return writes;},get confirmed(){return confirmed;},changed(node){callback([{target:node,type:'childList'}]);}};
}
const r=run();assert.equal(r.nav.textContent,'All Papers');r.button.events.click();assert.equal(r.nav.textContent,'全部文献');assert.equal(r.ctx.document.documentElement.lang,'zh-CN');assert.equal(r.action.textContent,'删除');assert.equal(r.search.attrs.placeholder,'输入文献标题');assert.equal(r.search.value,'Reading');for(const x of [r.title,r.researcher])assert.equal(x.textContent,'Reading');assert.equal(r.note.textContent,'Save');assert.equal(r.results.textContent,'All Papers');assert.equal(r.hint.textContent,'研究领域 · 已选 3 项');assert.equal(r.store.get('reading-garden-ui-language'),'zh');
r.action.textContent='Edit';r.changed(r.action);assert.equal(r.action.textContent,'编辑');r.ctx.confirm('Delete “Reading”?');assert.equal(r.confirmed,'删除“Reading”？');r.button.events.click();assert.equal(r.nav.textContent,'All Papers');assert.equal(r.action.textContent,'Edit');assert.equal(r.search.attrs.placeholder,'Enter the paper title');assert.equal(r.title.textContent,'Reading');assert.equal(r.hint.textContent,'Research areas · 3 selected');
assert.equal(run('zh').nav.textContent,'全部文献');const blocked=run('en',true);blocked.button.events.click();assert.equal(blocked.nav.textContent,'全部文献');
console.log('PASS: language persistence, dynamic UI updates, English restoration, input values and protected content, confirmation text, and unavailable storage.');
