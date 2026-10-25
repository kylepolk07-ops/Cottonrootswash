/** Stripe-hosted Checkout with explicit, fail-closed test and live modes. */
import {createHmac,timingSafeEqual} from 'node:crypto';

const API='https://api.stripe.com/v1/checkout/sessions';
const safeEqual=(a,b)=>{const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&timingSafeEqual(left,right)};

export function stripeConfig(env=process.env,origin){
 if(!env.CRC_PAYMENT_PROVIDER)return null;
 if(!['stripe_test','stripe_live'].includes(env.CRC_PAYMENT_PROVIDER))throw Error('Stripe payment mode must be explicit');
 const mode=env.CRC_PAYMENT_PROVIDER==='stripe_live'?'live':'test';
 if(typeof origin!=='string'||!origin.startsWith('https://'))throw Error('Stripe requires the exact HTTPS app origin');
 const secretKey=String(mode==='live'?env.STRIPE_LIVE_SECRET_KEY||env.STRIPE_SECRET_KEY:env.STRIPE_SECRET_KEY||'').trim();
 const webhookSecret=String(mode==='live'?env.STRIPE_LIVE_WEBHOOK_SECRET||env.STRIPE_WEBHOOK_SECRET:env.STRIPE_WEBHOOK_SECRET||'').trim();
 if(!new RegExp(`^(?:sk|rk)_${mode}_\\S{8,}$`).test(secretKey))throw Error(`A Stripe ${mode} secret or restricted key is required`);
 if(!/^whsec_[A-Za-z0-9_]{16,}$/.test(webhookSecret))throw Error(`A Stripe ${mode} webhook signing secret is required`);
 const connect=env.CRC_STRIPE_CONNECT==='1';
 if(connect&&mode!=='live')throw Error('Stripe Connect onboarding is enabled only for live payments');
 if(mode==='live')return {provider:'stripe',mode,origin,secretKey,webhookSecret,connect};
 const feeBps=Number(env.CRC_STRIPE_TEST_FEE_BPS),feeFixedCents=Number(env.CRC_STRIPE_TEST_FEE_FIXED_CENTS);
 if(!Number.isInteger(feeBps)||feeBps<0||feeBps>1000||!Number.isInteger(feeFixedCents)||feeFixedCents<0||feeFixedCents>500)throw Error('Explicit Stripe test fee estimate required');
 return {provider:'stripe',mode,origin,secretKey,webhookSecret,feeBps,feeFixedCents,connect:false};
}
export const stripeTestConfig=stripeConfig;

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

