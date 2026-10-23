const preferenceKey='crc_account_type';
if('serviceWorker' in navigator)navigator.serviceWorker.register('/web/service-worker.js').catch(()=>{});
const choices=new Set(['customer','contractor']);
const params=new URLSearchParams(location.search);
const choosing=params.get('choose')==='1';
const remember=role=>{try{localStorage.setItem(preferenceKey,role)}catch{}};
const started=Date.now();
const finishSplash=async()=>{const remaining=3000-(Date.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));document.body.classList.remove('splash-active');await new Promise(resolve=>setTimeout(resolve,380))};

if(choosing){
 history.replaceState(null,'','/');
}

await finishSplash();

for(const link of document.querySelectorAll('.role-continue[data-role]')){
 link.addEventListener('click',()=>{const role=link.dataset.role;if(choices.has(role))remember(role)});
}

for(const details of document.querySelectorAll('.role-choice details')){
 details.addEventListener('toggle',()=>{if(!details.open)return;for(const other of document.querySelectorAll('.role-choice details'))if(other!==details)other.open=false});
}
