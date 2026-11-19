import test from 'node:test';import assert from 'node:assert/strict';import {scoreVisits,classKind} from '../src/challengeScoring.js';
const visit=(day,kind='reformer',extra={})=>({start:`2026-12-${day}T10:00:00`,kind,completed:true,...extra});
test('one reformer per day plus stretch, not stretch alone',()=>{
 assert.equal(scoreVisits([visit('06'),visit('06')]).points,1);
 assert.equal(scoreVisits([visit('06'),visit('06','stretch')]).points,2);
 assert.equal(scoreVisits([visit('06','stretch')]).points,0);
});
test('missed deducts, late cancellations unchanged, unsigned visits ignored',()=>{
 assert.equal(scoreVisits([visit('06'),visit('07','reformer',{missed:true,completed:false}),visit('08','reformer',{cancelled:true}),visit('09','reformer',{completed:false})]).points,0);
});
test('countdown counts 10 completed reformer classes for anyone, not stretch',()=>{
 assert.equal(scoreVisits(Array.from({length:10},(_,i)=>visit(String(i+6).padStart(2,'0')))).qualified,true);
 assert.equal(scoreVisits([visit('06','stretch')]).reformerClasses,0);
 assert.equal(classKind('Cave Stretch'),'stretch');assert.equal(classKind('Private Event'),null);
});
