import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import QRCode from 'qrcode';
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
const AGREEMENT_VERSION='pilot-2026-10-22-v1';
const AGREEMENT_CONDITIONS={customer:['platform_role','customer_contractor_service','pilot_data'],contractor:['platform_role','independent_business','pilot_data']};
export async function createApp({dataDir=resolve(root,'.runtime'),fixtures=false,remoteOrigin=null,stagingUser=null,stagingPassword=null,privateGate=true,fixturePasswords={},disposable=false,payment=null,stripeFetch=fetch,boxLockCode=null}={}) {
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
   state.users.push({id,username:role,role:role.replace(/2$/,''),salt,passwordHash:scryptSync(password,salt,64).toString('hex'),approved:role.startsWith('contractor'),days:[],preference:'both',agreement_version:role==='owner'?null:AGREEMENT_VERSION,agreement_accepted_at:role==='owner'?null:new Date().toISOString()});
   return {id,username:role,role:role.replace(/2$/,''),password};
  });
  const bagToken=token();state.bags.push({id:'bag-001',token:bagToken,customer_id:null});
  writeFileSync(resolve(dataDir,'fixtures.json'),JSON.stringify({accounts,bagToken,stationToken:state.stationToken},null,2),{mode:0o600});save();
 }
 const sessions=new Map(),attempts=new Map();
 const revokeSessions=userId=>{for(const [key,value] of sessions)if(value.userId===userId)sessions.delete(key)};
 const publicUser=u=>({id:u.id,username:u.username,role:u.role,approved:u.approved,active:u.active!==false,displayName:u.displayName||'',phone:u.phone||'',email:u.email||'',agreementVersion:u.agreement_version||null,agreementAcceptedAt:u.agreement_accepted_at||null});
 const staff=u=>['owner','staff'].includes(u.role);
 const visible=(o,u)=>staff(u)||o.customer_id===u.id||u.role==='contractor'&&(o.assigned_contractor_id===u.id||u.approved&&['at_shop','offered'].includes(o.status));
 const publicOrder=o=>{const {bag_token,stripe_checkout_session_id,stripe_payment_intent_id,payment_event_id,square_event_id,...safe}=o;return safe};
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
     res.writeHead(200,headers);res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cotton Roots app QR</title><style>body{margin:0;background:#f8f0dc;color:#173f32;font:18px system-ui;text-align:center}main{max-width:520px;margin:auto;padding:32px 20px}img{display:block;width:min(82vw,420px);height:auto;margin:24px auto;background:white;padding:12px;border-radius:20px}p{line-height:1.5}a{color:#173f32;font-weight:700}</style></head><body><main><h1>Cotton Roots &amp; Co.</h1><p>Scan with your phone camera to open the private test app.</p><img src="/trial-qr.png" alt="QR code for the private Cotton Roots test app"><p>The QR contains only the website address. You will still need your private access code.</p><p><a href="/access">Open the app on this device</a></p></main></body></html>');return;
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
    if(!storedMatch&&!trialMatch||u?.active===false)fail(401,'Invalid credentials');
    for(const [key,value] of sessions)if(value.expires<now)sessions.delete(key);
    if(sessions.size>=1000)fail(429,'Session capacity reached');
    const sid=token(),csrf=token();sessions.set(hash(sid),{userId:u.id,csrf,expires:now+8*3600000});
    headers['Set-Cookie']=`crc_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cookieSecurity}`;
    send(200,{user:publicUser(u),csrf});return;
   }
   const sid=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('crc_session='))?.slice(12);
   const session=sid&&sessions.get(hash(sid));if(!session||session.expires<Date.now())fail(401,'Sign in required');
   const user=state.users.find(u=>u.id===session.userId);if(!user||user.active===false){if(user)revokeSessions(user.id);fail(401,'Sign in required')}
   const agreementRequired=['customer','contractor'].includes(user.role)&&user.agreement_version!==AGREEMENT_VERSION;
   if(agreementRequired&&!['/api/me','/api/logout','/api/agreements/accept'].includes(path))fail(428,'Agreement acceptance required');
   if(req.method==='GET'){
    if(path==='/api/me')return send(200,{user:publicUser(user),csrf:session.csrf,agreement:{version:AGREEMENT_VERSION,required:agreementRequired,conditions:AGREEMENT_CONDITIONS[user.role]||[]},staging:{synthetic:true,disposable,payment:payment?.provider==='stripe'&&payment.mode==='test'?{provider:'stripe',mode:'test',estimatedFee:{basisPoints:payment.feeBps,fixedCents:payment.feeFixedCents}}:null}});
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
    if(path==='/api/bags')return send(200,{bags:state.bags.filter(b=>b.customer_id===user.id&&b.status!=='retired').map(({token,...b})=>b)});
    if(path==='/api/availability')return send(200,{days:user.days,preference:user.preference});
    if(path==='/api/earnings')return send(200,{earnings:state.orders.filter(o=>o.assigned_contractor_id===user.id&&o.returned_at).map(o=>({order_id:o.id,pounds:o.billed_pounds,amount:o.billed_pounds,status:'pending',note:'No payments or payouts connected'}))});
    if(path==='/api/management/test-kit/bag-qr'){
     if(user.role!=='owner'||!fixtures)fail(403,'Synthetic owner access required');
     const bagToken=state.bags[0]?.token;if(!bagToken)fail(404,'Synthetic bag unavailable');
     const svg=await QRCode.toString(bagToken,{type:'svg',errorCorrectionLevel:'M',margin:2,width:360});
     headers['Content-Type']='image/svg+xml; charset=utf-8';headers['Content-Disposition']='inline; filename="cotton-roots-test-bag.svg"';
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
    if(path==='/api/management'){if(!staff(user))fail(403,'Management access required');return send(200,{users:state.users.map(publicUser),bags:state.bags.map(({token,...bag})=>bag),orders:state.orders.map(publicOrder),audit:state.audit})}
    fail(404,'Not found');
   }
   if(req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF token required');
   if(path==='/api/logout'){sessions.delete(hash(sid));headers['Set-Cookie']=`crc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity}`;return send(200,{ok:true})}
   const requestKey=req.headers['idempotency-key'];if(typeof requestKey!=='string'||requestKey.length<8||requestKey.length>128)fail(400,'Idempotency-Key required');
   const key=user.id+':'+requestKey,fingerprint=hash(path+JSON.stringify(body));
   if(state.keys[key]){if(state.keys[key].fingerprint!==fingerprint)fail(409,'Key reused with different request');return send(200,state.keys[key].result)}
   const before=JSON.stringify(state);let result;
   try {
    if(path==='/api/agreements/accept'){
     const required=AGREEMENT_CONDITIONS[user.role]||[];
     if(!required.length||body.version!==AGREEMENT_VERSION||body.accepted!==true||!Array.isArray(body.conditions)||body.conditions.length!==required.length||!required.every(id=>body.conditions.includes(id)))fail(400,'All agreement conditions must be accepted');
     user.agreement_version=AGREEMENT_VERSION;user.agreement_accepted_at=new Date().toISOString();user.agreement_conditions=[...required];result={user:publicUser(user)};
    }else if(path==='/api/payments/checkout'){
     if(payment?.provider!=='stripe'||payment.mode!=='test')fail(503,'Test payments are not configured');
     if(user.role!=='customer')fail(403,'Customer required');
     const order=state.orders.find(order=>order.id===body.orderId&&order.customer_id===user.id);if(!order)fail(404,'Order not found');
     if(order.status!=='payment_pending'||order.payment_verified)fail(409,'Order is not awaiting payment');
     if(order.stripe_checkout_session_id)fail(409,'A test checkout is already open for this order');
     const baseAmountCents=Math.round(Number(order.total)*100);if(!Number.isSafeInteger(baseAmountCents)||baseAmountCents<=0)fail(409,'Verified order total required');
     const pricing=estimateStripeTestCharge(baseAmountCents,payment);
     const providerIdempotencyKey=hash(`stripe-test:${user.id}:${order.id}:${requestKey}`);
     const checkout=await createStripeTestCheckout({config:payment,orderId:order.id,customerId:user.id,amountCents:pricing.totalCents,estimatedFeeCents:pricing.estimatedFeeCents,currency:'USD',idempotencyKey:providerIdempotencyKey,fetchImpl:stripeFetch});
     order.stripe_checkout_session_id=checkout.sessionId;order.stripe_checkout_base_cents=pricing.baseAmountCents;order.stripe_checkout_fee_cents=pricing.estimatedFeeCents;order.stripe_checkout_total_cents=pricing.totalCents;
     result={order:publicOrder(order),checkoutUrl:checkout.checkoutUrl,pricing:{currency:'USD',laundrySubtotalCents:pricing.baseAmountCents,estimatedOnlinePaymentCostCents:pricing.estimatedFeeCents,testTotalCents:pricing.totalCents,estimateOnly:true}};
    }else if(path==='/api/bag-box/access'){
     if(user.role!=='customer')fail(403,'Customer required');
     if(!boxLockCode)fail(503,'Bag box access is not configured');
     user.box_access_issued_at??=new Date().toISOString();
     result={accessCode:boxLockCode,issuedAt:user.box_access_issued_at,reusable:true,notice:'Scan the unique QR on the bag to register it to your account.'};
    }else if(path==='/api/profile'){
     const displayName=typeof body.displayName==='string'?body.displayName.trim():'';
     const phone=typeof body.phone==='string'?body.phone.trim():'';
     const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
     if(displayName.length>80||phone.length>32||email.length>128||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Check the contact details and try again');
     user.displayName=displayName;user.phone=phone;user.email=email;result={user:publicUser(user)};
    }else if(path==='/api/bags/exchange-request'){
     if(user.role!=='customer')fail(403,'Customer required');
     const bag=state.bags.find(b=>b.id===body.bagId&&b.customer_id===user.id&&b.status!=='retired');if(!bag)fail(404,'Bag not found');
     bag.exchange_requested_at??=new Date().toISOString();result={bag:{id:bag.id,exchange_requested_at:bag.exchange_requested_at}};
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
     if(!['dropoff','full_service'].includes(body.service)||!['standard','own','contact'].includes(body.detergent))fail(400,'Invalid booking');
     if(body.service==='full_service')fail(409,'Home collection routing is not yet available');
     const bag=state.bags.find(b=>b.customer_id===user.id&&b.status!=='retired');if(!bag)fail(409,'Claim an active bag first');
     if(state.orders.some(o=>o.bag_id===bag.id&&!['picked_up','cancelled'].includes(o.status)))fail(409,'Bag already has an active order');
     const order={id:token().slice(0,24),customer_id:user.id,bag_id:bag.id,status:'awaiting_dropoff',service:body.service,detergent:body.detergent,rush_requested:body.rush_requested===true,rush_approved:false,payment_verified:false,ready_for_pickup:false,created_at:new Date().toISOString(),due_at:null,due_note:'Deadline is set from the verified shop drop-off time.'};
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
     if(temporaryPassword.length<12||temporaryPassword.length>256)fail(400,'Temporary password must be 12–256 characters');
     if(state.users.some(account=>account.username===username))fail(409,'That username is already in use');
     const salt=token(),account={id:token().slice(0,24),username,role:body.role,salt,passwordHash:scryptSync(temporaryPassword,salt,64).toString('hex'),approved:body.role==='customer',days:[],preference:'both',created_at:new Date().toISOString(),pilot:true};
     state.users.push(account);result={user:publicUser(account)};
    }else if(/^\/api\/management\/accounts\/[^/]+$/.test(path)){
     if(user.role!=='owner')fail(403,'Owner access required');const id=path.split('/').at(-1),account=state.users.find(a=>a.id===id);if(!account)fail(404,'Account not found');
     if(body.action==='set_active'){if(typeof body.active!=='boolean'||account.id===user.id)fail(400,'That account cannot be changed');account.active=body.active;if(!body.active)revokeSessions(account.id);result={user:publicUser(account)};}
     else if(body.action==='reset_password'){const temporaryPassword=typeof body.temporaryPassword==='string'?body.temporaryPassword:'';if(temporaryPassword.length<12||temporaryPassword.length>256)fail(400,'Temporary password must be 12–256 characters');const salt=token();account.salt=salt;account.passwordHash=scryptSync(temporaryPassword,salt,64).toString('hex');account.password_reset_at=new Date().toISOString();revokeSessions(account.id);result={user:publicUser(account)};}
     else if(body.action==='update_profile'){const displayName=typeof body.displayName==='string'?body.displayName.trim():'';const phone=typeof body.phone==='string'?body.phone.trim():'';const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';if(displayName.length>80||phone.length>32||email.length>128||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Check the contact details and try again');account.displayName=displayName;account.phone=phone;account.email=email;result={user:publicUser(account)};}
     else if(body.action==='delete_account'){
      if(account.id===user.id||!['customer','contractor'].includes(account.role))fail(400,'That account cannot be deleted');
      if(state.bags.some(b=>b.customer_id===account.id)||state.orders.some(o=>o.customer_id===account.id||o.assigned_contractor_id===account.id))fail(409,'This account has bag or job history. Pause it instead.');
      revokeSessions(account.id);state.users=state.users.filter(a=>a.id!==account.id);result={deleted:true,accountId:account.id};
     }
     else fail(400,'Unsupported account action');
    }else if(path==='/api/management/bags'){
     if(user.role!=='owner')fail(403,'Owner access required');
     if(body.action==='add'){const id=typeof body.id==='string'?body.id.trim().toLowerCase():'';if(!/^bag-[a-z0-9-]{3,32}$/.test(id))fail(400,'Use a bag ID such as bag-002');if(state.bags.some(b=>b.id===id))fail(409,'That bag ID already exists');state.bags.push({id,token:token(),customer_id:null,status:'active',created_at:new Date().toISOString()});result={bag:{id,status:'active'}};}
     else if(body.action==='exchange'){const oldBag=state.bags.find(b=>b.id===body.oldBagId&&b.customer_id&&b.status!=='retired'),newBag=state.bags.find(b=>b.id===body.newBagId&&b.status!=='retired'&&!b.customer_id);if(!oldBag||!newBag)fail(409,'Choose a registered old bag and an available replacement bag');if(state.orders.some(o=>o.bag_id===oldBag.id&&!['picked_up','cancelled'].includes(o.status)))fail(409,'Finish or cancel the active order before exchanging this bag');const customerId=oldBag.customer_id;oldBag.status='retired';oldBag.retired_at=new Date().toISOString();oldBag.replaced_by=newBag.id;oldBag.previous_customer_id=customerId;oldBag.customer_id=null;newBag.customer_id=customerId;newBag.claimed_at=new Date().toISOString();newBag.replaces=oldBag.id;result={oldBag:{id:oldBag.id,status:oldBag.status},newBag:{id:newBag.id,status:'active',customer_id:customerId}};}
     else fail(400,'Unsupported bag action');
    }else if(path==='/api/management/approve'){
     if(user.role!=='owner')fail(403,'Owner access required');const applicant=state.users.find(u=>u.id===body.userId&&u.role==='contractor');if(!applicant)fail(404,'Contractor not found');
     if(body.phoneConfirmed!==true||body.inPersonConfirmed!==true)fail(400,'Confirm the phone conversation and in-person shop meeting first');
     const approvedAt=new Date().toISOString();applicant.approved=true;applicant.phone_screen_confirmed_at=approvedAt;applicant.shop_meeting_confirmed_at=approvedAt;applicant.approved_at=approvedAt;applicant.approved_by=user.id;result={user:publicUser(applicant)};
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
    // The reusable physical lock code must never be copied into persistent
    // idempotency storage. Its issuance timestamp is naturally idempotent.
    if(path!=='/api/bag-box/access')state.keys[key]={fingerprint,result:structuredClone(result)};save();
   }catch(e){state=JSON.parse(before);throw e}
   send(200,result);
  }catch(e){send(e.status||500,{error:e.status?e.message:'Internal server error'})}finally{release()}
 });
 return {server,close:()=>{server.close();db.close()}};
}
