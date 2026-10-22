import {SHOP_TIME_ZONE} from './calendar.mjs';

const localParts=at=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:SHOP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
 const get=type=>Number(parts.find(part=>part.type===type).value);
 return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};
};

function atShopTime({year,month,day},hour,minute=0){
 const desired=Date.UTC(year,month-1,day,hour,minute);
 let guess=desired;
 for(let pass=0;pass<2;pass++){
  const actual=localParts(new Date(guess));
  const represented=Date.UTC(actual.year,actual.month-1,actual.day,actual.hour,actual.minute);
  guess+=desired-represented;
 }
 return new Date(guess);
}

function addDays(date,days){
 const noon=new Date(Date.UTC(date.year,date.month-1,date.day+days,12));
 return {year:noon.getUTCFullYear(),month:noon.getUTCMonth()+1,day:noon.getUTCDate()};
}

/**
 * Current Monday-Friday staging schedule from the owner build brief.
 * Holidays remain intentionally unmodeled and must be handled before launch.
 */
export function shopDueDeadline(at=new Date()){
 const local=localParts(at);
 const weekday=new Date(Date.UTC(local.year,local.month-1,local.day,12)).getUTCDay();
 const byCutoff=local.hour<14||(local.hour===14&&local.minute===0);
 const days=weekday===1?(byCutoff?1:2)
  :weekday===2?(byCutoff?1:3)
  :weekday===3?(byCutoff?2:5)
  :weekday===4?(byCutoff?1:4)
  :weekday===5?3
  :weekday===6?2:1;
 return atShopTime(addDays(local,days),17).toISOString();
}

export const SHOP_DUE_NOTE='Business deadline based on verified shop drop-off; holidays are not yet connected.';
