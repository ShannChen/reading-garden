(function(root){
  'use strict';
  const collections=['papers','ideas','tasks','feedSettings','people','paperColors'];
  const empty=()=>({papers:[],ideas:[],tasks:[],feedSettings:[],people:[],paperColors:[]});
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  const equal=(a,b)=>stable(a)===stable(b);
  function valid(data){return data&&collections.every(k=>(['feedSettings','people','paperColors'].includes(k)&&data[k]===undefined)||(Array.isArray(data[k])&&data[k].every(r=>r&&typeof r.id==='string')))}
  // A missing row is a deletion. Comparing against a saved base prevents
  // a stale offline device from resurrecting a record deleted elsewhere.
  function merge(base,local,remote,preference){
    const result=empty(),conflicts=[];
    for(const key of collections){
      const maps=[base,local,remote].map(s=>new Map((s[key]||[]).map(r=>[r.id,r])));
      const ids=new Set(maps.flatMap(m=>[...m.keys()]));
      for(const id of ids){
        const [b,l,r]=maps.map(m=>m.get(id));let picked;
        if(equal(l,b))picked=r;
        else if(equal(r,b)||equal(l,r))picked=l;
        else {conflicts.push({collection:key,id});picked=preference==='remote'?r:l;}
        if(picked!==undefined)result[key].push(picked);
      }
    }
    return {data:result,conflicts};
  }
  // Import is an explicit user action, rather than a background upload of
  // local-mode data. Keep the more recently updated copy for duplicate IDs.
  function importRecords(current,incoming){
    const result=empty();
    for(const key of collections){const map=new Map((current[key]||[]).map(r=>[r.id,r]));for(const r of (incoming[key]||[])){const old=map.get(r.id);if(!old||Number(r.updated)>Number(old.updated))map.set(r.id,r)}result[key]=[...map.values()]}
    return result;
  }
  const api={empty,equal,valid,merge,importRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReadingGardenSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
