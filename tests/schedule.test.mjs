import test from 'node:test';
import assert from 'node:assert/strict';
import {shopDueDeadline} from '../shared/schedule.mjs';

const due=iso=>shopDueDeadline(new Date(iso));
test('shop deadlines follow the stated Texas weekday and 2 PM cutoff schedule',()=>{
 assert.equal(due('2026-10-19T18:59:00Z'),'2026-10-20T22:00:00.000Z'); // Mon 1:59 CDT -> Tue 5
 assert.equal(due('2026-10-19T19:01:00Z'),'2026-10-21T22:00:00.000Z'); // Mon 2:01 -> Wed 5
 assert.equal(due('2026-10-20T19:01:00Z'),'2026-10-23T22:00:00.000Z'); // Tue after cutoff -> Fri
 assert.equal(due('2026-10-21T18:00:00Z'),'2026-10-23T22:00:00.000Z'); // Wed before cutoff -> Fri
 assert.equal(due('2026-10-21T20:00:00Z'),'2026-10-26T22:00:00.000Z'); // Wed after cutoff -> Mon
 assert.equal(due('2026-10-22T18:00:00Z'),'2026-10-23T22:00:00.000Z');
 assert.equal(due('2026-10-22T20:00:00Z'),'2026-10-26T22:00:00.000Z');
 assert.equal(due('2026-10-23T15:00:00Z'),'2026-10-26T22:00:00.000Z');
});

test('weekend drop-offs point to Monday and winter deadlines use CST',()=>{
 assert.equal(due('2026-10-24T17:00:00Z'),'2026-10-26T22:00:00.000Z');
 assert.equal(due('2026-12-07T19:00:00Z'),'2026-12-08T23:00:00.000Z');
 assert.equal(due('2026-12-07T21:00:00Z'),'2026-12-09T23:00:00.000Z');
});
