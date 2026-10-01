(function(){
  'use strict';
  const URL='https://oonwggwdcywukwshwbxx.supabase.co';
  const KEY='sb_publishable_4yQW3EaS9nr55lAKuAFyXQ_aySHekgL';
  const OWNER='3ad0b62f-79e2-4cff-8b78-0352fd42e8f1';
  const core=ReadingGardenSync, namespace='reading-garden-owner-'+OWNER;
  const metaKey=namespace+':sync-base';
  let client=null,loader=null,activating=null,active=false,busy=false,applying=false,paused=false,timer;
  let base=core.empty(),revision=0,session=null,generation=0;
  const el=id=>document.getElementById(id);
  const copy=data=>JSON.parse(JSON.stringify(data));
  const snapshot=()=>copy({papers,ideas,tasks});
  function readLocal(prefix){
    const result=core.empty();
    for(const [collection,key] of [['papers',KEY_LOCAL],['ideas',IDEAS_KEY],['tasks',TASKS_KEY]]){
      const raw=localStorage.getItem(prefix?prefix+':'+key:key);
      if(raw!==null){const records=JSON.parse(raw);if(!Array.isArray(records))throw Error('Invalid saved records');result[collection]=records;}
    }
    if(!core.valid(result))throw Error('Invalid saved records');
    return result;
  }
  // KEY_LOCAL is the existing app's data key, separate from the public API key.
  const KEY_LOCAL='reading-garden-v1';
  function status(message,quiet=false){const node=el('syncStatus');node.hidden=quiet;const button=el('cloudNow');button.hidden=!session||!paused;button.textContent='Resolve conflict';if(!quiet&&node.textContent!==message)node.textContent=message;}
  function controls(){
    el('cloudLogin').hidden=!!session;
    el('cloudLogout').hidden=!session;
    el('cloudNow').hidden=!session||!paused;el('cloudNow').textContent='Resolve conflict';
    el('cloudImport').hidden=!active;
  }
  function setData(data){
    applying=true;
    try{papers=copy(data.papers);ideas=copy(data.ideas);tasks=copy(data.tasks);persist();}
    finally{applying=false}
  }
  function saveBase(data,version){
    // Save the base only after the visible local snapshot is safely saved.
    if(!storageOK)throw Error('Browser storage unavailable. Export a backup.');
    localStorage.setItem(metaKey,JSON.stringify({data,revision:version}));
    base=copy(data);revision=version;
  }
  function describe(error){
    if(['PGRST205','PGRST202','42P01','42883'].includes(error?.code))return 'Cloud setup needed: run setup.sql in Supabase.';
    if(error?.code==='42501')return 'Cloud access denied. Check the owner account and database setup.';
    return navigator.onLine?'Sync failed. Your changes remain on this device; automatic sync will retry.':'Offline: changes are saved on this device.';
  }
  async function sdk(){
    if(client)return client;
    if(!loader)loader=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.crossOrigin='anonymous';
      script.onload=resolve;script.onerror=()=>reject(Error('Could not load sign-in service'));
      document.head.appendChild(script);
    }).then(()=>{
      client=window.supabase.createClient(URL,KEY,{auth:{storageKey:'reading-garden-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      client.auth.onAuthStateChange((_event,next)=>{
        // Supabase advises against awaiting API calls in this callback.
        setTimeout(()=>handleSession(next),0);
      });
      return client;
    }).catch(error=>{loader=null;throw error});
    return loader;
  }
  async function remote(){
    const {data,error}=await client.from('reading_garden_sync').select('payload,revision').eq('owner_id',OWNER).maybeSingle();
    if(error)throw error;
    if(data&&!core.valid(data.payload))throw Error('Cloud records have an invalid format');
    return {data:data?data.payload:core.empty(),revision:data?data.revision:0};
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>sync(false),1000);}
  function activate(){
    if(!activating)activating=activateOnce().finally(()=>{activating=null});
    return activating;
  }
  async function activateOnce(){
    if(active||!session)return;
    const ticket=generation;
    const cached=localStorage.getItem(metaKey);
    let local=readLocal(namespace),initial;
    if(cached){const saved=JSON.parse(cached);if(!core.valid(saved.data))throw Error('Invalid saved sync state');base=saved.data;revision=saved.revision;}
    else {initial=await remote();base=copy(initial.data);revision=initial.revision;local=copy(initial.data);}
    if(ticket!==generation)return;
    // Preserve the old browser-only records. Uploading them is explicit.
    storageNamespace=namespace;active=true;paused=false;
    for(const id of ['editor','ideaEditor'])el(id).close();editing=null;ideaEditing=null;
    setData(local);saveBase(base,revision);controls();
    status('Cloud connected. Use Import local records to bring over this device’s existing library.');
    await sync(false);
  }
  async function handleSession(next){
    if(next&&next.user.id!==OWNER){
      await client.auth.signOut({scope:'local'});toast('Cloud sync is reserved for the owner account.');return;
    }
    if(!next){
      generation++;session=null;active=false;paused=false;clearTimeout(timer);storageNamespace='';
      for(const id of ['editor','ideaEditor'])el(id).close();editing=null;ideaEditing=null;
      try{setData(readLocal(''))}catch{status('Could not read local records. Export a backup before continuing.');return;}
      controls();status('Local mode · saved only on this device');return;
    }
    session=next;controls();
    if(active)return;
    try{await activate()}catch(error){status(describe(error))}
  }
  async function sync(manual){
    if(busy||!session||(!manual&&paused))return;
    if(!active){try{await activate()}catch(error){status(describe(error))}return;}
    if(!navigator.onLine){status('Offline: changes are saved on this device.');return;}
    busy=true;const ticket=generation;status('Syncing…',true);
    try{
      for(let attempt=0;attempt<4;attempt++){
        const fetched=await remote();if(ticket!==generation)return;
        const local=snapshot();let merged=core.merge(base,local,fetched.data);
        if(merged.conflicts.length){
          if(!manual){paused=true;status('Conflicting edits: click Resolve conflict to choose which version to keep.');return;}
          const keepLocal=confirm('The same record was edited or deleted on both devices. OK: keep this device’s version of conflicting records. Cancel: use the cloud version. Other records will be merged.');
          merged=core.merge(base,local,fetched.data,keepLocal?'local':'remote');
        }
        let accepted=fetched;
        if(!core.equal(merged.data,fetched.data)){
          const {data,error}=await client.rpc('reading_garden_write',{expected_revision:fetched.revision,new_payload:merged.data});
          if(ticket!==generation)return;
          if(error){if(error.code==='40001')continue;throw error;}
          if(!data?.[0]||!core.valid(data[0].payload))throw Error('Invalid sync response');
          accepted={data:data[0].payload,revision:data[0].revision};
        }
        // Preserve edits made while the network request was in flight.
        const current=snapshot();const next=core.merge(local,current,accepted.data,'local').data;
        setData(next);saveBase(accepted.data,accepted.revision);paused=false;
        const pending=!core.equal(next,base);
        status(pending?'Saved locally · syncing remaining changes…':'Synced',true);
        if(pending)schedule();return;
      }
      throw Error('Another device is still updating. Try again.');
    }catch(error){status(describe(error));}
    finally{busy=false;}
  }
  el('cloudLogin').onclick=()=>{el('cloudMessage').textContent='Sign in with the owner account created in Supabase.';el('cloudDialog').showModal();};
  el('cloudClose').onclick=()=>el('cloudDialog').close();
  el('cloudForm').onsubmit=async event=>{
    event.preventDefault();const form=event.target;const button=el('cloudSubmit');button.disabled=true;
    try{
      const api=await sdk();const {data,error}=await api.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});
      if(error)throw error;
      if(data.user.id!==OWNER){await api.auth.signOut({scope:'local'});throw Error('This account is not enabled for cloud sync.');}
      form.elements.password.value='';el('cloudDialog').close();
    }catch(error){el('cloudMessage').textContent=error?.status===400?'Sign-in failed. Check your email and password.':error.message||'Could not sign in.';}
    finally{button.disabled=false;}
  };
  el('cloudNow').onclick=()=>sync(true);
  el('cloudLogout').onclick=async()=>{
    if(busy){toast('Sync is in progress. Try again in a moment.');return;}
    if(active&&!core.equal(snapshot(),base)&&!confirm('Some changes have not synced. They remain saved on this device. Sign out anyway?'))return;
    const {error}=await client.auth.signOut({scope:'local'});if(error)toast('Could not sign out. Please try again.');
  };
  el('cloudImport').onclick=()=>{
    if(busy){toast('Wait for sync to finish, then import.');return;}
    if(!confirm('Merge this device’s local-mode papers, ideas, and checklist into your private cloud library? Existing cloud records will be retained.'))return;
    try{setData(core.importRecords(snapshot(),readLocal('')));schedule();toast('Local records merged. Syncing to your other device…');}catch{toast('Could not read local records. Export a backup before continuing.');}
  };
  document.addEventListener('reading-garden:changed',()=>{if(active&&!applying){status('Saved on this device · sync pending',true);schedule();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync(false);});
  addEventListener('online',()=>sync(false));
  setInterval(()=>{if(!document.hidden)sync(false)},15000);
  // Cross-tab edits must be merged before uploading, rather than overwriting
  // a newer locally saved snapshot with an old tab's in-memory records.
  addEventListener('storage',event=>{
    if(active&&event.key?.startsWith(namespace+':')&&event.key!==metaKey){try{setData(core.merge(base,snapshot(),readLocal(namespace),'remote').data);schedule()}catch{status('Local records changed in another tab. Reload after exporting a backup.');}}
  });
  controls();
  if(localStorage.getItem('reading-garden-auth'))sdk().then(api=>api.auth.getSession()).then(({data})=>handleSession(data.session)).catch(()=>status('Sign-in service unavailable. Local records are still available.'));
})();
