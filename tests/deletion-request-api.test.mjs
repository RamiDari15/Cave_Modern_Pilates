import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {basename} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
// Never load developer credentials or call a real provider in these tests.
const exists=fs.existsSync;
fs.existsSync=p=>['.env','.env.local'].includes(basename(String(p)))?false:exists(p);
syncBuiltinESMExports();
Object.assign(process.env,{NODE_ENV:'test',SESSION_SECRET:'deletion-api-test',CAVE_DELETION_ENABLED:'true',SUPABASE_URL:'https://database.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake',RESEND_API_KEY:'fake',DELETION_EMAIL_FROM:'support@example.invalid',FRONT_DESK_PASSWORD:'test-only'});
const {handleApiRequest}=await import('../server/api.mjs');
const rows=[];const mail=[];
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);const body=options.body?JSON.parse(options.body):null;
 if(url.origin==='https://api.resend.com'){mail.push(body);return Response.json({id:'fake-mail'});}
 assert.equal(url.origin,'https://database.example.invalid');
 let found=rows.filter(row=>(!url.searchParams.has('subject_key')||'eq.'+row.subject_key===url.searchParams.get('subject_key'))&&(!url.searchParams.has('id')||'eq.'+row.id===url.searchParams.get('id'))&&(!url.searchParams.has('status')||row.status!=='completed')&&(!url.searchParams.has('erased_at')||row.erased_at));
 if(options.method==='POST'){rows.push({...body});return Response.json([body]);}
 if(options.method==='PATCH'){found.forEach(row=>Object.assign(row,body));return Response.json(found);}
 return Response.json(found);
};
function token(payload){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(process.env.SESSION_SECRET).digest(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify({...payload,exp:Math.floor(Date.now()/1000)+300})),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64url')).join('.');}
const customer=token({clientId:'42',user:{email:'test@example.invalid'},iat:1});
async function request(path,{body,auth=customer,method='POST',cookie='',origin='http://localhost'}={}){
 const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.url=path;req.method=method;req.headers={host:'localhost',origin,cookie,'content-type':'application/json',...(auth?{authorization:`Bearer ${auth}`}:{})};req.socket={remoteAddress:'deletion-api-test'};
 const headers=new Map();let output='';const res={statusCode:200,setHeader:(k,v)=>headers.set(k.toLowerCase(),v),getHeader:k=>headers.get(k.toLowerCase()),end:v=>{output+=v||'';}};
 await handleApiRequest(req,res);return {status:res.statusCode,body:output?JSON.parse(output):null};
}
test('request and staff routes enforce identity, CSRF, persistence and revocation',async()=>{
 assert.equal((await request('/api/account/deletion-request',{auth:null,body:{confirmed:true}})).status,401);
 assert.equal((await request('/api/account/deletion-request',{body:{confirmed:true}})).status,400);
 const first=await request('/api/account/deletion-request',{body:{confirmed:true,flow:'cave-deletion-v1',email:'victim@example.invalid'}});
 assert.equal(first.status,202);assert.equal(rows[0].email,'test@example.invalid');assert.equal(mail[0].to[0],'support@cavemodernpilates.com');
 assert.equal((await request('/api/front-desk/deletion-requests',{method:'GET'})).status,401);
 assert.equal((await request('/api/account/deletion-request',{body:{confirmed:true,flow:'cave-deletion-v1'},origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/account/deletion-request',{method:'GET'})).body.data.id,first.body.data.id);
 rows[0].erased_at=new Date().toISOString();rows[0].status='confirmation_pending';
 assert.equal((await request('/api/account/profile',{method:'GET'})).status,401);
 assert.equal((await request('/api/account/deletion-request',{method:'GET'})).status,200);
});
