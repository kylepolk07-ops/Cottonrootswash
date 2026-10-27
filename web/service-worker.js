self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={title:'Cotton Roots update',body:'Open Cotton Roots for an update.',url:'/customer'};try{data={...data,...event.data.json()}}catch{}
 event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/web/icon-192.png',badge:'/web/icon-192.png',data:{url:data.url||'/customer'},tag:'cotton-roots-order',renotify:true}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||'/customer',self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const client of clients)if(client.url.startsWith(self.location.origin)){client.navigate(target);return client.focus()}return self.clients.openWindow(target)}));
});
