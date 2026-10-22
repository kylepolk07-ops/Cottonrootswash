export const LATE_WARNING_HOURS=6;

export function deadlineAlert(order,now=new Date(),warningHours=LATE_WARNING_HOURS){
 if(!order?.due_at||order.returned_at||['payment_pending','paid_hold','paid_ready','picked_up','cancelled'].includes(order.status))return null;
 const due=Date.parse(order.due_at),current=now instanceof Date?now.getTime():Number(now);
 if(!Number.isFinite(due)||!Number.isFinite(current))return null;
 const minutes=Math.ceil(Math.abs(due-current)/60000);
 if(due<=current)return {state:'overdue',minutesLate:minutes};
 const minutesUntil=Math.ceil((due-current)/60000);
 if(minutesUntil<=warningHours*60)return {state:'due_soon',minutesUntil};
 return null;
}
