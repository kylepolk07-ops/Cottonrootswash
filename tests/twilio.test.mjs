import test from 'node:test';
import assert from 'node:assert/strict';
import {twilioConfig,normalizeUsPhone,sendTwilioSms} from '../server/twilio.mjs';

const accountSid=`AC${'1'.repeat(32)}`,authToken='secret-token-that-is-long-enough',messagingServiceSid=`MG${'2'.repeat(32)}`;

test('Twilio configuration is optional but rejects partial credentials',()=>{
 assert.equal(twilioConfig({}),null);
 assert.deepEqual(twilioConfig({TWILIO_ACCOUNT_SID:accountSid,TWILIO_AUTH_TOKEN:authToken,TWILIO_MESSAGING_SERVICE_SID:messagingServiceSid}),{accountSid,authToken,messagingServiceSid});
 assert.throws(()=>twilioConfig({TWILIO_ACCOUNT_SID:accountSid}));
});

test('US phone normalization accepts ordinary ten-digit customer numbers',()=>{
 assert.equal(normalizeUsPhone('(325) 555-0123'),'+13255550123');
 assert.equal(normalizeUsPhone('1-325-555-0123'),'+13255550123');
 assert.equal(normalizeUsPhone('555'),null);
});

test('Twilio sender uses a messaging service without exposing credentials in the body',async()=>{
 let request;const fetchImpl=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({sid:`SM${'3'.repeat(32)}`,status:'queued'})}};
 const result=await sendTwilioSms({config:{accountSid,authToken,messagingServiceSid},to:'325-555-0123',body:'Cotton Roots order update',fetchImpl});
 assert.equal(result.status,'queued');assert.match(request.url,new RegExp(accountSid));assert.match(request.options.headers.Authorization,/^Basic /);
 const form=new URLSearchParams(request.options.body);assert.equal(form.get('To'),'+13255550123');assert.equal(form.get('MessagingServiceSid'),messagingServiceSid);assert.equal(form.get('Body'),'Cotton Roots order update');assert.ok(!request.options.body.toString().includes(authToken));
});
