import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
const origin='https://private-test.onrender.com';
const random=()=>randomBytes(24).toString('hex');
async function harness(t){
 const dataDir=await mkdtemp(join(tmpdir(),'cotton-access-review-')),password=random();
 const app=await createApp({dataDir,fixtures:true,remoteOrigin:origin,stagingUser:'trial',stagingPassword:password});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.close();await rm(dataDir,{recursive:true,force:true})});
 const fixtures=JSON.parse(await readFile(join(dataDir,'fixtures.json'),'utf8'));
 function request(path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:app.server.address().port,path,method,headers:{host:new URL(origin).host,'x-forwarded-proto':'https',...headers}},res=>{
   let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));
  });req.on('error',reject);req.end(body);
 })}
 return {request,password,fixtures};
}
import {createPrivateAccess} from '../server/private-access.mjs';
function form(r){return {csrf:r.text.match(/name="csrf" value="([^"]+)"/)[1],cookie:r.headers['set-cookie'][0].split(';')[0]}}
function submit(request,f,password,{originHeader=origin,csrf=f.csrf,cookie=f.cookie,next='/customer'}={}){
 return request('/access',{method:'POST',headers:{origin:originHeader,cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,password,next}).toString()});
}
function gateCookie(r){return r.headers['set-cookie'].find(c=>c.startsWith('__Host-crc_access=')).split(';')[0]}
async function isolated(t){
 let time=1000;const password=random();
 const guard=createPrivateAccess({origin,username:'trial',password,now:()=>time});
 const server=http.createServer(async(req,res)=>{const headers={'Cache-Control':'no-store'};try{if(!await guard(req,res,headers)){res.writeHead(200,headers);res.end('authorized')}}catch{res.writeHead(500);res.end('failed')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 function request(path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}))});req.on('error',reject);req.end(body)})}
 return {password,request,advance:n=>time+=n};
}

