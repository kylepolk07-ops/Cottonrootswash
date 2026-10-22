// Build first: DOCKER_CONFIG=/workspace/scratch/docker-config docker build -t cotton-roots-private-staging:review .
// Run: DOCKER_CONFIG=/workspace/scratch/docker-config node tests/container.mjs
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import http from 'node:http';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const render=process.argv.includes('--render');
const name='cotton-test-'+randomBytes(6).toString('hex'),volume=name+'-data';
const temp=mkdtempSync(join(tmpdir(),'cotton-container-')),envFile=join(temp,'private.env');
const origin=render?'https://cotton-test.onrender.com':'https://cotton-test.up.railway.app',password=randomBytes(32).toString('hex');
const customerPassword=randomBytes(32).toString('hex');
const contractorPassword=randomBytes(32).toString('hex');
const ownerPassword=randomBytes(32).toString('hex');
const trialEnv=`CRC_DEPLOYMENT=render\nCRC_EPHEMERAL_TEST=1\nRENDER_EXTERNAL_URL=${origin}\nCRC_STAGING_USER=staging\nCRC_STAGING_PASSWORD=${password}\nCRC_CUSTOMER_PASSWORD=${customerPassword}\nCRC_CONTRACTOR_PASSWORD=${contractorPassword}\nCRC_OWNER_PASSWORD=${ownerPassword}\nPORT=3000\n`;
writeFileSync(envFile,render?trialEnv:`CRC_DEPLOYMENT=railway\nCRC_DATA_DIR=/data\nRAILWAY_VOLUME_MOUNT_PATH=/data\nCRC_PUBLIC_ORIGIN=${origin}\nCRC_STAGING_USER=staging\nCRC_STAGING_PASSWORD=${password}\nPORT=3000\n`,{mode:0o600});
let base,csrf,cookie;
const headers={authorization:'Basic '+Buffer.from('staging:'+password).toString('base64'),Host:new URL(origin).host,'x-forwarded-proto':'https'};
async function request(path,body,extra={}){
 return new Promise((resolve,reject)=>{
  const req=http.request(base+path,{method:body===undefined?'GET':'POST',headers:{...headers,...(body===undefined?{}:{'content-type':'application/json',origin,'x-csrf-token':csrf||'','idempotency-key':randomUUID(),cookie:cookie||''}),...extra}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
    const raw=Buffer.concat(chunks);let data;try{data=JSON.parse(raw.toString())}catch{data={}}
    resolve({status:res.statusCode,headers:{get:key=>Array.isArray(res.headers[key])?res.headers[key][0]:res.headers[key]},data,raw});
   });
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
}
async function ready(){for(let i=0;i<100;i++){try{if((await request('/healthz')).status===200)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Container not ready')}
try{
 docker('volume','create',volume);
 const launch=()=>docker('run','-d','--name',name,'--env-file',envFile,...(render?[]:['-v',volume+':/data']),'-p','127.0.0.1::3000','cotton-roots-private-staging:review');
 launch();
 const port=docker('port',name,'3000/tcp').split(':').pop();base='http://127.0.0.1:'+port;await ready();
 const status=docker('exec',name,'cat','/proc/1/status');assert.match(status,/Uid:\s+1000\s+1000\s+1000\s+1000/);assert.match(status,/Gid:\s+1000\s+1000\s+1000\s+1000/);assert.match(status,/Groups:\s*\n/);
 const qrPage=await request('/trial-qr');assert.equal(qrPage.status,200);assert.match(qrPage.raw.toString(),/You will still need your private PIN/);
 const qrImage=await request('/trial-qr.png');assert.equal(qrImage.status,200);assert.equal(qrImage.headers.get('content-type'),'image/png');assert.equal(qrImage.raw.subarray(1,4).toString(),'PNG');
 const fixtures=JSON.parse(docker('exec',name,'cat',render?'/tmp/cotton-roots-trial/fixtures.json':'/data/fixtures.json'));
 const user=fixtures.accounts.find(a=>a.username==='customer');
 if(render)assert.equal(user.password,customerPassword);
 async function login(){const r=await request('/api/login',{username:user.username,password:user.password});assert.equal(r.status,200,JSON.stringify(r.data));assert.match(r.headers.get('set-cookie'),/; Secure/);csrf=r.data.csrf;cookie=r.headers.get('set-cookie').split(';')[0]}
 await login();
 assert.equal((await request('/api/claim',{bagToken:fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true})).status,200);
 const order=await request('/api/orders',{service:'dropoff',detergent:'standard'});assert.equal(order.status,200);
 docker('restart',name);base='http://127.0.0.1:'+docker('port',name,'3000/tcp').split(':').pop();await ready();await login();
 const orders=await request('/api/orders',undefined,{cookie});assert.equal(orders.status,200);assert.equal(orders.data.orders[0].id,order.data.order.id);
 assert.equal((await request('/api/management',undefined,{cookie})).status,403);
 if(render){
  assert.equal((await request('/api/me',undefined,{cookie})).data.staging.disposable,true);
  assert.equal((await request('/api/management/test-kit',undefined,{cookie})).status,403);
  const ownerLogin=await request('/api/login',{username:'owner',password:ownerPassword});assert.equal(ownerLogin.status,200);
  const ownerCookie=ownerLogin.headers.get('set-cookie').split(';')[0];
  const kit=await request('/api/management/test-kit',undefined,{cookie:ownerCookie});assert.equal(kit.status,200);assert.equal(kit.data.bagToken,fixtures.bagToken);assert.equal(kit.data.stationToken,fixtures.stationToken);
  docker('rm','-f',name);launch();base='http://127.0.0.1:'+docker('port',name,'3000/tcp').split(':').pop();await ready();await login();
  const clean=await request('/api/orders',undefined,{cookie});assert.equal(clean.status,200);assert.deepEqual(clean.data.orders,[]);
  console.log('PASS Render disposable container: injected credentials, owner-only synthetic kit, disposable warning metadata, recreated-container reset with stable configured sign-in.');
 }
 console.log('PASS '+(render?'disposable Render':'persistent Railway')+' container: UID/GID 1000 with no supplementary groups, gated HTTPS-mode login, Secure cookie, claim/order after warm restart, role denial.');
}catch(error){
 console.error('Container diagnostics:',docker('logs',name));throw error;
}finally{
 try{docker('rm','-f',name)}catch{}
 try{docker('volume','rm',volume)}catch{}
 rmSync(temp,{recursive:true,force:true});
}
