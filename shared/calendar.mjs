export const SHOP_TIME_ZONE='America/Chicago';
export function shopDateKey(at=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:SHOP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
 const part=type=>parts.find(p=>p.type===type).value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function availabilityDays(at=new Date()){
 const first=new Date(shopDateKey(at)+'T12:00:00Z');
 return Array.from({length:14},(_,n)=>new Date(first.getTime()+n*86400000).toISOString().slice(0,10));
}
