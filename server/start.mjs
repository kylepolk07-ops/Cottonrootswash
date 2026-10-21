import {createApp} from './app.mjs';
const {server}=await createApp({fixtures:true});
server.listen(3000,'127.0.0.1',()=>console.log('Private synthetic staging listening on loopback port 3000. Fixture credentials: .runtime/fixtures.json (do not share or commit).'));
