import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';

const remoteOrigin='https://private-staging.example';
const stagingUser='test-gate';
const stagingPassword='synthetic-random-looking-password-123456789';
const authorization='Basic '+Buffer.from(stagingUser+':'+stagingPassword).toString('base64');
async function harness(t){
 const dataDir=await mkdtemp(join(tmpdir(),'cotton-remote-review-'));
 const app=await createApp({dataDir,fixtures:true,remoteOrigin,stagingUser,stagingPassword});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.close();await rm(dataDir,{recursive:true,force:true})});
 const fixtures=JSON.parse(await readFile(join(dataDir,'fixtures.json'),'utf8'));
 const request=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:JSON.stringify(body);
  const req=http.request({hostname:'127.0.0.1',port:app.server.address().port,path,method,headers:{host:'private-staging.example','x-forwarded-proto':'https',...(data?{'content-type':'application/json'}:{}),...headers}},res=>{
   let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));
  });req.on('error',reject);req.end(data);
 });
 return {request,fixtures};
}
test('independent remote review: health reveals no app data; all app routes require private gate',async t=>{
 const {request,fixtures}=await harness(t);
 const health=await request('/healthz',{headers:{host:'localhost'}});assert.equal(health.status,200);assert.deepEqual(JSON.parse(health.text),{ok:true});
 const qrPage=await request('/trial-qr');assert.equal(qrPage.status,200);assert.match(qrPage.headers['content-type'],/^text\/html/);assert.match(qrPage.text,/never contains|website address/i);
 const qrImage=await request('/trial-qr.png');assert.equal(qrImage.status,200);assert.equal(qrImage.headers['content-type'],'image/png');assert.ok(qrImage.text.length>100);
 for(const sensitive of [stagingPassword,fixtures.bagToken,...fixtures.accounts.map(a=>a.password)])assert.ok(!qrPage.text.includes(sensitive));
 for(const path of ['/customer','/contractor','/web/app.mjs','/api/orders','/api/management','/.runtime/fixtures.json']){
  const r=await request(path);assert.equal(r.status,path.startsWith('/api/')?401:303,path);assert.equal(r.headers['www-authenticate'],undefined);if(r.status===303)assert.equal(new URL(r.headers.location,'https://test.invalid').pathname,'/access');
  for(const sensitive of [stagingPassword,fixtures.bagToken,...fixtures.accounts.map(a=>a.password)])assert.ok(!r.text.includes(sensitive));
 }
 assert.equal((await request('/customer',{headers:{authorization:'Basic '+Buffer.from('test-gate:wrong-password').toString('base64')}})).status,303);
 assert.equal((await request('/customer',{headers:{authorization}})).status,200);
 assert.equal((await request('/api/orders',{headers:{authorization}})).status,401);
});

test('independent remote review: forwarded spoofing cannot bypass host; HTTPS and Origin enforced; sessions secure',async t=>{
 const {request,fixtures}=await harness(t);
 for(const host of ['attacker.example','localhost','127.0.0.1'])assert.equal((await request('/customer',{headers:{host,authorization,'x-forwarded-host':'private-staging.example'}})).status,403);
 for(const proto of ['http','https,http','HTTPS',''])assert.equal((await request('/customer',{headers:{authorization,'x-forwarded-proto':proto}})).status,403);
 const owner=fixtures.accounts.find(a=>a.username==='owner');
 const body={username:owner.username,password:owner.password};
 assert.equal((await request('/api/login',{method:'POST',headers:{authorization,origin:'https://attacker.example'},body})).status,403);
 assert.equal((await request('/api/login',{method:'POST',headers:{authorization,origin:'http://private-staging.example'},body})).status,403);
 const login=await request('/api/login',{method:'POST',headers:{authorization,origin:remoteOrigin},body});assert.equal(login.status,200);
 const cookie=login.headers['set-cookie'][0];assert.match(cookie,/; Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 assert.match(login.headers['strict-transport-security'],/max-age=31536000/);
 const session=JSON.parse(login.text);
 const logout=await request('/api/logout',{method:'POST',headers:{authorization,origin:remoteOrigin,cookie:cookie.split(';')[0],'x-csrf-token':session.csrf},body:{}});
 assert.equal(logout.status,200);assert.match(logout.headers['set-cookie'][0],/; Secure/);assert.match(logout.headers['set-cookie'][0],/Max-Age=0/);
});
