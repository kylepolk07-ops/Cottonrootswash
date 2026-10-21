import test from 'node:test';
import assert from 'node:assert/strict';
import {roundUpHalfPound,eligibleForCustomerPickup,ORDER_STATUS,invoiceTotal,canOfferToContractor} from '../shared/rules.mjs';
test('round UP to nearest half-pound',()=>{ for(const [a,b] of [[12,12],[12.01,12.5],[12.5,12.5],[12.6,13],[.01,.5]]) assert.equal(roundUpHalfPound(a),b); assert.throws(()=>roundUpHalfPound(0)); });
test('only owner paid and ready can pick up',()=>{const o={customer_id:'c1',status:ORDER_STATUS.PAID_READY,payment_verified:true,ready_for_pickup:true};assert.equal(eligibleForCustomerPickup(o,'c1'),true);assert.equal(eligibleForCustomerPickup(o,'c2'),false);assert.equal(eligibleForCustomerPickup({...o,payment_verified:false},'c1'),false);assert.equal(eligibleForCustomerPickup({...o,picked_up_at:'now'},'c1'),false);});
test('rates and approval',()=>{assert.equal(invoiceTotal('dropoff',12.1),31.25); assert.equal(invoiceTotal('full_service',12.1,true),50);});
test('availability and approval needed only for initial onboarding',()=>{const c={approved:true,skills:['both'],availability:{'2026-10-22':true}};assert.equal(canOfferToContractor(c,{status:'open',work_type:'wash_fold'},'2026-10-22'),true);assert.equal(canOfferToContractor({...c,approved:false},{status:'open',work_type:'wash_fold'},'2026-10-22'),false);});
