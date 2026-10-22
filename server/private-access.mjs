import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
const digest=value=>createHash('sha256').update(value).digest();
const equal=(a,b)=>timingSafeEqual(digest(a),digest(b));
const nonce=()=>randomBytes(32).toString('hex');
const cookie=(req,name)=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
const destination=value=>value==='/contractor'?'/contractor':value==='/customer'?'/customer':value===undefined||value===null||value===''?'/':'/customer';
export function createPrivateAccess({origin,username,password,now=Date.now}){
 const consumed=new Map(),sessions=new Map(),attempts=new Map();
 const signingKey=randomBytes(32);
 const sign=value=>createHmac('sha256',signingKey).update(value).digest('hex');
 const newChallenge=()=>{const payload=nonce()+'.'+(now()+600000);return payload+'.'+sign(payload)};
 const validChallenge=value=>{const parts=value.split('.');if(parts.length!==3||!/^([a-f0-9]{64})$/.test(parts[0])||!/^\d{1,16}$/.test(parts[1]))return false;const expiry=Number(parts[1]);return Number.isSafeInteger(expiry)&&expiry>now()&&expiry<=now()+600000&&equal(parts[2],sign(parts[0]+'.'+parts[1]))};
 const secret=digest(password),basicSecret=digest(username+':'+password);
 const prune=map=>{for(const [key,value]of map)if(value.expires<=now())map.delete(key)};
 const css=readFileSync(new URL('../web/style.css',import.meta.url));
 return async function guard(req,res,headers){
  const url=new URL(req.url,origin);
  const send=(status,data)=>{res.writeHead(status,headers);res.end(data)};
  const html=(message='',next='/',status=200)=>{
   const current=cookie(req,'__Host-crc_access_csrf');
   const csrf=current&&validChallenge(current)&&!consumed.has(digest(current).toString('hex'))?current:newChallenge();
   headers['Set-Cookie']=`__Host-crc_access_csrf=${csrf}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`;
   headers['Content-Type']='text/html; charset=utf-8';
   headers['Referrer-Policy']='same-origin';
   send(status,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cotton Roots · Private test access</title><link rel="stylesheet" href="/access.css"></head><body><div class="shell"><header><p class="eyebrow">COTTON ROOTS &amp; CO.</p><h1>Private test access</h1><p>One little step. Fresh beginnings.</p></header><aside class="staging">Synthetic test only · no real payments or identity documents</aside><main><section class="card"><span class="icon" aria-hidden="true">🌿</span><h2>Enter your test access code</h2><p>This private code opens the test site. You will choose Customer or Contractor next.</p>${message?`<p role="alert" class="error">${message}</p>`:''}<form method="post" action="/access"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="next" value="${destination(next)}"><label for="access-code">Private access code</label><input id="access-code" name="password" type="password" required maxlength="256" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false"><button type="submit">Open private test</button></form><p class="muted">Use the code set by the owner. Keep it private and avoid spaces when copying.</p><p class="muted">This code does not grant Management access.</p></section></main></div></body></html>`);
  };
  if(url.pathname==='/favicon.ico'&&req.method==='GET'){res.writeHead(204,headers);res.end();return true}
  if(url.pathname==='/access.css'&&req.method==='GET'){headers['Content-Type']='text/css';send(200,css);return true}
  if(url.pathname==='/access'&&req.method==='GET'){html('',destination(url.searchParams.get('next')));return true}
  if(url.pathname==='/access'&&req.method==='POST'){
   if(req.headers.origin!==origin){headers['Content-Type']='text/plain';send(403,'Please reopen the private test link and try again.');return true}
   if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')){headers['Content-Type']='text/plain';send(415,'Use the private access form.');return true}
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>8192){headers['Content-Type']='text/plain';send(413,'The form is too large.');return true}chunks.push(chunk)}
   const body=new URLSearchParams(Buffer.concat(chunks).toString()),csrf=body.get('csrf')||'',cookieCsrf=cookie(req,'__Host-crc_access_csrf');
   prune(consumed);const challengeKey=digest(csrf).toString('hex');
   if(!csrf||!cookieCsrf||!equal(csrf,cookieCsrf)||!validChallenge(csrf)||consumed.has(challengeKey)){html('This form expired. Please enter your code again.',body.get('next'),403);return true}
   prune(attempts);const key=req.socket.remoteAddress||'unknown';let attempt=attempts.get(key);
   if(!attempt){if(attempts.size>=1000){headers['Content-Type']='text/plain';send(429,'Please try again later.');return true}attempt={count:0,expires:now()+60000};attempts.set(key,attempt)}
   if(++attempt.count>20){html('Too many attempts. Wait one minute, then try again.',body.get('next'),429);return true}
   if(consumed.size>=1000){html('Test access is busy. Please try again later.',body.get('next'),429);return true}
   consumed.set(challengeKey,{expires:Number(csrf.split('.')[1])});
   if(!timingSafeEqual(digest(body.get('password')||''),secret)){html('That code did not match. Copy the full active private access code and try again.',body.get('next'),401);return true}
   prune(sessions);if(sessions.size>=1000){html('Test access is busy. Please try again later.',body.get('next'),429);return true}
   const sid=nonce();sessions.set(digest(sid).toString('hex'),{expires:now()+8*3600000});
   headers['Set-Cookie']=[`__Host-crc_access=${sid}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,'__Host-crc_access_csrf=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'];
   headers.Location=destination(body.get('next'));send(303,'');return true;
  }
  const gateCookie=cookie(req,'__Host-crc_access');const gateSession=gateCookie&&sessions.get(digest(gateCookie).toString('hex'));
  if(gateSession&&gateSession.expires>now())return false;
  if(gateCookie)sessions.delete(digest(gateCookie).toString('hex'));
  // Retain explicit Basic clients for existing operator checks, without browser challenges.
  const authorization=req.headers.authorization;
  if(typeof authorization==='string'&&authorization.startsWith('Basic ')){
   const supplied=Buffer.from(authorization.slice(6),'base64').toString('utf8');
   if(timingSafeEqual(digest(supplied),basicSecret))return false;
  }
  if(req.method==='GET'&&!url.pathname.startsWith('/api/')){headers.Location='/access?next='+encodeURIComponent(destination(url.pathname));send(303,'');return true}
  headers['Content-Type']='application/json';send(401,JSON.stringify({error:'Private test access required',code:'private_access_required'}));return true;
 };
}
