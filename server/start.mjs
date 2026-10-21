import {createApp} from './app.mjs';
import {runtimeConfig} from './config.mjs';
const config=runtimeConfig();
const {server,close}=await createApp(config.app);
server.listen(config.port,config.host,()=>console.log(config.app.remoteOrigin?'Private synthetic staging started. Credentials are retained only on the private volume.':'Private synthetic staging listening on loopback port 3000. Fixture credentials: .runtime/fixtures.json (do not share or commit).'));
let stopping=false;
function stop(){if(stopping)return;stopping=true;server.close(()=>{close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
