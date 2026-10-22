import test from 'node:test';
import {shopDateKey} from '../shared/calendar.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';

async function harness(t) {
 const dataDir=await mkdtemp(join(tmpdir(),'cotton-api-'));
 let app=await createApp({dataDir,fixtures:true});
 async function listen(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));}
 await listen();
 const fixtures=JSON.parse(await readFile(join(dataDir,'fixtures.json'),'utf8'));
 const clients=[];
 async function client(username) {
  const account=fixtures.accounts.find(a=>a.username===username);
  assert.ok(account,`Missing fixture ${username}`);
  const c={cookie:'',csrf:''};
  c.request=async(path,{method='GET',body,key=randomUUID(),csrf=c.csrf}={})=>{
   const headers={cookie:c.cookie};
   if(body!==undefined) headers['content-type']='application/json';
   if(csrf)headers['x-csrf-token']=csrf;
   headers['idempotency-key']=key;
   const r=await fetch(`http://127.0.0.1:${app.server.address().port}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   let data;try{data=await r.json()}catch{data={}}
   return {status:r.status,data,headers:r.headers};
  };
  const r=await c.request('/api/login',{method:'POST',body:{username:account.username,password:account.password}});
  assert.equal(r.status,200,JSON.stringify(r.data));
  c.cookie=r.headers.get('set-cookie').split(';')[0];c.csrf=r.data.csrf;
  assert.ok(c.csrf);assert.match(r.headers.get('set-cookie'),/HttpOnly/i);
  clients.push(c);return c;
 }
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.close?.();await rm(dataDir,{recursive:true,force:true});});
 return {dataDir,fixtures,client,async hostileHost(){return new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:app.server.address().port,path:'/customer',headers:{Host:'attacker.invalid'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject)});},async restart(){await new Promise(r=>app.server.close(r));app.close?.();app=await createApp({dataDir,fixtures:true});await listen();},async anonymous(path,options){return fetch(`http://127.0.0.1:${app.server.address().port}${path}`,options)}};
}
const denied=r=>assert.ok([400,401,403,404,409,422,501,503].includes(r.status),`Expected denial, received ${r.status}: ${JSON.stringify(r.data)}`);
async function setupOrder(h,c){
 const r=await c.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}});
 assert.ok([200,201].includes(r.status),JSON.stringify(r.data));
 const b=await c.request('/api/orders',{method:'POST',body:{service:'dropoff',detergent:'standard',rush_requested:false}});
 assert.ok([200,201].includes(b.status),JSON.stringify(b.data));return b.data.order;
}
function action(c,id,action,extra={},key){return c.request(`/api/orders/${id}/actions`,{method:'POST',key,body:{action,...extra}})}

