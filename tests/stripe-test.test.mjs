import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {stripeConfig,stripeTestConfig,estimateStripeTestCharge,verifyStripeSignature,createStripeCheckout,createStripeTestCheckout,reconcileStripeCheckout} from '../server/stripe-test.mjs';

const origin='https://cotton-test.example',secretKey='sk_test_1234567890abcdef',webhookSecret='whsec_1234567890abcdef';
const config={provider:'stripe',mode:'test',origin,secretKey,webhookSecret,feeBps:290,feeFixedCents:30,connect:false};
const env={CRC_PAYMENT_PROVIDER:'stripe_test',STRIPE_SECRET_KEY:secretKey,STRIPE_WEBHOOK_SECRET:webhookSecret,CRC_STRIPE_TEST_FEE_BPS:'290',CRC_STRIPE_TEST_FEE_FIXED_CENTS:'30'};
const event=()=>({id:'evt_synthetic',type:'checkout.session.completed',data:{object:{object:'checkout.session',id:'cs_test_synthetic',mode:'payment',payment_status:'paid',status:'complete',automatic_tax:{status:'complete'},client_reference_id:'order-1',metadata:{order_id:'order-1',customer_id:'customer'},customer:'cus_testcustomer1',amount_subtotal:3125,total_details:{amount_tax:258},amount_total:3383,currency:'usd',payment_intent:'pi_synthetic'}}});

test('Stripe configuration is explicit test mode and rejects live or partial credentials',()=>{
 assert.equal(stripeTestConfig({},origin),null);
 assert.deepEqual(stripeTestConfig(env,origin),config);
 for(const env of [{CRC_PAYMENT_PROVIDER:'stripe'},{CRC_PAYMENT_PROVIDER:'stripe_test',STRIPE_SECRET_KEY:'sk_live_1234567890abcdef',STRIPE_WEBHOOK_SECRET:webhookSecret},{CRC_PAYMENT_PROVIDER:'stripe_test',STRIPE_SECRET_KEY:secretKey,STRIPE_WEBHOOK_SECRET:'short'}])assert.throws(()=>stripeTestConfig(env,origin));
 assert.equal(stripeTestConfig({...env,STRIPE_SECRET_KEY:'rk_test_1234567890abcdef'},origin).secretKey,'rk_test_1234567890abcdef');
 assert.equal(stripeTestConfig({...env,STRIPE_SECRET_KEY:'  rk_test_new-format.value  '},origin).secretKey,'rk_test_new-format.value');
});

test('Stripe live mode is explicit and does not add a processing-fee line item',async()=>{
 const liveEnv={CRC_PAYMENT_PROVIDER:'stripe_live',STRIPE_SECRET_KEY:'sk_live_1234567890abcdef',STRIPE_WEBHOOK_SECRET:webhookSecret},live=stripeConfig(liveEnv,origin);assert.equal(live.mode,'live');assert.equal(live.feeBps,undefined);
 let request;const fetchImpl=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({id:'cs_live_ready123',url:'https://checkout.stripe.com/c/pay/cs_live_ready123'})}};
 const result=await createStripeCheckout({config:live,orderId:'order-1',customerId:'customer',customerEmail:'customer@example.com',amountCents:3000,idempotencyKey:'live-checkout-1',fetchImpl});assert.equal(result.sessionId,'cs_live_ready123');
 const form=new URLSearchParams(request.options.body);assert.equal(form.get('line_items[0][price_data][unit_amount]'),'3000');assert.equal(form.has('line_items[1][quantity]'),false);assert.equal(form.get('automatic_tax[enabled]'),'true');
 const liveEvent=event();liveEvent.data.object.id='cs_live_ready123';liveEvent.data.object.customer='cus_livecustomer1';liveEvent.data.object.amount_subtotal=3000;liveEvent.data.object.amount_total=3258;
 const record=reconcileStripeCheckout(liveEvent,{orderId:'order-1',customerId:'customer',amountCents:3000,checkoutSessionId:'cs_live_ready123',mode:'live'});assert.equal(record.taxCents,258);assert.equal(record.totalCents,3258);
});

test('Stripe Connect contractor onboarding requires explicit live enablement',()=>{
 assert.throws(()=>stripeConfig({...env,CRC_STRIPE_CONNECT:'1'},origin),/live payments/);
 const live=stripeConfig({CRC_PAYMENT_PROVIDER:'stripe_live',STRIPE_SECRET_KEY:'sk_live_1234567890abcdef',STRIPE_WEBHOOK_SECRET:webhookSecret,CRC_STRIPE_CONNECT:'1'},origin);assert.equal(live.connect,true);
});

