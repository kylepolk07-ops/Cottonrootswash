import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {shopDateKey} from '../shared/calendar.mjs';
import {shopDueDeadline,SHOP_DUE_NOTE} from '../shared/schedule.mjs';
import {createPrivateAccess} from './private-access.mjs';
import {transition,ACTION} from '../shared/workflow.mjs';
import {invoiceTotal} from '../shared/rules.mjs';
import {verifyStripeSignature,createStripeTestCheckout,reconcileStripeCheckout,estimateStripeTestCharge} from './stripe-test.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const token=()=>randomBytes(32).toString('hex');
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
export async function createApp({dataDir=resolve(root,'.runtime'),fixtures=false,remoteOrigin=null,stagingUser=null,stagingPassword=null,fixturePasswords={},disposable=false,payment=null,stripeFetch=fetch}={}) {
 if(remoteOrigin){
  const url=new URL(remoteOrigin);
  if(url.protocol!=='https:'||url.origin!==remoteOrigin||url.username||url.password)throw Error('An exact HTTPS remote origin is required');
  const validStagingPassword=typeof stagingPassword==='string'&&(disposable?/^\d{6}$/.test(stagingPassword)||stagingPassword.length>=24:stagingPassword.length>=24);
  if(typeof stagingUser!=='string'||!stagingUser||stagingUser.includes(':')||!validStagingPassword)throw Error(disposable?'A six-digit private preview PIN is required':'Private staging credentials required (password minimum 24 characters)');
 }
 for(const [username,password] of Object.entries(fixturePasswords)){
  if(!['customer','contractor','owner'].includes(username)||typeof password!=='string'||password.length<24||password.length>256)throw Error('Invalid synthetic fixture password configuration');
 }
 const privateAccess=remoteOrigin?createPrivateAccess({origin:remoteOrigin,username:stagingUser,password:stagingPassword}):null;
 const cookieSecurity=remoteOrigin?'; Secure':'';
 mkdirSync(dataDir,{recursive:true,mode:0o700});
 chmodSync(dataDir,0o700);
 const db=new DatabaseSync(resolve(dataDir,'staging.sqlite'));
 chmodSync(resolve(dataDir,'staging.sqlite'),0o600);
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
 let row=db.prepare('SELECT value FROM state WHERE id=1').get();
 let state=row?JSON.parse(row.value):{users:[],bags:[],orders:[],audit:[],keys:{},stationToken:token()};
 state.paymentEvents??=[];
 const save=()=>db.prepare('INSERT OR REPLACE INTO state VALUES (1,?)').run(JSON.stringify(state));
 if(!row && fixtures){
  const accounts=['customer','customer2','contractor','contractor2','owner'].map(role=>{
   const password=fixturePasswords[role]||token().slice(0,24),salt=token();const id=role;
   state.users.push({id,username:role,role:role.replace(/2$/,''),salt,passwordHash:scryptSync(password,salt,64).toString('hex'),approved:role.startsWith('contractor'),days:[],preference:'both'});
   return {id,username:role,role:role.replace(/2$/,''),password};
  });
  const bagToken=token();state.bags.push({id:'bag-001',token:bagToken,customer_id:null});
  writeFileSync(resolve(dataDir,'fixtures.json'),JSON.stringify({accounts,bagToken,stationToken:state.stationToken},null,2),{mode:0o600});save();
 }
 const sessions=new Map(),attempts=new Map();
 const publicUser=u=>({id:u.id,username:u.username,role:u.role,approved:u.approved});
 const staff=u=>['owner','staff'].includes(u.role);
 const visible=(o,u)=>staff(u)||o.customer_id===u.id||u.role==='contractor'&&(o.assigned_contractor_id===u.id||u.approved&&['at_shop','offered'].includes(o.status));
 const publicOrder=o=>{const {bag_token,stripe_checkout_session_id,stripe_payment_intent_id,payment_event_id,square_event_id,...safe}=o;return safe};
 const server=http.createServer(async(req,res)=>{
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
     if(payment?.provider!=='stripe'||payment.mode!=='test')fail(404,'Not found');
     if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required');
     let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)fail(413,'Request too large');chunks.push(chunk)}
     const rawBody=Buffer.concat(chunks),signatureHeader=req.headers['stripe-signature'];
     if(!verifyStripeSignature({rawBody,signatureHeader,webhookSecret:payment.webhookSecret}))fail(400,'Invalid webhook');
     let event;try{event=JSON.parse(rawBody.toString())}catch{fail(400,'Invalid webhook')}
     if(state.paymentEvents.includes(event.id))return send(200,{received:true,duplicate:true});
     const orderId=event.data?.object?.client_reference_id,index=state.orders.findIndex(order=>order.id===orderId),order=state.orders[index];
     if(!order||!order.stripe_checkout_session_id||!Number.isSafeInteger(order.stripe_checkout_total_cents))fail(409,'Unknown checkout');
     const before=JSON.stringify(state);
     try{
      const paymentRecord=reconcileStripeCheckout(event,{orderId:order.id,customerId:order.customer_id,amountCents:order.stripe_checkout_total_cents,currency:'USD',checkoutSessionId:order.stripe_checkout_session_id,processedEventIds:new Set(state.paymentEvents)});
      const updated=transition(order,ACTION.PAYMENT,{verifiedServerWebhook:true,paymentEventId:event.id});
      Object.assign(updated,{payment_provider:'stripe_test',stripe_payment_intent_id:paymentRecord.paymentIntentId,stripe_checkout_session_id:paymentRecord.sessionId});state.orders[index]=updated;state.paymentEvents.push(event.id);
      state.audit.push({id:token().slice(0,24),actor:'stripe-test-webhook',at:new Date().toISOString(),path:remotePath,action:'payment_verified',order_id:order.id,prior_status:order.status,new_status:updated.status,request_id:event.id});save();return send(200,{received:true});
     }catch(error){state=JSON.parse(before);fail(409,error.message)}
    }
    if(req.method==='GET'&&req.url==='/trial-qr.png'){
     headers['Content-Type']='image/png';headers['Cache-Control']='public, max-age=3600';
     res.writeHead(200,headers);res.end(readFileSync(resolve(root,'web/trial-qr.png')));return;
    }
    if(req.method==='GET'&&req.url==='/trial-qr'){
     headers['Content-Type']='text/html; charset=utf-8';headers['Cache-Control']='no-store';headers['Referrer-Policy']='no-referrer';
     res.writeHead(200,headers);res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cotton Roots app QR</title><style>body{margin:0;background:#f8f0dc;color:#173f32;font:18px system-ui;text-align:center}main{max-width:520px;margin:auto;padding:32px 20px}img{display:block;width:min(82vw,420px);height:auto;margin:24px auto;background:white;padding:12px;border-radius:20px}p{line-height:1.5}a{color:#173f32;font-weight:700}</style></head><body><main><h1>Cotton Roots &amp; Co.</h1><p>Scan with your phone camera to open the private test app.</p><img src="/trial-qr.png" alt="QR code for the private Cotton Roots test app"><p>The QR contains only the website address. You will still need your private PIN.</p><p><a href="/access">Open the app on this device</a></p></main></body></html>');return;
    }
    if(await privateAccess(req,res,headers))return;
   }else if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host||''))fail(403,'Host rejected');
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(!path.startsWith('/api/')){
    if(req.method!=='GET')fail(405,'Method not allowed');
    const files={'/':'apps/customer/index.html','/customer':'apps/customer/index.html','/customer/':'apps/customer/index.html','/contractor':'apps/contractor/index.html','/contractor/':'apps/contractor/index.html','/web/calendar.mjs':'shared/calendar.mjs'};
    let file=files[path];
    if(!file&&/^\/web\/[a-zA-Z0-9_.-]+$/.test(path))file=path.slice(1);
    if(!file||!existsSync(resolve(root,file)))fail(404,'Not found');
    headers['Content-Type']=file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'text/html';
    res.writeHead(200,headers);res.end(readFileSync(resolve(root,file)));return;
   }
   if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');
   let body={};
   if(req.method==='POST'){
    const origin=req.headers.origin;
    if(origin&&origin!==(remoteOrigin||`http://${req.headers.host}`))fail(403,'Origin rejected');
    if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required');
    let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)fail(413,'Request too large');chunks.push(chunk)}
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
    if(!storedMatch&&!trialMatch)fail(401,'Invalid credentials');
    for(const [key,value] of sessions)if(value.expires<now)sessions.delete(key);
    if(sessions.size>=1000)fail(429,'Session capacity reached');
    const sid=token(),csrf=token();sessions.set(hash(sid),{userId:u.id,csrf,expires:now+8*3600000});
    headers['Set-Cookie']=`crc_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cookieSecurity}`;
    send(200,{user:publicUser(u),csrf});return;
   }
   const sid=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('crc_session='))?.slice(12);
   const session=sid&&sessions.get(hash(sid));if(!session||session.expires<Date.now())fail(401,'Sign in required');
   const user=state.users.find(u=>u.id===session.userId);if(!user)fail(401,'Sign in required');
   if(req.method==='GET'){
    if(path==='/api/me')return send(200,{user:publicUser(user),csrf:session.csrf,staging:{synthetic:true,disposable,payment:payment?.provider==='stripe'&&payment.mode==='test'?{provider:'stripe',mode:'test',estimatedFee:{basisPoints:payment.feeBps,fixedCents:payment.feeFixedCents}}:null}});
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
      return send(200,{dashboard:{role:'contractor',approved:user.approved,availableDays:user.days.length,offers:offers.length,activeJobs:jobs.length,pendingPay:Number(returned.reduce((sum,o)=>sum+(o.billed_pounds||0),0).toFixed(2)),nextJob}});
     }
     if(staff(user)){
      const now=Date.now(),open=state.orders.filter(o=>!['picked_up','cancelled'].includes(o.status));
      return send(200,{dashboard:{role:'management',customers:state.users.filter(u=>u.role==='customer').length,contractors:state.users.filter(u=>u.role==='contractor').length,openOrders:open.length,paymentHolds:open.filter(o=>['payment_pending','paid_hold'].includes(o.status)).length,overdue:open.filter(o=>o.due_at&&Date.parse(o.due_at)<now&&!o.returned_at).length}});
     }
     fail(403,'Dashboard unavailable');
    }
    if(path==='/api/orders')return send(200,{orders:state.orders.filter(o=>visible(o,user)).map(o=>{
     const v=publicOrder(o);if(o.customer_id!==user.id&&!staff(user)){delete v.customer_id;delete v.detergent;}return v;
    })});
    if(path==='/api/bags')return send(200,{bags:state.bags.filter(b=>b.customer_id===user.id).map(({token,...b})=>b)});
    if(path==='/api/availability')return send(200,{days:user.days,preference:user.preference});
    if(path==='/api/earnings')return send(200,{earnings:state.orders.filter(o=>o.assigned_contractor_id===user.id&&o.returned_at).map(o=>({order_id:o.id,pounds:o.billed_pounds,amount:o.billed_pounds,status:'pending',note:'No payments or payouts connected'}))});
    if(path==='/api/management/test-kit'){
     if(user.role!=='owner'||!fixtures)fail(403,'Synthetic owner access required');
     return send(200,{synthetic:true,bagToken:state.bags[0]?.token,stationToken:state.stationToken});
    }
    if(path==='/api/management'){if(!staff(user))fail(403,'Management access required');return send(200,{users:state.users.map(publicUser),orders:state.orders.map(publicOrder),audit:state.audit})}
    fail(404,'Not found');
   }
   if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF token required');
   if(path==='/api/logout'){sessions.delete(hash(sid));headers['Set-Cookie']=`crc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity}`;return send(200,{ok:true})}
   const requestKey=req.headers['idempotency-key'];if(typeof requestKey!=='string'||requestKey.length<8||requestKey.length>128)fail(400,'Idempotency-Key required');
   const key=user.id+':'+requestKey,fingerprint=hash(path+JSON.stringify(body));
   if(state.keys[key]){if(state.keys[key].fingerprint!==fingerprint)fail(409,'Key reused with different request');return send(200,state.keys[key].result)}
   const before=JSON.stringify(state);let result;
   try {
    if(path==='/api/payments/checkout'){
     if(payment?.provider!=='stripe'||payment.mode!=='test')fail(503,'Test payments are not configured');
     if(user.role!=='customer')fail(403,'Customer required');
     const order=state.orders.find(order=>order.id===body.orderId&&order.customer_id===user.id);if(!order)fail(404,'Order not found');
     if(order.status!=='payment_pending'||order.payment_verified)fail(409,'Order is not awaiting payment');
     const baseAmountCents=Math.round(Number(order.total)*100);if(!Number.isSafeInteger(baseAmountCents)||baseAmountCents<=0)fail(409,'Verified order total required');
     const pricing=estimateStripeTestCharge(baseAmountCents,payment);
     const providerIdempotencyKey=hash(`stripe-test:${user.id}:${order.id}:${requestKey}`);
     const checkout=await createStripeTestCheckout({config:payment,orderId:order.id,customerId:user.id,amountCents:pricing.totalCents,estimatedFeeCents:pricing.estimatedFeeCents,currency:'USD',idempotencyKey:providerIdempotencyKey,fetchImpl:stripeFetch});
     order.stripe_checkout_session_id=checkout.sessionId;order.stripe_checkout_base_cents=pricing.baseAmountCents;order.stripe_checkout_fee_cents=pricing.estimatedFeeCents;order.stripe_checkout_total_cents=pricing.totalCents;
     result={order:publicOrder(order),checkoutUrl:checkout.checkoutUrl,pricing:{currency:'USD',laundrySubtotalCents:pricing.baseAmountCents,estimatedOnlinePaymentCostCents:pricing.estimatedFeeCents,testTotalCents:pricing.totalCents,estimateOnly:true}};
    }else if(path==='/api/claim'){
     if(user.role!=='customer')fail(403,'Customer required');
     const bag=state.bags.find(b=>b.token===body.bagToken);if(!bag||bag.customer_id)fail(409,'Bag unavailable');
     if(body.boxAcknowledged!==true||body.lockedAcknowledged!==true)fail(400,'Box and lock acknowledgment required');
     if(state.bags.some(b=>b.customer_id===user.id))fail(403,'Extra bag purchasing is disabled');
     bag.customer_id=user.id;bag.claimed_at=new Date().toISOString();bag.first_return_due=new Date(Date.now()+86400000).toISOString();result={bag:{id:bag.id,claimed_at:bag.claimed_at,first_return_due:bag.first_return_due}};
    }else if(path==='/api/orders'){
     if(user.role!=='customer')fail(403,'Customer required');
     if(!['dropoff','full_service'].includes(body.service)||!['standard','own','contact'].includes(body.detergent))fail(400,'Invalid booking');
     if(body.service==='full_service')fail(409,'Home collection routing is not yet available');
     const bag=state.bags.find(b=>b.customer_id===user.id);if(!bag)fail(409,'Claim a bag first');
     if(state.orders.some(o=>o.bag_id===bag.id&&!['picked_up','cancelled'].includes(o.status)))fail(409,'Bag already has an active order');
     const order={id:token().slice(0,24),customer_id:user.id,bag_id:bag.id,status:'awaiting_dropoff',service:body.service,detergent:body.detergent,rush_requested:body.rush_requested===true,rush_approved:false,payment_verified:false,ready_for_pickup:false,created_at:new Date().toISOString(),due_at:null,due_note:'Deadline is set from the verified shop drop-off time.'};
     state.orders.push(order);result={order};
    }else if(path==='/api/availability'){
     if(user.role!=='contractor')fail(403,'Contractor required');
     if(!Array.isArray(body.days)||body.days.length>14||!body.days.every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d))||!['both','dropoff','full_service'].includes(body.preference))fail(400,'Invalid availability');
     user.days=[...new Set(body.days)];user.preference=body.preference;result={days:user.days,preference:user.preference};
    }else if(path==='/api/management/approve'){
     if(!staff(user))fail(403,'Management access required');const applicant=state.users.find(u=>u.id===body.userId&&u.role==='contractor');if(!applicant)fail(404,'Contractor not found');applicant.approved=true;result={user:publicUser(applicant)};
    }else if(/^\/api\/orders\/[^/]+\/actions$/.test(path)){
     const id=path.split('/')[3],index=state.orders.findIndex(o=>o.id===id),o=state.orders[index];if(!o||!visible(o,user))fail(404,'Order not found');
     const action=body.action,bag=state.bags.find(b=>b.id===o.bag_id),bagVerified=typeof body.bagToken==='string'&&body.bagToken===bag.token;
     const wallStationVerified=typeof body.stationToken==='string'&&body.stationToken===state.stationToken;
     const customerActions=[ACTION.DROP_OFF,ACTION.PICKUP,'rate'];const contractorActions=[ACTION.ACCEPT,ACTION.WEIGH,ACTION.CHECK_OUT,ACTION.WASH_COMPLETE,ACTION.RETURN_BAG,ACTION.CHECK_IN];
     if(customerActions.includes(action)){if(user.role!=='customer'||o.customer_id!==user.id)fail(403,'Order owner required')}
     else if(contractorActions.includes(action)){if(user.role!=='contractor'||!user.approved)fail(403,'Approved contractor required');if(action!==ACTION.ACCEPT&&o.assigned_contractor_id!==user.id)fail(403,'Assigned contractor required')}
     else if(action===ACTION.RELEASE){if(!staff(user))fail(403,'Staff required')}
     else fail(403,'Action unavailable; payments are not connected');
     if(action===ACTION.ACCEPT){const today=shopDateKey();if(!user.days.includes(today)||!['both',o.service].includes(user.preference))fail(409,'Set matching availability for today first')}
     if(action==='rate'){
      if(o.status!=='picked_up'||o.rating)fail(409,'Rating unavailable');if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)fail(400,'Rating must be 1–5');o.rating=body.rating;result={order:publicOrder(o)};
     }else{
      if(action===ACTION.WEIGH&&(typeof body.measuredPounds!=='number'||body.measuredPounds>200))fail(400,'Weight must be at most 200 lb');
      if(action===ACTION.WASH_COMPLETE&&o.wash_completed_at||action===ACTION.RETURN_BAG&&o.return_bag_scanned_at)fail(409,'Scan already recorded');
      let updated;try{updated=transition(o,action,{actorId:user.id,customerId:user.id,contractorId:user.id,contractorApproved:user.approved,deadlineAcknowledged:body.deadlineAcknowledged===true,bagOwnerVerified:bagVerified&&bag.customer_id===user.id,bagVerified,bagId:bag.id,wallStationVerified,measuredPounds:body.measuredPounds,staffAuthorized:staff(user)})}catch(e){fail(409,e.message)}
      if(action===ACTION.DROP_OFF){updated.due_at=shopDueDeadline();updated.due_note=SHOP_DUE_NOTE}
      if(updated.billed_pounds)updated.total=invoiceTotal(updated.service,updated.billed_pounds,updated.rush_approved);
      state.orders[index]=updated;result={order:publicOrder(updated)};
     }
    }else fail(404,'Not found');
    state.audit.push({id:token().slice(0,24),actor:user.id,at:new Date().toISOString(),path,action:body.action||path.split('/').pop(),order_id:result.order?.id,prior_status:JSON.parse(before).orders.find(o=>o.id===result.order?.id)?.status,new_status:result.order?.status,request_id:requestKey});
    state.keys[key]={fingerprint,result:structuredClone(result)};save();
   }catch(e){state=JSON.parse(before);throw e}
   send(200,result);
  }catch(e){send(e.status||500,{error:e.status?e.message:'Internal server error'})}
 });
 return {server,close:()=>{server.close();db.close()}};
}
