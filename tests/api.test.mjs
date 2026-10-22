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
 assert.deepEqual((await c.request('/api/dashboard')).data.dashboard,{role:'customer',bagCount:0,activeOrders:0,completedOrders:0,nextOrder:null});
 assert.equal((await owner.request('/api/dashboard')).data.dashboard.role,'management');
 denied(await c.request('/api/management'));
 const management=await owner.request('/api/management');assert.equal(management.status,200);assert.ok(Array.isArray(management.data.audit));
 const pilotPassword='private-pilot-password-123';
 const created=await owner.request('/api/management/accounts',{method:'POST',body:{role:'customer',username:'pilot-user',temporaryPassword:pilotPassword}});assert.equal(created.status,200);assert.equal(created.data.user.username,'pilot-user');assert.equal(created.data.temporaryPassword,undefined);
 denied(await c.request('/api/management/accounts',{method:'POST',body:{role:'customer',username:'not-owner',temporaryPassword:pilotPassword}}));
 const pilotLogin=await h.anonymous('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'pilot-user',password:pilotPassword})});assert.equal(pilotLogin.status,200);const pilotSession=await pilotLogin.json(),pilotCookie=pilotLogin.headers.get('set-cookie').split(';')[0];
 assert.equal((await h.anonymous('/api/dashboard',{headers:{cookie:pilotCookie}})).status,428);
 const bypassed=await h.anonymous('/api/agreements/accept',{method:'POST',headers:{cookie:pilotCookie,'content-type':'application/json','x-csrf-token':pilotSession.csrf,'idempotency-key':randomUUID()},body:JSON.stringify({version:'pilot-2026-10-22-v1',accepted:true})});assert.equal(bypassed.status,400);
 const accepted=await h.anonymous('/api/agreements/accept',{method:'POST',headers:{cookie:pilotCookie,'content-type':'application/json','x-csrf-token':pilotSession.csrf,'idempotency-key':randomUUID()},body:JSON.stringify({version:'pilot-2026-10-22-v1',accepted:true,conditions:['platform_role','customer_contractor_service','pilot_data']})});assert.equal(accepted.status,200);
 assert.equal((await h.anonymous('/api/dashboard',{headers:{cookie:pilotCookie}})).status,200);
 assert.ok(!JSON.stringify((await owner.request('/api/management')).data).includes(pilotPassword));
 denied(await c.request('/api/claim',{method:'POST',csrf:'invalid',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}}));
 denied(await c.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:false}}));
 const o=await setupOrder(h,c);
 const repeat=await c.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}});assert.equal(repeat.status,200);assert.equal(repeat.data.alreadyRegistered,true);
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

test('management bag labels, exchanges and account controls fail safely',async t=>{
 const h=await harness(t),customer=await h.client('customer'),other=await h.client('customer2'),owner=await h.client('owner');
 assert.equal((await customer.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}})).status,200);
 const added=await owner.request('/api/management/bags',{method:'POST',body:{action:'add',id:'bag-002'}});assert.equal(added.status,200);
 const qr=await owner.request('/api/management/bags/bag-002/qr');assert.equal(qr.status,200);assert.match(qr.headers.get('content-type'),/image\/svg/);
 const label=await owner.request('/api/management/bags/bag-002/label');assert.equal(label.status,200);assert.match(label.headers.get('content-type'),/text\/html/);
 assert.equal((await customer.request('/api/bags/exchange-request',{method:'POST',body:{bagId:'bag-001'}})).status,200);
 assert.equal((await owner.request('/api/management/bags',{method:'POST',body:{action:'exchange',oldBagId:'bag-001',newBagId:'bag-002'}})).status,200);
 assert.equal((await other.request('/api/claim',{method:'POST',body:{bagToken:h.fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true}})).status,409,'retired bag QR cannot be reclaimed');
 assert.equal((await owner.request('/api/management/accounts/customer2',{method:'POST',body:{action:'set_active',active:false}})).status,200);
 assert.equal((await other.request('/api/me')).status,401,'pausing an account revokes its active session');
 const unusedPassword='unused-private-password';
 const unused=await owner.request('/api/management/accounts',{method:'POST',body:{role:'customer',username:'unused-test',temporaryPassword:unusedPassword}});assert.equal(unused.status,200);
 assert.equal((await owner.request(`/api/management/accounts/${unused.data.user.id}`,{method:'POST',body:{action:'delete_account'}})).status,200);
 const deletedLogin=await h.anonymous('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'unused-test',password:unusedPassword})});assert.equal(deletedLogin.status,401);
 assert.equal((await owner.request('/api/management/accounts/customer',{method:'POST',body:{action:'delete_account'}})).status,409,'account history must be preserved');
 const contractor=await owner.request('/api/management/accounts',{method:'POST',body:{role:'contractor',username:'review-test',temporaryPassword:'contractor-review-pass'}});assert.equal(contractor.status,200);assert.equal(contractor.data.user.approved,false);
 assert.equal((await owner.request('/api/management/approve',{method:'POST',body:{userId:contractor.data.user.id}})).status,400);
 const approved=await owner.request('/api/management/approve',{method:'POST',body:{userId:contractor.data.user.id,phoneConfirmed:true,inPersonConfirmed:true}});assert.equal(approved.status,200);assert.equal(approved.data.user.approved,true);
});

