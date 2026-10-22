/** Deterministic domain checks. Enforce these again in authenticated database transactions. */
import {ORDER_STATUS, roundUpHalfPound} from './rules.mjs';
export const ACTION=Object.freeze({
  DROP_OFF:'drop_off', ACCEPT:'accept_job', WEIGH:'record_weight', CHECK_OUT:'wall_checkout',
  WASH_COMPLETE:'wash_complete', RETURN_BAG:'return_bag', CHECK_IN:'wall_checkin',
  PAYMENT:'square_payment_confirmed', RELEASE:'staff_release', PICKUP:'customer_pickup'
});
function requireIt(ok,message){if(!ok)throw new Error(message);}
/** Pure state transition for server implementation and UI tests. No client action may self-certify provider payment. */
export function transition(order,action,ctx={}){
  requireIt(order && typeof order==='object','Order required');
  const o={...order};
  const at=ctx.at || new Date().toISOString();
  switch(action){
    case ACTION.DROP_OFF:
      requireIt(o.status===ORDER_STATUS.AWAITING_DROPOFF,'Drop-off not expected');
      requireIt(ctx.bagOwnerVerified===true && ctx.wallStationVerified===true,'Bag owner and wall QR must be verified');
      o.status=ORDER_STATUS.AT_SHOP;o.dropped_at=at;break;
    case ACTION.ACCEPT:
      requireIt([ORDER_STATUS.AT_SHOP,ORDER_STATUS.OFFERED].includes(o.status),'Job unavailable');
      requireIt(ctx.contractorApproved===true && ctx.deadlineAcknowledged===true,'Contractor onboarding and deadline acknowledgment required');
      o.status=ORDER_STATUS.ACCEPTED;o.assigned_contractor_id=ctx.contractorId;o.accepted_at=at;if(o.rush_requested)o.rush_approved=true;break;
    case ACTION.WEIGH:
      requireIt(o.status===ORDER_STATUS.ACCEPTED,'Job must be accepted before weighing');
      requireIt(ctx.actorId===o.assigned_contractor_id && ctx.bagVerified===true,'Assigned contractor and bag required');
      requireIt(Number.isFinite(Number(ctx.measuredPounds)) && Number(ctx.measuredPounds)>0,'Positive measured weight required');
      o.measured_pounds=Number(ctx.measuredPounds);o.billed_pounds=roundUpHalfPound(ctx.measuredPounds);o.weighed_at=at;break;
    case ACTION.CHECK_OUT:
      requireIt(o.status===ORDER_STATUS.ACCEPTED && o.billed_pounds>0,'Weigh laundry before check-out');
      requireIt(ctx.actorId===o.assigned_contractor_id && (o.service==='full_service'?ctx.bagVerified===true:ctx.wallStationVerified===true),o.service==='full_service'?'Assigned contractor must scan the bag at customer pickup':'Assigned contractor must scan shop wall QR');
      o.status=ORDER_STATUS.WASHING;o.checked_out_at=at;break;
    case ACTION.WASH_COMPLETE:
      requireIt(o.status===ORDER_STATUS.WASHING && ctx.actorId===o.assigned_contractor_id,'Assigned contractor must finish washing');
      o.wash_completed_at=at;break;
    case ACTION.RETURN_BAG:
      requireIt(o.status===ORDER_STATUS.WASHING && o.wash_completed_at,'Washing must be finished first');
      requireIt(ctx.actorId===o.assigned_contractor_id && ctx.bagVerified===true,'Assigned contractor must scan correct bag');
      o.return_bag_scanned_at=at;if(o.service==='full_service'){o.status=ORDER_STATUS.PAYMENT_PENDING;o.returned_at=at;o.delivered_at=at;}break;
    case ACTION.CHECK_IN:
      requireIt(o.status===ORDER_STATUS.WASHING && o.return_bag_scanned_at,'Scan returned bag first');
      requireIt(ctx.actorId===o.assigned_contractor_id && ctx.wallStationVerified===true,'Assigned contractor must scan wall QR');
      o.status=ORDER_STATUS.PAYMENT_PENDING;o.returned_at=at;break;
    case ACTION.PAYMENT:
      requireIt(o.status===ORDER_STATUS.PAYMENT_PENDING,'Order not awaiting payment');
      {const eventId=ctx.paymentEventId||ctx.squareEventId;
      requireIt(ctx.verifiedServerWebhook===true && typeof eventId==='string' && eventId.length>0,'Verified payment-provider server webhook required');
      o.payment_verified=true;o.payment_event_id=eventId;o.paid_at=at;if(ctx.squareEventId)o.square_event_id=ctx.squareEventId;o.ready_for_pickup=true;o.status=ORDER_STATUS.PAID_READY;break;}
    case ACTION.RELEASE:
      requireIt(o.status===ORDER_STATUS.PAID_HOLD && o.payment_verified===true,'Payment verification required');
      requireIt(ctx.staffAuthorized===true && ctx.bagVerified===true,'Authorized staff must verify bag release');
      o.ready_for_pickup=true;o.status=ORDER_STATUS.PAID_READY;break;
    case ACTION.PICKUP:
      requireIt(o.status===ORDER_STATUS.PAID_READY && o.payment_verified===true && o.ready_for_pickup===true,'Order not paid and ready');
      requireIt(ctx.customerId===o.customer_id && ctx.bagVerified===true && ctx.bagId===o.bag_id,'Customer and exact bag must match');
      requireIt(!o.picked_up_at,'Already collected');
      o.status=ORDER_STATUS.PICKED_UP;o.picked_up_at=at;break;
    default: throw new Error('Unknown action');
  }
  return o;
}
/** Display-only earnings classification, not an instruction to issue funds. */
export function earningsState(order,ledger){
  if(!order || !ledger || ledger.order_id!==order.id)return 'not_recorded';
  if(ledger.status==='paid')return 'paid';
  if(ledger.status==='exception')return 'review';
  if(!order.returned_at || !order.payment_verified)return 'pending';
  return ledger.status==='approved'?'approved':'pending';
}