test('private access integrated: form gate stays private, exact host/HTTPS required and account auth stays separate',async t=>{
 const h=await harness(t);
 const page=await h.request('/access?next=https://attacker.example');assert.equal(page.status,200);assert.match(page.text,/name="next" value="\/customer"/);assert.equal(page.headers['www-authenticate'],undefined);
 assert.ok(!page.text.includes(h.password));
 assert.equal((await h.request('/access.css')).status,200);
 for(const path of ['/customer','/contractor','/web/app.mjs','/.runtime/fixtures.json','/access/../api/management','/access%2f../api/management']){
  const r=await h.request(path);assert.ok([303,401].includes(r.status),path);assert.equal(r.headers['www-authenticate'],undefined);assert.ok(!r.text.includes(h.fixtures.bagToken));
 }
 assert.equal((await h.request('/access',{headers:{host:'attacker.example'}})).status,403);
 assert.equal((await h.request('/access',{headers:{'x-forwarded-proto':'http'}})).status,403);
 const f=form(page);const unlocked=await submit(h.request,f,h.password,{next:'/contractor'});assert.equal(unlocked.status,303);assert.equal(unlocked.headers.location,'/contractor');
 const access=gateCookie(unlocked);
 assert.match(unlocked.headers['set-cookie'][0],/; Secure;/);assert.match(unlocked.headers['set-cookie'][0],/HttpOnly/);assert.match(unlocked.headers['set-cookie'][0],/SameSite=Strict/);assert.match(unlocked.headers['set-cookie'][0],/Path=\//);assert.doesNotMatch(unlocked.headers['set-cookie'][0],/Domain=/);
 assert.equal((await h.request('/customer',{headers:{cookie:access}})).status,200);
 assert.equal((await h.request('/api/me',{headers:{cookie:access}})).status,401,'Outer gate alone cannot sign into an account');
 const staleBasic='Basic '+Buffer.from('trial:incorrect-old-password').toString('base64');
 assert.equal((await h.request('/contractor',{headers:{cookie:access,authorization:staleBasic}})).status,200,'Valid cookie must take precedence over stale Basic');
 const customer=h.fixtures.accounts.find(a=>a.username==='customer');
 const login=await h.request('/api/login',{method:'POST',headers:{cookie:access,origin,'content-type':'application/json'},body:JSON.stringify({username:customer.username,password:customer.password})});assert.equal(login.status,200);
 const account=login.headers['set-cookie'][0].split(';')[0];
 assert.equal((await h.request('/api/me',{headers:{cookie:account}})).status,401,'Account cookie cannot bypass private gate');
 assert.equal((await h.request('/api/me',{headers:{cookie:access+'; '+account}})).status,200);
 assert.equal((await h.request('/api/management',{headers:{cookie:access+'; '+account}})).status,403,'Customer account cannot gain management');
});

test('private access rejects CSRF forgery, cross-site/missing Origin, wrong codes and consumed challenge replay',async t=>{
 const h=await isolated(t);
 for(const originHeader of ['https://attacker.example','']){
  const f=form(await h.request('/access'));assert.equal((await submit(h.request,f,h.password,{originHeader})).status,403);
 }
 for(const options of [{csrf:random()},{cookie:'__Host-crc_access_csrf='+random()},{cookie:''}]){
  const f=form(await h.request('/access'));assert.equal((await submit(h.request,f,h.password,options)).status,403);
 }
 const f=form(await h.request('/access'));
 const wrong=await submit(h.request,f,'wrong-'+random());assert.equal(wrong.status,401);assert.equal(wrong.headers['www-authenticate'],undefined);assert.ok(!wrong.headers['set-cookie'].some(c=>c.startsWith('__Host-crc_access=')));
 assert.equal((await submit(h.request,f,h.password)).status,403,'Failed form challenge is consumed');
 const good=form(await h.request('/access'));const unlocked=await submit(h.request,good,h.password);assert.equal(unlocked.status,303);
 assert.equal((await submit(h.request,good,h.password)).status,403,'Successful form challenge cannot be replayed');
 assert.equal((await h.request('/customer',{headers:{cookie:'__Host-crc_access='+random()}})).status,303,'Forged opaque session rejected');
 assert.equal((await h.request('/customer',{headers:{cookie:gateCookie(unlocked)}})).status,200);
});

test('private access expires challenges and sessions and only permits whitelisted destinations',async t=>{
 const h=await isolated(t);const expired=form(await h.request('/access'));h.advance(600000);
 assert.equal((await submit(h.request,expired,h.password)).status,403);
 const fresh=form(await h.request('/access'));const unlocked=await submit(h.request,fresh,h.password,{next:'//attacker.example/x'});assert.equal(unlocked.headers.location,'/customer');
 const cookie=gateCookie(unlocked);assert.ok(!cookie.includes(h.password));
 assert.equal((await h.request('/customer',{headers:{cookie}})).status,200);
 h.advance(8*3600000);
 assert.equal((await h.request('/api/orders',{headers:{cookie}})).status,401);
 assert.equal((await h.request('/customer',{headers:{cookie}})).status,303);
});

test('private access limits form size, format and password-attempt rate',async t=>{
 const h=await isolated(t);
 assert.equal((await h.request('/access',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,415);
 assert.equal((await h.request('/access',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:'x='.padEnd(8193,'x')})).status,413);
 let last;
 for(let n=0;n<21;n++){const f=form(await h.request('/access'));last=await submit(h.request,f,'wrong-'+random());assert.equal(last.status,n<20?401:429)}
 h.advance(60001);const f=form(await h.request('/access'));assert.equal((await submit(h.request,f,h.password)).status,303,'Rate limiter resets after the window');
});

test('private access signed challenges do not exhaust form capacity after many public GETs',async t=>{
 const h=await isolated(t);const first=form(await h.request('/access'));
 for(let n=0;n<1050;n++){
  const r=await h.request('/access');assert.equal(r.status,200,`GET ${n+1} must not exhaust nonce state`);
 }
 assert.equal((await submit(h.request,first,h.password)).status,303,'An unexpired signed challenge remains usable after many other GETs');
});

test('private access rejects forged matching form/cookie signatures, timestamp edits and cross-instance challenges',async t=>{
 const h=await isolated(t),other=await isolated(t);const original=form(await h.request('/access'));
 const parts=original.csrf.split('.');assert.equal(parts.length,3);
 const tampered=[
  [parts[0].replace(/^./,parts[0][0]==='a'?'b':'a'),parts[1],parts[2]].join('.'),
  [parts[0],String(Number(parts[1])+1),parts[2]].join('.'),
  [parts[0],String(Number(parts[1])+600001),parts[2]].join('.'),
  [parts[0],parts[1],parts[2].replace(/^./,parts[2][0]==='a'?'b':'a')].join('.'),
  random()+'.601000.'+random(),
  original.csrf+'.extra',
  [parts[0],'NaN',parts[2]].join('.'),
  [parts[0],'9007199254740992',parts[2]].join('.')
 ];
 for(const csrf of tampered){
  const forged={csrf,cookie:'__Host-crc_access_csrf='+csrf};
  assert.equal((await submit(h.request,forged,h.password)).status,403,'Matching attacker-controlled form and cookie must also require a valid signature');
 }
 const otherForm=form(await other.request('/access'));
 assert.equal((await submit(h.request,otherForm,h.password)).status,403,'Challenge from another process signing key rejected');
 assert.equal((await submit(h.request,original,h.password)).status,303,'Original signed challenge remains valid after rejected forgeries');
});

test('private access form preserves browser Origin and CSRF across favicon requests and repeated tabs',async t=>{
 const h=await harness(t);
 const initial=await h.request('/access?next=/contractor'),f=form(initial);
 assert.equal(initial.headers['referrer-policy'],'same-origin','Native same-origin form submission must retain its Origin');
 const icon=await h.request('/favicon.ico',{headers:{cookie:f.cookie}});
 assert.equal(icon.status,204);assert.equal(icon.text,'');assert.equal(icon.headers['set-cookie'],undefined);assert.equal(icon.headers.location,undefined);assert.equal(icon.headers['www-authenticate'],undefined);
 for(const secret of [h.password,h.fixtures.bagToken,h.fixtures.stationToken,...h.fixtures.accounts.map(a=>a.password)])assert.ok(!icon.text.includes(secret));
 const second=await h.request('/access?next=/customer',{headers:{cookie:f.cookie}}),third=await h.request('/access?next=/contractor',{headers:{cookie:f.cookie}});
 assert.equal(form(second).csrf,f.csrf);assert.equal(form(third).csrf,f.csrf);assert.equal(form(second).cookie,f.cookie);assert.equal(second.headers['referrer-policy'],'same-origin');
 const submitted=await submit(h.request,f,h.password,{next:'/contractor'});assert.equal(submitted.status,303);assert.equal(submitted.headers.location,'/contractor','Original visible form remains usable after incidental requests');
 const consumed=await h.request('/access',{headers:{cookie:f.cookie}});assert.notEqual(form(consumed).csrf,f.csrf,'Consumed nonce must not be reused in a new form');
 const failed=await submit(h.request,form(consumed),'wrong-'+random());assert.equal(failed.status,401);assert.equal(failed.headers['referrer-policy'],'same-origin','Recoverable form error retains browser submission policy');
});
