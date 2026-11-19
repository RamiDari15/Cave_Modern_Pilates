import test from 'node:test';
import assert from 'node:assert/strict';
import { deletionIdentity, submitDeletionRequest, completeDeletionRequest, deletionServices, sessionPredatesErasure } from '../server/deletionRequests.mjs';
function fixture() {
  const rows = []; const notifications = [];
  const store = {
    findActive: async key => rows.find(r => r.subject_key === key && r.status !== 'completed'),
    insert: async row => { rows.push({...row}); return rows.at(-1); },
    get: async id => rows.find(r => r.id === id),
    patch: async (id, patch) => Object.assign(rows.find(r => r.id === id), patch)
  };
  return { rows, notifications, store, notify: async (row,type) => notifications.push(type), secret:'test-secret',
    session: { user:{email:'owner@example.test'}, clientId:'42' }, body:{confirmed:true,flow:'cave-deletion-v1'}, now:new Date('2026-10-28T20:00:00Z') };
}
test('identity requires authenticated email and ignores customer-supplied target', async () => {
  assert.throws(() => deletionIdentity(null,'secret'), {status:401});
  assert.throws(() => deletionIdentity({clientId:'42'},'secret'), {status:409});
  const f=fixture();f.body.email='victim@example.test';f.body.clientId='999';
  await submitDeletionRequest(f);assert.equal(f.rows[0].email,'owner@example.test');assert.equal(f.rows[0].client_id,'42');
});
test('requires explicit versioned confirmation and persistent storage', async () => {
  const f=fixture(); await assert.rejects(submitDeletionRequest({...f,body:{confirmed:false}}),{status:400});
  f.store.insert=async()=>{throw Error('storage failed');};
  await assert.rejects(submitDeletionRequest(f),/storage failed/);assert.equal(f.notifications.length,0);
});
test('duplicate requests preserve receipt and original 48-hour deadline', async () => {
  const f=fixture();const first=await submitDeletionRequest(f);const second=await submitDeletionRequest({...f,now:new Date('2026-10-29T20:00:00Z')});
  assert.equal(first.id,second.id);assert.equal(second.dueAt,'2026-10-30T20:00:00.000Z');assert.equal(f.rows.length,1);assert.deepEqual(f.notifications,['staff']);
  assert.equal(first.status,'requested');assert.equal(first.completedAt,null);
});
test('notification outage preserves request and retry alerts staff', async () => {
  const f=fixture();const r=await submitDeletionRequest({...f,notify:async()=>{throw Error('outage');}});
  assert.equal(r.requestSubmitted,true);assert.equal(f.rows.length,1);assert.equal(f.rows[0].staff_notified_at,undefined);
  await submitDeletionRequest(f);assert.ok(f.rows[0].staff_notified_at);
});
const evidence={mindbodyDeleted:true,caveDataDeleted:true,accessRevoked:true,billingReviewed:true,evidence:'Provider erasure reference TEST; Cave data removed by test operator.'};
test('completion requires actual-erasure attestations and evidence',async()=>{
  const f=fixture();const r=await submitDeletionRequest(f);
  await assert.rejects(completeDeletionRequest({...f,id:r.id,body:{...evidence,mindbodyDeleted:false}}),{status:400});
  assert.equal(f.rows[0].status,'requested');assert.deepEqual(f.notifications,['staff']);
});
test('failed confirmation stays pending; successful retry scrubs identifiers',async()=>{
  const f=fixture();const r=await submitDeletionRequest(f);
  await assert.rejects(completeDeletionRequest({...f,id:r.id,body:evidence,notify:async()=>{throw Error('email failed');}}),/email failed/);
  assert.equal(f.rows[0].status,'confirmation_pending');assert.equal(f.rows[0].email,'owner@example.test');
  const done=await completeDeletionRequest({...f,id:r.id,body:evidence});assert.equal(done.status,'completed');assert.equal(f.rows[0].email,null);assert.equal(f.rows[0].client_id,null);
  await completeDeletionRequest({...f,id:r.id,body:evidence});assert.deepEqual(f.notifications,['staff','completion']);
});
test('production flow fails closed until storage, email and explicit enablement are configured',()=>{
  assert.throws(()=>deletionServices({}),{status:503});
});

test('erasure invalidates old and legacy sessions but permits a genuinely new session',()=>{
  const row={erased_at:'2026-10-28T20:00:00.000Z'};
  assert.equal(sessionPredatesErasure({},row),true);
  assert.equal(sessionPredatesErasure({iat:Date.parse(row.erased_at)/1000},row),true);
  assert.equal(sessionPredatesErasure({iat:Date.parse(row.erased_at)/1000+1},row),false);
  assert.equal(sessionPredatesErasure({},{}),false);
});