export async function createStripeCheckout({config,orderId,customerId,customerEmail='',stripeCustomerId='',amountCents,estimatedFeeCents=0,currency='USD',idempotencyKey,fetchImpl=fetch}){
 if(config?.provider!=='stripe'||!['test','live'].includes(config.mode)||!new RegExp(`^(?:sk|rk)_${config.mode}_\\S{8,}$`).test(config.secretKey))throw Error('Stripe configuration required');
 const trusted=trustedCheckout({orderId,customerId,amountCents,currency});
 if(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>128)throw Error('Idempotency key required');
 if(!Number.isSafeInteger(estimatedFeeCents)||estimatedFeeCents<0||estimatedFeeCents>=trusted.amountCents||config.mode==='live'&&estimatedFeeCents!==0)throw Error('Valid payment cost estimate required');
 const subtotalCents=trusted.amountCents-estimatedFeeCents;
 const form=new URLSearchParams({mode:'payment',success_url:`${config.origin}/customer?checkout=success`,cancel_url:`${config.origin}/customer?checkout=cancel`,client_reference_id:trusted.orderId,'metadata[order_id]':trusted.orderId,'metadata[customer_id]':trusted.customerId,'automatic_tax[enabled]':'true',billing_address_collection:'required','line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(subtotalCents),'line_items[0][price_data][tax_behavior]':'exclusive','line_items[0][price_data][product_data][name]':`Cotton Roots laundry order ${trusted.orderId}`});
 if(stripeCustomerId){if(!/^cus_[A-Za-z0-9]{8,}$/.test(stripeCustomerId))throw Error('Valid Stripe customer required');form.set('customer',stripeCustomerId)}
 else {form.set('customer_creation','always');if(customerEmail){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)||customerEmail.length>128)throw Error('Valid customer email required');form.set('customer_email',customerEmail)}}
 if(estimatedFeeCents){form.set('line_items[1][quantity]','1');form.set('line_items[1][price_data][currency]','usd');form.set('line_items[1][price_data][unit_amount]',String(estimatedFeeCents));form.set('line_items[1][price_data][tax_behavior]','exclusive');form.set('line_items[1][price_data][product_data][name]','Estimated online payment cost · TEST MODE')}
 const response=await fetchImpl(API,{method:'POST',headers:{Authorization:`Bearer ${config.secretKey}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey},body:form});
 let data;try{data=await response.json()}catch{throw Error('Stripe test mode returned an invalid response')}
 if(!response.ok)throw Error('Stripe could not create checkout');
 let checkoutUrl;try{checkoutUrl=new URL(data.url)}catch{throw Error('Stripe checkout URL missing')}
 if(checkoutUrl.protocol!=='https:'||checkoutUrl.hostname!=='checkout.stripe.com'||typeof data.id!=='string'||!data.id.startsWith(`cs_${config.mode}_`))throw Error('Unexpected Stripe checkout response');
 return {sessionId:data.id,checkoutUrl:checkoutUrl.href,orderId:trusted.orderId,amountCents:trusted.amountCents,currency:trusted.currency};
}
export const createStripeTestCheckout=createStripeCheckout;

export async function createStripePaymentSetup({config,customerId,customerEmail='',stripeCustomerId='',idempotencyKey,fetchImpl=fetch}){
 if(config?.provider!=='stripe'||!['test','live'].includes(config.mode)||!new RegExp(`^(?:sk|rk)_${config.mode}_\\S{8,}$`).test(config.secretKey))throw Error('Stripe configuration required');
 if(typeof customerId!=='string'||!customerId||typeof idempotencyKey!=='string'||idempotencyKey.length<8)throw Error('Customer and idempotency key required');
 const form=new URLSearchParams({mode:'setup',success_url:`${config.origin}/customer?payment_setup=success`,cancel_url:`${config.origin}/customer?payment_setup=cancel`,client_reference_id:customerId,'metadata[purpose]':'customer_payment_setup','metadata[customer_id]':customerId,'payment_method_types[0]':'card'});
 if(stripeCustomerId){if(!/^cus_[A-Za-z0-9]{8,}$/.test(stripeCustomerId))throw Error('Valid Stripe customer required');form.set('customer',stripeCustomerId)}else if(customerEmail){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))throw Error('Valid customer email required');form.set('customer_email',customerEmail)}
 const response=await fetchImpl(API,{method:'POST',headers:{Authorization:`Bearer ${config.secretKey}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey},body:form});let data;try{data=await response.json()}catch{throw Error('Stripe returned an invalid response')}
 if(!response.ok)throw Error('Stripe could not start secure payment setup');let url;try{url=new URL(data.url)}catch{throw Error('Stripe setup URL missing')};if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||typeof data.id!=='string'||!data.id.startsWith(`cs_${config.mode}_`))throw Error('Unexpected Stripe setup response');return {sessionId:data.id,checkoutUrl:url.href};
}

export function reconcileStripeCheckout(event,{orderId,customerId,amountCents,currency='USD',checkoutSessionId=null,processedEventIds=new Set(),mode='test',stripeCustomerId=''}={}){
 const trusted=trustedCheckout({orderId,customerId,amountCents,currency});
 if(!(processedEventIds instanceof Set))throw Error('Processed event set required');
 if(!event||event.type!=='checkout.session.completed'||typeof event.id!=='string'||!event.id.startsWith('evt_')||processedEventIds.has(event.id))throw Error(processedEventIds.has(event?.id)?'Duplicate event':'Unexpected event');
 const session=event.data?.object;
 const taxCents=session.total_details?.amount_tax;
 if(!['test','live'].includes(mode)||!session||session.object!=='checkout.session'||typeof session.id!=='string'||!session.id.startsWith(`cs_${mode}_`)||session.mode!=='payment'||session.payment_status!=='paid'||session.status!=='complete'||session.automatic_tax?.status!=='complete'||session.client_reference_id!==trusted.orderId||session.metadata?.order_id!==trusted.orderId||session.metadata?.customer_id!==trusted.customerId||session.amount_subtotal!==trusted.amountCents||!Number.isSafeInteger(taxCents)||taxCents<0||session.amount_total!==trusted.amountCents+taxCents||session.currency!==trusted.currency.toLowerCase()||(checkoutSessionId&&session.id!==checkoutSessionId)||typeof session.payment_intent!=='string'||!session.payment_intent.startsWith('pi_')||typeof session.customer!=='string'||!/^cus_[A-Za-z0-9]{8,}$/.test(session.customer)||(stripeCustomerId&&session.customer!==stripeCustomerId))throw Error('Stripe checkout does not match trusted order');
 return {eventId:event.id,sessionId:session.id,paymentIntentId:session.payment_intent,stripeCustomerId:session.customer,orderId:trusted.orderId,customerId:trusted.customerId,subtotalCents:trusted.amountCents,taxCents,totalCents:session.amount_total,currency:trusted.currency};
}
