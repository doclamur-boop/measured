'use strict';
const VERSION='measured-v22.0.1';
const CORE=['./','./index.html','./styles.css?v=22.0','./db.js?v=22.0','./charts.js?v=22.0','./app.js?v=22.0','./manifest.webmanifest','./icon-v22-192.png','./icon-v22-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)));});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(VERSION).then(c=>c.put('./index.html',copy));return r;}).catch(()=>caches.match('./index.html')));return;}e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));});


