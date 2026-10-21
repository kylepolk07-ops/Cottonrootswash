import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifySquareSignature,reconcileSquarePayment} from '../server/square-verification.mjs';
const trusted={squareOrderId:'square-order-test',amountCents:2125,currency:'USD',merchantId:'sandbox-merchant'};
const event=()=>({event_id:'event-test',type:'payment.updated',merchant_id:'sandbox-merchant',data:{type:'payment',object:{payment:{id:'payment-test',status:'COMPLETED',order_id:'square-order-test',amount_money:{amount:2125,currency:'USD'}}}}});
test('Square signature binds exact HTTPS notification URL and raw body',()=>{
 const signatureKey='synthetic-unit-test-key',notificationUrl='https://staging.example.invalid/webhook',rawBody=Buffer.from(JSON.stringify(event()));
 const signature=createHmac('sha256',signatureKey).update(notificationUrl).update(rawBody).digest('base64');
 const args={signatureKey,notificationUrl,rawBody,signature};assert.equal(verifySquareSignature(args),true);
 for(const change of [{signature:'forged'},{signatureKey:'wrong'},{notificationUrl:notificationUrl+'/'},{rawBody:Buffer.concat([rawBody,Buffer.from(' ')])},{notificationUrl:'http://staging.example.invalid/webhook'}])assert.equal(verifySquareSignature({...args,...change}),false);
});
test('Square reconciliation rejects wrong amounts, currency, order, merchant, incomplete payment and duplicate event',()=>{
 const e=event();assert.equal(reconcileSquarePayment(e,trusted).paymentId,'payment-test');
 for(const mutation of [x=>x.merchant_id='other',x=>x.type='refund.updated',x=>x.data.object.payment.status='APPROVED',x=>x.data.object.payment.refunded_money={amount:1,currency:'USD'},x=>x.data.object.payment.order_id='other',x=>x.data.object.payment.amount_money.amount=1,x=>x.data.object.payment.amount_money.currency='CAD']){
  const copy=event();mutation(copy);assert.throws(()=>reconcileSquarePayment(copy,trusted));
 }
 assert.throws(()=>reconcileSquarePayment(e,{...trusted,processedEventIds:new Set([e.event_id])}),/Duplicate/);
 assert.throws(()=>reconcileSquarePayment(e,{...trusted,merchantId:''}));
});
