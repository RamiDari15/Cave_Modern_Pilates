import test from 'node:test';
import assert from 'node:assert/strict';
import {isScheduleReleased} from '../src/scheduleRelease.js';
test('members get the next month on the 18th; everyone else on the 20th',()=>{
 for(const member of [true,false]) assert.equal(isScheduleReleased('2026-12-07',member,'2026-11-17'),false);
 assert.equal(isScheduleReleased('2026-12-07',true,'2026-11-18'),true);
 assert.equal(isScheduleReleased('2026-12-07',false,'2026-11-19'),false);
 assert.equal(isScheduleReleased('2026-12-07',false,'2026-11-20'),true);
 assert.equal(isScheduleReleased('2027-01-07',true,'2026-12-18'),true);
 assert.equal(isScheduleReleased('bad',true,'2026-11-20'),false);
});
