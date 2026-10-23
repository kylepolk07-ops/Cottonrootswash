import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runtimeConfig} from '../server/config.mjs';
import {createApp} from '../server/app.mjs';
const secret=()=>randomBytes(24).toString('hex');
function environment(){return {CRC_DEPLOYMENT:'render',CRC_EPHEMERAL_TEST:'1',RENDER_EXTERNAL_URL:'https://cotton-test.onrender.com',CRC_STAGING_USER:'trial',CRC_STAGING_PASSWORD:secret(),CRC_CUSTOMER_PASSWORD:secret(),CRC_CONTRACTOR_PASSWORD:secret(),CRC_OWNER_PASSWORD:secret()}}

test('Render configuration fails closed and explicitly selects disposable synthetic storage',()=>{
 const env=environment();
 const c=runtimeConfig(env);assert.equal(c.host,'0.0.0.0');assert.equal(c.app.dataDir,'/tmp/cotton-roots-trial');assert.equal(c.app.disposable,true);assert.equal(c.app.fixtures,true);assert.equal(c.app.remoteOrigin,env.RENDER_EXTERNAL_URL);
 for(const key of ['CRC_EPHEMERAL_TEST','RENDER_EXTERNAL_URL','CRC_STAGING_USER','CRC_STAGING_PASSWORD','CRC_CUSTOMER_PASSWORD','CRC_CONTRACTOR_PASSWORD','CRC_OWNER_PASSWORD']){
  const missing={...env};delete missing[key];assert.throws(()=>runtimeConfig(missing),undefined,key);
 }
 for(const origin of ['http://cotton-test.onrender.com','https://cotton-test.onrender.com/','https://x:y@cotton-test.onrender.com'])assert.throws(()=>runtimeConfig({...env,RENDER_EXTERNAL_URL:origin}));
 assert.throws(()=>runtimeConfig({...env,CRC_STAGING_PASSWORD:'12345'}));
 assert.doesNotThrow(()=>runtimeConfig({...env,CRC_STAGING_PASSWORD:'482731'}));
 assert.equal(runtimeConfig({...env,CRC_BOX_LOCK_CODE:'4827'}).app.boxLockCode,'4827');
 for(const code of ['','123','12345','abcd'])assert.throws(()=>runtimeConfig({...env,CRC_BOX_LOCK_CODE:code}));
 assert.throws(()=>runtimeConfig({...env,CRC_STAGING_PASSWORD:'abcdef'}));
 assert.throws(()=>runtimeConfig({...env,CRC_STAGING_PASSWORD:'1234567'}));
 for(const key of ['CRC_CUSTOMER_PASSWORD','CRC_CONTRACTOR_PASSWORD','CRC_OWNER_PASSWORD'])assert.throws(()=>runtimeConfig({...env,[key]:'short'}));
 for(const key of ['CRC_CUSTOMER_PASSWORD','CRC_CONTRACTOR_PASSWORD','CRC_OWNER_PASSWORD'])assert.throws(()=>runtimeConfig({...env,[key]:'x'.repeat(257)}));
 assert.throws(()=>runtimeConfig({...env,CRC_EPHEMERAL_TEST:'0'}));
 assert.throws(()=>runtimeConfig({...env,PORT:'not-a-port'}));
 assert.throws(()=>runtimeConfig({...env,CRC_STAGING_USER:'user:password'}));
 assert.throws(()=>runtimeConfig({...env,CRC_DEPLOYMENT:'unknown-provider'}));
});

test('Render accepts only the documented protected persistent-disk configuration',()=>{
 const persistent={...environment(),CRC_DATA_DIR:'/var/data',RENDER_DISK_MOUNT_PATH:'/var/data',CRC_STAGING_PASSWORD:secret()};delete persistent.CRC_EPHEMERAL_TEST;
 const c=runtimeConfig(persistent);assert.equal(c.app.dataDir,'/var/data');assert.equal(c.app.disposable,false);
 assert.throws(()=>runtimeConfig({...persistent,CRC_STAGING_PASSWORD:'482731'}));
 assert.throws(()=>runtimeConfig({...persistent,CRC_DATA_DIR:'/tmp/data'}));
 assert.throws(()=>runtimeConfig({...persistent,RENDER_DISK_MOUNT_PATH:'/tmp/data'}));
});

test('persistent Render may use individual account login without an outer access code',()=>{
 const env={...environment(),CRC_DATA_DIR:'/var/data',RENDER_DISK_MOUNT_PATH:'/var/data',CRC_ACCOUNT_LOGIN_ONLY:'1'};delete env.CRC_EPHEMERAL_TEST;delete env.CRC_STAGING_USER;delete env.CRC_STAGING_PASSWORD;
 const c=runtimeConfig(env);assert.equal(c.app.privateGate,false);assert.equal(c.app.dataDir,'/var/data');
 assert.throws(()=>runtimeConfig({...environment(),CRC_ACCOUNT_LOGIN_ONLY:'1'}),'disposable storage must not expose reusable accounts');
});

