import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autoLyrics,prefetchAutoLyrics,cachedAutoLyrics} from '../lib/lyrics-auto.js';
test('verified synchronized LRC prefetches once, caches, and becomes immediate on reselect',async()=>{
 const saved=new Map();
 const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 let requests=0;
 globalThis.fetch=async url=>{requests++;
  assert.match(String(url),/lrclib\.net\/api\/get/);
  return {status:200,ok:true,json:async()=>({
   id:987,trackName:'Runaway',artistName:'AURORA',duration:200,albumName:'All My Demons',
   instrumental:false,syncedLyrics:'[00:10.00]I was listening\n[00:20.00]To the ocean',
   plainLyrics:'I was listening\nTo the ocean'})};
 };
 const track={id:'youtube:test',title:'Runaway',artist:'AURORA',album:'All My Demons',duration:200};
 try{
  assert.equal(cachedAutoLyrics(track),null);
  const [first,second]=await Promise.all([prefetchAutoLyrics(track),prefetchAutoLyrics(track)]);
  assert.equal(requests,1,'one speculative request for verified next track');
  assert.equal(first?.synced,true);assert.deepEqual(first,second);
  const instant=cachedAutoLyrics(track);
  assert.equal(instant?.lines.length,2);
  await autoLyrics(track);assert.equal(requests,1);
  assert.ok(saved.has('gnarly.web.synced-lyrics-cache.v1'));
 }finally{globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage}
});
test('unknown artist cannot trigger network requests or fabricated lyric timings',async()=>{
 const old=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('should not query')};
 try{
  const track={id:'youtube:unknown',title:'Song',artist:'YouTube Music'};
  const result=await prefetchAutoLyrics(track);
  assert.equal(result,null);assert.equal(requests,0);
  assert.equal(cachedAutoLyrics(track),null);
 }finally{globalThis.fetch=old}
});
