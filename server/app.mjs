import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomInt,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import QRCode from 'qrcode';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {shopDateKey} from '../shared/calendar.mjs';
import {shopDueDeadline,SHOP_DUE_NOTE} from '../shared/schedule.mjs';
import {createPrivateAccess} from './private-access.mjs';
import {transition,ACTION} from '../shared/workflow.mjs';
import {invoiceTotal,deliveryFee,contractorPayBreakdown} from '../shared/rules.mjs';
import {deadlineAlert} from '../shared/management.mjs';
import {verifyStripeSignature,createStripeCheckout,createStripePaymentSetup,reconcileStripeCheckout,estimateStripeTestCharge} from './stripe-test.mjs';
import {createConnectedAccount,createConnectOnboardingLink,connectedAccountStatus} from './stripe-connect.mjs';
import webpush from 'web-push';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const token=()=>randomBytes(32).toString('hex');
const hash=s=>createHash('sha256').update(s).digest('hex');
const sixDigitCode=()=>String(randomInt(0,1000000)).padStart(6,'0');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const connectErrorMessage=error=>{
 const detail=String(error?.message||'').replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]+/g,'[Stripe key]').replace(/\bacct_[A-Za-z0-9]+/g,'[Stripe account]').replace(/https?:\/\/\S+/g,'Stripe Dashboard').slice(0,300);
 if(/connected_account_write|Accounts Write/i.test(detail))return 'Stripe permission missing: set Connect Accounts to Write for the live key, save it, then try again.';
 if(/account_links?|Account Links/i.test(detail)&&/permission/i.test(detail))return 'Stripe permission missing: set Account Links to Write for the live key, save it, then try again.';
 if(/signed up for Connect|activate.*Connect|Connect.*activat/i.test(detail))return 'Stripe Connect is not fully activated yet. In Stripe, open Connect, complete every required platform item, then try again.';
 if(/Invalid API Key|No such API key|authentication/i.test(detail))return 'Stripe rejected the live key. Replace STRIPE_LIVE_SECRET_KEY in Render with the newly created live key, save, and redeploy.';
 return detail?`Stripe could not start banking setup: ${detail}`:'Stripe could not start banking setup. Try again, then check the Render logs for the Stripe response.';
};
const AGREEMENT_VERSION='launch-draft-2026-10-25-v3';
const DEFAULT_PRICING=Object.freeze({dropoff:2.5,full_service:2.75,rushPerLb:1,extraBag:10,contractor:1});
const AGREEMENT_CONDITIONS={customer:['platform_role','customer_contractor_service','inspect_preexisting_damage','laundry_risk','empty_pockets','care_disclosure','claims_process','legal_draft'],contractor:['platform_role','independent_business','custody_care','deadline_scans','smartphone_required','legal_draft']};
const SHOP_COORDINATES={latitude:32.47095,longitude:-100.40594};
const milesBetween=(a,b)=>{const radians=value=>value*Math.PI/180,dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude),lat1=radians(a.latitude),lat2=radians(b.latitude),h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 3958.8*2*Math.asin(Math.sqrt(h))};
const photoPayload=(value,label)=>{const match=typeof value==='string'&&value.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);if(!match)fail(400,`Take a clear photo of the ${label}`);const bytes=Buffer.from(match[2],'base64');if(bytes.length<1000||bytes.length>500000)fail(400,`${label} photo must be between 1 KB and 500 KB`);if(match[1]==='image/jpeg'&&!(bytes[0]===0xff&&bytes[1]===0xd8)||match[1]==='image/png'&&!(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47))fail(400,`Invalid ${label} photo`);return {bytes,type:match[1]}};
async function estimateDeliveryMiles(address){
 const signal=AbortSignal.timeout(8000),query=new URLSearchParams({address,benchmark:'Public_AR_Current',format:'json'});
 const response=await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${query}`,{headers:{Accept:'application/json'},signal});
 if(!response.ok)throw Error('Address lookup unavailable');
 const coordinates=(await response.json())?.result?.addressMatches?.[0]?.coordinates;if(!Number.isFinite(coordinates?.x)||!Number.isFinite(coordinates?.y))throw Error('Address not found');
 const destination={latitude:coordinates.y,longitude:coordinates.x};
 try{
  const route=await fetch(`https://router.project-osrm.org/route/v1/driving/${SHOP_COORDINATES.longitude},${SHOP_COORDINATES.latitude};${destination.longitude},${destination.latitude}?overview=false`,{headers:{Accept:'application/json'},signal});
  const meters=(await route.json())?.routes?.[0]?.distance;if(route.ok&&Number.isFinite(meters))return Number((meters/1609.344).toFixed(1));
 }catch{}
 return Number(milesBetween(SHOP_COORDINATES,destination).toFixed(1));
}
export async function createApp({dataDir=resolve(root,'.runtime'),fixtures=false,initialOwner=null,remoteOrigin=null,stagingUser=null,stagingPassword=null,privateGate=true,fixturePasswords={},disposable=false,payment=null,stripeFetch=fetch,boxLockCode=null,distanceLookup=estimateDeliveryMiles,pushSender=webpush.sendNotification.bind(webpush)}={}) {
 if(boxLockCode!==null&&!/^\d{4}$/.test(boxLockCode))throw Error('Box lock code must be exactly four digits');
 if(remoteOrigin&&privateGate){
  const url=new URL(remoteOrigin);
  if(url.protocol!=='https:'||url.origin!==remoteOrigin||url.username||url.password)throw Error('An exact HTTPS remote origin is required');
  const validStagingPassword=typeof stagingPassword==='string'&&(disposable?/^\d{6}$/.test(stagingPassword)||stagingPassword.length>=24:stagingPassword.length>=24);
  if(typeof stagingUser!=='string'||!stagingUser||stagingUser.includes(':')||!validStagingPassword)throw Error(disposable?'A six-digit private preview PIN is required':'Private staging credentials required (password minimum 24 characters)');
 }
 for(const [username,password] of Object.entries(fixturePasswords)){
  if(!['customer','contractor','owner'].includes(username)||typeof password!=='string'||password.length<24||password.length>256)throw Error('Invalid synthetic fixture password configuration');
 }
 const privateAccess=remoteOrigin&&privateGate?createPrivateAccess({origin:remoteOrigin,username:stagingUser,password:stagingPassword}):null;
 const cookieSecurity=remoteOrigin?'; Secure':'';
 mkdirSync(dataDir,{recursive:true,mode:0o700});
 try{chmodSync(dataDir,0o700)}catch(error){if(!(remoteOrigin&&dataDir==='/var/data'&&error?.code==='EPERM'))throw error}
 const databaseFile=payment?.mode==='live'?'live.sqlite':'staging.sqlite';
 const db=new DatabaseSync(resolve(dataDir,databaseFile));
 chmodSync(resolve(dataDir,databaseFile),0o600);
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL)');
 let row=db.prepare('SELECT value FROM state WHERE id=1').get();
 let state=row?JSON.parse(row.value):{users:[],bags:[],orders:[],audit:[],keys:{},stationToken:token()};
 if(payment?.mode==='live'&&row&&state.environment!=='live')throw Error('Live payments require a fresh live database; pilot data cannot be converted automatically');
 if(!row)state.environment=payment?.mode==='live'?'live':'pilot';
 state.complaints??=[];
 state.pricing??={...DEFAULT_PRICING};
 state.pricingHistory??=[];state.notices??=[];state.pricingPin??=null;
 state.businessCosts??=[];
 state.paymentEvents??=[];
 state.notifications??=[];
 const pushKeysCreated=!state.pushKeys;if(pushKeysCreated)state.pushKeys=webpush.generateVAPIDKeys();
 state.passkeyChallenges??={};
 const save=()=>db.prepare('INSERT OR REPLACE INTO state VALUES (1,?)').run(JSON.stringify(state));
 if(pushKeysCreated)save();
 webpush.setVapidDetails(remoteOrigin||'https://cotton-roots.local',state.pushKeys.publicKey,state.pushKeys.privateKey);
 const pricingMigration='delivery-2.75-2026-10-26';
 if(state.pricingMigration!==pricingMigration){
  const prior={...state.pricing},effectiveAt=new Date().toISOString();state.pricing.full_service=2.75;state.pricingMigration=pricingMigration;
  if(Number(prior.full_service)!==2.75){state.pricingHistory.push({id:token().slice(0,24),effective_at:effectiveAt,changed_by:'business-pricing-update',prior,pricing:{...state.pricing}});state.notices.push({id:token().slice(0,24),type:'pricing',effective_at:effectiveAt,created_at:effectiveAt,title:'Pricing update',pricing:{...state.pricing},message:'Pickup and return service is now $2.75 per pound. Existing booked orders keep their original rates.'})}
  save();
 }
 if(!row && fixtures){
  const accounts=['customer','customer2','contractor','contractor2','owner'].map(role=>{
   const password=fixturePasswords[role]||token().slice(0,24),salt=token();const id=role;
   state.users.push({id,username:role,role:role.replace(/2$/,''),salt,passwordHash:scryptSync(password,salt,64).toString('hex'),approved:role.startsWith('contractor'),payment_method_ready:role.startsWith('customer'),days:[],preference:'both',agreement_version:role==='owner'?null:AGREEMENT_VERSION,agreement_accepted_at:role==='owner'?null:new Date().toISOString()});
   return {id,username:role,role:role.replace(/2$/,''),password};
  });
  const bagToken=token();state.bags.push({id:'bag-001',token:bagToken,customer_id:null});
  writeFileSync(resolve(dataDir,'fixtures.json'),JSON.stringify({accounts,bagToken,stationToken:state.stationToken},null,2),{mode:0o600});save();
 }
 if(payment?.mode==='live'){
  if(!initialOwner||!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(initialOwner.username)||typeof initialOwner.password!=='string'||initialOwner.password.length<24||initialOwner.password.length>256)throw Error('A secure initial live owner is required');
  if(!row){
   const salt=token();state.users.push({id:token().slice(0,24),username:initialOwner.username,role:'owner',salt,passwordHash:scryptSync(initialOwner.password,salt,64).toString('hex'),approved:true,active:true,created_at:new Date().toISOString()});save();
  }else{
   const owners=state.users.filter(user=>user.role==='owner'),owner=owners.find(user=>user.username===initialOwner.username)||(owners.length===1?owners[0]:null);if(!owner)throw Error('Live owner recovery username does not match an owner');
   const candidate=scryptSync(initialOwner.password,owner.salt,64),matches=timingSafeEqual(candidate,Buffer.from(owner.passwordHash,'hex'));
   if(owner.username!==initialOwner.username||!matches){owner.username=initialOwner.username;owner.salt=token();owner.passwordHash=scryptSync(initialOwner.password,owner.salt,64).toString('hex');owner.active=true;db.prepare('DELETE FROM sessions WHERE user_id=?').run(owner.id);state.audit.push({id:token().slice(0,24),actor:'live-owner-recovery',at:new Date().toISOString(),path:'startup',action:'owner_credentials_resynchronized'});save()}
  }
 }
 // Older verified payments waited for a manual staff release. Returned bags
 // are already secured at the shop, so verified payment now makes them ready
 // for the owning customer to collect with an exact bag scan.
 let pickupMigration=false;for(const order of state.orders){if(order.status==='paid_hold'&&order.payment_verified===true){order.status='paid_ready';order.ready_for_pickup=true;pickupMigration=true}}
 if(pickupMigration)save();
 const attempts=new Map();
 const revokeSessions=userId=>db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
 const proofDir=resolve(dataDir,'delivery-proofs');mkdirSync(proofDir,{recursive:true,mode:0o700});
 const rewardsFor=u=>{if(u.role!=='customer')return null;const paid=state.orders.filter(order=>order.customer_id===u.id&&order.payment_verified),purchasePoints=paid.reduce((sum,order)=>sum+Math.floor(Number(order.payment_total_cents||Math.round(Number(order.total||0)*100))/100),0),qualified=u.referred_by&&paid.length?100:0,referralPoints=state.users.filter(other=>other.role==='customer'&&other.referred_by===u.id&&state.orders.some(order=>order.customer_id===other.id&&order.payment_verified)).length*100,totalEarnedPoints=purchasePoints+qualified+referralPoints,redeemedPoints=Math.max(0,Number(u.reward_points_redeemed)||0),points=Math.max(0,totalEarnedPoints-redeemedPoints);return {points,totalEarnedPoints,redeemedPoints,purchasePoints,referralPoints:qualified+referralPoints,creditDollars:Math.floor(points/250)*5,pointsToNextCredit:points%250?250-points%250:0,referralCode:u.username,program:'Earn 1 point per paid dollar. After a referred customer’s first paid order, both customers receive 100 points. Redeem 250 points for a $5 credit on an unpaid laundry order.'}};
 const publicUser=u=>({id:u.id,username:u.username,role:u.role,approved:u.approved,active:u.active!==false,displayName:u.displayName||'',phone:u.phone||'',email:u.email||'',address:u.address||'',deliveryInstructions:u.delivery_instructions||'',profileVerifiedAt:u.profile_verified_at||null,applicationStatus:u.application_status||null,applicationCreatedAt:u.application_created_at||null,agreementVersion:u.agreement_version||null,agreementAcceptedAt:u.agreement_accepted_at||null,payoutOnboardingComplete:u.payout_onboarding_complete===true,paymentMethodReady:u.payment_method_ready===true,notificationAcks:u.notification_acks||[],referralName:u.referral_name||'',referredBy:u.referred_by||null});
 const staff=u=>['owner','staff'].includes(u.role);
 const payoutState=o=>{if(o.contractor_payout_status==='paid')return {status:'paid',eligibleAt:o.contractor_paid_at||null};if(!o.payment_verified||!o.paid_at)return {status:'waiting_for_customer_payment',eligibleAt:null};const eligibleAt=new Date(Date.parse(o.paid_at)+24*3600000).toISOString();return {status:Date.now()>=Date.parse(eligibleAt)?'ready':'clearing',eligibleAt}};
 const visible=(o,u)=>staff(u)||o.customer_id===u.id||u.role==='contractor'&&(o.assigned_contractor_id===u.id||u.approved&&['at_shop','offered'].includes(o.status));
 const publicOrder=o=>{const {bag_token,stripe_checkout_session_id,stripe_payment_intent_id,payment_event_id,square_event_id,delivery_proof_file,weight_proof_file,contractor_pay_adjustments,...safe}=o;return safe};
 const pushCopy=(order,event)=>({dropped_off:{title:'Bag checked in',body:`Your bag ${order.bag_id} was dropped off at Cotton Roots.`},ready:{title:'Laundry ready',body:order.service==='full_service'?'Your laundry has been returned. Open My Laundry to confirm delivery.':`Your bag ${order.bag_id} is ready for pickup at Cotton Roots.`}}[event]);
 const notifyCustomer=async(order,event)=>{
  const customer=state.users.find(item=>item.id===order.customer_id),copy=pushCopy(order,event);if(!customer||!copy)return;
  const subscriptions=Array.isArray(customer.push_subscriptions)?customer.push_subscriptions:[],record={id:token().slice(0,24),customer_id:customer.id,order_id:order.id,event,channel:'push',body:copy.body,status:'skipped',created_at:new Date().toISOString()};
  if(!subscriptions.length){record.error='Customer has not enabled phone notifications';state.notifications.push(record);return}
  let sent=0;for(const subscription of [...subscriptions])try{await pushSender(subscription,JSON.stringify({...copy,url:'/customer'}),{vapidDetails:{subject:remoteOrigin||'https://cotton-roots.local',publicKey:state.pushKeys.publicKey,privateKey:state.pushKeys.privateKey}});sent++}catch(error){if([404,410].includes(error?.statusCode))customer.push_subscriptions=customer.push_subscriptions.filter(item=>item.endpoint!==subscription.endpoint)}
  record.status=sent?'sent':'failed';record.sent_at=sent?new Date().toISOString():undefined;if(!sent)record.error='No installed phone accepted the notification';
  state.notifications.push(record);
 };
 // The pilot persists one state document. Serialize requests so an awaited
 // provider call can never roll an unrelated concurrent mutation backward.
 let requestQueue=Promise.resolve();
 const server=http.createServer(async(req,res)=>{
  const prior=requestQueue;let release;requestQueue=new Promise(resolve=>{release=resolve});await prior;
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Permissions-Policy':'camera=(self), microphone=(), geolocation=()'};
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data))};
  try{
   const remoteHost=remoteOrigin?new URL(remoteOrigin).host:null;
   const requestHost=req.headers.host||'';
   const isLoopback=/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost);
   if(remoteOrigin){
    const healthProbe=req.url==='/healthz'&&req.method==='GET'&&(requestHost===remoteHost||isLoopback||requestHost==='healthcheck.railway.app');
    if(healthProbe){db.prepare('SELECT 1').get();return send(200,{ok:true})}
    if(requestHost!==remoteHost&&!isLoopback)fail(403,'Host rejected');
    if(requestHost!==remoteHost)fail(403,'Remote host required');
    if(req.headers['x-forwarded-proto']!=='https')fail(403,'HTTPS required');
    headers['Strict-Transport-Security']='max-age=31536000';
    const remotePath=new URL(req.url,remoteOrigin).pathname;
    if(remotePath==='/api/payments/stripe/webhook'){
     if(payment?.provider!=='stripe')fail(404,'Not found');
     if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required');
     let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)fail(413,'Request too large');chunks.push(chunk)}
     const rawBody=Buffer.concat(chunks),signatureHeader=req.headers['stripe-signature'];
     if(!verifyStripeSignature({rawBody,signatureHeader,webhookSecret:payment.webhookSecret}))fail(400,'Invalid webhook');
     let event;try{event=JSON.parse(rawBody.toString())}catch{fail(400,'Invalid webhook')}
     if(state.paymentEvents.includes(event.id))return send(200,{received:true,duplicate:true});
     const session=event.data?.object;if(event.type==='checkout.session.completed'&&session?.metadata?.purpose==='customer_payment_setup'){
      const customer=state.users.find(account=>account.id===session.metadata.customer_id&&account.role==='customer');if(!customer||session.object!=='checkout.session'||session.mode!=='setup'||session.status!=='complete'||session.client_reference_id!==customer.id||typeof session.id!=='string'||!session.id.startsWith(`cs_${payment.mode}_`)||typeof session.customer!=='string'||!/^cus_[A-Za-z0-9]{8,}$/.test(session.customer)||typeof session.setup_intent!=='string'||!session.setup_intent.startsWith('seti_'))fail(409,'Stripe setup does not match customer');customer.stripe_customer_id=session.customer;customer.payment_method_ready=true;customer.payment_method_verified_at=new Date().toISOString();state.paymentEvents.push(event.id);state.audit.push({id:token().slice(0,24),actor:'stripe-webhook',at:new Date().toISOString(),path:remotePath,action:'customer_payment_method_verified',request_id:event.id});save();return send(200,{received:true});
     }
     const orderId=event.data?.object?.client_reference_id,index=state.orders.findIndex(order=>order.id===orderId),order=state.orders[index];
     if(!order||!order.stripe_checkout_session_id||!Number.isSafeInteger(order.stripe_checkout_total_cents))fail(409,'Unknown checkout');
     const before=JSON.stringify(state);
     try{
      const customer=state.users.find(account=>account.id===order.customer_id);if(!customer)fail(409,'Payment customer unavailable');
      const paymentRecord=reconcileStripeCheckout(event,{orderId:order.id,customerId:order.customer_id,amountCents:order.stripe_checkout_total_cents,currency:'USD',checkoutSessionId:order.stripe_checkout_session_id,processedEventIds:new Set(state.paymentEvents),mode:payment.mode,stripeCustomerId:customer.stripe_customer_id||''});
      const updated=transition(order,ACTION.PAYMENT,{verifiedServerWebhook:true,paymentEventId:event.id});
      customer.stripe_customer_id=paymentRecord.stripeCustomerId;customer.payment_method_ready=true;customer.payment_method_verified_at??=new Date().toISOString();Object.assign(updated,{payment_provider:`stripe_${payment.mode}`,stripe_payment_intent_id:paymentRecord.paymentIntentId,stripe_checkout_session_id:paymentRecord.sessionId,sales_tax_cents:paymentRecord.taxCents,payment_subtotal_cents:paymentRecord.subtotalCents,payment_total_cents:paymentRecord.totalCents});state.orders[index]=updated;state.paymentEvents.push(event.id);
      state.audit.push({id:token().slice(0,24),actor:'stripe-test-webhook',at:new Date().toISOString(),path:remotePath,action:'payment_verified',order_id:order.id,prior_status:order.status,new_status:updated.status,request_id:event.id});save();return send(200,{received:true});
     }catch(error){state=JSON.parse(before);fail(409,error.message)}
    }
    if(req.method==='GET'&&req.url==='/trial-qr.png'){
     headers['Content-Type']='image/png';headers['Cache-Control']='public, max-age=3600';
     res.writeHead(200,headers);res.end(readFileSync(resolve(root,'web/trial-qr.png')));return;
    }
    if(req.method==='GET'&&req.url==='/trial-qr'){
     headers['Content-Type']='text/html; charset=utf-8';headers['Cache-Control']='no-store';headers['Referrer-Policy']='no-referrer';
     res.writeHead(200,headers);res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cotton Roots customer QR</title><style>body{margin:0;background:#f8f0dc;color:#173f32;font:18px system-ui;text-align:center}main{max-width:520px;margin:auto;padding:32px 20px}img{display:block;width:min(82vw,420px);height:auto;margin:24px auto;background:white;padding:12px;border-radius:20px}p{line-height:1.5}a{color:#173f32;font-weight:700}</style></head><body><main><h1>Cotton Roots &amp; Co.</h1><p>Scan with your phone camera to create or open your customer account.</p><img src="/trial-qr.png" alt="QR code for the Cotton Roots customer app"><p><a href="/customer">Open the customer app on this device</a></p></main></body></html>');return;
    }
    if(privateAccess&&await privateAccess(req,res,headers))return;
   }else if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||''))fail(403,'Host rejected');
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(!path.startsWith('/api/')){
    if(req.method!=='GET')fail(405,'Method not allowed');
    const files={'/':'apps/index.html','/customer':'apps/customer/index.html','/customer/':'apps/customer/index.html','/contractor':'apps/contractor/index.html','/contractor/':'apps/contractor/index.html','/web/calendar.mjs':'shared/calendar.mjs','/web/jsQR.js':'node_modules/jsqr/dist/jsQR.js'};
    let file=files[path];
    if(!file&&/^\/web\/[a-zA-Z0-9_.-]+$/.test(path))file=path.slice(1);
    if(!file||!existsSync(resolve(root,file)))fail(404,'Not found');
    const contentTypes={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml; charset=utf-8','.mp4':'video/mp4','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
    const extension=file.includes('.')?`.${file.split('.').at(-1)}`:'';
    headers['Content-Type']=contentTypes[extension]||'text/html; charset=utf-8';
    const contents=readFileSync(resolve(root,file));headers['Content-Length']=String(contents.length);
    if(extension==='.mp4'){
     headers['Accept-Ranges']='bytes';const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
     if(range){const start=range[1]?Number(range[1]):0,end=range[2]?Number(range[2]):contents.length-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=contents.length){headers['Content-Range']=`bytes */${contents.length}`;delete headers['Content-Length'];res.writeHead(416,headers);res.end();return}const last=Math.min(end,contents.length-1);headers['Content-Range']=`bytes ${start}-${last}/${contents.length}`;headers['Content-Length']=String(last-start+1);res.writeHead(206,headers);res.end(contents.subarray(start,last+1));return}
    }
    res.writeHead(200,headers);res.end(contents);return;
   }
   if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');
   let body={};
   if(req.method==='POST'){
    const origin=req.headers.origin;
    if(origin&&origin!==(remoteOrigin||`http://${req.headers.host}`))fail(403,'Origin rejected');
    if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required');
    const bodyLimit=/^\/api\/orders\/[^/]+\/actions$/.test(path)?750000:16384;
    let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>bodyLimit)fail(413,'Request too large');chunks.push(chunk)}
    try{body=JSON.parse(Buffer.concat(chunks).toString())}catch{fail(400,'Invalid JSON')}
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Object required');
   }
   if(path==='/api/login'&&req.method==='POST'){
    const key=req.socket.remoteAddress;const now=Date.now();let a=attempts.get(key);if(!a||now-a.at>60000)a={count:0,at:now};attempts.set(key,a);if(++a.count>20)fail(429,'Try again later');
    const u=state.users.find(u=>u.username===body.username);
    const candidate=scryptSync(String(body.password||'').slice(0,256),u?.salt||'dummy',64);
    const storedMatch=Boolean(u)&&timingSafeEqual(candidate,Buffer.from(u.passwordHash,'hex'));
    // The disposable Render trial is already protected by the private-access
    // gate. Let testers reuse that code for non-management fixture accounts so
    // generated bootstrap passwords cannot strand a trial. Owner access stays
    // on its separate credential.
    const trialCandidate=scryptSync(String(body.password||'').slice(0,256),'crc-disposable-trial',64);
    const trialExpected=scryptSync(stagingPassword||'unavailable','crc-disposable-trial',64);
    const trialMatch=disposable&&Boolean(u)&&['customer','contractor'].includes(u.role)&&timingSafeEqual(trialCandidate,trialExpected);
    if(!storedMatch&&!trialMatch||u?.active===false)fail(401,'Invalid credentials');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
    if(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count>=1000)fail(429,'Session capacity reached');
    const sid=token(),csrf=token(),sessionSeconds=body.remember===true?30*24*3600:8*3600;db.prepare('INSERT INTO sessions (id_hash,user_id,csrf,expires) VALUES (?,?,?,?)').run(hash(sid),u.id,csrf,now+sessionSeconds*1000);
    headers['Set-Cookie']=`crc_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionSeconds}${cookieSecurity}`;
    send(200,{user:publicUser(u),csrf});return;
   }
   if(path==='/api/passkeys/authentication/options'&&req.method==='POST'){
    if(!remoteOrigin)fail(503,'Passkeys require the secure hosted app');
    const rateKey=`passkey:${req.socket.remoteAddress}`,now=Date.now();let attempt=attempts.get(rateKey);if(!attempt||now-attempt.at>60000)attempt={count:0,at:now};attempts.set(rateKey,attempt);if(++attempt.count>20)fail(429,'Try again later');
    const username=typeof body.username==='string'?body.username.trim().toLowerCase():'',u=state.users.find(item=>item.username===username&&['owner','staff'].includes(item.role)&&item.active!==false);if(!u?.passkeys?.length)fail(404,'No passkey is registered for this Management account');
    const rpID=new URL(remoteOrigin).hostname,options=await generateAuthenticationOptions({rpID,allowCredentials:u.passkeys.map(item=>({id:item.id,transports:item.transports||[]})),userVerification:'required',timeout:60000});state.passkeyChallenges[`auth:${u.id}`]={challenge:options.challenge,expires:Date.now()+300000};save();send(200,options);return;
   }
   if(path==='/api/passkeys/authentication/verify'&&req.method==='POST'){
    if(!remoteOrigin)fail(503,'Passkeys require the secure hosted app');
    const username=typeof body.username==='string'?body.username.trim().toLowerCase():'',u=state.users.find(item=>item.username===username&&['owner','staff'].includes(item.role)&&item.active!==false),credential=u?.passkeys?.find(item=>item.id===body.credential?.id),challenge=u&&state.passkeyChallenges[`auth:${u.id}`];if(!u||!credential||!challenge||challenge.expires<Date.now())fail(401,'Passkey request expired. Try again');
    let verification;try{verification=await verifyAuthenticationResponse({response:body.credential,expectedChallenge:challenge.challenge,expectedOrigin:remoteOrigin,expectedRPID:new URL(remoteOrigin).hostname,credential:{id:credential.id,publicKey:Buffer.from(credential.publicKey,'base64url'),counter:credential.counter,transports:credential.transports||[]},requireUserVerification:true})}catch{fail(401,'Passkey verification failed')}
    delete state.passkeyChallenges[`auth:${u.id}`];if(!verification.verified)fail(401,'Passkey verification failed');credential.counter=verification.authenticationInfo.newCounter;const now=Date.now(),sid=token(),csrf=token();db.prepare('DELETE FROM sessions WHERE expires<?').run(now);db.prepare('INSERT INTO sessions (id_hash,user_id,csrf,expires) VALUES (?,?,?,?)').run(hash(sid),u.id,csrf,now+8*3600000);headers['Set-Cookie']=`crc_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cookieSecurity}`;save();send(200,{user:publicUser(u),csrf});return;
   }
   if(path==='/api/management/phone-setup/login'&&req.method==='POST'){
    const rateKey=`phone-setup:${req.socket.remoteAddress}`,now=Date.now();let attempt=attempts.get(rateKey);if(!attempt||now-attempt.at>600000)attempt={count:0,at:now};attempts.set(rateKey,attempt);if(++attempt.count>10)fail(429,'Too many attempts. Generate a new phone setup code');
    const code=typeof body.code==='string'?body.code.trim():'',supplied=Buffer.from(hash(code));let u=null,setup=null;
    for(const candidate of state.users.filter(item=>['owner','staff'].includes(item.role)&&item.active!==false&&item.phoneSetup)){const expected=Buffer.from(candidate.phoneSetup.codeHash);if(supplied.length===expected.length&&timingSafeEqual(supplied,expected)){u=candidate;setup=candidate.phoneSetup}}
    if(!/^\d{6}$/.test(code)||!setup||setup.expires<now)fail(401,'That phone setup code is invalid or expired');
    delete u.phoneSetup;const sid=token(),csrf=token();db.prepare('DELETE FROM sessions WHERE expires<?').run(now);db.prepare('INSERT INTO sessions (id_hash,user_id,csrf,expires) VALUES (?,?,?,?)').run(hash(sid),u.id,csrf,now+8*3600000);headers['Set-Cookie']=`crc_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cookieSecurity}`;state.audit.push({id:token().slice(0,24),actor:u.id,at:new Date().toISOString(),path,action:'management_phone_setup_code_used'});save();send(200,{user:publicUser(u),csrf,mustAddPasskey:true});return;
   }
   if(path==='/api/contractor-applications'&&req.method==='POST'){
    const key=`application:${req.socket.remoteAddress}`,now=Date.now();let a=attempts.get(key);if(!a||now-a.at>3600000)a={count:0,at:now};attempts.set(key,a);if(++a.count>10)fail(429,'Too many applications. Try again later');
    const username=typeof body.username==='string'?body.username.trim().toLowerCase():'',password=typeof body.password==='string'?body.password:'',displayName=typeof body.displayName==='string'?body.displayName.trim():'',phone=typeof body.phone==='string'?body.phone.trim():'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username))fail(400,'Username must be 4–32 letters, numbers, dots, dashes, or underscores');
    if(password.length<8||password.length>256)fail(400,'Password must be 8–256 characters');
    if(displayName.length<2||displayName.length>80||phone.length<7||phone.length>32||email.length>128||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter your name, phone number, and a valid email address');
    if(body.agreed!==true||!Array.isArray(body.conditions)||body.conditions.length!==AGREEMENT_CONDITIONS.contractor.length||!AGREEMENT_CONDITIONS.contractor.every(id=>body.conditions.includes(id)))fail(400,'Agree to every contractor condition');
    if(state.users.some(u=>u.username===username))fail(409,'That username is unavailable');
    const salt=token(),createdAt=new Date().toISOString(),applicant={id:token().slice(0,24),username,role:'contractor',salt,passwordHash:scryptSync(password,salt,64).toString('hex'),approved:false,active:true,displayName,phone,email,days:[],preference:'both',application_status:'pending',application_created_at:createdAt,agreement_version:AGREEMENT_VERSION,agreement_accepted_at:createdAt,agreement_conditions:[...AGREEMENT_CONDITIONS.contractor]};
    state.users.push(applicant);state.audit.push({id:token().slice(0,24),actor:applicant.id,at:createdAt,path,action:'contractor_application_submitted'});save();
    send(201,{submitted:true,message:'Application submitted for Management review'});return;
   }
   if(path==='/api/customer-registrations'&&req.method==='POST'){
    const key=`customer-registration:${req.socket.remoteAddress}`,now=Date.now();let a=attempts.get(key);if(!a||now-a.at>3600000)a={count:0,at:now};attempts.set(key,a);if(++a.count>10)fail(429,'Too many registrations. Try again later');
    const username=typeof body.username==='string'?body.username.trim().toLowerCase():'',password=typeof body.password==='string'?body.password:'',displayName=typeof body.displayName==='string'?body.displayName.trim():'',phone=typeof body.phone==='string'?body.phone.trim():'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'',address=typeof body.address==='string'?body.address.trim():'',referralCode=typeof body.referralCode==='string'?body.referralCode.trim().toLowerCase():'',referralName=typeof body.referralName==='string'?body.referralName.trim():'';
    if(!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username))fail(400,'Username must be 4–32 letters, numbers, dots, dashes, or underscores');
    if(password.length<8||password.length>256)fail(400,'Password must be 8–256 characters');
    if(displayName.length<2||displayName.length>80||phone.length<7||phone.length>32||email.length>128||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||address.length<8||address.length>200||referralName.length>80)fail(400,'Enter your name, phone number, valid email, and service address');
    if(body.agreed!==true||!Array.isArray(body.conditions)||body.conditions.length!==AGREEMENT_CONDITIONS.customer.length||!AGREEMENT_CONDITIONS.customer.every(id=>body.conditions.includes(id)))fail(400,'Agree to every customer condition');
    if(state.users.some(u=>u.username===username))fail(409,'That username is unavailable');
    const referrer=referralCode?state.users.find(u=>u.role==='customer'&&u.username===referralCode):null;if(referralCode&&!referrer)fail(400,'Referral username was not found');if(referralCode===username)fail(400,'You cannot refer yourself');
    const salt=token(),createdAt=new Date().toISOString(),customer={id:token().slice(0,24),username,role:'customer',salt,passwordHash:scryptSync(password,salt,64).toString('hex'),approved:true,active:true,displayName,phone,email,address,referred_by:referrer?.id||null,referral_name:referralName,referral_verified_at:referrer?createdAt:null,application_status:'approved',created_at:createdAt,profile_verified_at:createdAt,agreement_version:AGREEMENT_VERSION,agreement_accepted_at:createdAt,agreement_conditions:[...AGREEMENT_CONDITIONS.customer]};
    state.users.push(customer);state.audit.push({id:token().slice(0,24),actor:customer.id,at:createdAt,path,action:'customer_self_registered'});save();send(201,{registered:true,message:'Customer account created. Sign in to continue.'});return;
   }
   const sid=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('crc_session='))?.slice(12);
   const session=sid&&db.prepare('SELECT user_id AS userId, csrf, expires FROM sessions WHERE id_hash=?').get(hash(sid));if(!session||session.expires<Date.now()){if(sid)db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hash(sid));fail(401,'Sign in required')}
   const user=state.users.find(u=>u.id===session.userId);if(!user||user.active===false){if(user)revokeSessions(user.id);fail(401,'Sign in required')}
   const agreementRequired=['customer','contractor'].includes(user.role)&&user.agreement_version!==AGREEMENT_VERSION;
   if(agreementRequired&&!['/api/me','/api/logout','/api/agreements/accept'].includes(path))fail(428,'Agreement acceptance required');
   if(path==='/api/passkeys/registration/options'&&req.method==='POST'){
    if(!staff(user))fail(403,'Management access required');if(!remoteOrigin)fail(503,'Passkeys require the secure hosted app');if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF token required');
    const options=await generateRegistrationOptions({rpName:'Cotton Roots & Company',rpID:new URL(remoteOrigin).hostname,userName:user.username,userID:Buffer.from(user.id),userDisplayName:user.displayName||user.username,attestationType:'none',excludeCredentials:(user.passkeys||[]).map(item=>({id:item.id,transports:item.transports||[]})),authenticatorSelection:{residentKey:'preferred',userVerification:'required'},preferredAuthenticatorType:'localDevice',timeout:60000});state.passkeyChallenges[`register:${user.id}`]={challenge:options.challenge,expires:Date.now()+300000};save();send(200,options);return;
   }
   if(path==='/api/passkeys/registration/verify'&&req.method==='POST'){
    if(!staff(user))fail(403,'Management access required');if(!remoteOrigin)fail(503,'Passkeys require the secure hosted app');if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF token required');const challenge=state.passkeyChallenges[`register:${user.id}`];if(!challenge||challenge.expires<Date.now())fail(401,'Passkey request expired. Try again');
    let verification;try{verification=await verifyRegistrationResponse({response:body.credential,expectedChallenge:challenge.challenge,expectedOrigin:remoteOrigin,expectedRPID:new URL(remoteOrigin).hostname,requireUserVerification:true})}catch{fail(400,'Passkey registration failed')}
    delete state.passkeyChallenges[`register:${user.id}`];if(!verification.verified)fail(400,'Passkey registration failed');const registered=verification.registrationInfo.credential;user.passkeys??=[];if(user.passkeys.some(item=>item.id===registered.id))fail(409,'This passkey is already registered');user.passkeys.push({id:registered.id,publicKey:Buffer.from(registered.publicKey).toString('base64url'),counter:registered.counter,transports:body.credential?.response?.transports||[],created_at:new Date().toISOString()});state.audit.push({id:token().slice(0,24),actor:user.id,at:new Date().toISOString(),path,action:'management_passkey_registered'});save();send(200,{registered:true,count:user.passkeys.length});return;
   }
   if(path==='/api/management/phone-setup/code'&&req.method==='POST'){
    if(!staff(user))fail(403,'Management access required');if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF token required');const code=sixDigitCode();user.phoneSetup={codeHash:hash(code),expires:Date.now()+10*60000,failed:0};state.audit.push({id:token().slice(0,24),actor:user.id,at:new Date().toISOString(),path,action:'management_phone_setup_code_created'});save();send(200,{code,expiresInMinutes:10});return;
   }
   if(req.method==='GET'){
    if(path==='/api/me')return send(200,{user:publicUser(user),csrf:session.csrf,pricing:state.pricing,rewards:rewardsFor(user),agreement:{version:AGREEMENT_VERSION,required:agreementRequired,conditions:AGREEMENT_CONDITIONS[user.role]||[]},staging:{synthetic:payment?.mode!=='live',disposable,payment:payment?.provider==='stripe'?{provider:'stripe',mode:payment.mode,connect:payment.connect===true,...(payment.mode==='test'?{estimatedFee:{basisPoints:payment.feeBps,fixedCents:payment.feeFixedCents}}:{})}:null}});
    if(path==='/api/push/config')return send(200,{publicKey:state.pushKeys.publicKey,subscribed:Array.isArray(user.push_subscriptions)&&user.push_subscriptions.length>0});
    if(path==='/api/contractor-onboarding'){
     if(user.role!=='contractor')fail(403,'Washing Specialist required');if(!payment?.connect)return send(200,{enabled:false,status:{started:false,complete:false}});
     let status;try{status=await connectedAccountStatus({config:payment,accountId:user.stripe_connected_account_id,fetchImpl:stripeFetch})}catch(error){console.error('Stripe Connect status failed:',String(error.message||'unknown').slice(0,240));fail(503,connectErrorMessage(error))}if(status.complete&&!user.payout_onboarding_complete){user.payout_onboarding_complete=true;user.payout_onboarding_completed_at=new Date().toISOString();save()}return send(200,{enabled:true,status});
    }
    const proofMatch=path.match(/^\/api\/orders\/([^/]+)\/delivery-proof$/);
    if(proofMatch){
     const order=state.orders.find(item=>item.id===decodeURIComponent(proofMatch[1]));if(!order||!visible(order,user)||!order.delivery_proof_file)fail(404,'Delivery photo not found');
     headers['Content-Type']=order.delivery_proof_type||'image/jpeg';headers['Cache-Control']='private, no-store';res.writeHead(200,headers);res.end(readFileSync(resolve(proofDir,order.delivery_proof_file)));return;
    }
    const weightProofMatch=path.match(/^\/api\/orders\/([^/]+)\/weight-proof$/);
    if(weightProofMatch){
     const order=state.orders.find(item=>item.id===decodeURIComponent(weightProofMatch[1]));if(!order||!visible(order,user)||!order.weight_proof_file)fail(404,'Scale photo not found');
     headers['Content-Type']=order.weight_proof_type||'image/jpeg';headers['Cache-Control']='private, no-store';res.writeHead(200,headers);res.end(readFileSync(resolve(proofDir,order.weight_proof_file)));return;
    }
    if(path==='/api/dashboard'){
     if(user.role==='customer'){
      const orders=state.orders.filter(o=>o.customer_id===user.id),active=orders.filter(o=>!['picked_up','cancelled'].includes(o.status));
      const next=active.at(-1)||null;
      return send(200,{dashboard:{role:'customer',bagCount:state.bags.filter(b=>b.customer_id===user.id).length,activeOrders:active.length,completedOrders:orders.filter(o=>o.status==='picked_up').length,nextOrder:next&&publicOrder(next)}});
     }
     if(user.role==='contractor'){
      const visibleOrders=state.orders.filter(o=>visible(o,user)),jobs=visibleOrders.filter(o=>o.assigned_contractor_id===user.id&&!['picked_up','cancelled'].includes(o.status));
      const offers=visibleOrders.filter(o=>['at_shop','offered'].includes(o.status)&&!o.assigned_contractor_id);
      const returned=state.orders.filter(o=>o.assigned_contractor_id===user.id&&o.returned_at);
      const nextJob=jobs[0]?publicOrder(jobs[0]):null;if(nextJob){delete nextJob.customer_id;delete nextJob.detergent}
      return send(200,{dashboard:{role:'contractor',approved:user.approved,availableDays:user.days.length,offers:offers.length,activeJobs:jobs.length,pendingPay:Number(returned.reduce((sum,o)=>sum+contractorPayBreakdown(o,DEFAULT_PRICING.contractor).total,0).toFixed(2)),nextJob}});
     }
     if(staff(user)){
      const now=Date.now(),open=state.orders.filter(o=>!['picked_up','cancelled'].includes(o.status));
      return send(200,{dashboard:{role:'management',customers:state.users.filter(u=>u.role==='customer').length,contractors:state.users.filter(u=>u.role==='contractor').length,openOrders:open.length,paymentHolds:open.filter(o=>['payment_pending','paid_hold'].includes(o.status)).length,overdue:open.filter(o=>o.due_at&&Date.parse(o.due_at)<now&&!o.returned_at).length}});
     }
     fail(403,'Dashboard unavailable');
    }
    if(path==='/api/orders')return send(200,{orders:state.orders.filter(o=>visible(o,user)).map(o=>{
     const v=publicOrder(o),contractor=state.users.find(account=>account.id===o.assigned_contractor_id),customer=state.users.find(account=>account.id===o.customer_id);if(contractor)v.assigned_contractor_name=contractor.displayName||contractor.username;if(customer&&(o.customer_id===user.id||staff(user)||o.assigned_contractor_id===user.id))v.customer_name=customer.displayName||customer.username;
     if(o.customer_id!==user.id&&!staff(user)){delete v.customer_id;delete v.detergent;if(o.assigned_contractor_id!==user.id){delete v.pickup_address;delete v.return_address;delete v.delivery_instructions}}return v;
    })});
    if(path==='/api/bags')return send(200,{bags:state.bags.filter(b=>b.customer_id===user.id&&b.status!=='retired').map(({token,...b})=>b)});
    if(path==='/api/availability')return send(200,{days:user.days,preference:user.preference});
    if(path==='/api/earnings')return send(200,{earnings:state.orders.filter(o=>o.assigned_contractor_id===user.id&&o.returned_at).map(o=>{const pay=contractorPayBreakdown(o,DEFAULT_PRICING.contractor),payout=payoutState(o);return {order_id:o.id,service:o.service,pounds:pay.pounds,rate:pay.rate,base_pay:pay.base,delivery_bonus:pay.deliveryBonus,rush_bonus:pay.rushBonus,adjustments:pay.adjustments,amount:pay.total,status:payout.status,payout_eligible_at:payout.eligibleAt,adjustment_details:o.contractor_pay_adjustments||[],note:'No payments or payouts connected'}})});
    if(path==='/api/management/test-kit/bag-qr'){
     if(user.role!=='owner'||!fixtures)fail(403,'Synthetic owner access required');
     const bagToken=state.bags[0]?.token;if(!bagToken)fail(404,'Synthetic bag unavailable');
     const svg=await QRCode.toString(bagToken,{type:'svg',errorCorrectionLevel:'M',margin:2,width:360});
     headers['Content-Type']='image/svg+xml; charset=utf-8';headers['Content-Disposition']='inline; filename="cotton-roots-test-bag.svg"';
     res.writeHead(200,headers);res.end(svg);return;
    }
    if(path==='/api/management/test-kit/station-qr'){
     if(user.role!=='owner'||!fixtures)fail(403,'Synthetic owner access required');
     const svg=await QRCode.toString(state.stationToken,{type:'svg',errorCorrectionLevel:'M',margin:2,width:360});
     headers['Content-Type']='image/svg+xml; charset=utf-8';headers['Content-Disposition']='inline; filename="cotton-roots-test-station.svg"';
     res.writeHead(200,headers);res.end(svg);return;
    }
    if(path==='/api/management/test-kit'){
     if(user.role!=='owner'||!fixtures)fail(403,'Synthetic owner access required');
     return send(200,{synthetic:true,bagToken:state.bags[0]?.token,stationToken:state.stationToken});
    }
    const bagQrMatch=path.match(/^\/api\/management\/bags\/([^/]+)\/qr$/);
    if(bagQrMatch){
     if(user.role!=='owner')fail(403,'Owner access required');
     const bag=state.bags.find(b=>b.id===decodeURIComponent(bagQrMatch[1]));if(!bag||bag.status==='retired')fail(404,'Active bag unavailable');
     const svg=await QRCode.toString(bag.token,{type:'svg',errorCorrectionLevel:'M',margin:2,width:360});
     headers['Content-Type']='image/svg+xml; charset=utf-8';headers['Content-Disposition']=`inline; filename="${bag.id}.svg"`;
     res.writeHead(200,headers);res.end(svg);return;
    }
    const bagLabelMatch=path.match(/^\/api\/management\/bags\/([^/]+)\/label$/);
    if(bagLabelMatch){
     if(user.role!=='owner')fail(403,'Owner access required');
     const bag=state.bags.find(b=>b.id===decodeURIComponent(bagLabelMatch[1]));if(!bag||bag.status==='retired')fail(404,'Active bag unavailable');
     const qr=await QRCode.toDataURL(bag.token,{errorCorrectionLevel:'M',margin:1,width:420});
     headers['Content-Type']='text/html; charset=utf-8';headers['Content-Security-Policy']="default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
     res.writeHead(200,headers);res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${bag.id} bag tag</title><style>@page{size:3.5in 2.25in;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#eee;color:#173f32;font-family:Arial,sans-serif}.sheet{width:3.5in;height:2.25in;padding:.09in;background:#fff}.tag{width:100%;height:100%;border:.025in dashed #173f32;border-radius:.12in;padding:.12in;display:grid;grid-template-columns:1.25in 1fr;gap:.12in;overflow:hidden}.qr{width:1.18in;height:1.18in;display:block}.brand{font:700 .15in Georgia,serif;color:#8b6a22;letter-spacing:.02in}.bag{font:700 .24in Georgia,serif;margin:.02in 0 .08in}.line{border-bottom:1px solid #355b49;height:.25in;font-size:.1in;padding-top:.08in}.hint{font-size:.075in;color:#52655b;margin-top:.04in;line-height:1.2}.scan{font-size:.075in;font-weight:700;text-align:center;margin-top:.04in;line-height:1.25}@media print{html,body{background:#fff}.sheet{break-inside:avoid}}</style></head><body><main class="sheet"><section class="tag"><div><img class="qr" src="${qr}" alt="QR code for ${bag.id}"><div class="scan">SCAN TO REGISTER<br>CHECK IN · CHECK OUT</div></div><div><div class="brand">COTTON ROOTS &amp; CO.</div><div class="bag">${bag.id.toUpperCase()}</div><div class="line">Name / initials:</div><div class="line">Phone last 4:</div><div class="line">Notes:</div><div class="hint">Cut on the dashed border and place in a 3.5 × 2.25 inch protective holder. Use your browser’s Print command at 100% scale.</div></div></section></main></body></html>`);return;
    }
    if(path==='/api/complaints'){
     if(user.role!=='customer')fail(403,'Customer required');
     return send(200,{complaints:state.complaints.filter(item=>item.customer_id===user.id)});
    }
    if(path==='/api/notices')return send(200,{notices:state.notices.slice(-10).reverse()});
    if(path==='/api/management'){if(!staff(user))fail(403,'Management access required');return send(200,{users:state.users.map(publicUser),bags:state.bags.map(({token,...bag})=>bag),orders:state.orders.map(order=>{const payout=payoutState(order);return {...publicOrder(order),contractor_pay_adjustments:order.contractor_pay_adjustments||[],contractor_pay:contractorPayBreakdown(order,DEFAULT_PRICING.contractor),contractor_payout_status:payout.status,contractor_payout_eligible_at:payout.eligibleAt,deadline_alert:deadlineAlert(order)}}),notifications:state.notifications.slice(-500).reverse(),complaints:state.complaints,pricing:state.pricing,pricingPinSet:!!state.pricingPin,pricingHistory:state.pricingHistory.slice(-20).reverse(),businessCosts:state.businessCosts.slice().reverse(),audit:state.audit})}
    fail(404,'Not found');
   }
   if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF token required');
   if(path==='/api/logout'){db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hash(sid));headers['Set-Cookie']=`crc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity}`;return send(200,{ok:true})}
   const requestKey=req.headers['idempotency-key'];if(typeof requestKey!=='string'||requestKey.length<8||requestKey.length>128)fail(400,'Idempotency-Key required');
   const key=user.id+':'+requestKey,fingerprint=hash(path+JSON.stringify(body));
   if(state.keys[key]){if(state.keys[key].fingerprint!==fingerprint)fail(409,'Key reused with different request');return send(200,state.keys[key].result)}
   const before=JSON.stringify(state);let result;
   try {
    if(path==='/api/agreements/accept'){
     const required=AGREEMENT_CONDITIONS[user.role]||[];
     if(!required.length||body.version!==AGREEMENT_VERSION||body.accepted!==true||!Array.isArray(body.conditions)||body.conditions.length!==required.length||!required.every(id=>body.conditions.includes(id)))fail(400,'All agreement conditions must be accepted');
     user.agreement_version=AGREEMENT_VERSION;user.agreement_accepted_at=new Date().toISOString();user.agreement_conditions=[...required];result={user:publicUser(user)};
    }else if(path==='/api/push/subscribe'){
     if(user.role!=='customer')fail(403,'Customer required');const subscription=body.subscription,endpoint=typeof subscription?.endpoint==='string'?subscription.endpoint:'',p256dh=typeof subscription?.keys?.p256dh==='string'?subscription.keys.p256dh:'',auth=typeof subscription?.keys?.auth==='string'?subscription.keys.auth:'';
     let endpointUrl;try{endpointUrl=new URL(endpoint)}catch{fail(400,'Valid phone notification subscription required')}if(endpointUrl.protocol!=='https:'||endpoint.length>2000||p256dh.length<40||p256dh.length>200||auth.length<10||auth.length>100)fail(400,'Valid phone notification subscription required');
     user.push_subscriptions??=[];user.push_subscriptions=user.push_subscriptions.filter(item=>item.endpoint!==endpoint);user.push_subscriptions.push({endpoint,keys:{p256dh,auth},created_at:new Date().toISOString()});user.push_subscriptions=user.push_subscriptions.slice(-5);result={subscribed:true};
    }else if(path==='/api/push/unsubscribe'){
     if(user.role!=='customer')fail(403,'Customer required');const endpoint=typeof body.endpoint==='string'?body.endpoint:'';user.push_subscriptions=(user.push_subscriptions||[]).filter(item=>item.endpoint!==endpoint);result={subscribed:false};
    }else if(path==='/api/contractor-onboarding/start'){
     if(user.role!=='contractor')fail(403,'Washing Specialist required');if(!payment?.connect)fail(503,'Stripe payout onboarding is not enabled');if(!user.displayName||!user.email)fail(400,'Save your name and email before payout setup');
     try{if(!user.stripe_connected_account_id)user.stripe_connected_account_id=await createConnectedAccount({config:payment,user,idempotencyKey:hash(`connect-controller-v1:${user.id}`),fetchImpl:stripeFetch});const onboardingUrl=await createConnectOnboardingLink({config:payment,accountId:user.stripe_connected_account_id,fetchImpl:stripeFetch});result={onboardingUrl}}catch(error){console.error('Stripe Connect onboarding failed:',String(error.message||'unknown').slice(0,240));fail(503,connectErrorMessage(error))}
    }else if(path==='/api/payment-profile/setup'){
     if(payment?.provider!=='stripe'||user.role!=='customer')fail(403,'Customer payment setup unavailable');let setup;try{setup=await createStripePaymentSetup({config:payment,customerId:user.id,customerEmail:user.email||'',stripeCustomerId:user.stripe_customer_id||'',idempotencyKey:hash(`payment-profile:${user.id}:${requestKey}`),fetchImpl:stripeFetch})}catch(error){console.error('Stripe customer payment setup failed:',String(error.message||'unknown').slice(0,240));fail(503,`Stripe could not open payment setup: ${String(error.message||'check the restricted-key permissions').slice(0,240)}`)}result={setupUrl:setup.checkoutUrl};
    }else if(path==='/api/notifications/ack'){
     const id=typeof body.id==='string'?body.id.slice(0,160):'';if(!id)fail(400,'Notification required');user.notification_acks??=[];if(!user.notification_acks.includes(id))user.notification_acks.push(id);user.notification_acks=user.notification_acks.slice(-200);result={acknowledged:true,id};
    }else if(path==='/api/rewards/redeem'){
     if(user.role!=='customer')fail(403,'Customer required');const order=state.orders.find(item=>item.id===body.orderId&&item.customer_id===user.id);if(!order)fail(404,'Order not found');if(order.status!=='payment_pending'||order.payment_verified)fail(409,'Rewards can be applied only before payment');if(order.stripe_checkout_session_id)fail(409,'Finish or cancel the open checkout before applying rewards');if(order.reward_credit_cents)fail(409,'A reward is already applied to this order');const rewards=rewardsFor(user);if(rewards.points<250)fail(409,'You need 250 available points to redeem a $5 credit');const totalCents=Math.round(Number(order.total)*100);if(!Number.isSafeInteger(totalCents)||totalCents<=500)fail(409,'This order total is too small for a $5 reward');user.reward_points_redeemed=(Number(user.reward_points_redeemed)||0)+250;order.reward_credit_cents=500;order.reward_points_redeemed=250;order.reward_redeemed_at=new Date().toISOString();result={order:publicOrder(order),rewards:rewardsFor(user)};
    }else if(path==='/api/payments/checkout'){
     if(payment?.provider!=='stripe')fail(503,'Payments are not configured');
     if(user.role!=='customer')fail(403,'Customer required');
     const order=state.orders.find(order=>order.id===body.orderId&&order.customer_id===user.id);if(!order)fail(404,'Order not found');
     if(order.status!=='payment_pending'||order.payment_verified)fail(409,'Order is not awaiting payment');
     const baseAmountCents=Math.round(Number(order.total)*100)-Number(order.reward_credit_cents||0);if(!Number.isSafeInteger(baseAmountCents)||baseAmountCents<=0)fail(409,'Verified order total required');
     const pricing=payment.mode==='test'?estimateStripeTestCharge(baseAmountCents,payment):{baseAmountCents,estimatedFeeCents:0,totalCents:baseAmountCents};
     const providerIdempotencyKey=hash(`stripe-${payment.mode}:${user.id}:${order.id}:${requestKey}`);
     let checkout;try{checkout=await createStripeCheckout({config:payment,orderId:order.id,customerId:user.id,customerEmail:user.email||'',stripeCustomerId:user.stripe_customer_id||'',amountCents:pricing.totalCents,estimatedFeeCents:pricing.estimatedFeeCents,currency:'USD',idempotencyKey:providerIdempotencyKey,fetchImpl:stripeFetch})}catch(error){console.error('Stripe order checkout failed:',String(error.message||'unknown').slice(0,240));fail(503,`Stripe could not open checkout: ${String(error.message||'please try again').slice(0,240)}`)}
     order.stripe_checkout_session_id=checkout.sessionId;order.stripe_checkout_base_cents=pricing.baseAmountCents;order.stripe_checkout_fee_cents=pricing.estimatedFeeCents;order.stripe_checkout_total_cents=pricing.totalCents;
     result={order:publicOrder(order),checkoutUrl:checkout.checkoutUrl,pricing:{currency:'USD',laundrySubtotalCents:pricing.baseAmountCents,estimatedOnlinePaymentCostCents:pricing.estimatedFeeCents,checkoutSubtotalCents:pricing.totalCents,...(payment.mode==='test'?{testTotalCents:pricing.totalCents}:{}),estimateOnly:payment.mode==='test'}};
    }else if(path==='/api/bag-box/access'){
     if(user.role!=='customer')fail(403,'Customer required');
     if(!boxLockCode)fail(503,'Bag box access is not configured');
     user.box_access_issued_at??=new Date().toISOString();
     result={accessCode:boxLockCode,issuedAt:user.box_access_issued_at,reusable:true,notice:'Scan the unique QR on the bag to register it to your account.'};
    }else if(path==='/api/profile'){
     if(body.action==='verify'){
      if(!user.displayName||!user.phone||user.phone.length<7||!user.email||user.role==='customer'&&!user.address)fail(400,user.role==='customer'?'Add your name, phone number, email, and service address before verifying':'Add your name, phone number, and email before verifying');
      user.profile_verified_at=new Date().toISOString();result={user:publicUser(user)};
     }else{
     const displayName=typeof body.displayName==='string'?body.displayName.trim():'';
     const phone=typeof body.phone==='string'?body.phone.trim():'';
     const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
     const address=typeof body.address==='string'?body.address.trim():'';
     const deliveryInstructions=typeof body.deliveryInstructions==='string'?body.deliveryInstructions.trim():'';
     if(displayName.length>80||phone.length>32||email.length>128||address.length>200||deliveryInstructions.length>500||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Check the contact details and try again');
     user.displayName=displayName;user.phone=phone;user.email=email;if(user.role==='customer'){user.address=address;user.delivery_instructions=deliveryInstructions}user.profile_verified_at=null;result={user:publicUser(user)};
     }
    }else if(path==='/api/bags/exchange-request'){
     if(user.role!=='customer')fail(403,'Customer required');
     const bag=state.bags.find(b=>b.id===body.bagId&&b.customer_id===user.id&&b.status!=='retired');if(!bag)fail(404,'Bag not found');
     bag.exchange_requested_at??=new Date().toISOString();result={bag:{id:bag.id,exchange_requested_at:bag.exchange_requested_at}};
    }else if(path==='/api/complaints'){
     if(user.role!=='customer')fail(403,'Customer required');
     const orderId=typeof body.orderId==='string'?body.orderId:'';
     const order=state.orders.find(item=>item.id===orderId&&item.customer_id===user.id);if(!order)fail(404,'Order not found');
     const category=typeof body.category==='string'?body.category:'';
     const message=typeof body.message==='string'?body.message.trim():'';
     if(!['service','late','bag','payment','other'].includes(category)||message.length<10||message.length>1000)fail(400,'Choose a topic and enter 10–1000 characters');
     const complaint={id:token().slice(0,24),customer_id:user.id,order_id:order.id,category,message,status:'open',created_at:new Date().toISOString()};
     state.complaints.push(complaint);result={complaint};
    }else if(path==='/api/claim'){
     if(user.role!=='customer')fail(403,'Customer required');
     const bag=state.bags.find(b=>b.token===body.bagToken&&b.status!=='retired');if(!bag)fail(409,'Bag unavailable');
     if(body.boxAcknowledged!==true||body.lockedAcknowledged!==true)fail(400,'Box and lock acknowledgment required');
     if(bag.customer_id===user.id){result={bag:{id:bag.id,claimed_at:bag.claimed_at,first_return_due:bag.first_return_due},alreadyRegistered:true};}
     else {
     if(bag.customer_id)fail(409,'Bag unavailable');
     if(state.bags.some(b=>b.customer_id===user.id))fail(403,'Extra bag purchasing is disabled');
     bag.customer_id=user.id;bag.claimed_at=new Date().toISOString();bag.first_return_due=new Date(Date.now()+86400000).toISOString();result={bag:{id:bag.id,claimed_at:bag.claimed_at,first_return_due:bag.first_return_due}};
     }
    }else if(path==='/api/orders'){
     if(user.role!=='customer')fail(403,'Customer required');
     if(payment?.provider==='stripe'&&!user.payment_method_ready)fail(403,'Set up and verify your payment method before placing an order');
     if(state.orders.some(order=>order.customer_id===user.id&&!['picked_up','cancelled'].includes(order.status)))fail(409,'Finish and pay your current laundry order before starting another');
     if(!['dropoff','full_service'].includes(body.service)||!['standard','own','contact'].includes(body.detergent))fail(400,'Invalid booking');
     const bag=state.bags.find(b=>b.customer_id===user.id&&b.status!=='retired');if(!bag)fail(409,'Claim an active bag first');
     if(state.orders.some(o=>o.bag_id===bag.id&&!['picked_up','cancelled'].includes(o.status)))fail(409,'Bag already has an active order');
     let pickupAddress=null,returnAddress=null,distanceMiles=0,distanceCharge=0;if(body.service==='full_service'){
      pickupAddress=user.address||'';returnAddress=pickupAddress;
      if(pickupAddress.length<5||pickupAddress.length>200)fail(400,'Add your pickup and return address in My profile first');
      try{const oneWayMiles=await distanceLookup(pickupAddress);distanceMiles=Number((oneWayMiles*2).toFixed(1))}catch{fail(503,'We could not calculate delivery distance. Check your profile address and try again.')}
      if(!Number.isFinite(distanceMiles)||distanceMiles<0||distanceMiles>100)fail(400,'Delivery address must be within 100 miles of the shop');
      distanceCharge=deliveryFee(distanceMiles);
     }
     const laundryNotes=typeof body.laundryNotes==='string'?body.laundryNotes.trim():'';if(laundryNotes.length>500)fail(400,'Laundry instructions must be 500 characters or fewer');
     const order={id:token().slice(0,24),customer_id:user.id,bag_id:bag.id,status:body.service==='full_service'?'offered':'awaiting_dropoff',service:body.service,detergent:body.detergent,laundry_notes:laundryNotes,rush_requested:body.rush_requested===true,rush_approved:body.rush_requested===true,payment_verified:false,ready_for_pickup:false,customer_rate_per_lb:state.pricing[body.service],rush_rate_per_lb:state.pricing.rushPerLb,contractor_rate_per_lb:state.pricing.contractor,delivery_free_miles:5,delivery_rate_per_mile:1,delivery_miles:distanceMiles,delivery_fee:distanceCharge,pickup_address:pickupAddress,return_address:returnAddress,delivery_instructions:body.service==='full_service'?(user.delivery_instructions||'Hand directly to customer if available.'):null,created_at:new Date().toISOString(),due_at:body.service==='full_service'?shopDueDeadline():null,due_note:body.service==='full_service'?SHOP_DUE_NOTE:'Deadline is set from the verified shop drop-off time.'};
     state.orders.push(order);result={order};
    }else if(path==='/api/availability'){
     if(user.role!=='contractor')fail(403,'Contractor required');
     if(!Array.isArray(body.days)||body.days.length>14||!body.days.every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d))||!['both','dropoff','full_service'].includes(body.preference))fail(400,'Invalid availability');
     user.days=[...new Set(body.days)];user.preference=body.preference;result={days:user.days,preference:user.preference};
    }else if(path==='/api/management/accounts'){
     if(user.role!=='owner')fail(403,'Owner access required');
     const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
     const temporaryPassword=typeof body.temporaryPassword==='string'?body.temporaryPassword:'';
     if(!['customer','contractor'].includes(body.role)||!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username))fail(400,'Use a username with 3–32 lowercase letters, numbers, dashes, or underscores');
     if(temporaryPassword.length<8||temporaryPassword.length>256)fail(400,'Temporary password must be 8–256 characters');
     if(state.users.some(account=>account.username===username))fail(409,'That username is already in use');
     const salt=token(),account={id:token().slice(0,24),username,role:body.role,salt,passwordHash:scryptSync(temporaryPassword,salt,64).toString('hex'),approved:body.role==='customer',days:[],preference:'both',created_at:new Date().toISOString(),pilot:true};
     state.users.push(account);result={user:publicUser(account)};
    }else if(/^\/api\/management\/accounts\/[^/]+$/.test(path)){
     if(user.role!=='owner')fail(403,'Owner access required');const id=path.split('/').at(-1),account=state.users.find(a=>a.id===id);if(!account)fail(404,'Account not found');
     if(body.action==='set_active'){if(typeof body.active!=='boolean'||account.id===user.id)fail(400,'That account cannot be changed');account.active=body.active;if(!body.active)revokeSessions(account.id);result={user:publicUser(account)};}
     else if(body.action==='reset_password'){const temporaryPassword=typeof body.temporaryPassword==='string'?body.temporaryPassword:'';if(temporaryPassword.length<8||temporaryPassword.length>256)fail(400,'Temporary password must be 8–256 characters');const salt=token();account.salt=salt;account.passwordHash=scryptSync(temporaryPassword,salt,64).toString('hex');account.password_reset_at=new Date().toISOString();revokeSessions(account.id);result={user:publicUser(account)};}
     else if(body.action==='update_profile'){
      if(account.role==='customer'){
       if(!state.pricingPin)fail(409,'Set the six-digit owner PIN in Pricing first');const pin=typeof body.pin==='string'?body.pin:'';
       const candidate=scryptSync(pin,state.pricingPin.salt,64);if(!/^\d{6}$/.test(pin)||!timingSafeEqual(candidate,Buffer.from(state.pricingPin.hash,'hex')))fail(403,'Owner PIN did not match');
      }
      const displayName=typeof body.displayName==='string'?body.displayName.trim():'';const phone=typeof body.phone==='string'?body.phone.trim():'';const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';if(displayName.length>80||phone.length>32||email.length>128||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Check the contact details and try again');account.displayName=displayName;account.phone=phone;account.email=email;account.profile_verified_at=null;result={user:publicUser(account)};
     }
     else if(body.action==='verify_referral'){
      if(account.role!=='customer')fail(400,'Referral must belong to a customer');const referrer=state.users.find(candidate=>candidate.id===body.referrerId&&candidate.role==='customer');if(!referrer||referrer.id===account.id)fail(400,'Choose a different valid customer');account.referred_by=referrer.id;account.referral_verified_at=new Date().toISOString();result={user:publicUser(account)};
     }
     else if(body.action==='delete_account'){
      if(account.id===user.id||!['customer','contractor'].includes(account.role))fail(400,'That account cannot be deleted');
      if(state.bags.some(b=>b.customer_id===account.id)||state.orders.some(o=>o.customer_id===account.id||o.assigned_contractor_id===account.id))fail(409,'This account has bag or job history. Pause it instead.');
      revokeSessions(account.id);state.users=state.users.filter(a=>a.id!==account.id);result={deleted:true,accountId:account.id};
     }
     else fail(400,'Unsupported account action');
    }else if(path==='/api/management/bags'){
     if(user.role!=='owner')fail(403,'Owner access required');
     if(body.action==='add'){
      const highest=state.bags.reduce((max,bag)=>{const match=/^bag-(\d+)$/.exec(bag.id);return match?Math.max(max,Number(match[1])):max},0);let number=highest+1,id;
      do{id=`bag-${String(number++).padStart(3,'0')}`}while(state.bags.some(b=>b.id===id));
      state.bags.push({id,token:token(),customer_id:null,status:'active',created_at:new Date().toISOString()});result={bag:{id,status:'active'}};
     }
     else if(body.action==='exchange'){const oldBag=state.bags.find(b=>b.id===body.oldBagId&&b.customer_id&&b.status!=='retired'),newBag=state.bags.find(b=>b.id===body.newBagId&&b.status!=='retired'&&!b.customer_id);if(!oldBag||!newBag)fail(409,'Choose a registered old bag and an available replacement bag');if(state.orders.some(o=>o.bag_id===oldBag.id&&!['picked_up','cancelled'].includes(o.status)))fail(409,'Finish or cancel the active order before exchanging this bag');const customerId=oldBag.customer_id;oldBag.status='retired';oldBag.retired_at=new Date().toISOString();oldBag.replaced_by=newBag.id;oldBag.previous_customer_id=customerId;oldBag.customer_id=null;newBag.customer_id=customerId;newBag.claimed_at=new Date().toISOString();newBag.replaces=oldBag.id;result={oldBag:{id:oldBag.id,status:oldBag.status},newBag:{id:newBag.id,status:'active',customer_id:customerId}};}
     else fail(400,'Unsupported bag action');
    }else if(path==='/api/management/approve'){
     if(user.role!=='owner')fail(403,'Owner access required');const applicant=state.users.find(u=>u.id===body.userId&&u.role==='contractor');if(!applicant)fail(404,'Contractor not found');
     if(payment?.provider==='stripe'&&(!payment.connect||!applicant.payout_onboarding_complete))fail(409,'Tax, identity, and bank payout setup must be verified before approval');
     if(body.phoneConfirmed!==true||body.inPersonConfirmed!==true)fail(400,'Confirm the phone conversation and in-person shop meeting first');
     const approvedAt=new Date().toISOString();applicant.approved=true;applicant.application_status='approved';applicant.phone_screen_confirmed_at=approvedAt;applicant.shop_meeting_confirmed_at=approvedAt;applicant.approved_at=approvedAt;applicant.approved_by=user.id;result={user:publicUser(applicant)};
    }else if(path==='/api/management/pricing'){
     if(user.role!=='owner')fail(403,'Owner access required');
     const pin=typeof body.pin==='string'?body.pin:'';
     if(body.action==='set_pin'){
      if(state.pricingPin)fail(409,'Pricing PIN is already set');if(!/^\d{6}$/.test(pin)||pin!==body.confirmPin)fail(400,'Enter the same six-digit pricing PIN twice');
      const salt=token();state.pricingPin={salt,hash:scryptSync(pin,salt,64).toString('hex'),created_at:new Date().toISOString(),created_by:user.id};result={pricingPinSet:true};
     }else{
     if(!state.pricingPin)fail(409,'Set the pricing PIN first');
     const candidate=scryptSync(pin,state.pricingPin.salt,64);if(!/^\d{6}$/.test(pin)||!timingSafeEqual(candidate,Buffer.from(state.pricingPin.hash,'hex')))fail(403,'Pricing PIN did not match');
     const next={};for(const key of Object.keys(DEFAULT_PRICING)){const value=Number(body[key]);if(!Number.isFinite(value)||value<0||value>100||Math.abs(value*100-Math.round(value*100))>1e-8)fail(400,'Prices must be between $0 and $100 with no more than two decimals');next[key]=value}
     const effectiveAt=new Date().toISOString(),prior={...state.pricing};state.pricing=next;state.pricingHistory.push({id:token().slice(0,24),effective_at:effectiveAt,changed_by:user.id,prior,pricing:{...next}});
     state.notices.push({id:token().slice(0,24),type:'pricing',effective_at:effectiveAt,created_at:effectiveAt,title:'Pricing update',pricing:{...next},message:'New pricing is now effective. Existing booked orders keep their original rates.'});
     result={pricing:state.pricing,effectiveAt};
     }
    }else if(path==='/api/management/costs'){
     if(user.role!=='owner')fail(403,'Owner access required');
     if(body.action==='add'){
      const description=typeof body.description==='string'?body.description.trim():'',category=typeof body.category==='string'?body.category:'',date=typeof body.date==='string'?body.date:'';
      const amount=Number(body.amount);if(description.length<2||description.length>100||!['supplies','rent','utilities','software','marketing','other'].includes(category)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||amount<=0||amount>100000||Math.abs(amount*100-Math.round(amount*100))>1e-8)fail(400,'Check the cost description, category, date, and amount');
      const cost={id:token().slice(0,24),description,category,date,amount,created_at:new Date().toISOString(),created_by:user.id};state.businessCosts.push(cost);result={cost};
     }else if(body.action==='delete'){
      const index=state.businessCosts.findIndex(item=>item.id===body.id);if(index<0)fail(404,'Cost not found');const [cost]=state.businessCosts.splice(index,1);result={deleted:true,costId:cost.id};
     }else fail(400,'Unsupported cost action');
    }else if(path==='/api/management/pay-adjustments'){
     if(user.role!=='owner')fail(403,'Owner access required');
     const order=state.orders.find(item=>item.id===body.orderId&&item.assigned_contractor_id&&item.returned_at);if(!order)fail(404,'Completed contractor order not found');order.contractor_pay_adjustments??=[];
     if(order.contractor_payout_status==='paid')fail(409,'Paid jobs cannot be edited');
     if(body.action==='set'){
      const amount=Number(body.amount),reason=typeof body.reason==='string'?body.reason.trim():'';if(!Number.isFinite(amount)||amount<-500||amount>500||Math.abs(amount*100-Math.round(amount*100))>1e-8||amount!==0&&(reason.length<3||reason.length>120))fail(400,'Enter an adjustment from -$500 to $500 and a short reason');
      order.contractor_pay_adjustments=amount===0?[]:[{id:token().slice(0,24),amount,reason,created_at:new Date().toISOString(),created_by:user.id}];result={contractorPay:contractorPayBreakdown(order,DEFAULT_PRICING.contractor)};
     }else if(body.action==='add'){
      const amount=Number(body.amount),reason=typeof body.reason==='string'?body.reason.trim():'';if(!Number.isFinite(amount)||amount===0||amount<-500||amount>500||Math.abs(amount*100-Math.round(amount*100))>1e-8||reason.length<3||reason.length>120)fail(400,'Enter an adjustment from -$500 to $500 and a short reason');
      const adjustment={id:token().slice(0,24),amount,reason,created_at:new Date().toISOString(),created_by:user.id};order.contractor_pay_adjustments.push(adjustment);result={adjustment,contractorPay:contractorPayBreakdown(order,DEFAULT_PRICING.contractor)};
     }else if(body.action==='delete'){
      const index=order.contractor_pay_adjustments.findIndex(item=>item.id===body.adjustmentId);if(index<0)fail(404,'Pay adjustment not found');const [adjustment]=order.contractor_pay_adjustments.splice(index,1);result={deleted:true,adjustmentId:adjustment.id,contractorPay:contractorPayBreakdown(order,DEFAULT_PRICING.contractor)};
     }else fail(400,'Unsupported pay adjustment action');
    }else if(/^\/api\/management\/complaints\/[^/]+$/.test(path)){
     if(!staff(user))fail(403,'Management access required');
     const complaint=state.complaints.find(item=>item.id===path.split('/').at(-1));if(!complaint)fail(404,'Complaint not found');
     if(!['resolved','open'].includes(body.status))fail(400,'Choose open or resolved');
     complaint.status=body.status;
     if(body.status==='resolved'){complaint.resolved_at=new Date().toISOString();complaint.resolved_by=user.id}else{delete complaint.resolved_at;delete complaint.resolved_by}
     result={complaint};
    }else if(/^\/api\/orders\/[^/]+\/actions$/.test(path)){
     const id=path.split('/')[3],index=state.orders.findIndex(o=>o.id===id),o=state.orders[index];if(!o||!visible(o,user))fail(404,'Order not found');
     const action=body.action,bag=state.bags.find(b=>b.id===o.bag_id),bagVerified=typeof body.bagToken==='string'&&body.bagToken===bag.token;
     const customerActions=[ACTION.DROP_OFF,ACTION.PICKUP,'rate'];const contractorActions=[ACTION.ACCEPT,ACTION.WEIGH,ACTION.CHECK_OUT,ACTION.RETURN_BAG];
     if(customerActions.includes(action)){if(user.role!=='customer'||o.customer_id!==user.id)fail(403,'Order owner required');if(action===ACTION.DROP_OFF&&payment?.provider==='stripe'&&!user.payment_method_ready)fail(403,'Verify your payment method before dropping off laundry')}
     else if(contractorActions.includes(action)){if(user.role!=='contractor'||!user.approved)fail(403,'Approved contractor required');if(action===ACTION.ACCEPT&&payment?.connect&&!user.payout_onboarding_complete)fail(403,'Complete tax, identity, and bank payout setup before accepting work');if(action!==ACTION.ACCEPT&&o.assigned_contractor_id!==user.id)fail(403,'Assigned contractor required')}
     else if(action===ACTION.RELEASE){if(!staff(user))fail(403,'Staff required')}
     else fail(403,'Action unavailable; payments are not connected');
     if(action==='rate'){
      if(o.status!=='picked_up'||o.rating)fail(409,'Rating unavailable');if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)fail(400,'Rating must be 1–5');o.rating=body.rating;result={order:publicOrder(o)};
     }else{
      if(action===ACTION.WEIGH&&(typeof body.measuredPounds!=='number'||body.measuredPounds>200))fail(400,'Weight must be at most 200 lb');
      if(action===ACTION.RETURN_BAG&&o.return_bag_scanned_at)fail(409,'Scan already recorded');
      let weightProof=null;if(action===ACTION.WEIGH){
       const photo=photoPayload(body.weightPhoto,'scale reading');weightProof={...photo,file:`${token()}.${photo.type==='image/png'?'png':'jpg'}`};
      }
      let deliveryProof=null;if(action===ACTION.RETURN_BAG&&o.service==='full_service'){
       const match=typeof body.deliveryPhoto==='string'&&body.deliveryPhoto.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);if(!match)fail(400,'Take a delivery photo before completing the return');
       const bytes=Buffer.from(match[2],'base64');if(bytes.length<1000||bytes.length>500000)fail(400,'Delivery photo must be between 1 KB and 500 KB');
       if(match[1]==='image/jpeg'&&!(bytes[0]===0xff&&bytes[1]===0xd8)||match[1]==='image/png'&&!(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47))fail(400,'Invalid delivery photo');
       deliveryProof={bytes,type:match[1],file:`${token()}.${match[1]==='image/png'?'png':'jpg'}`};
      }
      let updated;try{updated=transition(o,action,{actorId:user.id,customerId:user.id,contractorId:user.id,contractorApproved:user.approved,deadlineAcknowledged:body.deadlineAcknowledged===true,availabilityConfirmed:body.availabilityConfirmed===true,shopConfirmed:body.shopConfirmed===true,bagOwnerVerified:bagVerified&&bag.customer_id===user.id,bagVerified,bagId:bag.id,measuredPounds:body.measuredPounds,staffAuthorized:staff(user)})}catch(e){fail(409,e.message)}
      if(action===ACTION.ACCEPT){const today=shopDateKey();if(!user.days.includes(today))user.days.push(today)}
      if(action===ACTION.DROP_OFF){updated.due_at=shopDueDeadline();updated.due_note=SHOP_DUE_NOTE}
      if(weightProof){writeFileSync(resolve(proofDir,weightProof.file),weightProof.bytes,{mode:0o600});updated.weight_proof_file=weightProof.file;updated.weight_proof_type=weightProof.type;updated.weight_photo_at=new Date().toISOString()}
      if(deliveryProof){writeFileSync(resolve(proofDir,deliveryProof.file),deliveryProof.bytes,{mode:0o600});updated.delivery_proof_file=deliveryProof.file;updated.delivery_proof_type=deliveryProof.type;updated.delivery_photo_at=new Date().toISOString()}
      if(updated.billed_pounds)updated.total=invoiceTotal(updated.service,updated.billed_pounds,updated.rush_approved,{dropoff:updated.customer_rate_per_lb??DEFAULT_PRICING.dropoff,full_service:updated.customer_rate_per_lb??DEFAULT_PRICING.full_service,rushPerLb:updated.rush_rate_per_lb??DEFAULT_PRICING.rushPerLb},updated.delivery_fee||0);
      state.orders[index]=updated;result={order:publicOrder(updated)};
      if(action===ACTION.DROP_OFF)await notifyCustomer(updated,'dropped_off');
      if(action===ACTION.RETURN_BAG)await notifyCustomer(updated,'ready');
     }
    }else fail(404,'Not found');
    state.audit.push({id:token().slice(0,24),actor:user.id,at:new Date().toISOString(),path,action:body.action||path.split('/').pop(),order_id:result.order?.id,prior_status:JSON.parse(before).orders.find(o=>o.id===result.order?.id)?.status,new_status:result.order?.status,request_id:requestKey});
    // The reusable physical lock code must never be copied into persistent
    // idempotency storage. Its issuance timestamp is naturally idempotent.
    if(path!=='/api/bag-box/access')state.keys[key]={fingerprint,result:structuredClone(result)};save();
   }catch(e){state=JSON.parse(before);throw e}
   send(200,result);
  }catch(e){send(e.status||500,{error:e.status?e.message:'Internal server error'})}finally{release()}
 });
 return {server,close:()=>{server.close();db.close()}};
}
