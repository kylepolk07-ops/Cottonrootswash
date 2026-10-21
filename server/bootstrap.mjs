// The container starts as root only to initialize the mounted volume ownership.
// The application itself always runs as the image's unprivileged node user.
import {mkdirSync,chownSync,chmodSync} from 'node:fs';
if(process.getuid?.()===0){
 if(process.env.CRC_DEPLOYMENT==='railway'){
  mkdirSync('/data',{recursive:true,mode:0o700});chownSync('/data',1000,1000);chmodSync('/data',0o700);
 }
 process.setgroups([]);process.setgid(1000);process.setuid(1000);
}
await import('./start.mjs');
