import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import QRCode from 'qrcode';
import {createApp} from '../server/app.mjs';

const origin='https://bag-qr-review.onrender.com',host=new URL(origin).host;
const gatePassword='synthetic-private-gate-password';
const gate='Basic '+Buffer.from(`trial:${gatePassword}`).toString('base64');
const fixturePasswords={customer:'customer-password-long-enough',contractor:'contractor-password-long-enough',owner:'owner-password-long-enough'};

async function harness(t){
 const dataDir=await mkdtemp(join(tmpdir(),'cotton-bag-qr-'));
 const app=await createApp({dataDir,fixtures:true,remoteOrigin:origin,stagingUser:'trial',stagingPassword:gatePassword,fixturePasswords,disposable:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.close();await rm(dataDir,{recursive:true,force:true})});
 const fixtures=JSON.parse(await readFile(join(dataDir,'fixtures.json'),'utf8'));
 function request(path,{method='GET',authorization=gate,cookie='',body}={}){return new Promise((resolve,reject)=>{
  const raw=body===undefined?undefined:Buffer.from(JSON.stringify(body));
  const req=http.request({hostname:'127.0.0.1',port:app.server.address().port,path,method,headers:{host,'x-forwarded-proto':'https',...(authorization?{authorization}:{}),...(cookie?{cookie}:{}),...(raw?{origin,'content-type':'application/json','content-length':raw.length}:{})}},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,raw:Buffer.concat(chunks)}));
  });req.on('error',reject);req.end(raw);
 })}
 async function login(username){
  const response=await request('/api/login',{method:'POST',body:{username,password:fixturePasswords[username]}});
  assert.equal(response.status,200,`${username} fixture login failed`);
  return response.headers['set-cookie'][0].split(';')[0];
 }
 return {fixtures,request,login};
}

test('synthetic bag QR is exact-token, owner-only and still behind private access',async t=>{
 const h=await harness(t),path='/api/management/test-kit/bag-qr';
 assert.equal((await h.request(path,{authorization:''})).status,401,'outer private gate must reject QR access');
 assert.equal((await h.request(path)).status,401,'private gate alone must not reveal the QR');
 for(const role of ['customer','contractor']){
  const cookie=await h.login(role);
  const denied=await h.request(path,{cookie});assert.equal(denied.status,403,`${role} must not receive bag QR`);
  assert.ok(!denied.raw.includes(h.fixtures.bagToken),'denial leaked raw bag token');
 }
 const ownerCookie=await h.login('owner'),qr=await h.request(path,{cookie:ownerCookie});
 assert.equal(qr.status,200);assert.match(qr.headers['content-type'],/^image\/svg\+xml/);
 assert.equal(qr.headers['cache-control'],'no-store');assert.equal(qr.headers['x-content-type-options'],'nosniff');
 const expected=await QRCode.toString(h.fixtures.bagToken,{type:'svg',errorCorrectionLevel:'M',margin:2,width:360});
 assert.equal(qr.raw.toString(),expected,'QR must encode exactly the existing synthetic bag token');
 for(const value of [...h.fixtures.accounts.map(account=>account.password),h.fixtures.stationToken])assert.ok(!qr.raw.includes(value),'QR response included unrelated fixture data');
});
