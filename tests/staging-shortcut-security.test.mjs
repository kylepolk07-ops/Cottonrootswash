import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';

const secret=()=>randomBytes(24).toString('hex');

async function harness(t,{disposable}){
 const dataDir=await mkdtemp(join(tmpdir(),'cotton-shortcut-security-'));
 const origin='https://security-review.example';
 const stagingUser='trial';
 const stagingPassword=secret();
 const fixturePasswords={customer:secret(),contractor:secret(),owner:secret()};
 const app=await createApp({dataDir,fixtures:true,remoteOrigin:origin,stagingUser,stagingPassword,fixturePasswords,disposable});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{
  await new Promise(resolve=>app.server.close(resolve));
  app.close();
  await rm(dataDir,{recursive:true,force:true});
 });
 const gate='Basic '+Buffer.from(`${stagingUser}:${stagingPassword}`).toString('base64');
 function login(username,password,{authorized=true}={}){
  const body=JSON.stringify({username,password});
  return new Promise((resolve,reject)=>{
   const req=http.request({
    hostname:'127.0.0.1',port:app.server.address().port,path:'/api/login',method:'POST',
    headers:{host:new URL(origin).host,'x-forwarded-proto':'https',origin,'content-type':'application/json','content-length':Buffer.byteLength(body),...(authorized?{authorization:gate}:{})}
   },res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
   req.on('error',reject);req.end(body);
  });
 }
 return {login,stagingPassword,fixturePasswords};
}

test('shared trial code is confined to disposable non-management fixtures behind the private gate',async t=>{
 const trial=await harness(t,{disposable:true});
 assert.equal(await trial.login('customer',trial.stagingPassword,{authorized:false}),401,'outer gate must run before role login');
 assert.equal(await trial.login('customer',trial.stagingPassword),200);
 assert.equal(await trial.login('contractor',trial.stagingPassword),200);
 assert.equal(await trial.login('owner',trial.stagingPassword),401,'trial code must never grant Management');
 assert.equal(await trial.login('Customer',trial.stagingPassword),401,'fixture names remain exact');
});

test('shared trial code is disabled for persistent remote staging',async t=>{
 const staging=await harness(t,{disposable:false});
 for(const username of ['customer','contractor','owner'])assert.equal(await staging.login(username,staging.stagingPassword),401,username);
 assert.equal(await staging.login('customer',staging.fixturePasswords.customer),200,'role-specific fixture credential remains valid');
});
