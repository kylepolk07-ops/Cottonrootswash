import test from 'node:test';
import assert from 'node:assert/strict';
import {deadlineAlert,LATE_WARNING_HOURS} from '../shared/management.mjs';

const now=Date.parse('2026-10-22T12:00:00.000Z');
const order=(offsetMinutes,extra={})=>({status:'washing',due_at:new Date(now+offsetMinutes*60000).toISOString(),...extra});

test('management deadline alerts warn six hours ahead and measure overdue time',()=>{
 assert.equal(LATE_WARNING_HOURS,6);
 assert.deepEqual(deadlineAlert(order(360),now),{state:'due_soon',minutesUntil:360});
 assert.equal(deadlineAlert(order(361),now),null);
 assert.deepEqual(deadlineAlert(order(1),now),{state:'due_soon',minutesUntil:1});
 assert.deepEqual(deadlineAlert(order(0),now),{state:'overdue',minutesLate:0});
 assert.deepEqual(deadlineAlert(order(-210),now),{state:'overdue',minutesLate:210});
 assert.equal(deadlineAlert(order(-60,{returned_at:'2026-10-22T11:00:00.000Z'}),now),null);
 assert.equal(deadlineAlert(order(-60,{status:'picked_up'}),now),null);
 assert.equal(deadlineAlert({status:'washing',due_at:'invalid'},now),null);
});
