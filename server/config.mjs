import {resolve} from 'node:path';
export function runtimeConfig(env=process.env){
 const remote=env.CRC_DEPLOYMENT==='railway';
 if(env.CRC_DEPLOYMENT&&!remote)throw Error('Unknown deployment mode');
 const port=Number(env.PORT||3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 if(!remote)return {host:'127.0.0.1',port,app:{fixtures:true}};
 if(env.RAILWAY_REPLICA_COUNT&&env.RAILWAY_REPLICA_COUNT!=='1')throw Error('SQLite staging requires one replica');
 if(env.CRC_DATA_DIR!=='/data'||env.RAILWAY_VOLUME_MOUNT_PATH!=='/data')throw Error('Attach a persistent Railway volume at /data');
 const remoteOrigin=env.CRC_PUBLIC_ORIGIN;
 if(!remoteOrigin)throw Error('Set CRC_PUBLIC_ORIGIN to the exact HTTPS staging origin');
 const u=new URL(remoteOrigin);
 if(u.origin!==remoteOrigin||u.protocol!=='https:'||u.username||u.password)throw Error('Exact HTTPS staging origin required');
 if(!env.CRC_STAGING_USER||env.CRC_STAGING_USER.includes(':')||!env.CRC_STAGING_PASSWORD||env.CRC_STAGING_PASSWORD.length<24)throw Error('Set private staging credentials; password minimum 24 characters');
 return {host:'0.0.0.0',port,app:{dataDir:resolve('/data'),fixtures:true,remoteOrigin,stagingUser:env.CRC_STAGING_USER,stagingPassword:env.CRC_STAGING_PASSWORD}};
}