test('role dashboards summarize only authorized product data',async t=>{
 const h=await harness(t),c=await h.client('customer'),other=await h.client('customer2'),contractor=await h.client('contractor'),owner=await h.client('owner');
 const order=await setupOrder(h,c);
 const customer=(await c.request('/api/dashboard')).data.dashboard;
 assert.equal(customer.bagCount,1);assert.equal(customer.activeOrders,1);assert.equal(customer.nextOrder.id,order.id);
 const stranger=(await other.request('/api/dashboard')).data.dashboard;
 assert.equal(stranger.activeOrders,0);assert.equal(stranger.nextOrder,null);
 const work=(await contractor.request('/api/dashboard')).data.dashboard;
 assert.equal(work.role,'contractor');assert.equal(work.activeJobs,0);assert.equal(work.offers,0,'Awaiting customer drop-off is not an offer');
 const scan={bagToken:h.fixtures.bagToken,stationToken:h.fixtures.stationToken};
 assert.equal((await action(c,order.id,'drop_off',scan)).status,200);
 assert.equal((await contractor.request('/api/availability',{method:'POST',body:{days:[shopDateKey()],preference:'both'}})).status,200);
 assert.equal((await action(contractor,order.id,'accept_job',{deadlineAcknowledged:true})).status,200);
 const assigned=(await contractor.request('/api/dashboard')).data.dashboard;
 assert.equal(assigned.nextJob.id,order.id);assert.equal(assigned.nextJob.customer_id,undefined);assert.equal(assigned.nextJob.detergent,undefined);
 const management=(await owner.request('/api/dashboard')).data.dashboard;
 assert.equal(management.role,'management');assert.equal(management.openOrders,1);
});

test('customer complaints are private, persistent and managed by staff',async t=>{
 const h=await harness(t),customer=await h.client('customer'),other=await h.client('customer2'),contractor=await h.client('contractor'),owner=await h.client('owner');
 const order=await setupOrder(h,customer);
 denied(await contractor.request('/api/complaints',{method:'POST',body:{orderId:order.id,category:'service',message:'Contractors cannot submit this.'}}));
 assert.equal((await other.request('/api/complaints')).data.complaints.length,0);
 denied(await other.request('/api/complaints',{method:'POST',body:{orderId:order.id,category:'service',message:'This order belongs to someone else.'}}));
 denied(await customer.request('/api/complaints',{method:'POST',body:{orderId:order.id,category:'bad',message:'This category is invalid.'}}));
 const created=await customer.request('/api/complaints',{method:'POST',body:{orderId:order.id,category:'late',message:'My laundry has not been returned on time.',status:'resolved',customer_id:'forged'}});
 assert.equal(created.status,200);assert.equal(created.data.complaint.status,'open');assert.equal(created.data.complaint.customer_id,'customer');
 assert.equal((await customer.request('/api/complaints')).data.complaints.length,1);
 let management=await owner.request('/api/management');assert.equal(management.data.complaints.length,1);
 const resolved=await owner.request(`/api/management/complaints/${created.data.complaint.id}`,{method:'POST',body:{status:'resolved'}});
 assert.equal(resolved.status,200);assert.equal(resolved.data.complaint.status,'resolved');assert.ok(resolved.data.complaint.resolved_at);
 await h.restart();
 const restoredOwner=await h.client('owner');management=await restoredOwner.request('/api/management');assert.equal(management.data.complaints[0].status,'resolved');
});

