// Generate actual-screen captures with isolated disposable fixtures, then the PDF.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/phone-walkthrough.mjs
import {mkdtempSync,readFileSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=mkdtempSync(resolve(tmpdir(),'cotton-walkthrough-'));
const application=await createApp({dataDir:dir,fixtures:true});
await new Promise(r=>application.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${application.server.address().port}`;
const fixtures=JSON.parse(readFileSync(resolve(dir,'fixtures.json'),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago'});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const shotDir=resolve('test-results/walkthrough');mkdirSync(shotDir,{recursive:true});
const captures=[];
const click=t=>page.getByRole('button',{name:t,exact:true}).click();
const heading=t=>page.getByRole('heading',{name:t,exact:true}).waitFor();
const login=async(name,app)=>{await page.goto(base+'/'+app);const a=fixtures.accounts.find(x=>x.username===name);await page.getByLabel('Username',{exact:true}).fill(a.username);await page.getByLabel('Password',{exact:true}).fill(a.password);await click('Sign in');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor()};
async function capture(filename,title,caption){
 // Refuse screenshots while any fixture password or token is present in form fields.
 const values=await page.locator('input').evaluateAll(inputs=>inputs.map(i=>i.value));
 for(const value of values)assert.ok(![fixtures.bagToken,fixtures.stationToken,...fixtures.accounts.map(a=>a.password)].includes(value),'Credential present in screenshot field');
 const text=await page.locator('body').innerText();
 for(const secret of [fixtures.bagToken,fixtures.stationToken,...fixtures.accounts.map(a=>a.password)])assert.ok(!text.includes(secret),'Credential present in screenshot text');
 await page.evaluate(()=>window.scrollTo(0,0));
 const path=resolve(shotDir,filename+'.png');await page.screenshot({path,fullPage:false});captures.push({path,title,caption});
}
try{
 await login('customer','customer');
 await click('My bags');await click('Claim a bag at the box');
 await page.getByLabel('I scanned the QR inside the lid. I am taking a bag.').check();await page.getByLabel('Scan your unique bag QR',{exact:true}).fill(fixtures.bagToken);
 await click('Next: close the box');await page.getByLabel('I shut and locked the box.').check();await click('Claim this bag');await heading('Your Cotton Roots bags');
 await click('New order');await capture('01-book','Customer: book laundry','Choose drop-off service. The interface keeps each question on a simple guided screen.');
 await click('Next: detergent');await click('Review order');await click('Create order');await heading('Your laundry, step by step');
 await click('Drop off this bag');await capture('02-dropoff','Customer: shop drop-off','Scan the matching bag and the shop station. The server checks ownership and the expected step.');
 await page.getByLabel('Scan the matching bag QR',{exact:true}).fill('wrong-token');await page.getByLabel('Scan the shop station QR',{exact:true}).fill(fixtures.stationToken);await click('Confirm this step');await page.getByRole('status').filter({hasText:'Bag owner and wall QR must be verified'}).waitFor();
 await page.getByLabel('Scan the matching bag QR',{exact:true}).fill(fixtures.bagToken);await click('Confirm this step');await heading('Your laundry, step by step');
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/management');return r.status}),403);
 await click('Sign out');await login('contractor','contractor');await click('Availability');
 const dateLabel=new Date().toLocaleDateString('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric'});await page.getByLabel(dateLabel,{exact:true}).check();await click('Save availability');await page.getByRole('status').filter({hasText:'Availability saved.'}).waitFor();
 await click('Jobs');await click('Review this offer');await capture('03-offer','Contractor: review the offer','The contractor sees the synthetic test deadline and must acknowledge being able to meet it.');
 await page.getByLabel('I can meet this deadline.').check();await click('Confirm this step');await click('Scan bag & weigh');await page.getByLabel('Measured pounds',{exact:true}).fill('12.1');await capture('04-weigh','Contractor: scan and weigh','Record the measured weight. The shared rules round 12.1 lb upward to 12.5 lb.');
 await page.getByLabel('Scan the matching bag QR',{exact:true}).fill(fixtures.bagToken);await click('Confirm this step');await page.getByText('12.5 lb',{exact:true}).waitFor();await click('Scan station & check out');await page.getByLabel('Scan the shop station QR',{exact:true}).fill(fixtures.stationToken);await click('Confirm this step');
 await click('Laundry is clean');await click('Confirm this step');await click('Scan bag on return');await page.getByLabel('Scan the matching bag QR',{exact:true}).fill(fixtures.bagToken);await click('Confirm this step');await click('Check in at shop');await capture('05-return','Contractor: return to the shop','Returning is a separate visit: finish laundry, scan its bag, then scan the shop station to check it in.');
 await page.getByLabel('Scan the shop station QR',{exact:true}).fill(fixtures.stationToken);await click('Confirm this step');await page.getByText('payment pending',{exact:true}).waitFor();await capture('06-pending','Returned, awaiting payment','Returned laundry stays payment pending. There is no pretend paid toggle, and pickup remains blocked.');
 await click('My pay');await page.getByText('status: pending',{exact:true}).waitFor();await capture('07-earnings','Contractor: pending earnings','The pay screen records pending work. No Square checkout, payout or real money is connected.');
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/management');return r.status}),403);
 await click('Sign out');await login('owner','contractor');await click('Management');await heading('Management');await page.getByRole('heading',{name:'Synthetic test codes',exact:true}).evaluate(h=>h.closest('section').remove());await capture('08-management','Management: owner access','Management requires the owner role. The sample-code card is omitted from this preview; customer and contractor access was denied.');
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(shotDir,'captures.json'),JSON.stringify(captures,null,2));
 execFileSync('python',['scripts/phone-walkthrough.py',resolve(shotDir,'captures.json'),'/workspace/Cotton-Roots-Phone-Walkthrough.pdf'],{stdio:'inherit'});
 console.log('PASS actual-screen walkthrough: 8 credential-free captures, guided custody through pending payment, role denial, no browser exceptions.');
}finally{await context.close();await browser.close();await new Promise(r=>application.server.close(r));application.close();rmSync(dir,{recursive:true,force:true})}
