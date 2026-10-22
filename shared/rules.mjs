/** Shared business rules. All production transitions must also be enforced server-side. */
export const ORDER_STATUS = Object.freeze({
  AWAITING_DROPOFF:'awaiting_dropoff', AT_SHOP:'at_shop', OFFERED:'offered',
  ACCEPTED:'accepted', WASHING:'washing', RETURNED:'returned_to_shop',
  PAYMENT_PENDING:'payment_pending', PAID_HOLD:'paid_hold', PAID_READY:'paid_ready',
  PICKED_UP:'picked_up', CANCELLED:'cancelled'
});
export const RATE = Object.freeze({ dropoff:2.5, full_service:3, contractor:1, extraBag:10, rushPerLb:1 });
export function roundUpHalfPound(value) {
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0) throw Error('Weight must be positive');
  return Math.ceil((n-1e-10)*2)/2;
}
export function eligibleForCustomerPickup(order, accountId) {
  return !!order && order.customer_id===accountId && order.status===ORDER_STATUS.PAID_READY && order.payment_verified===true && order.ready_for_pickup===true && !order.picked_up_at;
}
export function canOfferToContractor(contractor, offer, dateKey) {
  return contractor?.approved===true && offer?.status==='open' && !!contractor.availability?.[dateKey] && (contractor.skills?.includes(offer.work_type)||contractor.skills?.includes('both'));
}
export function estimateContractorPay(approvedPounds){ return roundUpHalfPound(approvedPounds)*RATE.contractor; }
export function deliveryFee(distanceMiles,freeMiles=5,ratePerMile=1){
  const miles=Number(distanceMiles);if(!Number.isFinite(miles)||miles<0)throw Error('Valid delivery distance required');
  return Number((Math.max(0,miles-freeMiles)*ratePerMile).toFixed(2));
}
export function invoiceTotal(service, roundedPounds, rushApproved=false, pricing=RATE,deliveryCharge=0) {
  if(!['dropoff','full_service'].includes(service)) throw Error('Invalid service');
  const lbs=roundUpHalfPound(roundedPounds);
  return Number((lbs*(Number(pricing[service])+(rushApproved?Number(pricing.rushPerLb):0))+Number(deliveryCharge||0)).toFixed(2));
}
export const CUSTODY_SEQUENCE=Object.freeze([
  'customer_bag_scan','customer_wall_dropoff','contractor_bag_out',
  'contractor_weight_confirmed','contractor_wall_checkout',
  'contractor_wash_complete','contractor_bag_return','contractor_wall_checkin',
  'square_payment_verified','staff_paid_bin_release','customer_bag_pickup'
]);
