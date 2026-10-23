const preferenceKey='crc_account_type';
const identityKey='crc_remembered_identity';
if('serviceWorker' in navigator)navigator.serviceWorker.register('/web/service-worker.js').catch(()=>{});
const choices=new Set(['customer','contractor']);
const params=new URLSearchParams(location.search);
const choosing=params.get('choose')==='1';
const remember=role=>{try{localStorage.setItem(preferenceKey,role)}catch{}};
const destination=user=>user?.role==='customer'?'/customer':['contractor','owner','staff'].includes(user?.role)?'/contractor':null;
const started=Date.now();
const finishSplash=async()=>{const remaining=1100-(Date.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));document.body.classList.remove('splash-active')};
let nextRoute=null;

if(choosing){
 history.replaceState(null,'','/');
}else{
 try{
  const response=await fetch('/api/me',{credentials:'same-origin',headers:{Accept:'application/json'}});
  if(response.ok){const data=await response.json(),next=destination(data.user);if(next){remember(data.user.role==='customer'?'customer':'contractor');nextRoute=next}}
  else {const saved=JSON.parse(localStorage.getItem(identityKey)||'null');if(saved&&choices.has(saved.role))nextRoute=`/${saved.role}`}
 }catch{}
}

await finishSplash();
if(nextRoute)location.replace(nextRoute);

for(const link of document.querySelectorAll('.role-continue[data-role]')){
 link.addEventListener('click',()=>{const role=link.dataset.role;if(choices.has(role))remember(role)});
}

for(const details of document.querySelectorAll('.role-choice details')){
 details.addEventListener('toggle',()=>{if(!details.open)return;for(const other of document.querySelectorAll('.role-choice details'))if(other!==details)other.open=false});
}
