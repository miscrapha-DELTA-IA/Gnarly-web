import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OFFLINE_MAX_BYTES,offlineProfile,validAudioFile,cleanOfflineTrack,
 createOfflineLibrary,fetchFullAudio} from '../lib/offline-library.js';

import {offlineSuccessors} from '../lib/smart-queue.js';
import {renderSmartQueuePanel} from '../ui/smart-queue-panel.js';
const track={id:'youtube:aaaaaaaaaaa',source:'youtube',videoId:'aaaaaaaaaaa',
 title:'Minha música',artist:'Artista',album:'Álbum',duration:192,artwork:'https://example.test/cover.jpg'};
function memoryIDB(){
 const records=new Map();
 const db={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
  transaction(name,mode){
   const tx={oncomplete:null,onerror:null,onabort:null,error:null,
    objectStore(){
     return {
      put(item){records.set(item.key,item);return req(item)},
      get(key){return req(records.get(key))},
      delete(key){records.delete(key);return req(undefined)},
      getAll(){return req([...records.values()])}
     };
    }};
   return tx;
   function req(value){
    const request={result:value,onsuccess:null,onerror:null,error:null};
    queueMicrotask(()=>{request.onsuccess?.();setTimeout(()=>tx.oncomplete?.(),0)});
    return request;
   }
  }
 };
 return {open(){
  const request={result:db,onsuccess:null,onerror:null,onupgradeneeded:null,error:null};
  queueMicrotask(()=>request.onsuccess?.());
  return request;
 }};
}
test('offline device identity persists, and an older browser without crypto UUID has stable fallback',()=>{
 const values=new Map(),store={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const a=offlineProfile(store,{});
 const b=offlineProfile(store,{});
 assert.equal(a,b);assert.match(a,/^[a-f0-9-]{12,70}$/);
});
test('offline metadata is bounded; invalid video identities cannot be stored',()=>{
 const clean=cleanOfflineTrack({...track,internalToken:'secret',file:new Blob(['a'])});
 assert.equal(clean.id,track.id);
 assert.equal(Object.hasOwn(clean,'internalToken'),false);
 assert.equal(Object.hasOwn(clean,'file'),false);
 assert.throws(()=>cleanOfflineTrack({...track,videoId:'bad'}));
});
test('persistent IndexedDB audio is isolated by stable profile key',async()=>{
 const idb=memoryIDB(),a=createOfflineLibrary({indexedDB:idb,profile:'aaaaaaaaaaaa'}),
 b=createOfflineLibrary({indexedDB:idb,profile:'bbbbbbbbbbbb'});
 const blob=new Blob([new Uint8Array(4096)],{type:'audio/mp4'});
 await a.save(track,blob);
 assert.equal((await a.list()).length,1);
 assert.equal((await b.list()).length,0,'another profile must not read saved media');
 assert.equal((await a.get(track.id)).blob.size,4096);
 await a.remove(track.id);
 assert.equal((await a.list()).length,0);
});
test('reject empty, too large and unsupported audio imports',()=>{
 assert.equal(validAudioFile({size:0,type:'audio/mp4'}),false);
 assert.equal(validAudioFile({size:OFFLINE_MAX_BYTES+1,type:'audio/mp4'}),false);
 assert.equal(validAudioFile({size:3000,type:'text/html',name:'page.html'}),false);
 assert.equal(validAudioFile({size:3000,type:'audio/mp4'}),true);
 assert.equal(validAudioFile({size:3000,type:'',name:'music.flac'}),true);
});
test('explicit download is full canonical M4A only; partial Ranges/errors never stored',async()=>{
 const bytes=new Uint8Array(4096).fill(42);
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return new Response(bytes,{status:200,headers:{'content-type':'audio/mp4','content-length':String(bytes.length)}});
 };
 const blob=await fetchFullAudio(track,{fetcher});
 assert.equal(blob.size,bytes.length);assert.equal(blob.type,'audio/mp4');
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.includes('delivery=browser'));
 assert.ok(calls[0].url.includes('aaaaaaaaaaa'));
 assert.equal(calls[0].options.credentials,'omit');
 await assert.rejects(fetchFullAudio(track,{fetcher:async()=>new Response(bytes,{status:206,headers:{'content-type':'audio/mp4'}})}),/arquivo completo/);
 await assert.rejects(fetchFullAudio(track,{fetcher:async()=>new Response('<html/>',{status:200,headers:{'content-type':'text/html'}})}),/sem áudio/);
 await assert.rejects(fetchFullAudio({...track,videoId:'invalid'},{fetcher}),/identificadas/);
});
test('offline shell caches static resources but refuses remote audio, APIs, and user data',()=>{
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
 assert.match(sw,/const CORE=/);
 assert.match(sw,/url.origin===self.location.origin/);
 assert.match(sw,/url.pathname/);
 assert.match(sw,/cache.match\(request/);
 assert.match(sw,/request.mode==='navigate'/);
 assert.match(build,/offline-assets.json/);
 assert.match(build,/sw.js/);
 assert.match(app,/navigator.serviceWorker.register\('\/sw.js'/);
 assert.match(app,/offlineAudio\(track.id\)\|\|trackAudioURL/);
 assert.match(app,/void restoreOfflineLibrary\(\)/);
 assert.match(app,/const offlineLibrary=createOfflineLibrary\(\)/);
 assert.match(app,/data-action="download"/);
 assert.match(app,/case 'library':content.innerHTML=/);
});

test('offline next uses device-saved blobs, ordered and never cycles session history',()=>{
 const make=(id,artist='Solo')=>({id:'youtube:'+id.repeat(11),videoId:id.repeat(11),
  source:'youtube',title:id,artist,album:'Album'});
 const A=make('A'),B=make('B'),C=make('C'),D=make('D','Other'),E=make('E');
 const offline=new Set([A.id,B.id,C.id,D.id]);
 const options={current:A,library:[A,B,C,D,E],available:id=>offline.has(id)};
 assert.deepEqual(offlineSuccessors(options).map(x=>x.id),[B.id,C.id,D.id]);
 assert.deepEqual(offlineSuccessors({...options,queue:[D,E,B]}).map(x=>x.id),
  [D.id,B.id,C.id],'explicit queued files have priority; online-only E is not promoted');
 assert.deepEqual(offlineSuccessors({...options,recent:[B,C,D]}),[],
  'do not silently replay a recent song or loop forever');
 assert.deepEqual(offlineSuccessors({...options,available:()=>false}),[]);
});
test('offline queue opt-in is explicit and does not auto-download by default',()=>{
 const html=renderSmartQueuePanel({queueCount:2,playing:true,online:true});
 assert.match(html,/data-auto-offline-save="1"/);
 assert.doesNotMatch(html,/<input[^>]+checked/);
 const enabled=renderSmartQueuePanel({offlineAutoSave:true,
  offlineSaveStatus:'Próxima música salva offline',online:false});
 assert.match(enabled,/checked/);
 assert.match(enabled,/disabled/);
 assert.match(enabled,/Próxima música salva offline/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function maybeAutoSaveNext\(/);
 assert.match(app,/cachedNativeAvailable\(next\)/,
  'only verified ready edge audio can be saved speculatively');
 assert.match(app,/downloadOfflineTrack\(next,\{quiet:true,signal:controller.signal\}\)/);
 assert.match(app,/if\(!navigator.onLine\|\|startingTrack.source==='local'\)/);
 assert.match(app,/if\(state.playing&&!audio.paused\)\{prepareUpcomingAudio\(\);maybeAutoSaveNext\(\);\}/);
});
