import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectedAccount,createConnectOnboardingLink,connectedAccountStatus} from '../server/stripe-connect.mjs';

const config={provider:'stripe',mode:'live',connect:true,origin:'https://cotton.example',secretKey:'sk_live_1234567890abcdef'};
test('Stripe Connect uses hosted onboarding and exposes only completion status',async()=>{
 const calls=[],fetchImpl=async(url,options={})=>{calls.push({url,options});if(url.endsWith('/accounts'))return {ok:true,json:async()=>({id:'acct_specialist123'})};if(url.endsWith('/account_links'))return {ok:true,json:async()=>({url:'https://connect.stripe.com/setup/s/test'})};return {ok:true,json:async()=>({id:'acct_specialist123',details_submitted:true,payouts_enabled:true,requirements:{currently_due:[]}})}};
 const accountId=await createConnectedAccount({config,user:{id:'specialist-1',role:'contractor',email:'worker@example.com'},idempotencyKey:'connect-specialist-1',fetchImpl});assert.equal(accountId,'acct_specialist123');const accountForm=new URLSearchParams(calls[0].options.body);assert.equal(accountForm.has('type'),false);assert.equal(accountForm.get('controller[fees][payer]'),'application');assert.equal(accountForm.get('controller[losses][payments]'),'application');assert.equal(accountForm.get('controller[requirement_collection]'),'stripe');assert.equal(accountForm.get('controller[stripe_dashboard][type]'),'express');assert.equal(accountForm.get('capabilities[transfers][requested]'),'true');assert.equal(accountForm.get('metadata[cotton_roots_user_id]'),'specialist-1');
 const onboardingUrl=await createConnectOnboardingLink({config,accountId,fetchImpl});assert.match(onboardingUrl,/^https:\/\/connect\.stripe\.com\//);const linkForm=new URLSearchParams(calls[1].options.body);assert.equal(linkForm.get('return_url'),'https://cotton.example/contractor?stripe_connect=return');
 const status=await connectedAccountStatus({config,accountId,fetchImpl});assert.deepEqual(status,{started:true,complete:true,detailsSubmitted:true,payoutsEnabled:true,requirementsDue:0});assert.ok(!JSON.stringify(status).includes('bank'));
});

test('Stripe Connect stays incomplete while identity, tax, or payout requirements remain',async()=>{
 const status=await connectedAccountStatus({config,accountId:'acct_pending1',fetchImpl:async()=>({ok:true,json:async()=>({details_submitted:true,payouts_enabled:false,requirements:{currently_due:['individual.verification.document']}})})});assert.equal(status.complete,false);assert.equal(status.requirementsDue,1);
});
