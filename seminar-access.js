(function(){
  'use strict';
  const ownerEmailHash='8a4b5c901f5936f1690fde77211be616944d0f8f2a9849705dd948dac843c08c';
  let generation=0,identity=null;
  async function setUser(user){
    const key=user?.id&&user.email&&user.email_confirmed_at?user.id+':'+user.email.trim().toLowerCase():'';
    if(key===identity)return;identity=key;
    const ticket=++generation;
    window.ReadingGardenSeminars?.setAllowed(false);
    if(!user?.id||!user.email||!user.email_confirmed_at)return;
    try{
      const bytes=new TextEncoder().encode(user.email.trim().toLowerCase());
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if(ticket===generation)window.ReadingGardenSeminars?.setAllowed(hash===ownerEmailHash);
    }catch{/* Keep the personal navigation hidden if identity cannot be checked. */}
  }
  window.ReadingGardenSeminarAccess={setUser};
  setUser(window.ReadingGardenAccount?.getUser()||null);
})();
