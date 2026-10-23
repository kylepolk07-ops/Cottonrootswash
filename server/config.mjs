import {resolve} from 'node:path';
import {stripeConfig} from './stripe-test.mjs';
import {twilioConfig} from './twilio.mjs';
export function runtimeConfig(env=process.env){
 const provider=env.CRC_DEPLOYMENT;
 const remote=['railway','render'].includes(provider);
 if(provider&&!remote)throw Error('Unknown deployment mode');
 const port=Number(env.PORT||3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 if(!remote)return {host:'127.0.0.1',port,app:{fixtures:true,payment:null}};
 if(provider==='railway'){
  if(env.RAILWAY_REPLICA_COUNT&&env.RAILWAY_REPLICA_COUNT!=='1')throw Error('SQLite staging requires one replica');
  if(env.CRC_DATA_DIR!=='/data'||env.RAILWAY_VOLUME_MOUNT_PATH!=='/data')throw Error('Attach a persistent Railway volume at /data');
 }
 const renderPersistent=provider==='render'&&env.CRC_DATA_DIR==='/var/data'&&env.RENDER_DISK_MOUNT_PATH==='/var/data';
 if(provider==='render'&&!renderPersistent&&env.CRC_EPHEMERAL_TEST!=='1')throw Error('Render trial must explicitly acknowledge disposable synthetic data, or attach the protected disk at /var/data');
 if(provider==='render'&&!renderPersistent&&(env.CRC_DATA_DIR||env.RENDER_DISK_MOUNT_PATH))throw Error('Render persistent storage must use /var/data for both disk variables');
 const remoteOrigin=env.CRC_PUBLIC_ORIGIN||(provider==='render'?env.RENDER_EXTERNAL_URL:null);
 if(!remoteOrigin)throw Error('Set the exact HTTPS staging origin');
 const u=new URL(remoteOrigin);
 if(u.origin!==remoteOrigin||u.protocol!=='https:'||u.username||u.password)throw Error('Exact HTTPS staging origin required');
 const disposable=provider==='render'&&!renderPersistent;
 const accountLoginOnly=env.CRC_ACCOUNT_LOGIN_ONLY==='1';
 if(accountLoginOnly&&disposable)throw Error('Account-login-only mode requires persistent storage');
 if(!accountLoginOnly){
  const validStagingPassword=disposable?/^\d{6}$/.test(env.CRC_STAGING_PASSWORD||'')||(env.CRC_STAGING_PASSWORD||'').length>=24:(env.CRC_STAGING_PASSWORD||'').length>=24;
  if(!env.CRC_STAGING_USER||env.CRC_STAGING_USER.includes(':')||!validStagingPassword)throw Error(disposable?'Set a six-digit private preview PIN':'Set private staging credentials; password minimum 24 characters');
 }
 const fixturePasswords={};
 if(provider==='render'&&env.CRC_PAYMENT_PROVIDER!=='stripe_live'){
  for(const [user,key] of [['customer','CRC_CUSTOMER_PASSWORD'],['contractor','CRC_CONTRACTOR_PASSWORD'],['owner','CRC_OWNER_PASSWORD']]){
   if(!env[key]||env[key].length<24||env[key].length>256)throw Error('Private trial fixture passwords required (24–256 characters)');
   fixturePasswords[user]=env[key];
  }
 }
 const payment=stripeConfig(env,remoteOrigin);
 if(payment?.mode==='live'&&(disposable||!accountLoginOnly||env.CRC_LIVE_PAYMENTS!=='1'))throw Error('Live Stripe requires persistent storage, individual account login, and CRC_LIVE_PAYMENTS=1');
 let initialOwner=null;if(payment?.mode==='live'){const username=String(env.CRC_INITIAL_OWNER_USER||'').trim().toLowerCase(),password=String(env.CRC_INITIAL_OWNER_PASSWORD||'');if(!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username)||password.length<24||password.length>256)throw Error('Live Stripe requires a first owner username and 24–256 character password');initialOwner={username,password}}
 if(env.CRC_BOX_LOCK_CODE!==undefined&&!/^\d{4}$/.test(env.CRC_BOX_LOCK_CODE))throw Error('Box lock code must be exactly four digits');
 return {host:'0.0.0.0',port,app:{dataDir:resolve(provider==='railway'?'/data':renderPersistent?'/var/data':'/tmp/cotton-roots-trial'),fixtures:payment?.mode!=='live',initialOwner,remoteOrigin,stagingUser:env.CRC_STAGING_USER,stagingPassword:env.CRC_STAGING_PASSWORD,privateGate:!accountLoginOnly,fixturePasswords,disposable,payment,notifications:twilioConfig(env),boxLockCode:env.CRC_BOX_LOCK_CODE||null}};
}