test('authentication, CSRF, roles, protected resources and disabled sensitive features',async t=>{
 const h=await harness(t);
 assert.equal((await stat(h.dataDir)).mode&0o777,0o700);
 assert.equal((await stat(join(h.dataDir,'staging.sqlite'))).mode&0o777,0o600);
 assert.equal(await h.hostileHost(),403);
 assert.equal((await h.anonymous('/api/orders')).status,401);
 const c=await h.client('customer'), other=await h.client('customer2'), owner=await h.client('owner');
 denied(await c.request('/api/management'));
 const management=await owner.request('/api/management');assert.equal(management.status,200);assert.ok(Array.isArray(management.data.audit));
 denied(await c.request('/api/claim',{method:'POST',csrf:'invalid',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}}));
 denied(await c.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:false}}));
 const o=await setupOrder(h,c);
 assert.deepEqual((await other.request('/api/orders')).data.orders,[]);
 denied(await other.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}}));
 assert.ok(!JSON.stringify(management.data.users).match(/passwordHash|\"salt\"|\"password\"/));
 assert.equal((await h.anonymous('/.runtime/fixtures.json')).status,404);
 assert.equal((await h.anonymous('/web/%2e%2e/server/app.mjs')).status,404);
 assert.equal((await h.anonymous('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'x'.repeat(17000)})})).status,413);
 assert.equal((await h.anonymous('/api/orders',{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.invalid'},body:'{}'})).status,403);
 denied(await action(other,o.id,'drop_off',{bagToken:h.fixtures.bagToken,stationToken:h.fixtures.stationToken}));
 denied(await action(c,o.id,'square_payment_confirmed',{verifiedServerWebhook:true,squareEventId:'forged',payment_verified:true,role:'owner'}));
 denied(await c.request('/api/uploads',{method:'POST',body:{name:'license.jpg'}}));
 denied(await owner.request('/api/payments',{method:'POST',body:{orderId:o.id}}));
});

test('custody workflow rejects forged scans, unpaid pickup, duplicates and competing acceptance',async t=>{
 const h=await harness(t),c=await h.client('customer'),k=await h.client('contractor'),k2=await h.client('contractor2');
 const o=await setupOrder(h,c),scan={bagToken:h.fixtures.bagToken,stationToken:h.fixtures.stationToken};
 denied(await action(c,o.id,'drop_off',{...scan,bagToken:'forged'}));
 denied(await action(c,o.id,'drop_off',{...scan,stationToken:'forged'}));
 const key=randomUUID();
 const first=await action(c,o.id,'drop_off',scan,key);assert.equal(first.status,200,JSON.stringify(first.data));
 const repeat=await action(c,o.id,'drop_off',scan,key);assert.equal(repeat.status,200);assert.deepEqual(repeat.data,first.data);
 denied(await action(c,o.id,'drop_off',scan));
 const conflict=await action(c,o.id,'drop_off',{...scan,bagToken:'different'},key);assert.equal(conflict.status,409);
 denied(await action(c,o.id,'customer_pickup',scan));
 for(const actor of [k,k2])assert.equal((await actor.request('/api/availability',{method:'POST',body:{days:[shopDateKey()],preference:'both'}})).status,200);
 denied(await action(k,o.id,'accept_job',{deadlineAcknowledged:false}));
 const accepts=await Promise.all([k,k2].map(actor=>action(actor,o.id,'accept_job',{deadlineAcknowledged:true})));
 assert.equal(accepts.filter(r=>r.status===200).length,1,JSON.stringify(accepts));
 const assigned=accepts[0].status===200?k:k2,unassigned=assigned===k?k2:k;
 assert.ok(!(await unassigned.request('/api/orders')).data.orders.some(order=>order.id===o.id));
 denied(await action(unassigned,o.id,'record_weight',{bagToken:h.fixtures.bagToken,measuredPounds:8.1}));
 denied(await action(assigned,o.id,'wall_checkout',scan));
 denied(await action(assigned,o.id,'record_weight',{bagToken:'wrong',measuredPounds:8.1}));
 const weighed=await action(assigned,o.id,'record_weight',{bagToken:h.fixtures.bagToken,measuredPounds:8.1});assert.equal(weighed.status,200,JSON.stringify(weighed.data));assert.equal(weighed.data.order.billed_pounds,8.5);
 assert.equal((await action(assigned,o.id,'wall_checkout',scan)).status,200);
 denied(await action(assigned,o.id,'wall_checkin',scan));
 assert.equal((await action(assigned,o.id,'wash_complete')).status,200);
 assert.equal((await action(assigned,o.id,'return_bag',scan)).status,200);
 assert.equal((await action(assigned,o.id,'wall_checkin',scan)).status,200);
 denied(await action(c,o.id,'customer_pickup',scan));
 const earnings=await assigned.request('/api/earnings');assert.equal(earnings.status,200);assert.ok(earnings.data.earnings.every(e=>e.status!=='approved'&&e.status!=='paid'));
 const owner=await h.client('owner');const audit=JSON.stringify((await owner.request('/api/management')).data.audit);
 for(const secret of [h.fixtures.bagToken,h.fixtures.stationToken,...h.fixtures.accounts.map(a=>a.password)])assert.ok(!audit.includes(secret),'Audit leaked raw credential');
 await h.restart();
 const resumed=await h.client('customer');
 const replay=await action(resumed,o.id,'drop_off',scan,key);assert.equal(replay.status,200);assert.deepEqual(replay.data,first.data);
 const saved=await resumed.request('/api/orders');assert.equal(saved.status,200);assert.equal(saved.data.orders[0].status,'payment_pending');
});

test('logout revokes session and login throttling rejects credential guessing',async t=>{
 const h=await harness(t),c=await h.client('customer');
 assert.equal((await c.request('/api/logout',{method:'POST',body:{}})).status,200);
 assert.equal((await c.request('/api/me')).status,401);
 let last;for(let i=0;i<21;i++)last=await h.anonymous('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'unknown',password:'wrong'})});
 assert.equal(last.status,429);
});