test('custody workflow rejects forged scans, unpaid pickup, duplicates and competing acceptance',async t=>{
 const h=await harness(t),c=await h.client('customer'),k=await h.client('contractor'),k2=await h.client('contractor2');
 const o=await setupOrder(h,c),scan={bagToken:h.fixtures.bagToken,stationToken:h.fixtures.stationToken};
 denied(await action(c,o.id,'drop_off',{...scan,bagToken:'forged'}));
 denied(await action(c,o.id,'drop_off',{...scan,stationToken:'forged'}));
 const key=randomUUID();
 const first=await action(c,o.id,'drop_off',scan,key);assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal(o.due_at,null,'Booking must not guess a deadline before verified drop-off');
 assert.match(first.data.order.due_at,/Z$/);assert.match(first.data.order.due_note,/verified shop drop-off/i);
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

test('secure login session survives a safe server restart',async t=>{
 const h=await harness(t),customer=await h.client('customer');
 assert.equal((await customer.request('/api/me')).status,200);
 await h.restart();
 const restored=await customer.request('/api/me');assert.equal(restored.status,200);assert.equal(restored.data.user.id,'customer');
 assert.equal((await customer.request('/api/logout',{method:'POST',body:{}})).status,200);
 assert.equal((await customer.request('/api/me')).status,401);
});

test('owner pricing changes are protected and new orders snapshot their rates',async t=>{
 const h=await harness(t),customer=await h.client('customer'),owner=await h.client('owner');
 const first={dropoff:3.25,full_service:4.5,rushPerLb:1.25,extraBag:12,contractor:1.5};
 denied(await customer.request('/api/management/pricing',{method:'POST',body:first}));
 assert.equal((await owner.request('/api/management/pricing',{method:'POST',body:{action:'set_pin',pin:'246810',confirmPin:'246810'}})).status,200);
 denied(await owner.request('/api/management/pricing',{method:'POST',body:{...first,pin:'111111'}}));
 const changed=await owner.request('/api/management/pricing',{method:'POST',body:{...first,pin:'246810'}});assert.equal(changed.status,200);assert.deepEqual(changed.data.pricing,first);assert.match(changed.data.effectiveAt,/Z$/);
 denied(await owner.request('/api/management/pricing',{method:'POST',body:{...first,dropoff:3.257,pin:'246810'}}));
 const order=await setupOrder(h,customer);assert.equal(order.customer_rate_per_lb,3.25);assert.equal(order.rush_rate_per_lb,1.25);assert.equal(order.contractor_rate_per_lb,1.5);
 const second={dropoff:4,full_service:5,rushPerLb:2,extraBag:15,contractor:2};assert.equal((await owner.request('/api/management/pricing',{method:'POST',body:{...second,pin:'246810'}})).status,200);
 const saved=(await customer.request('/api/orders')).data.orders[0];assert.equal(saved.customer_rate_per_lb,3.25);assert.equal(saved.contractor_rate_per_lb,1.5);
 const management=(await owner.request('/api/management')).data;assert.deepEqual(management.pricing,second);assert.equal(management.pricingPinSet,true);assert.equal(JSON.stringify(management).includes('246810'),false);
 const notices=(await customer.request('/api/notices')).data.notices;assert.equal(notices[0].type,'pricing');assert.deepEqual(notices[0].pricing,second);
});

test('owner business costs are validated, private and persistent',async t=>{
 const h=await harness(t),customer=await h.client('customer'),owner=await h.client('owner'),cost={action:'add',description:'Laundry supplies',category:'supplies',date:'2026-10-22',amount:24.75};
 denied(await customer.request('/api/management/costs',{method:'POST',body:cost}));
 denied(await owner.request('/api/management/costs',{method:'POST',body:{...cost,amount:-1}}));
 const added=await owner.request('/api/management/costs',{method:'POST',body:cost});assert.equal(added.status,200);assert.equal(added.data.cost.amount,24.75);
 assert.equal((await owner.request('/api/management')).data.businessCosts.length,1);
 await h.restart();const restored=await h.client('owner');const saved=(await restored.request('/api/management')).data.businessCosts;assert.equal(saved[0].description,'Laundry supplies');
 assert.equal((await restored.request('/api/management/costs',{method:'POST',body:{action:'delete',id:saved[0].id}})).status,200);assert.equal((await restored.request('/api/management')).data.businessCosts.length,0);
});
