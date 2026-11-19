import test from 'node:test';
import assert from 'node:assert/strict';
import { studioProfileAccess } from '../server/studioProfileAccess.mjs';
const check = payload => studioProfileAccess(payload, '42', 'client@example.invalid');
test('revoked and redacted studio profiles cannot reuse old sessions', () => {
  for (const Client of [null, {Id:'42',Active:false}, {Id:'42',Email:''}, {Id:'42',Action:'Removed'}]) assert.equal(check({Client}), 'revoked');
});
test('unavailable provider data is not proof of deletion', () => {
  for (const payload of [null, {}, {Error:'offline'}, {Client:{Id:'99'}}]) assert.equal(check(payload), 'unavailable');
});
test('valid newly created studio profile is accepted', () => {
  assert.equal(studioProfileAccess({Client:{Id:'43',Active:true,Email:'client@example.invalid'}}, '43', 'client@example.invalid'), 'active');
});