test('live Stripe fails closed unless storage and individual accounts are production-ready',()=>{
 const base={...environment(),CRC_PAYMENT_PROVIDER:'stripe_live',STRIPE_SECRET_KEY:'sk_live_1234567890abcdef',STRIPE_WEBHOOK_SECRET:'whsec_1234567890abcdef'};
 assert.throws(()=>runtimeConfig(base));
 const live={...base,CRC_DATA_DIR:'/var/data',RENDER_DISK_MOUNT_PATH:'/var/data',CRC_ACCOUNT_LOGIN_ONLY:'1',CRC_LIVE_PAYMENTS:'1',CRC_INITIAL_OWNER_USER:'cotton.owner',CRC_INITIAL_OWNER_PASSWORD:'owner-password-that-is-private'};delete live.CRC_EPHEMERAL_TEST;delete live.CRC_STAGING_USER;delete live.CRC_STAGING_PASSWORD;delete live.CRC_CUSTOMER_PASSWORD;delete live.CRC_CONTRACTOR_PASSWORD;delete live.CRC_OWNER_PASSWORD;
 const configured=runtimeConfig(live);assert.equal(configured.app.payment.mode,'live');assert.equal(configured.app.fixtures,false);assert.equal(configured.app.privateGate,false);
 for(const key of ['CRC_DATA_DIR','RENDER_DISK_MOUNT_PATH','CRC_ACCOUNT_LOGIN_ONLY','CRC_LIVE_PAYMENTS','CRC_INITIAL_OWNER_USER','CRC_INITIAL_OWNER_PASSWORD'])assert.throws(()=>runtimeConfig({...live,[key]:''}));
});

async function harness(t){
 const env=environment(),config=runtimeConfig(env),dir=await mkdtemp(join(tmpdir(),'cotton-render-review-'));
 let app;
 async function start(overrides={}){app=await createApp({...config.app,dataDir:dir,...overrides});await new Promise(r=>app.server.listen(0,'127.0.0.1',r))}
 async function stop(){await new Promise(r=>app.server.close(r));app.close()}
 await start();t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true})});
 const gate='Basic '+Buffer.from(env.CRC_STAGING_USER+':'+env.CRC_STAGING_PASSWORD).toString('base64');
 function request(path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:app.server.address().port,path,method,headers:{host:'cotton-test.onrender.com','x-forwarded-proto':'https',authorization:gate,...(body?{'content-type':'application/json'}:{}),...headers}},res=>{
   let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),text,headers:res.headers}));
  });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 })}
 async function login(username,password){const r=await request('/api/login',{method:'POST',body:{username,password}});return {...r,cookie:r.headers['set-cookie']?.[0]?.split(';')[0]}}
 return {env,request,login,dir,async restart(overrides={}){await stop();await start(overrides)}};
}

test('Render injected credentials initialize once, survive restart, and never appear in API output',async t=>{
 const h=await harness(t);
 for(const [username,key]of [['customer','CRC_CUSTOMER_PASSWORD'],['contractor','CRC_CONTRACTOR_PASSWORD'],['owner','CRC_OWNER_PASSWORD']]){
  const logged=await h.login(username,h.env[key]);assert.equal(logged.status,200);assert.ok(logged.cookie);assert.ok(!logged.text.includes(h.env[key]));
 }
 const originalFixtures=JSON.parse(await readFile(join(h.dir,'fixtures.json'),'utf8'));
 const replacement={customer:secret(),contractor:secret(),owner:secret()};
 await h.restart({fixturePasswords:replacement});
 assert.deepEqual(JSON.parse(await readFile(join(h.dir,'fixtures.json'),'utf8')),originalFixtures,'Existing fixture file must not be rewritten silently');
 assert.equal((await h.login('owner',h.env.CRC_OWNER_PASSWORD)).status,200);
 assert.equal((await h.login('owner',replacement.owner)).status,401,'Changing bootstrap env must not silently rotate existing account');
});

test('disposable testers can reuse the private gate code without granting owner access',async t=>{
 const h=await harness(t);
 for(const username of ['customer','contractor'])assert.equal((await h.login(username,h.env.CRC_STAGING_PASSWORD)).status,200,username);
 assert.equal((await h.login('owner',h.env.CRC_STAGING_PASSWORD)).status,401);
 assert.equal((await h.login('customer','wrong-'+secret())).status,401);
});

test('Render test kit is owner-only, disabled without fixtures and behind the private gate',async t=>{
 const h=await harness(t);
 assert.equal((await h.request('/api/management/test-kit',{headers:{authorization:''}})).status,401);
 assert.equal((await h.request('/api/management/test-kit')).status,401);
 for(const [username,key]of [['customer','CRC_CUSTOMER_PASSWORD'],['contractor','CRC_CONTRACTOR_PASSWORD']]){
  const logged=await h.login(username,h.env[key]);assert.equal(logged.status,200);
  assert.equal((await h.request('/api/management/test-kit',{headers:{cookie:logged.cookie}})).status,403);
 }
 const owner=await h.login('owner',h.env.CRC_OWNER_PASSWORD);
 const kit=await h.request('/api/management/test-kit',{headers:{cookie:owner.cookie}});assert.equal(kit.status,200);assert.deepEqual(Object.keys(kit.data).sort(),['bagToken','stationToken','synthetic']);assert.equal(kit.data.synthetic,true);
 const fixtures=JSON.parse(await readFile(join(h.dir,'fixtures.json'),'utf8'));assert.equal(kit.data.bagToken,fixtures.bagToken);assert.equal(kit.data.stationToken,fixtures.stationToken);
 for(const password of Object.values(h.env).filter(v=>v.length>=24))assert.ok(!kit.text.includes(password));
 assert.equal((await h.request('/api/me',{headers:{cookie:owner.cookie}})).data.staging.disposable,true);
 await h.restart({fixtures:false});
 const resumedOwner=await h.login('owner',h.env.CRC_OWNER_PASSWORD);assert.equal(resumedOwner.status,200);
 assert.equal((await h.request('/api/management/test-kit',{headers:{cookie:resumedOwner.cookie}})).status,403);
});
