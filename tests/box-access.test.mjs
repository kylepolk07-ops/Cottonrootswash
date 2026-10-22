import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';

async function setup(t,boxLockCode='4827'){
 const dataDir=await mkdtemp(join(tmpdir(),'crc-box-'));
 const app=await createApp({dataDir,fixtures:true,boxLockCode});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const fixtures=JSON.parse(await readFile(join(dataDir,'fixtures.json'),'utf8'));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.close();await rm(dataDir,{recursive:true,force:true})});
 async function client(username){const account=fixtures.accounts.find(a=>a.username===username);let cookie='',csrf='';async function request(path,body,key=randomUUID()){const headers={};if(cookie)headers.cookie=cookie;if(body!==undefined){headers['content-type']='application/json';headers['x-csrf-token']=csrf;headers['idempotency-key']=key}const response=await fetch(`http://127.0.0.1:${app.server.address().port}${path}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();return {status:response.status,data,headers:response.headers}}const login=await request('/api/login',{username,password:account.password});cookie=login.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;return {request}}
 return {client};
}

test('protected reusable box code is customer-only and does not leak through reads',async t=>{
 const h=await setup(t),customer=await h.client('customer'),contractor=await h.client('contractor'),owner=await h.client('owner');
 const key=randomUUID(),first=await customer.request('/api/bag-box/access',{},key),again=await customer.request('/api/bag-box/access',{},key);
 assert.equal(first.status,200);assert.equal(first.data.accessCode,'4827');assert.equal(first.data.reusable,true);assert.deepEqual(again.data,first.data);
 assert.equal((await contractor.request('/api/bag-box/access',{})).status,403);
 assert.equal((await owner.request('/api/bag-box/access',{})).status,403);
 for(const response of [await customer.request('/api/me'),await customer.request('/api/dashboard'),await customer.request('/api/bags'),await owner.request('/api/management')])assert.equal(JSON.stringify(response.data).includes('4827'),false);
});

test('box access fails closed when no protected code is configured',async t=>{
 const h=await setup(t,null),customer=await h.client('customer');
 assert.equal((await customer.request('/api/bag-box/access',{})).status,503);
});
