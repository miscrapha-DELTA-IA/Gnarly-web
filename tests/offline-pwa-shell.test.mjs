import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const workerSource=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const buildSource=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
const ORIGIN='https://gnarly-web-pages.pages.dev';
const art='https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg';
const manifest=['/','/index.html','/app.js','/gnarly-ui.css','/chunks/critical-ABCDE.js',
 '/assets/gnarly-icon.png','/lib/dynamic-tool.js','/basic-pitch-worker.js'];
function harness(){
 const handlers={},stores=new Map(),requested=[],delays=[];
 let online=true,skipped=false,claimed=false;
 const normalize=key=>{
  const str=typeof key==='string'?key:key?.url;
  const url=new URL(str,ORIGIN);
  return url.origin===ORIGIN?url.pathname+url.search:url.href;
 };
 function cache(name){
  if(!stores.has(name))stores.set(name,new Map());
  const map=stores.get(name);
  return {
   async match(key,{ignoreSearch=false}={}){
    const target=normalize(key);
    const value=map.get(target)||(ignoreSearch?[...map].find(([k])=>k.split('?')[0]===target.split('?')[0])?.[1]:null);
    return value?.clone()||null;
   },
   async put(key,value){map.set(normalize(key),value.clone())},
   async keys(){return [...map.keys()].map(k=>new Request(new URL(k,ORIGIN).href))},
   async delete(key){return map.delete(normalize(key))}
  };
 }
 const caches={
  open:async name=>cache(name),keys:async()=>[...stores.keys()],
  delete:async name=>stores.delete(name)
 };
 const missing=new Set();
 async function network(input){
  const url=new URL(typeof input==='string'?input:input.url,ORIGIN);
  requested.push(url.href);
  if(!online||missing.has(url.pathname))throw new TypeError('offline or missing resource');
  if(url.pathname==='/offline-assets.json')
   return Response.json(manifest,{headers:{'Cache-Control':'no-store'}});
  if(url.origin!==ORIGIN)
   return new Response(new Uint8Array(5000).fill(1),{headers:{'content-type':'image/jpeg'}});
  return new Response('asset:'+url.pathname,{status:200});
 }
 const self={
  location:{origin:ORIGIN,href:ORIGIN+'/'},
  addEventListener(name,handler){handlers[name]=handler},
  skipWaiting:async()=>{skipped=true},
  clients:{claim:async()=>{claimed=true}}
 };
 vm.runInNewContext(workerSource,{
  self,caches,fetch:network,Request,Response,URL,console,
  setTimeout,clearTimeout,Promise,Uint8Array,DataView
 },{filename:'sw.js'});
 const withEvent=(type,data={})=>{
  const pending=[];let responded;
  handlers[type]({
   ...data,
   waitUntil(p){pending.push(Promise.resolve(p))},
   respondWith(p){responded=Promise.resolve(p)}
  });
  return {pending,responded};
 };
 return {
  requested,stores,missing,
  offline(){online=false},
  async install(){const e=withEvent('install');await Promise.all(e.pending)},
  async activate(){const e=withEvent('activate');await Promise.all(e.pending)},
  async message(data){const e=withEvent('message',{data});await Promise.all(e.pending)},
  async request(request){
   const e=withEvent('fetch',{request});
   if(!e.responded)return null;
   const response=await e.responded;
   await Promise.all(e.pending);
   return response;
  },
  get skipped(){return skipped},get claimed(){return claimed}
 };
}

test('PWA install guarantees startup bundle, hashed lazy chunks and icon before activation',async()=>{
 const w=harness();
 await w.install();
 assert.equal(w.skipped,true);
 const shell=[...w.stores.entries()].find(([name])=>name.startsWith('gnarly-web-shell-'));
 assert.ok(shell);
 for(const asset of ['/','/index.html','/app.js','/gnarly-ui.css',
   '/chunks/critical-ABCDE.js','/assets/gnarly-icon.png','/offline-assets.json']){
  assert.ok(shell[1].has(asset),'missing offline essential: '+asset);
 }
 await w.activate();
 assert.equal(w.claimed,true);
 w.offline();
 const page=await w.request({method:'GET',mode:'navigate',url:ORIGIN+'/playlist/minhas'});
 assert.equal(page.status,200);
 assert.equal(await page.text(),'asset:/index.html');
 const script=await w.request(new Request(ORIGIN+'/chunks/critical-ABCDE.js'));
 assert.equal(script.status,200);
 assert.equal(await script.text(),'asset:/chunks/critical-ABCDE.js');
});

test('missing critical chunk aborts upgrade; old working SW is not replaced',async()=>{
 const w=harness();w.missing.add('/chunks/critical-ABCDE.js');
 await assert.rejects(w.install(),/offline or missing resource|GNARLY essential offline resource unavailable/);
 assert.equal(w.skipped,false);
});

test('only trusted public image requests get stored; an offline return retains the original cover',async()=>{
 const w=harness();await w.install();await w.activate();
 const image={method:'GET',destination:'image',mode:'no-cors',url:art};
 const first=await w.request(image);
 assert.equal(first.status,200);
 await w.message({type:'GNARLY_CACHE_COVERS',urls:[
  art,'https://evil.test/secret.jpg',
  'https://i.ytimg.com/vi/AAAAAAAAAAA/default.jpg?token=private'
 ]});
 const artStore=w.stores.get('gnarly-web-public-artwork-v1');
 assert.equal(artStore.size,1);
 w.offline();
 const offline=await w.request(image);
 assert.equal(offline.status,200);
 assert.equal((await offline.arrayBuffer()).byteLength,5000);
 const unknown=await w.request({method:'GET',destination:'image',mode:'no-cors',
  url:'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg'});
 assert.equal(unknown.status,200,'unknown offline thumbnails use cached GNARLY icon');
});

test('no API, remote song, POST or private resource is intercepted by offline image cache',async()=>{
 const w=harness();await w.install();
 const api=await w.request({method:'GET',destination:'',url:ORIGIN+'/api/catalog?q=test'});
 const media=await w.request({method:'GET',destination:'audio',
  url:'https://nightcorelab.onrender.com/download?url=recording'});
 const post=await w.request({method:'POST',destination:'image',url:art});
 assert.equal(api,null);
 assert.equal(media,null);
 assert.equal(post,null);
 assert.equal(w.stores.has('gnarly-web-public-artwork-v1'),false);
});

test('app persists covers for offline saved tracks without changing audio transport',()=>{
 assert.match(appSource,/function cacheSavedArtwork\(tracks\)/);
 assert.match(appSource,/GNARLY_CACHE_COVERS/);
 assert.match(appSource,/await offlineLibrary\.save\(track,blob\);\s+registerOfflineURL\(track,blob\);\s+cacheSavedArtwork\(track\)/);
 assert.match(appSource,/if\(!source\|\|source===icon\|\|!navigator\.onLine\)return/);
 assert.match(appSource,/!navigator\.onLine\?tr\.artwork:artworkCandidates/);
 assert.match(appSource,/offlineAudio\(track\.id\)\|\|trackAudioURL/);
 assert.match(buildSource,/basic-pitch-worker\.js/);
 assert.match(workerSource,/request\.destination==='image'/);
 assert.doesNotMatch(workerSource,/audio\/mp4|\.mp3|\.m4a/);
});
