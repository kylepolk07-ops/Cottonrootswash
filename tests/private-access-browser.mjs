// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/private-access-browser.mjs
// A loopback-only TLS gateway uses an ephemeral localhost certificate trusted only by its exact public-key pin in this test browser. Provider proxy headers/Origin are simulated; no deployed-provider TLS claim.
import {mkdtempSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomBytes,createHash,X509Certificate} from 'node:crypto';
import {createApp} from '../server/app.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=mkdtempSync(join(tmpdir(),'cotton-access-browser-'));
const origin='https://cotton-test.onrender.com',password=randomBytes(32).toString('hex');
const app=await createApp({dataDir:dir,fixtures:true,remoteOrigin:origin,stagingUser:'trial',stagingPassword:password});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const fixtures=JSON.parse(readFileSync(join(dir,'fixtures.json'),'utf8'));
const keyPath=join(dir,'test-key.pem'),certPath=join(dir,'test-cert.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
const cert=readFileSync(certPath);
const pin=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
const gateway=https.createServer({key:readFileSync(keyPath),cert},(req,res)=>{
 const headers={...req.headers,host:new URL(origin).host,'x-forwarded-proto':'https'};
 // This loopback-only TLS UI harness maps browser Origin to the simulated HTTPS proxy origin.
 if(headers.origin===localOrigin)headers.origin=origin;
 const upstream=http.request({host:'127.0.0.1',port:app.server.address().port,path:req.url,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
 upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
});
await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
const localOrigin='https://localhost:'+gateway.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--ignore-certificate-errors-spki-list='+pin]});
const context=await browser.newContext({viewport:{width:390,height:844}});
const errors=[];
const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(localOrigin+'/contractor');
 await page.getByRole('heading',{name:'Enter your test access code'}).waitFor();
 assert.ok(page.url().includes('/access'));
 assert.equal(await page.getByLabel('Private access code',{exact:true}).count(),1);
 await page.getByLabel('Private access code',{exact:true}).fill('wrong-code');await page.getByRole('button',{name:'Open private test',exact:true}).click();
 await page.waitForLoadState('networkidle');
 const alertText=await page.getByRole('alert').textContent();assert.ok(alertText.includes('That code did not match.'),alertText);

 await page.getByLabel('Private access code',{exact:true}).fill(password);await page.getByRole('button',{name:'Open private test',exact:true}).click();
 await page.getByRole('heading',{name:'Welcome back',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/contractor');
 const cookies=await context.cookies(localOrigin);const access=cookies.find(c=>c.name==='__Host-crc_access');assert.ok(access?.secure&&access.httpOnly);assert.equal(access.sameSite,'Strict');
 const customer=fixtures.accounts.find(u=>u.username==='customer');
 await page.goto(localOrigin+'/customer');await page.getByLabel('Username',{exact:true}).fill(customer.username);await page.getByLabel('Password',{exact:true}).fill(customer.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('heading',{name:'Your laundry, step by step',exact:true}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Your laundry, step by step',exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=>(await fetch('/api/management')).status),403);
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 mkdirSync(resolve('test-results'),{recursive:true});
 await context.clearCookies();await page.goto(localOrigin+'/access?next=/customer');await page.screenshot({path:resolve('test-results/private-access-mobile.png'),fullPage:true});
 console.log('PASS phone-size browser access: normal form, wrong-code recovery, Secure/HttpOnly gate cookie, contractor redirect, separate customer account login, refreshed session, management denied; HTTPS proxy simulated.');
}catch(error){let text=await page.locator('body').innerText().catch(()=>'(no body)');for(const value of [password,...fixtures.accounts.map(a=>a.password),fixtures.bagToken,fixtures.stationToken])text=text.replaceAll(value,'[redacted]');console.error('Browser diagnostic:',text.slice(0,600));throw error;}finally{gateway.closeAllConnections();app.server.closeAllConnections();await context.close();await browser.close();await new Promise(r=>gateway.close(r));await new Promise(r=>app.server.close(r));app.close();rmSync(dir,{recursive:true,force:true})}
