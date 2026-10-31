import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet,lyricUpstreamURL} from '../functions/api/lyrics-lookup.js';
import {autoLyrics,lyricsProxyURL,verifiedTitleDurationMatch} from '../lib/lyrics-auto.js';

const track={title:'Neon Clouds 99',artist:'Asterian Audio',duration:192};
const sample={trackName:track.title,artistName:track.artist,duration:192,
 syncedLyrics:'[00:03.20]This is a test line'};
test('lyric proxy accepts fixed provider paths only and rejects URL injection',()=>{
 const base='https://gnarly-web-pages.pages.dev/api/lyrics-lookup';
 const valid=lyricUpstreamURL(base+'?source=get&track_name=Song&artist_name=Artist&duration=200');
 assert.equal(valid,'https://lrclib.net/api/get?track_name=Song&artist_name=Artist&duration=200');
 assert.equal(lyricUpstreamURL(base+'?source=http://localhost:1234'),null);
 assert.equal(lyricUpstreamURL(base+'?source=search&q='+'x'.repeat(500)),null);
 assert.equal(lyricUpstreamURL(base+'?source=get&artist_name=x'),null);
 assert.equal(lyricUpstreamURL(base+'?source=get&artist_name=x&track_name=y&duration=99999'),null);
});
test('lyric proxy uses same-origin only on an owned Pages host',()=>{
 const url='https://lrclib.net/api/get?track_name=Song&artist_name=Artist';
 assert.match(lyricsProxyURL(url,'gnarly-web-pages.pages.dev'),/^\/api\/lyrics-lookup\?/);
 assert.equal(lyricsProxyURL(url,'evil.pages.dev'),null);
 assert.equal(lyricsProxyURL('https://evil.example/api/get','gnarly-web-pages.pages.dev'),null);
});
test('lyric proxy preserves upstream 429 with retryAfter and no retries',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'45'}})};
 try{
  const reply=await onRequestGet({request:new Request('https://gnarly-web-pages.pages.dev/api/lyrics-lookup?source=get&track_name=Song&artist_name=Artist')});
  assert.equal(reply.status,429);
  assert.equal(reply.headers.get('Retry-After'),'45');
  assert.equal(calls,1);
 }finally{globalThis.fetch=previous}
});
test('browser network failures fall back to first-party LRCLIB and retain synced lines',async()=>{
 const previous=globalThis.fetch,location=globalThis.location;
 let calls=0;
 globalThis.location={hostname:'gnarly-web-pages.pages.dev'};
 globalThis.fetch=async(input)=>{
  calls++;
  if(String(input).startsWith('https://lrclib.net/'))throw Error('CORS network error');
  assert.match(String(input),/\/api\/lyrics-lookup\?/);
  return Response.json(sample);
 };
 try{
  const result=await autoLyrics(track);
  assert.equal(result.synced,true);
  assert.equal(result.lines[0].time,3.2);
  assert.equal(calls,2);
 }finally{globalThis.fetch=previous;globalThis.location=location}
});
test('missing YouTube artist can be recovered by unique exact title and duration',async()=>{
 const x={title:'Unique Horizon 404',artist:'Artista não identificado',duration:200};
 const records=[{trackName:x.title,artistName:'Real Band',duration:201,
  syncedLyrics:'[00:02.00]Some words'}];
 assert.equal(verifiedTitleDurationMatch(records,x),records[0]);
 assert.equal(verifiedTitleDurationMatch([...records,{...records[0],artistName:'Other Band'}],x),null);
 assert.equal(verifiedTitleDurationMatch([{...records[0],duration:255}],x),null);
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(records);
 try{
  const result=await autoLyrics(x);
  assert.equal(result.synced,true);
  assert.equal(result.source,'lrclib');
 }finally{globalThis.fetch=previous}
});
test('unknown artist with unknown duration is not assigned another song lyrics',async()=>{
 const x={title:'Ambiguous Track',artist:'YouTube Music',duration:0};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('must not guess based on title alone')};
 try{
  const result=await autoLyrics(x);
  assert.equal(result.synced,false);
  assert.equal(result.lines.length,0);
 }finally{globalThis.fetch=previous}
});
