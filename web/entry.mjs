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

const walkthrough=document.querySelector('.how-video video');
if(walkthrough&&'speechSynthesis' in window){
 const scenes=[
  'Welcome to Cotton Roots and Company. First, create your customer account, add your contact information, and securely verify your payment method. Your card details stay with Stripe.',
  'For your first bag, visit Cotton Roots at 307 Locust Street during normal shop hours. Bring your dirty clothes with you so you can place them in your bag.',
  'Open My Bags in the app, get the bag box code, and take one Cotton Roots bag. Scan its unique QR code so that exact bag is assigned to your account.',
  'Place your clothes inside, choose your laundry and care instructions, and create the order. At drop-off, scan your registered bag and confirm the handoff. You receive a drop-off notification.',
  'An approved Washing Specialist reviews available work and accepts your order. They scan your exact bag, photograph the scale display, enter its measured weight, and confirm custody.',
  'The Washing Specialist keeps your items together, follows the care instructions attached to the order, then washes, dries, and folds your laundry.',
  'The same registered bag is returned to Cotton Roots. Scanning it back in confirms the work is complete, securely checks it into the shop, and marks it ready.',
  'You receive a text message and an in-app notification when the laundry is ready. Open My Laundry to review the final weight and total, then pay securely through Stripe.',
  'After payment is confirmed, visit the shop, scan your matching bag, and collect your fresh laundry. The finished order moves into your order history. One bag, clear handoffs, fresh beginnings.',
 ];
 let spokenScene=-1;
 const speakCurrent=()=>{
  if(walkthrough.paused||walkthrough.ended)return;
  const scene=Math.min(scenes.length-1,Math.floor(walkthrough.currentTime/12));
  if(scene===spokenScene)return;
  speechSynthesis.cancel();spokenScene=scene;
  const voice=new SpeechSynthesisUtterance(scenes[scene]);voice.rate=1.03;voice.pitch=1;voice.volume=1;speechSynthesis.speak(voice);
 };
 walkthrough.addEventListener('play',()=>{spokenScene=-1;speakCurrent()});
 walkthrough.addEventListener('timeupdate',speakCurrent);
 walkthrough.addEventListener('seeking',()=>{speechSynthesis.cancel();spokenScene=-1});
 walkthrough.addEventListener('pause',()=>speechSynthesis.cancel());
 walkthrough.addEventListener('ended',()=>{speechSynthesis.cancel();spokenScene=-1});
 window.addEventListener('pagehide',()=>speechSynthesis.cancel());
}