test('Stripe live mode prefers separately staged live secrets',()=>{
 const live=stripeConfig({CRC_PAYMENT_PROVIDER:'stripe_live',STRIPE_SECRET_KEY:'sk_test_1234567890abcdef',STRIPE_WEBHOOK_SECRET:'whsec_test_1234567890abcdef',STRIPE_LIVE_SECRET_KEY:'rk_live_1234567890abcdef',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_live_1234567890abcdef'},origin);
 assert.equal(live.secretKey,'rk_live_1234567890abcdef');assert.equal(live.webhookSecret,'whsec_live_1234567890abcdef');
});

test('Stripe test fee estimate is explicit and grossed up without altering the trusted laundry subtotal',()=>{
 assert.deepEqual(estimateStripeTestCharge(3000,config),{baseAmountCents:3000,estimatedFeeCents:121,totalCents:3121,feeBps:290,feeFixedCents:30});
 for(const args of [[0,config],[3000,{feeBps:10001,feeFixedCents:30}],[3000,{feeBps:290,feeFixedCents:-1}]])assert.throws(()=>estimateStripeTestCharge(...args));
});

test('Stripe signature binds timestamp and exact raw body with a short replay window',()=>{
 const rawBody=Buffer.from(JSON.stringify(event())),timestamp=1700000000;
 const signature=createHmac('sha256',webhookSecret).update(`${timestamp}.`).update(rawBody).digest('hex');
 const args={rawBody,signatureHeader:`t=${timestamp},v1=${signature}`,webhookSecret,now:timestamp};
 assert.equal(verifyStripeSignature(args),true);
 for(const change of [{rawBody:Buffer.concat([rawBody,Buffer.from(' ')])},{signatureHeader:`t=${timestamp},v1=${'0'.repeat(64)}`},{now:timestamp+301},{webhookSecret:'whsec_wrongwrongwrongwrong'}])assert.equal(verifyStripeSignature({...args,...change}),false);
});

test('hosted Stripe test checkout sends trusted amount and accepts only Stripe test URLs',async()=>{
 let request;
 const fetchImpl=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({id:'cs_test_synthetic',url:'https://checkout.stripe.com/c/pay/cs_test_synthetic'})}};
 const result=await createStripeTestCheckout({config,orderId:'order-1',customerId:'customer',customerEmail:'customer@example.com',amountCents:3125,idempotencyKey:'checkout-order-1',fetchImpl});
 assert.equal(result.amountCents,3125);assert.equal(request.url,'https://api.stripe.com/v1/checkout/sessions');assert.equal(request.options.headers.Authorization,`Bearer ${secretKey}`);assert.equal(request.options.headers['Idempotency-Key'],'checkout-order-1');
 assert.equal(new URLSearchParams(request.options.body).get('customer_email'),'customer@example.com');
 const form=new URLSearchParams(request.options.body);assert.equal(form.get('mode'),'payment');assert.equal(form.get('line_items[0][price_data][unit_amount]'),'3125');assert.equal(form.get('metadata[customer_id]'),'customer');assert.ok(!request.options.body.toString().includes(secretKey));
 assert.equal(form.get('automatic_tax[enabled]'),'true');assert.equal(form.get('billing_address_collection'),'required');assert.equal(form.get('line_items[0][price_data][tax_behavior]'),'exclusive');
 assert.equal(form.get('customer_creation'),'always');
 await assert.rejects(()=>createStripeTestCheckout({config,orderId:'order-1',customerId:'customer',amountCents:3125,idempotencyKey:'checkout-order-1',fetchImpl:async()=>({ok:true,json:async()=>({id:'cs_live_bad',url:'https://attacker.example'})})}));
});

test('Stripe reconciliation rejects mismatched, unpaid, live-like and duplicate checkout events',()=>{
 const trusted={orderId:'order-1',customerId:'customer',amountCents:3125,currency:'USD',checkoutSessionId:'cs_test_synthetic',processedEventIds:new Set()};
 const record=reconcileStripeCheckout(event(),trusted);assert.equal(record.paymentIntentId,'pi_synthetic');assert.equal(record.stripeCustomerId,'cus_testcustomer1');assert.equal(record.taxCents,258);assert.equal(record.totalCents,3383);
 const mutations=[e=>e.type='payment_intent.succeeded',e=>e.data.object.payment_status='unpaid',e=>e.data.object.status='open',e=>e.data.object.automatic_tax.status='failed',e=>e.data.object.amount_subtotal=1,e=>e.data.object.amount_total=1,e=>e.data.object.currency='cad',e=>e.data.object.client_reference_id='other',e=>e.data.object.metadata.customer_id='other',e=>e.data.object.id='cs_live_bad'];
 for(const mutate of mutations){const changed=event();mutate(changed);assert.throws(()=>reconcileStripeCheckout(changed,trusted))}
 assert.throws(()=>reconcileStripeCheckout(event(),{...trusted,processedEventIds:new Set(['evt_synthetic'])}),/Duplicate/);
});
