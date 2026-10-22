const API='https://api.twilio.com/2010-04-01';

export function twilioConfig(env=process.env){
 const values=['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_MESSAGING_SERVICE_SID'].map(key=>String(env[key]||'').trim());
 if(values.every(value=>!value))return null;
 const [accountSid,authToken,messagingServiceSid]=values;
 if(!/^AC[a-fA-F0-9]{32}$/.test(accountSid)||authToken.length<20||!/^MG[a-fA-F0-9]{32}$/.test(messagingServiceSid))throw Error('Complete Twilio SMS credentials are required');
 return {accountSid,authToken,messagingServiceSid};
}

export function normalizeUsPhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(digits.length===10)return `+1${digits}`;
 if(digits.length===11&&digits.startsWith('1'))return `+${digits}`;
 return null;
}

export async function sendTwilioSms({config,to,body,fetchImpl=fetch}){
 if(!config||!normalizeUsPhone(to)||typeof body!=='string'||body.length<1||body.length>500)throw Error('Valid Twilio message required');
 const form=new URLSearchParams({To:normalizeUsPhone(to),MessagingServiceSid:config.messagingServiceSid,Body:body});
 const response=await fetchImpl(`${API}/Accounts/${config.accountSid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:form});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok||!/^SM[a-fA-F0-9]{32}$/.test(data.sid||''))throw Error(data.message||'Twilio could not accept the message');
 return {providerId:data.sid,status:data.status||'queued'};
}
