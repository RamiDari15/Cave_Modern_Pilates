import test from 'node:test';
import assert from 'node:assert/strict';
import {isClassVisible} from '../src/scheduleVisibility.js';
test('studio-local classes disappear at 15 minutes, regardless of visitor timezone',()=>{
 const item={startDateTime:'2026-11-16T10:00:00'};
 assert.equal(isClassVisible(item,Date.parse('2026-11-16T16:14:59Z')),true);
 assert.equal(isClassVisible(item,Date.parse('2026-11-16T16:15:00Z')),false);
 assert.equal(isClassVisible(item,Date.parse('2026-11-16T20:00:00Z')),false);
 assert.equal(isClassVisible(item,Date.parse('2026-11-16T15:00:00Z')),true);
});
test('summer daylight time and explicit offsets are respected',()=>{
 assert.equal(isClassVisible({startTime:'2026-07-01T10:00:00'},Date.parse('2026-07-01T15:15:00Z')),false);
 assert.equal(isClassVisible({startTime:'2026-11-16T10:00:00-06:00'},Date.parse('2026-11-16T16:14:59Z')),true);
 assert.equal(isClassVisible({startTime:'2026-11-16T16:00:00Z'},Date.parse('2026-11-16T16:15:00Z')),false);
});
test('unknown times and stale fallback rows are hidden',()=>{
 assert.equal(isClassVisible({time:'6:00 AM'}),false);
 assert.equal(isClassVisible({startTime:'invalid'}),false);
});
