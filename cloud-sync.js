(function(){
  'use strict';
  const URL='https://oonwggwdcywukwshwbxx.supabase.co';
  const KEY='sb_publishable_4yQW3EaS9nr55lAKuAFyXQ_aySHekgL';
  const core=ReadingGardenSync;
  let namespace='',metaKey='',activationGeneration=-1,authMode='signin',authBusy=false;
  let requestClient=null,requestToken=null;
  let client=null,loader=null,activating=null,active=false,busy=false,applying=false,paused=false,timer;
  let base=core.empty(),revision=0,session=null,generation=0;
  const el=id=>document.getElementById(id);
  const copy=data=>JSON.parse(JSON.stringify(data));
  const snapshot=()=>copy({papers,ideas,tasks,paperColors,feedSettings:window.ReadingGardenFeeds?.exportState()||[],people:window.ReadingGardenPeople?.exportState()||[]});
  function readLocal(prefix){
    const result=core.empty();
    for(const [collection,key] of [['papers',KEY_LOCAL],['ideas',IDEAS_KEY],['tasks',TASKS_KEY],['paperColors',COLORS_KEY],['feedSettings','reading-garden-feed-settings-v1'],['people','reading-garden-people-v1']]){
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
  function setData(data,save=true){
    applying=true;
    try{papers=copy(data.papers);ideas=copy(data.ideas);tasks=copy(data.tasks);paperColors=copy(data.paperColors||[]);window.ReadingGardenFeeds?.setState(data.feedSettings||[]);window.ReadingGardenPeople?.setState(data.people||[]);if(save)persist();else render();}
    finally{applying=false}
  }
  function saveBase(data,version){
    // Save the base only after the visible local snapshot is safely saved.
    if(!storageOK)throw Error('Browser storage unavailable. Export a backup.');
    localStorage.setItem(metaKey,JSON.stringify({data,revision:version}));
    base=copy(data);revision=version;
  }
  function describe(error){
    if(['PGRST205','PGRST202','42P01','42883'].includes(error?.code))return 'Cloud setup is not ready. Your records remain on this device. Contact the site owner.';
    if(error?.code==='42501')return 'Cloud access denied. Your private records remain on this device. Contact the site owner.';
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
      client=window.supabase.createClient(URL,KEY,{auth:{storageKey:'reading-garden-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      client.auth.onAuthStateChange((_event,next)=>{
        // Supabase advises against awaiting API calls in this callback.
        setTimeout(()=>handleSession(next),0);
      });
      return client;
    }).catch(error=>{loader=null;throw error});
    return loader;
  }
  function accountApi(){
    if(!session?.access_token)throw Error('Sign in again to sync.');
    // Bind each request to the token captured now, even if another tab changes accounts.
    if(requestToken!==session.access_token){requestToken=session.access_token;requestClient=window.supabase.createClient(URL,KEY,{global:{headers:{Authorization:'Bearer '+requestToken}},auth:{storageKey:'reading-garden-request',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
    return requestClient;
  }
  async function remote(){
    const userId=session?.user.id,api=accountApi();
    const {data,error}=await api.from('reading_garden_sync').select('payload,revision').eq('owner_id',userId).maybeSingle();
    if(error)throw error;
    if(data&&!core.valid(data.payload))throw Error('Cloud records have an invalid format');
    return {data:data?data.payload:core.empty(),revision:data?data.revision:0};
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>sync(false),1000);}
  function activate(){
    if(!activating||activationGeneration!==generation){activationGeneration=generation;const promise=activateOnce().finally(()=>{if(activating===promise)activating=null;});activating=promise;}
    return activating;
  }
  async function activateOnce(){
    if(active||!session)return;
    const ticket=generation;
    const cached=localStorage.getItem(metaKey);
    let local=readLocal(namespace),initial;const initialLocal=copy(local);
    if(cached){const saved=JSON.parse(cached);if(!core.valid(saved.data))throw Error('Invalid saved sync state');base=saved.data;revision=saved.revision;}
    else {initial=await remote();if(ticket!==generation)return;base=copy(initial.data);revision=initial.revision;local=core.merge(core.empty(),local,initial.data).data;}
    if(ticket!==generation)return;
    local=core.merge(initialLocal,snapshot(),local,'local').data;
    // Browser-only records remain separate until the user explicitly imports them.
    storageNamespace=namespace;active=true;paused=false;
    for(const id of ['editor','ideaEditor'])el(id).close();editing=null;ideaEditing=null;window.ReadingGardenPeople?.close();
    setData(local);saveBase(base,revision);controls();
    status('Private library connected.',true);
    await sync(false);
  }
  async function handleSession(next){
    const nextId=next?.user?.id||'';
    if(nextId!==(session?.user?.id||'')){
      generation++;active=false;paused=false;clearTimeout(timer);base=core.empty();revision=0;
      session=next;namespace=nextId?'reading-garden-owner-'+nextId:'';metaKey=namespace+':sync-base';storageNamespace=namespace;
      for(const id of ['editor','ideaEditor'])el(id).close();editing=null;ideaEditing=null;window.ReadingGardenPeople?.close();
      try{setData(readLocal(namespace),false)}catch{setData(core.empty(),false);status('Could not read this account’s saved records.');}
    }else session=next;
    controls();
    if(!next){status('Local mode · saved only on this device');return;}
    if(active)return;
    const ticket=generation;
    try{await activate()}catch(error){if(ticket===generation)status(describe(error))}
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
          const {data,error}=await accountApi().rpc('reading_garden_write',{expected_revision:fetched.revision,new_payload:merged.data});
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
    }catch(error){if(ticket===generation)status(describe(error));}
    finally{busy=false;}
  }
  function setAuthMode(mode){
    authMode=mode;const signup=mode==='signup',f=el('cloudForm');
    el('cloudTitle').textContent=signup?'Create your account':'Sign in';
    el('cloudMessage').textContent=signup?'Your papers, ideas and people will belong to your own private account.':'Sign in to sync your private library across devices.';
    el('cloudSubmit').textContent=signup?'Create account':'Sign in';
    el('cloudToggle').textContent=signup?'Already have an account? Sign in':'New here? Create an account';
    el('cloudConfirmLabel').hidden=!signup;f.elements.confirmPassword.required=signup;
    f.elements.password.minLength=signup?8:0;f.elements.password.autocomplete=signup?'new-password':'current-password';
    f.elements.password.value='';f.elements.confirmPassword.value='';
  }
  el('cloudLogin').onclick=()=>{setAuthMode('signin');el('cloudDialog').showModal();};
  el('cloudToggle').onclick=()=>{if(!authBusy)setAuthMode(authMode==='signin'?'signup':'signin');};
  el('cloudClose').onclick=()=>el('cloudDialog').close();
  el('cloudDialog').addEventListener('close',()=>{el('cloudForm').elements.password.value='';el('cloudForm').elements.confirmPassword.value='';});
  el('cloudForm').onsubmit=async event=>{
    event.preventDefault();if(authBusy)return;const form=event.target,mode=authMode;
    const email=form.elements.email.value.trim(),password=form.elements.password.value;
    if(mode==='signup'&&(password.length<8||password!==form.elements.confirmPassword.value)){el('cloudMessage').textContent='Use at least 8 characters and enter the same password twice.';return;}
    authBusy=true;el('cloudSubmit').disabled=true;el('cloudToggle').disabled=true;
    try{
      const api=await sdk();
      if(mode==='signup'){
        const capability=await api.rpc('reading_garden_capabilities');
        if(capability.error||capability.data?.multiUser!==true)throw Error('Registration is not open yet. Please contact the site owner.');
        const {data,error}=await api.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
        if(error)throw error;
        form.elements.password.value='';form.elements.confirmPassword.value='';
        if(data.session){await handleSession(data.session);el('cloudDialog').close();}
        else{setAuthMode('signin');el('cloudMessage').textContent='Check your email for a confirmation link, then return here to sign in. If you already have an account, sign in with its password.';}
      }else{
        const {data,error}=await api.auth.signInWithPassword({email,password});if(error)throw error;
        await handleSession(data.session);form.elements.password.value='';el('cloudDialog').close();
      }
    }catch(error){
      const messages={signup_disabled:'Registration is not open yet. Please contact the site owner.',email_address_not_authorized:'Confirmation emails are not available for this address yet. Please contact the site owner.',email_not_confirmed:'Confirm your email before signing in.',invalid_credentials:'Sign-in failed. Check your email and password.',over_email_send_rate_limit:'Too many confirmation requests. Please try again later.',over_request_rate_limit:'Too many requests. Please try again later.'};
      el('cloudMessage').textContent=messages[error?.code]||error.message||'Could not complete sign-in. Please try again.';
    }finally{authBusy=false;el('cloudSubmit').disabled=false;el('cloudToggle').disabled=false;}
  };
  el('cloudNow').onclick=()=>sync(true);
  el('cloudLogout').onclick=async()=>{
    if(busy){toast('Sync is in progress. Try again in a moment.');return;}
    if(active&&!core.equal(snapshot(),base)&&!confirm('Some changes have not synced. They remain saved on this device. Sign out anyway?'))return;
    const {error}=await client.auth.signOut({scope:'local'});if(error)toast('Could not sign out. Please try again.');
  };
  el('cloudImport').onclick=()=>{
    if(busy){toast('Wait for sync to finish, then import.');return;}
    if(!confirm('Merge this device’s local-mode papers, ideas, people and feed preferences into this account’s private library? Existing cloud records will be retained.'))return;
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
  if(localStorage.getItem('reading-garden-auth')||/(?:access_token|error_description)=/.test(location.hash)||/(?:^|[?&])code=/.test(location.search))sdk().then(api=>api.auth.getSession()).then(({data})=>handleSession(data.session)).catch(()=>status('Sign-in service unavailable. Local records are still available.'));
})();
