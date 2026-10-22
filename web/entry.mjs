const preferenceKey='crc_account_type';
const choices=new Set(['customer','contractor']);
const params=new URLSearchParams(location.search);

try{
 if(params.get('choose')==='1'){
  localStorage.removeItem(preferenceKey);
  history.replaceState(null,'','/');
 }else{
  const remembered=localStorage.getItem(preferenceKey);
  if(choices.has(remembered))location.replace(`/${remembered}`);
 }
}catch{
 // The chooser still works when a browser blocks local storage.
}

for(const link of document.querySelectorAll('.role-continue[data-role]')){
 link.addEventListener('click',()=>{
  const role=link.dataset.role;
  if(!choices.has(role))return;
  try{localStorage.setItem(preferenceKey,role);}catch{}
 });
}

for(const details of document.querySelectorAll('.role-choice details')){
 details.addEventListener('toggle',()=>{
  if(!details.open)return;
  for(const other of document.querySelectorAll('.role-choice details'))if(other!==details)other.open=false;
 });
}
