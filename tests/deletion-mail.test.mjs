import test from 'node:test';import assert from 'node:assert/strict';
import {googleMailConfig,sendGoogleDeletionMail} from '../server/deletionMail.mjs';
const env={GOOGLE_SMTP_USER:'support@example.test',GOOGLE_APP_PASSWORD:'abcd efgh ijkl mnop'};
const message={id:'test-completion',to:'recipient@example.test',subject:'Test',text:'Synthetic test'};
test('Google transport enforces TLS and never logs credentials',()=>{
 const c=googleMailConfig(env);assert.equal(c.secure,true);assert.equal(c.host,'smtp.gmail.com');assert.equal(c.port,465);assert.equal(c.auth.pass,'abcdefghijklmnop');assert.equal(c.debug,false);assert.equal(c.disableFileAccess,true);assert.equal(googleMailConfig({}),null);
});
test('OAuth is preferred when configured',()=>{assert.equal(googleMailConfig({...env,GOOGLE_CLIENT_ID:'x',GOOGLE_CLIENT_SECRET:'y',GOOGLE_REFRESH_TOKEN:'z'}).auth.type,'OAuth2');});
test('completion requires Google to accept the intended recipient',async()=>{
 let sent,closed=false;const factory=()=>({sendMail:async m=>{sent=m;return {accepted:[message.to],rejected:[]};},close:()=>{closed=true;}});
 assert.deepEqual(await sendGoogleDeletionMail(message,env,factory),{accepted:true});assert.equal(sent.to,message.to);assert.ok(closed);
 await assert.rejects(sendGoogleDeletionMail(message,env,()=>({sendMail:async()=>({accepted:[],rejected:[message.to]})})),{status:503});
});
test('provider errors do not expose server responses or secrets',async()=>{
 await assert.rejects(sendGoogleDeletionMail(message,env,()=>({sendMail:async()=>{throw Error('secret server response');}})), e=>e.status===503&&!e.message.includes('secret'));
});
