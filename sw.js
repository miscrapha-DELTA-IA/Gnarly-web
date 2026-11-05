/* GNARLY offline shell.
 * App resources: same-origin only. Audio: per-profile IndexedDB only.
 * Artwork: bounded public image CDN responses, never APIs, signed media,
 * bearer credentials, music metadata responses, or remote audio.
 */
const SHELL='gnarly-web-shell-20261104-offline-v1';
const PREFIX='gnarly-web-shell-';
const ARTWORK_CACHE='gnarly-web-public-artwork-v1';
const ARTWORK_LIMIT=64;
const CORE=['/','/index.html','/app.js','/gnarly-ui.css','/mic.html','/mic.js',
 '/styles.css','/module-dock.css','/performance.css','/ipod-mode.css',
 '/cover-charge.css','/karaoke-art.css','/karaoke-art-refined.css',
 '/karaoke-stage.css','/search-hierarchy.css','/manifest.webmanifest',
 '/logo.svg','/assets/gnarly-icon.png'];
const ROOT_STATIC=['/sw.js','/offline-assets.json','/basic-pitch-worker.js'];
const STATIC_EXT=['.js','.mjs','.css','.png','.jpg','.jpeg','.webp','.svg'];
const staticURL=url=>{
 const p=url.pathname;
 return url.origin===self.location.origin&&(
  CORE.includes(p)||ROOT_STATIC.includes(p)||
  (['/assets/','/lib/','/ui/','/chunks/'].some(prefix=>p.startsWith(prefix))&&
   STATIC_EXT.some(ext=>p.endsWith(ext)))
 );
};
function publicArtworkURL(source){
 try{
  if(typeof source!=='string'||source.length>1200)return null;
  const url=new URL(source);
  if(url.protocol!=='https:'||url.username||url.password||
     url.origin===self.location.origin)return null;
  const host=url.hostname.toLowerCase();
  if(!(
   host==='i.ytimg.com'||host==='img.youtube.com'||
   /(?:^|\.)mzstatic\.com$/.test(host)||
   /^lh[3456]\.googleusercontent\.com$/.test(host)||
   host==='cdn-images.dzcdn.net'||
   host==='coverartarchive.org'
  ))return null;
  // Do not persist signed URLs, private CDN responses or expiring tokens.
  if(/[?&](?:sig|signature|token|key|expires|authorization|auth|x-amz-)/i.test(url.search))return null;
  return url.href;
 }catch{return null}
}
const playableResponse=response=>response&&(response.ok||response.type==='opaque');
async function storeArtwork(request,response){
 if(!playableResponse(response))return false;
 const cache=await caches.open(ARTWORK_CACHE);
 if(await cache.match(request))return true;
 await cache.put(request,response.clone());
 const keys=await cache.keys();
 if(keys.length>ARTWORK_LIMIT){
  // CacheStorage preserves insertion order. Evict the oldest, never R2/audio.
  await Promise.all(keys.slice(0,keys.length-ARTWORK_LIMIT).map(key=>cache.delete(key)));
 }
 return true;
}
async function prefetchCovers(urls){
 if(!Array.isArray(urls))return;
 const unique=[...new Set(urls.slice(0,12).map(publicArtworkURL).filter(Boolean))].slice(0,8);
 for(const url of unique){
  try{
   const request=new Request(url,{mode:'no-cors',credentials:'omit'});
   const cache=await caches.open(ARTWORK_CACHE);
   if(await cache.match(request))continue;
   const response=await fetch(request);
   await storeArtwork(request,response);
  }catch{/* CDNs may be unavailable or browser quotas may be exceeded. */}
 }
}
function offlineFallback(cache,request){
 return cache.match(request,{ignoreSearch:true});
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  // A PWA must have a self-contained STARTUP, not only its HTML. The hashed
  // lazy chunks are loaded from the generated build manifest BEFORE the new
  // SW may replace the last working version. A failed install keeps that old
  // active worker and cache. Two at a time avoids audio/startup contention.
  const manifest=await fetch('/offline-assets.json',{cache:'reload'});
  if(!manifest.ok)throw Error('GNARLY offline manifest missing');
  const manifestForCache=manifest.clone();
  const assets=await manifest.json();
  if(!Array.isArray(assets))throw Error('GNARLY offline manifest invalid');
  const required=[...new Set([
   '/', '/index.html','/app.js','/gnarly-ui.css','/manifest.webmanifest',
   '/logo.svg','/assets/gnarly-icon.png','/mic.html','/mic.js',
   ...assets.filter(p=>typeof p==='string'&&
    (p.startsWith('/chunks/')&&/\.js$/.test(p)||
     p==='/basic-pitch-worker.js'))
  ])];
  // Always cache the manifest, so later warmups can recover after a page
  // resumes online without relying on untrusted network configuration.
  await cache.put('/offline-assets.json',manifestForCache);
  let next=0;
  await Promise.all([0,1].map(async()=>{
   while(next<required.length){
    const path=required[next++];
    const response=await fetch(path,{cache:'reload'});
    if(!response.ok||response.type==='opaque')
     throw Error('GNARLY essential offline resource unavailable: '+path);
    await cache.put(path,response);
   }
  }));
  await self.skipWaiting();
 })());
});
let warming=null;
async function warmShell(){
 if(warming)return warming;
 warming=(async()=>{
  const cache=await caches.open(SHELL);
  let paths=[];
  try{
   const old=await cache.match('/offline-assets.json');
   const response=await fetch('/offline-assets.json',{cache:'no-store'}).catch(()=>old);
   if(response?.ok){
    const list=await response.json();
    if(Array.isArray(list))paths=[...new Set(list)].filter(p=>typeof p==='string'&&p.startsWith('/')&&
      staticURL(new URL(p,self.location.href)));
   }
  }catch{return}
  let index=0;
  await Promise.all([0,1].map(async()=>{
   while(index<paths.length){
    const path=paths[index++];
    try{
     if(await cache.match(path))continue;
     const response=await fetch(path,{cache:'reload'});
     if(response.ok&&response.type!=='opaque')await cache.put(path,response);
    }catch{/* Never block the player because an optional asset is missing. */}
   }
  }));
 })();
 try{await warming}finally{warming=null}
}
self.addEventListener('message',event=>{
 if(event.data?.type==='GNARLY_WARM_SHELL'){
  event.waitUntil(warmShell());
 }else if(event.data?.type==='GNARLY_CACHE_COVERS'){
  event.waitUntil(prefetchCovers(event.data.urls));
 }
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
 if(request.method!=='GET')return;
 // A navigation to a client-side PWA route is still the app shell, even if
 // that path was not precached verbatim. Exclude functions and private data.
 const isNavigation=url.origin===self.location.origin&&request.mode==='navigate'&&
  !/^\/(?:api|fast-audio|fast-prepare|audius-audio|jamendo-audio)\//.test(url.pathname);
 if(isNavigation){
  event.respondWith((async()=>{
   const cache=await caches.open(SHELL);
   try{
    const response=await fetch(request);
    if(response.ok&&response.type!=='opaque'){
     event.waitUntil(cache.put('/index.html',response.clone()).catch(()=>{}));
     return response;
    }
   }catch{}
   return await cache.match('/index.html')||await cache.match('/')||
    new Response('GNARLY precisa ser aberto online uma vez para instalar o modo offline.',{
     status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
  })());
  return;
 }
 // Browser image requests are no-cors; an opaque response IS cacheable in
 // CacheStorage and can reappear without the original artwork CDN online.
 if(request.destination==='image'&&publicArtworkURL(request.url)){
  event.respondWith((async()=>{
   const cache=await caches.open(ARTWORK_CACHE);
   const cached=await cache.match(request);
   if(cached&&(request.mode!=='cors'||cached.type!=='opaque'))return cached;
   try{
    const response=await fetch(request);
    if(playableResponse(response))
     event.waitUntil(storeArtwork(request,response).catch(()=>{}));
    return response;
   }catch{
    // A public thumbnail not previously saved degrades to the app's icon.
    // Never send an HTML error body in place of image bytes.
    if(request.mode!=='cors'){
     const shell=await caches.open(SHELL);
     const icon=await shell.match('/assets/gnarly-icon.png');
     if(icon)return icon;
    }
    return Response.error();
   }
  })());
  return;
 }
 if(!staticURL(url)||url.pathname==='/sw.js'||url.pathname==='/offline-assets.json')return;
 event.respondWith((async()=>{
  const cache=await caches.open(SHELL);
  try{
   const online=await fetch(request);
   if(online.ok&&online.type!=='opaque'){
    event.waitUntil(cache.put(request,online.clone()).catch(()=>{}));
    return online;
   }
  }catch{}
  const cached=await offlineFallback(cache,request);
  if(cached)return cached;
  return new Response('GNARLY offline: recurso ainda não armazenado.',{
   status:503,headers:{'content-type':'text/plain; charset=utf-8'}
  });
 })());
});
