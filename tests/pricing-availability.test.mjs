import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { supportedMembershipQuote } from "../server/contract-catalog.mjs";

// Synthetic identity, contracts and provider. Never contact Mindbody or charge.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|SESSION_SECRET$|PUBLIC_BASE_URL$|SITE_URL$|VITE_SITE_URL$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test", SESSION_SECRET: "membership-checkout-test-secret",
  BOOKING_API_KEY: "test-key", BOOKING_SITE_ID: "test-studio", BOOKING_LOCATION_ID: "1",
  BOOKING_STAFF_TOKEN: "test-staff-token", MINDBODY_CONTRACT_PRICES_VERIFIED: "true"
});
const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const isEnvFile = (path) => [".env", ".env.local"].includes(basename(String(path)));
fs.existsSync = (path) => isEnvFile(path) ? false : originalExistsSync(path);
fs.readFileSync = (path, ...options) => isEnvFile(path) ? "" : originalReadFileSync(path, ...options);
syncBuiltinESMExports();
const { handleApiRequest } = await import("../server/api.mjs");

let contracts = [{Id: "901", Name: "4 Class Membership 3 Month", SoldOnline: true}, {Id: "903", Name: "8 Class Membership-6 Month Contract", SoldOnline: true}, {Id:"904",Name:"Offline",SoldOnline:false}];
let services = [{Id: "902", Name: "Drop in", SellOnline: true, Price: 35, Count: 1}];
let fail = false;
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
globalThis.fetch = async input => {
 const url = new URL(String(input));
 if(fail) throw new Error("offline");
 if(url.pathname.endsWith("/sale/contracts")) {
  assert.equal(url.searchParams.get("request.soldOnline"), "true");
  assert.equal(url.searchParams.has("request.sellOnline"), false);
  return Response.json({Contracts: contracts});
 }
 assert.ok(url.pathname.endsWith("/sale/services"));
 return Response.json({Services: services});
};
async function catalog() {
 const req = Readable.from([]);
 Object.assign(req,{url:"/api/pricing/catalog",method:"GET",headers:{host:"localhost"},socket:{remoteAddress:"test"}});
 let output=""; const headers=new Map();
 const res={statusCode:200,setHeader(k,v){headers.set(k,v)},getHeader(k){return headers.get(k)},end(v=""){output+=v}};
 await handleApiRequest(req,res);
 return JSON.parse(output).catalog;
}
test("catalog drops removed options after refresh and never resurrects a snapshot", async () => {
 const first=await catalog();
 assert.equal(first.memberships.length,1);
 assert.equal(first.dropIn.length,1);
 contracts=[]; services=[]; now+=61000;
 const removed=await catalog();
 assert.deepEqual(removed,{blackFriday:[],newbie:[],classPacks:[],dropIn:[],memberships:[],privateSessions:[]});
 fail=true; now+=61000;
 assert.deepEqual(await catalog(),removed);
 Date.now=realNow;
});
