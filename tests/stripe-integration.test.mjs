import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {shopDateKey} from '../shared/calendar.mjs';

const origin='https://stripe-test.example',host=new URL(origin).host,gatePassword='123456',gate='Basic '+Buffer.from('trial:'+gatePassword).toString('base64');
const payment={provider:'stripe',mode:'test',origin,secretKey:'sk_test_1234567890abcdef',webhookSecret:'whsec_1234567890abcdef',feeBps:290,feeFixedCents:30};
const weightPhoto=`data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(1200)]).toString('base64')}`;

test('Stripe test checkout is customer-owned, reconciled by signed webhook, and cannot bypass release gates',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cotton-stripe-integration-')),fixturePasswords={customer:'c'.repeat(32),contractor:'k'.repeat(32),owner:'o'.repeat(32)};let stripeRequest;
 const stripeFetch=async(url,options)=>{stripeRequest={url,options};return {ok:true,json:async()=>({id:'cs_test_integrated',url:'https://checkout.stripe.com/c/pay/cs_test_integrated'})}};
 const app=await createApp({dataDir:dir,fixtures:true,remoteOrigin:origin,stagingUser:'trial',stagingPassword:gatePassword,fixturePasswords,disposable:true,payment,stripeFetch});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.close();await rm(dir,{recursive:true,force:true})});
 const fixtures=JSON.parse(await readFile(join(dir,'fixtures.json'),'utf8')),port=app.server.address().port;
 const raw=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{host,'x-forwarded-proto':'https',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const rawBody=Buffer.concat(chunks);let data={};try{data=JSON.parse(rawBody)}catch{}resolve({status:res.statusCode,headers:res.headers,data,raw:rawBody})})});req.on('error',reject);req.end(body)});
 async function client(username){let cookie='',csrf='';const request=async(path,{method='GET',body,key=randomUUID()}={})=>{const r=await raw(path,{method,headers:{authorization:gate,cookie,...(body===undefined?{}:{origin,'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':key})},body:body===undefined?undefined:JSON.stringify(body)});return r};const password=fixturePasswords[username]||fixtures.accounts.find(account=>account.username===username)?.password,logged=await request('/api/login',{method:'POST',body:{username,password}});assert.equal(logged.status,200);cookie=logged.headers['set-cookie'][0].split(';')[0];csrf=logged.data.csrf;return {request}}
 const customer=await client('customer'),otherCustomer=await client('customer2'),contractor=await client('contractor');
 assert.equal((await customer.request('/api/claim',{method:'POST',body:{bagToken:fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}})).status,200);
 const booked=await customer.request('/api/orders',{method:'POST',body:{service:'dropoff',detergent:'standard'}}),id=booked.data.order.id,scan={bagToken:fixtures.bagToken,stationToken:fixtures.stationToken};
 const action=(actor,action,extra={})=>actor.request(`/api/orders/${id}/actions`,{method:'POST',body:{action,...extra}});
 assert.equal((await action(customer,'drop_off',scan)).status,200);assert.equal((await action(contractor,'accept_job',{deadlineAcknowledged:true,availabilityConfirmed:true})).status,200);assert.equal((await action(contractor,'record_weight',{bagToken:fixtures.bagToken,measuredPounds:8.1,weightPhoto})).status,200);assert.equal((await action(contractor,'wall_checkout',scan)).status,200);assert.equal((await action(contractor,'wash_complete')).status,200);assert.equal((await action(contractor,'return_bag',{bagToken:fixtures.bagToken})).status,200);assert.equal((await action(contractor,'wall_checkin',{stationToken:fixtures.stationToken})).status,200);
 assert.equal((await otherCustomer.request('/api/payments/checkout',{method:'POST',body:{orderId:id}})).status,404);assert.equal((await contractor.request('/api/payments/checkout',{method:'POST',body:{orderId:id}})).status,403);
 const checkout=await customer.request('/api/payments/checkout',{method:'POST',body:{orderId:id},key:'customer-checkout-1'});assert.equal(checkout.status,200,JSON.stringify(checkout.data));assert.equal(checkout.data.pricing.laundrySubtotalCents,2125);assert.equal(checkout.data.pricing.estimateOnly,true);assert.ok(checkout.data.pricing.estimatedOnlinePaymentCostCents>0);assert.equal(new URL(stripeRequest.url).hostname,'api.stripe.com');
 const form=new URLSearchParams(stripeRequest.options.body);assert.equal(form.get('client_reference_id'),id);assert.equal(Number(form.get('line_items[0][price_data][unit_amount]')),checkout.data.pricing.laundrySubtotalCents);assert.equal(Number(form.get('line_items[1][price_data][unit_amount]')),checkout.data.pricing.estimatedOnlinePaymentCostCents);assert.match(form.get('line_items[1][price_data][product_data][name]'),/TEST MODE/);assert.equal(form.get('metadata[customer_id]'),'customer');assert.match(stripeRequest.options.headers['Idempotency-Key'],/^[a-f0-9]{64}$/);assert.notEqual(stripeRequest.options.headers['Idempotency-Key'],'customer-checkout-1');
 const event={id:'evt_integrated',type:'checkout.session.completed',data:{object:{object:'checkout.session',id:'cs_test_integrated',mode:'payment',payment_status:'paid',status:'complete',automatic_tax:{status:'complete'},client_reference_id:id,metadata:{order_id:id,customer_id:'customer'},customer:'cus_integrated1',amount_subtotal:checkout.data.pricing.testTotalCents,total_details:{amount_tax:175},amount_total:checkout.data.pricing.testTotalCents+175,currency:'usd',payment_intent:'pi_integrated'}}};
 const webhook=async payload=>{const body=Buffer.from(JSON.stringify(payload)),timestamp=Math.floor(Date.now()/1000),signature=createHmac('sha256',payment.webhookSecret).update(`${timestamp}.`).update(body).digest('hex');return raw('/api/payments/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':`t=${timestamp},v1=${signature}`},body})};
 const mismatch=structuredClone(event);mismatch.id='evt_wrong_amount';mismatch.data.object.amount_subtotal--;assert.equal((await webhook(mismatch)).status,409);assert.equal((await customer.request('/api/orders')).data.orders[0].status,'payment_pending');
 assert.equal((await webhook(event)).status,200);const duplicate=await webhook(event);assert.equal(duplicate.status,200);assert.equal(duplicate.data.duplicate,true);
 let order=(await customer.request('/api/orders')).data.orders[0];assert.equal(order.status,'paid_ready');assert.equal(order.payment_verified,true);assert.equal(order.ready_for_pickup,true);assert.equal(order.stripe_checkout_session_id,undefined);assert.equal(order.stripe_payment_intent_id,undefined);assert.equal(order.payment_event_id,undefined);
 assert.equal((await action(customer,'customer_pickup',{bagToken:'wrong'})).status,409);assert.equal((await action(customer,'customer_pickup',{bagToken:fixtures.bagToken})).status,200);
 order=(await customer.request('/api/orders')).data.orders[0];assert.equal(order.status,'picked_up');
});
