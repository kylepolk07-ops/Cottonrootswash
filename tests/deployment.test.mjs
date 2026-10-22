import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {runtimeConfig} from '../server/config.mjs';
const origin='https://cotton-test.up.railway.app';
const password='synthetic-test-password-at-least-24-characters';
const basic='Basic '+Buffer.from('staging:'+password).toString('base64');
test('remote configuration fails closed without volume, HTTPS and private credentials',()=>{
 const good={CRC_DEPLOYMENT:'railway',CRC_DATA_DIR:'/data',RAILWAY_VOLUME_MOUNT_PATH:'/data',CRC_PUBLIC_ORIGIN:origin,CRC_STAGING_USER:'staging',CRC_STAGING_PASSWORD:password,PORT:'8080'};
 assert.equal(runtimeConfig(good).host,'0.0.0.0');
 assert.equal(runtimeConfig(good).port,8080);
 for(const key of ['CRC_DATA_DIR','RAILWAY_VOLUME_MOUNT_PATH','CRC_PUBLIC_ORIGIN','CRC_STAGING_USER','CRC_STAGING_PASSWORD'])assert.throws(()=>runtimeConfig({...good,[key]:''}));
 for(const value of ['http://test.invalid','https://test.invalid/path','https://user:pass@test.invalid'])assert.throws(()=>runtimeConfig({...good,CRC_PUBLIC_ORIGIN:value}));
 assert.throws(()=>runtimeConfig({...good,RAILWAY_REPLICA_COUNT:'2'}));
 assert.throws(()=>runtimeConfig({...good,PORT:'0'}));
 assert.throws(()=>runtimeConfig({CRC_DEPLOYMENT:'production'}));
 assert.equal(runtimeConfig({}).host,'127.0.0.1');
});
test('private remote staging gates all app assets, enforces transport/origin and secure sessions',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'cotton-remote-'));
 const app=await createApp({dataDir,fixtures:true,remoteOrigin:origin,stagingUser:'staging',stagingPassword:password});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.close();await rm(dataDir,{recursive:true,force:true})});
 function request(path,{method='GET',headers={},body}={}){
  return new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:app.server.address().port,path,method,headers:{Host:new URL(origin).host,'x-forwarded-proto':'https',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}))});req.on('error',reject);req.end(body);
  });
 }
 for(const path of ['/customer','/contractor','/web/app.mjs','/api/orders']){
  const r=await request(path);assert.equal(r.status,path.startsWith('/api/')?401:303);assert.equal(r.headers['www-authenticate'],undefined);if(r.status===303)assert.equal(new URL(r.headers.location,'https://test.invalid').pathname,'/access');
 }
 assert.equal((await request('/healthz')).status,200);
 assert.equal((await request('/healthz',{headers:{Host:'healthcheck.railway.app'}})).status,200);
 assert.equal((await request('/customer',{headers:{Host:'healthcheck.railway.app',authorization:basic}})).status,403);
 const health=await request('/healthz',{headers:{Host:'localhost'}});assert.deepEqual(JSON.parse(health.body),{ok:true});
 assert.equal((await request('/customer',{headers:{Host:'attacker.invalid',authorization:basic}})).status,403);
 assert.equal((await request('/customer',{headers:{Host:'localhost',authorization:basic}})).status,403);
 for(const proto of ['http','https,http',''])assert.equal((await request('/customer',{headers:{authorization:basic,'x-forwarded-proto':proto}})).status,403);
 assert.equal((await request('/customer',{headers:{authorization:'Basic '+Buffer.from('staging:wrong').toString('base64')}})).status,303);
 const page=await request('/customer',{headers:{authorization:basic}});assert.equal(page.status,200);assert.match(page.headers['strict-transport-security'],/max-age/);
 const fixtures=JSON.parse(await readFile(join(dataDir,'fixtures.json'),'utf8'));
 const user=fixtures.accounts.find(a=>a.username==='customer');
 const loginBody=JSON.stringify({username:user.username,password:user.password});
 const headers={authorization:basic,'content-type':'application/json',origin};
 assert.equal((await request('/api/login',{method:'POST',headers:{...headers,origin:'https://attacker.invalid'},body:loginBody})).status,403);
 const login=await request('/api/login',{method:'POST',headers,body:loginBody});assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/; Secure/);
 const {csrf}=JSON.parse(login.body);const cookie=login.headers['set-cookie'][0].split(';')[0];
 assert.equal((await request('/api/me',{headers:{cookie}})).status,401,'A session cannot bypass the outer gate');
 assert.equal((await request('/api/me',{headers:{authorization:basic,cookie}})).status,200);
 assert.equal((await request('/api/management',{headers:{authorization:basic,cookie}})).status,403);
 const logout=await request('/api/logout',{method:'POST',headers:{...headers,cookie,'x-csrf-token':csrf},body:'{}'});assert.equal(logout.status,200);assert.match(logout.headers['set-cookie'][0],/; Secure/);
 assert.equal((await request('/api/me',{headers:{authorization:basic,cookie}})).status,401);
});
