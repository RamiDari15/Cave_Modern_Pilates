import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../server/api.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function attachClientWaiver(');
const end = source.indexOf('\nfunction compactObject', start);
function setup(confirmed) {
  const calls = [];
  const context = vm.createContext({
    resolveSessionClientId: async () => '42',
    getMindbodyActionToken: async () => 'synthetic',
    waiverCustomClientFields: () => [{Id:1,Value:'Test signature'}],
    httpError: (status,message) => Object.assign(new Error(message),{status}),
    bookingRequest: async (path, options) => {
      calls.push({path,options});
      return {Client:{Id:'42',Liability:{IsReleased: path.endsWith('updateclient') ? false : confirmed}}};
    }
  });
  vm.runInContext(source.slice(start,end)+'\nthis.save=attachClientWaiver;',context);
  return {save:context.save,calls};
}
test('waiver writes correct provider flag and custom fields, then verifies persisted acceptance', async () => {
  const {save,calls}=setup(true);
  assert.equal((await save({},{})).storedInMindbody,true);
  assert.equal(calls[0].options.body.Client.LiabilityRelease,true);
  assert.equal(calls[0].options.body.Client.Liability,undefined);
  assert.equal(calls[0].options.body.Client.CustomClientFields[0].Value,'Test signature');
  assert.equal(calls.length,2);
});
test('waiver never reports success when provider did not persist it', async () => {
  const {save}=setup(false);
  await assert.rejects(save({},{}), error => error.status === 502);
});
