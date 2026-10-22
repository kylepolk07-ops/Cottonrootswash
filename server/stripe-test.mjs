/** Stripe-hosted Checkout groundwork. Test keys only; this module never enables live payments. */
import {createHmac,timingSafeEqual} from 'node:crypto';

const API='https://api.stripe.com/v1/checkout/sessions';
const safeEqual=(a,b)=>{const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&timingSafeEqual(left,right)};

export function stripeTestConfig(env=process.env,origin){
 if(!env.CRC_PAYMENT_PROVIDER)return null;
 if(env.CRC_PAYMENT_PROVIDER!=='stripe_test')throw Error('Only Stripe test mode is supported');
 if(typeof origin!=='string'||!origin.startsWith('https://'))throw Error('Stripe test mode requires the exact HTTPS app origin');
 if(!/^sk_test_[A-Za-z0-9_]{16,}$/.test(env.STRIPE_SECRET_KEY||''))throw Error('A Stripe test secret key is required');
 if(!/^whsec_[A-Za-z0-9_]{16,}$/.test(env.STRIPE_WEBHOOK_SECRET||''))throw Error('A Stripe test webhook signing secret is required');
 const feeBps=Number(env.CRC_STRIPE_TEST_FEE_BPS),feeFixedCents=Number(env.CRC_STRIPE_TEST_FEE_FIXED_CENTS);
 if(!Number.isInteger(feeBps)||feeBps<0||feeBps>1000||!Number.isInteger(feeFixedCents)||feeFixedCents<0||feeFixedCents>500)throw Error('Explicit Stripe test fee estimate required');
 return {provider:'stripe',mode:'test',origin,secretKey:env.STRIPE_SECRET_KEY,webhookSecret:env.STRIPE_WEBHOOK_SECRET,feeBps,feeFixedCents};
}

export function estimateStripeTestCharge(baseAmountCents,{feeBps,feeFixedCents}={}){
 if(!Number.isSafeInteger(baseAmountCents)||baseAmountCents<=0||!Number.isInteger(feeBps)||feeBps<0||feeBps>1000||!Number.isInteger(feeFixedCents)||feeFixedCents<0||feeFixedCents>500)throw Error('Valid test subtotal and fee estimate required');
 const totalCents=Math.ceil((baseAmountCents+feeFixedCents)/(1-feeBps/10000));
 return {baseAmountCents,estimatedFeeCents:totalCents-baseAmountCents,totalCents,feeBps,feeFixedCents};
}

export function verifyStripeSignature({rawBody,signatureHeader,webhookSecret,now=Math.floor(Date.now()/1000),toleranceSeconds=300}){
 if(!Buffer.isBuffer(rawBody)||typeof signatureHeader!=='string'||typeof webhookSecret!=='string'||!webhookSecret.startsWith('whsec_'))return false;
 const fields=signatureHeader.split(',').map(value=>value.trim().split('=',2));
 const timestamp=Number(fields.find(([key])=>key==='t')?.[1]);
 const signatures=fields.filter(([key])=>key==='v1').map(([,value])=>value);
 if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>toleranceSeconds||!signatures.length)return false;
 const expected=createHmac('sha256',webhookSecret).update(String(timestamp)).update('.').update(rawBody).digest('hex');
 return signatures.some(signature=>/^[a-f0-9]{64}$/.test(signature)&&safeEqual(signature,expected));
}

function trustedCheckout({orderId,customerId,amountCents,currency='USD'}){
 if(typeof orderId!=='string'||!orderId||typeof customerId!=='string'||!customerId||!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>10000000||currency!=='USD')throw Error('Trusted order total and customer are required');
 return {orderId,customerId,amountCents,currency};
}

export async function createStripeTestCheckout({config,orderId,customerId,amountCents,estimatedFeeCents=0,currency='USD',idempotencyKey,fetchImpl=fetch}){
 if(config?.provider!=='stripe'||config.mode!=='test'||!config.secretKey.startsWith('sk_test_'))throw Error('Stripe test configuration required');
 const trusted=trustedCheckout({orderId,customerId,amountCents,currency});
 if(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>128)throw Error('Idempotency key required');
 if(!Number.isSafeInteger(estimatedFeeCents)||estimatedFeeCents<0||estimatedFeeCents>=trusted.amountCents)throw Error('Valid test payment cost estimate required');
 const subtotalCents=trusted.amountCents-estimatedFeeCents;
 const form=new URLSearchParams({mode:'payment',success_url:`${config.origin}/customer?checkout=success`,cancel_url:`${config.origin}/customer?checkout=cancel`,client_reference_id:trusted.orderId,'metadata[order_id]':trusted.orderId,'metadata[customer_id]':trusted.customerId,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(subtotalCents),'line_items[0][price_data][product_data][name]':`Cotton Roots laundry order ${trusted.orderId}`});
 if(estimatedFeeCents){form.set('line_items[1][quantity]','1');form.set('line_items[1][price_data][currency]','usd');form.set('line_items[1][price_data][unit_amount]',String(estimatedFeeCents));form.set('line_items[1][price_data][product_data][name]','Estimated online payment cost · TEST MODE')}
 const response=await fetchImpl(API,{method:'POST',headers:{Authorization:`Bearer ${config.secretKey}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey},body:form});
 let data;try{data=await response.json()}catch{throw Error('Stripe test mode returned an invalid response')}
 if(!response.ok)throw Error('Stripe test mode could not create checkout');
 let checkoutUrl;try{checkoutUrl=new URL(data.url)}catch{throw Error('Stripe checkout URL missing')}
 if(checkoutUrl.protocol!=='https:'||checkoutUrl.hostname!=='checkout.stripe.com'||typeof data.id!=='string'||!data.id.startsWith('cs_test_'))throw Error('Unexpected Stripe test checkout response');
 return {sessionId:data.id,checkoutUrl:checkoutUrl.href,orderId:trusted.orderId,amountCents:trusted.amountCents,currency:trusted.currency};
}

export function reconcileStripeCheckout(event,{orderId,customerId,amountCents,currency='USD',checkoutSessionId=null,processedEventIds=new Set()}={}){
 const trusted=trustedCheckout({orderId,customerId,amountCents,currency});
 if(!(processedEventIds instanceof Set))throw Error('Processed event set required');
 if(!event||event.type!=='checkout.session.completed'||typeof event.id!=='string'||!event.id.startsWith('evt_')||processedEventIds.has(event.id))throw Error(processedEventIds.has(event?.id)?'Duplicate event':'Unexpected event');
 const session=event.data?.object;
 if(!session||session.object!=='checkout.session'||typeof session.id!=='string'||!session.id.startsWith('cs_test_')||session.mode!=='payment'||session.payment_status!=='paid'||session.status!=='complete'||session.client_reference_id!==trusted.orderId||session.metadata?.order_id!==trusted.orderId||session.metadata?.customer_id!==trusted.customerId||session.amount_total!==trusted.amountCents||session.currency!==trusted.currency.toLowerCase()||(checkoutSessionId&&session.id!==checkoutSessionId)||typeof session.payment_intent!=='string'||!session.payment_intent.startsWith('pi_'))throw Error('Stripe checkout does not match trusted order');
 return {eventId:event.id,sessionId:session.id,paymentIntentId:session.payment_intent,orderId:trusted.orderId,customerId:trusted.customerId,amountCents:trusted.amountCents,currency:trusted.currency};
}
