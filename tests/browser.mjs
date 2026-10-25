// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser.mjs
// Uses isolated synthetic fixtures, never the retained staging database.
import {mkdtempSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=mkdtempSync(resolve(tmpdir(),'cotton-browser-'));
const payment={provider:'stripe',mode:'test',origin:'https://stripe-browser.example',secretKey:'sk_test_1234567890abcdef',webhookSecret:'whsec_1234567890abcdef',feeBps:290,feeFixedCents:30};
const application=await createApp({dataDir:dir,fixtures:true,payment,stripeFetch:async()=>({ok:true,json:async()=>({id:'cs_test_browser',url:'https://checkout.stripe.com/c/pay/cs_test_browser'})})});
await new Promise(r=>application.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${application.server.address().port}`;
const fixtures=JSON.parse(readFileSync(resolve(dir,'fixtures.json'),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago'});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const shotDir=resolve('test-results');mkdirSync(shotDir,{recursive:true});
const click=t=>page.getByRole('button',{name:t,exact:true}).click();
const scan=(title,value)=>page.locator(`[data-scan-title="${title}"]`).evaluate((input,token)=>{input.value=token},value);
const login=async(name,app)=>{await page.goto(base+'/'+app);const a=fixtures.accounts.find(x=>x.username===name);await page.getByLabel('Username',{exact:true}).fill(a.username);await page.getByLabel('Password',{exact:true}).fill(a.password);await click('Sign in');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor()};
const heading=t=>page.getByRole('heading',{name:t,exact:true}).waitFor();
try{
 await login('customer','customer');
 assert.equal(await page.locator('header').getByText('customer',{exact:true}).count(),1);assert.equal(await page.locator('body').getAttribute('data-session-role'),'customer');
 await page.goto(base+'/contractor');await page.waitForURL(base+'/customer');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
 await page.goto(base+'/');await page.waitForURL(base+'/customer');
 await click('Profile');await page.getByLabel('Name',{exact:true}).fill('Customer Test');await page.getByLabel('Phone',{exact:true}).fill('325-555-0101');await page.getByLabel('Email',{exact:true}).fill('customer@example.com');await page.getByLabel('Home or camper address',{exact:true}).fill('100 Test Street, Sweetwater, TX');await page.getByLabel('Where should deliveries be left?',{exact:true}).fill('Beside the porch chair');await click('Save and review');await page.getByRole('button',{name:'Verify my information',exact:true}).waitFor();await click('Verify my information');await page.getByText('✓ Verified',{exact:true}).waitFor();await page.getByRole('button',{name:'Edit information',exact:true}).waitFor();
 await click('My bags');await click('Scan and register my bag');
 assert.equal(await page.locator('input[data-scan-title]:visible').count(),0,'QR tokens must not have a visible typing field');
 await page.getByLabel('I took this bag from the box.').check();
 await scan('Scan the unique bag QR',fixtures.bagToken);
 await click('Next: close the box');await page.getByLabel('I shut and locked the box.').check();await click('Register this bag to me');await heading('Your Cotton Roots bags');
 await click('New order');await click('Next: choose detergent');await click('Next: review order');await click('Book this order');await heading('Your laundry, step by step');
 await click('Drop off this bag');await scan('Scan the matching bag QR','wrong-token');await click('Next: verify this drop-off');await click('VERIFY: I am dropping off this dirty bag at Cotton Roots & Company');await page.getByRole('status').filter({hasText:'Customer must verify the assigned bag'}).waitFor();
 await click('Cancel and scan again');await scan('Scan the matching bag QR',fixtures.bagToken);await click('Next: verify this drop-off');await click('VERIFY: I am dropping off this dirty bag at Cotton Roots & Company');await heading('Your laundry, step by step');
 await page.reload();await click('My laundry');await heading('Your laundry, step by step');await page.getByLabel('Laundry status',{exact:true}).waitFor();await page.getByRole('button',{name:'Refresh status',exact:true}).waitFor();assert.equal(await page.getByText('At the shop',{exact:true}).count(),1);
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/management');return r.status}),403);
 await page.screenshot({path:resolve(shotDir,'customer-mobile.png'),fullPage:true});
 await click('Sign out');await page.goto(base+'/?choose=1');await heading('What would you like to do?');await login('contractor','contractor');assert.equal(await page.locator('header').getByText('Washing Specialist',{exact:true}).count(),1);assert.equal(await page.locator('body').getAttribute('data-session-role'),'contractor');await click('Availability');
 const now=new Date(),dateLabel=now.toLocaleDateString('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric'});
 await page.getByLabel(dateLabel,{exact:true}).check();await click('Save availability');await page.getByRole('status').filter({hasText:'Availability saved.'}).waitFor();
 await click('Offers');await click('Review this offer');await page.getByLabel('I can meet this deadline.').check();await click('Confirm this step');await click('Scan bag & weigh');
 await scan('Scan the matching bag QR',fixtures.bagToken);await click('Next: weigh laundry');await page.getByLabel('Measured pounds',{exact:true}).fill('12.1');await click('Confirm this step');
 await page.getByText('12.5 lb',{exact:true}).waitFor();await click('Confirm shop checkout');await click('YES, I AM CHECKING OUT THIS BAG');
 await page.reload();await click('My jobs');await click('Scan bag on return');await scan('Scan the matching bag QR',fixtures.bagToken);await click('Confirm this step');await click('Check in at shop');await click('YES, I AM CHECKING IN THIS BAG');await page.getByText('Finished · payment pending',{exact:true}).waitFor();
 await click('My pay');await page.locator('.pill').filter({hasText:'Waiting for customer payment'}).waitFor();await page.screenshot({path:resolve(shotDir,'contractor-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/management');return r.status}),403);
 await click('Sign out');await login('customer','customer');await click('My laundry');await page.getByText(/TEST MODE ESTIMATE/).waitFor();await page.getByRole('button',{name:'Pay securely with card or Link',exact:true}).waitFor();
 await page.getByRole('button',{name:'Report a problem',exact:true}).click();await heading('Report a problem');await page.getByLabel('What is this about?').selectOption('late');await page.getByLabel('Tell us what happened').fill('This private test order needs a timing review.');await click('Send to Management');await page.getByText('Your report was sent to Management.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/management');return r.status}),403);
 await click('Sign out');await login('owner','contractor');await click('Management');await heading('Management');
 for(const [buttonName,headingName] of [['Customers','Customers'],['Washing Specialist applications','Washing Specialist applications & accounts'],['Bag inventory','Bag inventory'],['Money','Money'],['Orders','Orders'],['Late alerts','Late alerts'],['Customer complaints','Customer complaints'],['Text notifications','Text notifications'],['Pricing','Pricing'],['Pilot tools','Pilot tools']]){
  await page.getByRole('button',{name:new RegExp(`^${buttonName}`)}).click();await heading(headingName);if(buttonName==='Money'){await page.getByLabel('View',{exact:true}).selectOption('last_week');await page.getByText(/^Showing /).waitFor();await page.getByLabel('View',{exact:true}).selectOption('custom');await page.getByLabel('Start date',{exact:true}).waitFor();await page.getByLabel('End date',{exact:true}).waitFor()}await click('← Management home');await heading('Management');
 }
 await page.screenshot({path:resolve(shotDir,'management-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS mobile browser flow: claim, booking, wrong QR rejection, dropoff, persistent reload, availability, acceptance, rounded weight, checkout, complete, return, Stripe test estimate, complaint submission, pending earnings, customer/contractor management denial, and all nine owner Management workspaces. No browser exceptions.');
}finally{await context.close();await browser.close();await new Promise(r=>application.server.close(r));application.close();rmSync(dir,{recursive:true,force:true})}
