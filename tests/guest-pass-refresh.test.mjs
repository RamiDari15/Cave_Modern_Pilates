import assert from 'node:assert/strict';
import test from 'node:test';
import { watchGuestPassRenewal } from '../src/guestPassRefresh.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(refresh) {
 const window = new EventTarget(), document = new EventTarget();
 document.visibilityState = 'visible';
 let time=0, tick, cleared=false;
 window.setInterval=(fn,ms)=>{assert.equal(ms,180000);tick=fn;return 1;};
 window.clearInterval=()=>{cleared=true;};
 const stop=watchGuestPassRenewal({window,document,refresh,now:()=>new Date(time)});
 return {window,document,stop,tick:()=>tick(),advance:ms=>{time+=ms;},cleared:()=>cleared};
}
test('refreshes current-month membership once per three minutes, not on every focus event',async()=>{
 let calls=0;const env=setup(async()=>{calls++;});
 env.tick();assert.equal(calls,0);
 env.advance(180000);env.tick();await flush();assert.equal(calls,1);
 for(let i=0;i<100;i++){env.window.dispatchEvent(new Event('focus'));env.document.dispatchEvent(new Event('visibilitychange'));env.tick();}
 await flush();assert.equal(calls,1);
 env.advance(540000);env.tick();await flush();assert.equal(calls,2);env.stop();
});
test('hidden tabs pause; returning refreshes only when cooldown has elapsed',async()=>{
 let calls=0;const env=setup(async()=>{calls++;});
 env.document.visibilityState='hidden';env.advance(180000);env.tick();assert.equal(calls,0);
 env.document.visibilityState='visible';env.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(calls,1);
 env.window.dispatchEvent(new Event('focus'));await flush();assert.equal(calls,1);env.stop();
});
test('slow requests cannot overlap and cleanup prevents late updates',async()=>{
 let calls=0,release,late;const env=setup(async active=>{calls++;await new Promise(r=>{release=r;});late=active();});
 env.advance(180000);env.tick();env.advance(900000);env.tick();env.window.dispatchEvent(new Event('focus'));assert.equal(calls,1);
 env.stop();release();await flush();assert.equal(late,false);assert.equal(env.cleared(),true);
 env.advance(180000);env.tick();env.window.dispatchEvent(new Event('focus'));assert.equal(calls,1);
});
test('failures back off instead of retrying continuously and success resets the interval',async()=>{
 let calls=0;const env=setup(async()=>{calls++;if(calls<3)throw new Error('offline');});
 env.advance(180000);env.tick();await flush();assert.equal(calls,1);
 env.advance(180000);env.tick();await flush();assert.equal(calls,1);
 env.advance(540000);env.tick();await flush();assert.equal(calls,2);
 env.advance(540000);env.tick();await flush();assert.equal(calls,2);
 env.advance(180000);env.tick();await flush();assert.equal(calls,3);
 env.advance(180000);env.tick();await flush();assert.equal(calls,4);env.stop();
});
