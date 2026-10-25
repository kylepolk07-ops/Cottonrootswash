import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTION,transition,earningsState} from '../shared/workflow.mjs';
import {ORDER_STATUS} from '../shared/rules.mjs';
const seed=()=>({id:'o1',customer_id:'c1',bag_id:'b1',status:ORDER_STATUS.AWAITING_DROPOFF});
const drop={bagOwnerVerified:true};
const contractor={contractorApproved:true,deadlineAcknowledged:true,availabilityConfirmed:true,contractorId:'k1'};
const actor={actorId:'k1'};
function throughAccepted(){let o=transition(seed(),ACTION.DROP_OFF,drop);return transition(o,ACTION.ACCEPT,contractor)}
test('no fake dropoff or unapproved/deadline-less job acceptance',()=>{
 assert.throws(()=>transition(seed(),ACTION.DROP_OFF,{bagOwnerVerified:false}));
 const o=transition(seed(),ACTION.DROP_OFF,drop);
 assert.throws(()=>transition(o,ACTION.ACCEPT,{...contractor,deadlineAcknowledged:false}));
 assert.equal(transition(o,ACTION.ACCEPT,contractor).status,ORDER_STATUS.ACCEPTED);
 assert.equal(transition({...o,rush_requested:true,rush_approved:false},ACTION.ACCEPT,contractor).rush_approved,true);
});
test('weight rounds upward and checkout requires weight, right contractor, and shop confirmation',()=>{
 const o=throughAccepted(); assert.throws(()=>transition(o,ACTION.CHECK_OUT,{...actor,shopConfirmed:true}));
 assert.throws(()=>transition(o,ACTION.WEIGH,{...actor,bagVerified:true,measuredPounds:0}));
 const weighed=transition(o,ACTION.WEIGH,{...actor,bagVerified:true,measuredPounds:12.1});
 assert.equal(weighed.billed_pounds,12.5);
 assert.throws(()=>transition(weighed,ACTION.CHECK_OUT,{actorId:'other',shopConfirmed:true}));
 assert.throws(()=>transition(weighed,ACTION.CHECK_OUT,actor));
 assert.equal(transition(weighed,ACTION.CHECK_OUT,{...actor,shopConfirmed:true}).status,ORDER_STATUS.WASHING);
});
test('return bag and shop check-in confirm clean laundry; Square cannot be spoofed',()=>{
 let o=transition(transition(throughAccepted(),ACTION.WEIGH,{...actor,bagVerified:true,measuredPounds:8.3}),ACTION.CHECK_OUT,{...actor,shopConfirmed:true});
 assert.throws(()=>transition(o,ACTION.CHECK_IN,{...actor,shopConfirmed:true}));
 o=transition(o,ACTION.RETURN_BAG,{...actor,bagVerified:true});
 assert.throws(()=>transition(o,ACTION.CHECK_IN,actor));
 o=transition(o,ACTION.CHECK_IN,{...actor,shopConfirmed:true});
 assert.ok(o.wash_completed_at);
 assert.equal(o.status,ORDER_STATUS.PAYMENT_PENDING);
 assert.throws(()=>transition(o,ACTION.PAYMENT,{squareEventId:'fake',verifiedServerWebhook:false}));
 o=transition(o,ACTION.PAYMENT,{squareEventId:'evt1',verifiedServerWebhook:true});
 assert.equal(o.status,ORDER_STATUS.PAID_READY);assert.equal(o.ready_for_pickup,true);assert.ok(o.paid_at);
 assert.throws(()=>transition(o,ACTION.PICKUP,{customerId:'c2',bagVerified:true,bagId:'b1'}));
 assert.throws(()=>transition(o,ACTION.PICKUP,{customerId:'c1',bagVerified:true,bagId:'wrong'}));
 o=transition(o,ACTION.PICKUP,{customerId:'c1',bagVerified:true,bagId:'b1'});
 assert.equal(o.status,ORDER_STATUS.PICKED_UP);
 assert.throws(()=>transition(o,ACTION.PICKUP,{customerId:'c1',bagVerified:true,bagId:'b1'}));
});
test('earnings cannot be approved based on finished status without verified payment',()=>{
 const o={id:'o1',returned_at:'today',payment_verified:false};const l={order_id:'o1',status:'approved'};
 assert.equal(earningsState(o,l),'pending');assert.equal(earningsState({...o,payment_verified:true},l),'approved');
 assert.equal(earningsState(o,{...l,status:'paid'}),'paid');
});
