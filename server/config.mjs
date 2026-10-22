import {resolve} from 'node:path';
import {stripeTestConfig} from './stripe-test.mjs';
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
 }else if(env.CRC_EPHEMERAL_TEST!=='1')throw Error('Render trial must explicitly acknowledge disposable synthetic data');
 const remoteOrigin=env.CRC_PUBLIC_ORIGIN||(provider==='render'?env.RENDER_EXTERNAL_URL:null);
 if(!remoteOrigin)throw Error('Set the exact HTTPS staging origin');
 const u=new URL(remoteOrigin);
 if(u.origin!==remoteOrigin||u.protocol!=='https:'||u.username||u.password)throw Error('Exact HTTPS staging origin required');
 const validStagingPassword=provider==='render'?/^\d{6}$/.test(env.CRC_STAGING_PASSWORD||'')||(env.CRC_STAGING_PASSWORD||'').length>=24:(env.CRC_STAGING_PASSWORD||'').length>=24;
 if(!env.CRC_STAGING_USER||env.CRC_STAGING_USER.includes(':')||!validStagingPassword)throw Error(provider==='render'?'Set a six-digit private preview PIN':'Set private staging credentials; password minimum 24 characters');
 const fixturePasswords={};
 if(provider==='render'){
  for(const [user,key] of [['customer','CRC_CUSTOMER_PASSWORD'],['contractor','CRC_CONTRACTOR_PASSWORD'],['owner','CRC_OWNER_PASSWORD']]){
   if(!env[key]||env[key].length<24||env[key].length>256)throw Error('Private trial fixture passwords required (24–256 characters)');
   fixturePasswords[user]=env[key];
  }
 }
 const payment=stripeTestConfig(env,remoteOrigin);
 return {host:'0.0.0.0',port,app:{dataDir:resolve(provider==='railway'?'/data':'/tmp/cotton-roots-trial'),fixtures:true,remoteOrigin,stagingUser:env.CRC_STAGING_USER,stagingPassword:env.CRC_STAGING_PASSWORD,fixturePasswords,disposable:provider==='render',payment}};
}
