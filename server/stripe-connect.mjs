const API='https://api.stripe.com/v1';
const auth=config=>({Authorization:`Bearer ${config.secretKey}`});
async function stripeJson(url,options,fetchImpl){const response=await fetchImpl(url,options);let data;try{data=await response.json()}catch{throw Error('Stripe Connect returned an invalid response')}if(!response.ok)throw Error(data?.error?.message||'Stripe Connect is unavailable');return data}
export async function createConnectedAccount({config,user,idempotencyKey,fetchImpl=fetch}){
 if(!config?.connect||user?.role!=='contractor'||!user.id||!/^.+@.+\..+$/.test(user.email||''))throw Error('Complete your name and email before payout setup');
 const form=new URLSearchParams({type:'express',country:'US',email:user.email,'business_type':'individual','capabilities[transfers][requested]':'true','metadata[cotton_roots_user_id]':user.id});
 const data=await stripeJson(`${API}/accounts`,{method:'POST',headers:{...auth(config),'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey},body:form},fetchImpl);
 if(!/^acct_[A-Za-z0-9]+$/.test(data.id))throw Error('Stripe did not create the payout account');return data.id;
}
export async function createConnectOnboardingLink({config,accountId,fetchImpl=fetch}){
 if(!config?.connect||!/^acct_[A-Za-z0-9]+$/.test(accountId))throw Error('Stripe payout account required');
 const form=new URLSearchParams({account:accountId,refresh_url:`${config.origin}/contractor?stripe_connect=refresh`,return_url:`${config.origin}/contractor?stripe_connect=return`,type:'account_onboarding'});
 const data=await stripeJson(`${API}/account_links`,{method:'POST',headers:{...auth(config),'Content-Type':'application/x-www-form-urlencoded'},body:form},fetchImpl);let url;try{url=new URL(data.url)}catch{throw Error('Stripe onboarding link missing')}if(url.protocol!=='https:'||!/(^|\.)stripe\.com$/.test(url.hostname))throw Error('Unexpected Stripe onboarding link');return url.href;
}
export async function connectedAccountStatus({config,accountId,fetchImpl=fetch}){
 if(!config?.connect||!/^acct_[A-Za-z0-9]+$/.test(accountId))return {started:false,complete:false};
 const data=await stripeJson(`${API}/accounts/${encodeURIComponent(accountId)}`,{headers:auth(config)},fetchImpl),due=Array.isArray(data.requirements?.currently_due)?data.requirements.currently_due:[];
 return {started:true,complete:data.details_submitted===true&&data.payouts_enabled===true&&due.length===0,detailsSubmitted:data.details_submitted===true,payoutsEnabled:data.payouts_enabled===true,requirementsDue:due.length};
}
