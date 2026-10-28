/* GNARLY offline shell: same-origin app files ONLY, never private API,
 * backend music, user metadata, or cross-origin resources.
 * Downloaded music lives in per-profile IndexedDB; SW caches the interface.
 */
const SHELL='gnarly-web-shell-20261028-remote-mic-v3';
const PREFIX='gnarly-web-shell-';
const CORE=['/','/index.html','/app.js','/mic.html','/mic.js','/styles.css','/module-dock.css',
 '/performance.css','/ipod-mode.css','/karaoke-art.css','/karaoke-art-refined.css',
 '/karaoke-stage.css','/manifest.webmanifest','/assets/gnarly-icon.png'];
const ROOT_STATIC=['/logo.svg','/sw.js','/offline-assets.json'];
const STATIC_EXT=['.js','.mjs','.css','.png','.jpg','.jpeg','.webp','.svg'];
const staticURL=url=>{
 const p=url.pathname;
 return url.origin===self.location.origin&&(
  CORE.includes(p)||ROOT_STATIC.includes(p)||
  (['/assets/','/lib/','/ui/'].some(prefix=>p.startsWith(prefix))&&
   STATIC_EXT.some(ext=>p.endsWith(ext)))
 );
};
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  let urls=CORE;
  try{
   const response=await fetch('/offline-assets.json',{cache:'no-store'});
   if(response.ok){
    const assets=await response.json();
    if(Array.isArray(assets))urls=[...new Set([...CORE,...assets])].filter(url=>
     typeof url==='string'&&url.startsWith('/')&&staticURL(new URL(url,self.location.href)));
   }
  }catch{}
  // Store what is available, without making one optional asset fail install.
  await Promise.allSettled(urls.map(async path=>{
   const response=await fetch(path,{cache:'reload'});
   if(response.ok&&response.type!=='opaque')await cache.put(path,response);
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(x=>x.startsWith(PREFIX)&&x!==SHELL).map(x=>caches.delete(x)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||!staticURL(url))return;
 if(url.pathname.endsWith('/sw.js')||url.pathname.endsWith('/offline-assets.json'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(SHELL);
  try{
   const online=await fetch(request);
   if(online.ok&&online.type!=='opaque'){
    // Cache only app shell and static media; never intercepted remote music.
    event.waitUntil(cache.put(request,online.clone()).catch(()=>{}));
   }
   return online;
  }catch{
   const cached=await cache.match(request,{ignoreSearch:true});
   if(cached)return cached;
   if(request.mode==='navigate'){
    const home=await cache.match('/index.html')||await cache.match('/');
    if(home)return home;
   }
   return new Response('GNARLY offline: este recurso ainda não foi armazenado.',{
    status:503,headers:{'content-type':'text/plain; charset=utf-8'}
   });
  }
 })());
});
