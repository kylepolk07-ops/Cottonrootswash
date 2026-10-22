import test from 'node:test';
import assert from 'node:assert/strict';
import {shopDateKey,availabilityDays} from '../shared/calendar.mjs';
test('Texas shop day stays on prior date after UTC midnight and rolls over at local midnight',()=>{
 assert.equal(shopDateKey(new Date('2026-10-22T00:21:00Z')),'2026-10-21');
 assert.equal(shopDateKey(new Date('2026-10-22T04:59:59Z')),'2026-10-21');
 assert.equal(shopDateKey(new Date('2026-10-22T05:00:00Z')),'2026-10-22');
 assert.equal(shopDateKey(new Date('2026-12-22T05:59:59Z')),'2026-12-21');
 assert.equal(shopDateKey(new Date('2026-12-22T06:00:00Z')),'2026-12-22');
});
test('two-week availability uses Texas dates without missing or repeated days at daylight-saving changes',()=>{
 const days=availabilityDays(new Date('2026-11-01T00:30:00Z'));
 assert.equal(days.length,14);assert.equal(new Set(days).size,14);
 assert.equal(days[0],'2026-10-31');assert.equal(days[1],'2026-11-01');assert.equal(days[13],'2026-11-13');
 assert.deepEqual(availabilityDays(new Date('2026-03-08T00:30:00Z')).slice(0,3),['2026-03-07','2026-03-08','2026-03-09']);
});
