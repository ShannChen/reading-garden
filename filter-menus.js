(function(){
'use strict';
function install(id){
 const select=document.getElementById(id);if(!select)return;
 const wrap=document.createElement('div');wrap.className='rg-filter-wrap';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='rg-filter-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const menu=document.createElement('div');menu.className='rg-filter-menu';menu.setAttribute('role','listbox');menu.tabIndex=-1;
 select.parentNode.insertBefore(wrap,select);wrap.append(select,trigger,menu);select.classList.add('rg-filter-native');
 function close(){wrap.classList.remove('rg-open');trigger.setAttribute('aria-expanded','false');}
 function refresh(){
   const selected=select.selectedOptions[0];trigger.textContent=selected?.textContent||'Select';
   trigger.classList.toggle('rg-selected',!!select.value);
   menu.replaceChildren();
   for(const opt of select.options){
     const item=document.createElement('button');item.type='button';item.className='rg-filter-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(opt.selected));item.textContent=opt.textContent;
     if(opt.selected)item.classList.add('rg-option-active');
     item.addEventListener('click',()=>{select.value=opt.value;close();select.dispatchEvent(new Event('change',{bubbles:true}));trigger.focus();});
     menu.append(item);
   }
 }
 let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refresh();});});
 observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['selected']});
 trigger.addEventListener('click',()=>{const open=!wrap.classList.contains('rg-open');document.querySelectorAll('.rg-filter-wrap.rg-open').forEach(el=>{el.classList.remove('rg-open');el.querySelector('.rg-filter-trigger')?.setAttribute('aria-expanded','false');});if(open){refresh();wrap.classList.add('rg-open');trigger.setAttribute('aria-expanded','true');const active=menu.querySelector('.rg-option-active');active?.scrollIntoView({block:'nearest'});}});
 trigger.addEventListener('keydown',e=>{if(e.key==='Escape'){close();}if(e.key==='ArrowDown'||e.key==='Enter'||e.key===' '){if(!wrap.classList.contains('rg-open')){e.preventDefault();trigger.click();}if(e.key==='ArrowDown'){e.preventDefault();menu.querySelector('.rg-option-active')?.focus()||menu.querySelector('button')?.focus();}}});
 menu.addEventListener('keydown',e=>{const options=[...menu.querySelectorAll('button')],i=options.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();trigger.focus();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1))) ]?.focus();}});
 document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close();});
 select.addEventListener('change',refresh);
 refresh();
}
function boot(){install('categoryFilter');install('tagFilter');}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();