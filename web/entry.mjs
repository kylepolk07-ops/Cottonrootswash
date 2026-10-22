const preferenceKey='crc_account_type';
const choices=new Set(['customer','contractor']);
const params=new URLSearchParams(location.search);
const choosing=params.get('choose')==='1';
const remember=role=>{try{localStorage.setItem(preferenceKey,role)}catch{}};
const destination=user=>user?.role==='customer'?'/customer':['contractor','owner','staff'].includes(user?.role)?'/contractor':null;

if(choosing){
 try{localStorage.removeItem(preferenceKey)}catch{}
 history.replaceState(null,'','/');
}else{
 let directed=false;
 try{
  const response=await fetch('/api/me',{credentials:'same-origin',headers:{Accept:'application/json'}});
  if(response.ok){const data=await response.json(),next=destination(data.user);if(next){remember(data.user.role==='customer'?'customer':'contractor');directed=true;location.replace(next)}}
 }catch{}
 if(!directed){try{const remembered=localStorage.getItem(preferenceKey);if(choices.has(remembered))location.replace(`/${remembered}`)}catch{}}
}

for(const link of document.querySelectorAll('.role-continue[data-role]')){
 link.addEventListener('click',()=>{const role=link.dataset.role;if(choices.has(role))remember(role)});
}

for(const details of document.querySelectorAll('.role-choice details')){
 details.addEventListener('toggle',()=>{if(!details.open)return;for(const other of document.querySelectorAll('.role-choice details'))if(other!==details)other.open=false});
}
