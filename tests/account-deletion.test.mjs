import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDeletionDestination, deletionHandoff, deactivateStudioAccount } from '../server/accountDeletion.mjs';
const config = { MINDBODY_ACCOUNT_DELETION_URL: 'https://clients.mindbodyonline.com/test-deletion-form?studioid=123', MINDBODY_ACCOUNT_DELETION_URL_VERIFIED: 'true' };
test('deletion remains unavailable until a provider form is explicitly verified', () => {
  assert.equal(deletionHandoff({}).status,503);
  assert.equal(deletionHandoff({...config,MINDBODY_ACCOUNT_DELETION_URL_VERIFIED:'false'}).status,503);
});
test('only HTTPS Mindbody forms without credentials or customer identifiers are accepted', () => {
  for (const url of ['http://clients.mindbodyonline.com/form','https://mindbodyonline.com.evil.test/form','https://x:password@clients.mindbodyonline.com/form','https://clients.mindbodyonline.com/form?token=secret','https://clients.mindbodyonline.com/form?email=person@example.test','https://clients.mindbodyonline.com/form?clientId=42']) {
    assert.equal(accountDeletionDestination({...config,MINDBODY_ACCOUNT_DELETION_URL:url}),null);
  }
});
test('handoff does not assert submission or delete/deactivate any profile', () => {
  const result=deletionHandoff(config);
  assert.equal(result.status,200); assert.equal(result.body.data.requestSubmitted,false);
  assert.equal(result.body.data.scope,'cave_studio_profile');
});
test('studio deactivation requires authentication, confirmation and a linked profile', async () => {
  let calls = 0;
  const updateClient = async () => { calls++; };
  for (const [session, confirmed, status] of [[null,true,401],[{clientId:'42'},false,400],[{},true,409]]) {
    assert.equal((await deactivateStudioAccount({session,confirmed,updateClient})).status,status);
  }
  assert.equal(calls,0);
});
test('studio deactivation targets only the authenticated studio client and reports retention honestly', async () => {
  let payload;
  const result = await deactivateStudioAccount({
    session: {clientId:'42'}, confirmed:true,
    updateClient: async value => { payload=value; return {Client:{Id:'42',Active:false}}; }
  });
  assert.deepEqual(payload,{Client:{Id:'42',Active:false},CrossRegionalUpdate:false,Test:false});
  assert.equal(result.status,200);
  assert.deepEqual(result.body.data,{status:'deactivated',dataErased:false});
});
test('missing provider confirmation and provider errors never report success', async () => {
  const input = {session:{clientId:'42'},confirmed:true};
  assert.equal((await deactivateStudioAccount({...input,updateClient:async()=>({Client:{Active:true}})})).status,502);
  await assert.rejects(deactivateStudioAccount({...input,updateClient:async()=>{throw new Error('provider unavailable');}}),/provider unavailable/);
});
