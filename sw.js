/* GNARLY offline shell: same-origin app files ONLY, never private API,
 * backend music, user metadata, or cross-origin resources.
 * Downloaded music lives in per-profile IndexedDB; SW caches the interface.
 */
const SHELL='gnarly-web-shell-20261031-published-search-css-v15';
const PREFIX='gnarly-web-shell-';
const CORE=['/','/index.html','/app.js','/mic.html','/mic.js','/styles.css','/module-dock.css',
 '/performance.css','/ipod-mode.css','/cover-charge.css','/karaoke-art.css','/karaoke-art-refined.css',
 '/karaoke-stage.css','/search-hierarchy.css','/manifest.webmanifest','/assets/gnarly-icon.png'];
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
  // Keep installation small and cheap. The original install fetched the
  // ENTIRE module graph in parallel, contending with startup and shader GPU
  // compilation, especially on the first navigation after each deployment.
  // Main modules and offline tracks are cached independently as they load.
  const essentials=['/','/index.html','/app.js','/styles.css','/search-hierarchy.css',
                    '/manifest.webmanifest','/logo.svg'];
  await Promise.allSettled(essentials.map(async path=>{
   const response=await fetch(path,{cache:'reload'});
   if(response.ok&&response.type!=='opaque')await cache.put(path,response);
  }));
  await self.skipWaiting();
 })());
});
// Complete optional offline assets only after the app signals it is idle.
// Never fetch third-party songs or model weights; two concurrent same-origin
// fetches cannot saturate Safari's connections or first-audio delivery.
let warming=null;
async function warmShell(){
 if(warming)return warming;
 warming=(async()=>{
  const cache=await caches.open(SHELL);
  let paths=[];
  try{
   const response=await fetch('/offline-assets.json',{cache:'no-store'});
   if(response.ok){const found=await response.json();if(Array.isArray(found))
    paths=[...new Set(found)].filter(p=>typeof p==='string'&&p.startsWith('/')&&
     staticURL(new URL(p,self.location.href)));
   }
  }catch{return}
  let cursor=0;
  await Promise.all([0,1].map(async()=>{
   while(cursor<paths.length){
    const path=paths[cursor++];
    try{
     if(await cache.match(path))continue;
     const response=await fetch(path,{cache:'reload'});
     if(response.ok&&response.type!=='opaque')await cache.put(path,response);
    }catch{}
   }
  }));
 })();
 try{await warming}finally{warming=null}
}
self.addEventListener('message',event=>{
 if(event.data?.type!=='GNARLY_WARM_SHELL')return;
 event.waitUntil(warmShell());
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
