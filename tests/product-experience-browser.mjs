// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/product-experience-browser.mjs
// Independent mobile product check. Uses isolated synthetic fixtures only.
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=mkdtempSync(resolve(tmpdir(),'cotton-product-browser-'));
const application=await createApp({dataDir:dir,fixtures:true});
await new Promise(resolveReady=>application.server.listen(0,'127.0.0.1',resolveReady));
const base=`http://127.0.0.1:${application.server.address().port}`;
const fixtures=JSON.parse(readFileSync(resolve(dir,'fixtures.json'),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago',reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function login(username,app){
 await page.goto(`${base}/${app}`);
 const account=fixtures.accounts.find(item=>item.username===username);
 await page.getByLabel('Username',{exact:true}).fill(account.username[0].toUpperCase()+account.username.slice(1));
 const password=page.getByLabel(/^(Password|Private code|6-digit PIN)$/);
 if(username==='customer'){
  await password.fill('wrong-preview-code');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('That sign-in did not match. Check your private code and try again.',{exact:true}).waitFor();
  assert.equal(await page.locator('#notice').evaluate(element=>element===document.activeElement),true,'sign-in error must move into focus');
 }
 await password.fill(account.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
}

async function post(path,body){
 return page.evaluate(async({path,body})=>{
  const me=await fetch('/api/me').then(response=>response.json());
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw Error(`${response.status}: ${data.error}`);
  return data;
 },{path,body});
}

async function assertMobileBasics(){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'page must not overflow horizontally');
 const undersized=await page.locator('button:visible').evaluateAll(buttons=>buttons.filter(button=>{
  const box=button.getBoundingClientRect();
  return box.width>0&&box.height>0&&(box.height<44||box.width<44);
 }).map(button=>({name:button.getAttribute('aria-label')||button.textContent?.trim(),width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height})));
 assert.deepEqual(undersized,[],'visible buttons must provide at least a 44px touch target');
 const unlabeled=await page.locator('main input:visible, main select:visible').evaluateAll(fields=>fields.filter(field=>!field.labels?.length&&!field.getAttribute('aria-label')).map(field=>field.outerHTML));
 assert.deepEqual(unlabeled,[],'visible form controls must have accessible labels');
 const smallSummaries=await page.locator('summary:visible').evaluateAll(items=>items.filter(item=>item.getBoundingClientRect().height<44).map(item=>item.textContent?.trim()));
 assert.deepEqual(smallSummaries,[],'expandable details must provide at least a 44px touch target');
}

try{
 await page.goto(base+'/');
 await page.getByRole('heading',{name:'How will you use Cotton Roots?',exact:true}).waitFor();
 await page.locator('summary[aria-label="About Customer accounts"]').click();
 await page.getByText(/register your bag, place an order/i).waitFor();
 await page.getByRole('link',{name:'Continue as Customer',exact:true}).waitFor();
 await page.getByRole('link',{name:'Continue as Contractor',exact:true}).waitFor();
 await assertMobileBasics();
 await login('customer','customer');
 await page.getByRole('heading',{name:'A little less laundry.',exact:true}).waitFor();
 await page.getByRole('button',{name:/Get your bag/}).waitFor();
 await page.getByRole('button',{name:/Book laundry/}).waitFor();
 await page.getByRole('heading',{name:'Easy as one, two, three.',exact:true}).waitFor();
 for(const text of ['Bring & scan','We wash & fold','Pay, then collect'])await page.getByText(text,{exact:true}).waitFor();
 const navPosition=await page.locator('nav').evaluate(element=>getComputedStyle(element).position);
 assert.ok(['fixed','sticky'].includes(navPosition),'reference-style navigation must remain anchored at the bottom');
 await assertMobileBasics();
 await page.setViewportSize({width:320,height:700});
 await assertMobileBasics();
 await page.setViewportSize({width:390,height:844});

 await page.getByRole('button',{name:/Book laundry/}).click();
 await page.getByRole('heading',{name:/book your laundry/i}).waitFor();
 await page.getByRole('button',{name:/Drop off/}).waitFor();
 const pickupChoice=page.getByRole('button',{name:/Pickup & return/});
 await pickupChoice.waitFor();
 assert.equal(await pickupChoice.isDisabled(),true,'unconnected pickup routing must remain visibly unavailable');
 await assertMobileBasics();

 await post('/api/claim',{bagToken:fixtures.bagToken,boxAcknowledged:true,lockedAcknowledged:true});
 const created=await post('/api/orders',{service:'dropoff',detergent:'standard',rush_requested:false});
 await post(`/api/orders/${created.order.id}/actions`,{action:'drop_off',bagToken:fixtures.bagToken,stationToken:fixtures.stationToken});
 await page.getByRole('button',{name:'My laundry',exact:true}).click();
 await page.getByText('Your laundry journey',{exact:true}).waitFor();
 await page.getByText('At the shop',{exact:true}).waitFor();

 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await login('contractor','contractor');
 await page.getByRole('heading',{name:'A good day to help.',exact:true}).waitFor();
 await page.getByRole('button',{name:'Offers',exact:true}).click();
 await page.getByRole('heading',{name:'Available offers',exact:true}).waitFor();
 await page.getByRole('button',{name:'Review this offer',exact:true}).waitFor();
 await page.getByRole('button',{name:'My jobs',exact:true}).click();
 await page.getByRole('heading',{name:'My jobs',exact:true}).waitFor();
 await page.getByText(/accepted work will appear here/i).waitFor();
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await page.getByRole('button',{name:/Step-by-step guide/}).click();
 const guideTitles=['Read the order.','Match the bag.','Weigh before you leave.','Wash with care.','Keep it simple.','Dry, fold, and check.','Return on your second visit.','Review your earnings.'];
 for(let index=0;index<guideTitles.length;index++){
  await page.getByRole('heading',{name:guideTitles[index],exact:true}).waitFor();
  assert.equal(await page.getByRole('progressbar',{name:'Guide progress'}).getAttribute('value'),String(index+1));
  if(index<guideTitles.length-1)await page.getByRole('button',{name:'Next guide step',exact:true}).click();
 }
 await page.getByText(/trial moves no money/i).waitFor();
 await page.getByRole('button',{name:'Previous guide step',exact:true}).waitFor();
 await page.getByRole('button',{name:'My pay',exact:true}).click();
 for(const label of ['pending','Approved for payout','paid'])await page.getByText(label,{exact:true}).waitFor();
 await assertMobileBasics();
 assert.deepEqual(errors,[],'browser must not report uncaught page errors');
 console.log('PASS product experience: customer dashboard, visual service choices, three-step story and custody timeline; contractor Today, separate Offers/My jobs, eight-step guide and pay summaries; anchored navigation, accessible labels, 44px touch targets, and no mobile overflow.');
}finally{
 await context.close();
 await browser.close();
 await new Promise(resolveClosed=>application.server.close(resolveClosed));
 application.close();
 rmSync(dir,{recursive:true,force:true});
}
