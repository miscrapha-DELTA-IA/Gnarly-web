import test from 'node:test';
import assert from 'node:assert/strict';
import {autoLyrics,selectBestMatch,lyricsIdentity} from '../lib/lyrics-auto.js';
import {transcribeLyrics} from '../lib/lyrics-ai-service.js';

const track={title:'A Little Song',artist:'Actual Artist',album:'Album',duration:206,source:'youtube'};
const result=(r)=>Response.json(r);
test('LRCLIB strict identity prevents unrelated lyrics and wrong versions',()=>{
 const list=[{trackName:'A Little Song',artistName:'Wrong Artist',duration:206,syncedLyrics:'[00:03.00]Wrong'},
 {trackName:'A Little Song (Live)',artistName:'Actual Artist',duration:206,syncedLyrics:'[00:04.00]Wrong'},
 {trackName:'A Little Song',artistName:'Actual Artist',duration:206,syncedLyrics:'[00:05.00]Correct'}];
 assert.equal(selectBestMatch(list,track),list[2]);
 assert.equal(lyricsIdentity({...track,title:'Actual Artist - A Little Song',artist:'YouTube Music'}).artist,'Actual Artist');
});
test('LRCLIB exact result includes provenance and real synchronized timings',async()=>{
 const original=globalThis.fetch;let count=0;
 try{globalThis.fetch=async (url,options)=>{count++;
  assert.equal(new URL(url).host,'lrclib.net');
  assert.match(options.headers['Lrclib-Client'],/GNARLY WEB/);
  return result({trackName:track.title,artistName:track.artist,duration:206,syncedLyrics:'[00:04.50]First line\n[00:08.00]Next line'});
 };
 const lyrics=await autoLyrics(track);
 assert.equal(count,1);
 assert.equal(lyrics.lines[0].time,4.5);
 assert.equal(lyrics.synced,true);
 assert.equal(lyrics.source,'lrclib');
 }finally{globalThis.fetch=original}
});
test('plain-only lyrics are displayed without fictitious LRC timestamps',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>result({trackName:track.title,artistName:track.artist,duration:206,plainLyrics:'Line one\nLine two',syncedLyrics:null});
 const lyrics=await autoLyrics(track);
 assert.equal(lyrics.lines.length,0);
 assert.deepEqual(lyrics.plainLines,['Line one','Line two']);
 assert.equal(lyrics.synced,false);
 }finally{globalThis.fetch=original}
});
test('search fallback tries only one LRCLIB search before lyrics.ovh',async()=>{
 const original=globalThis.fetch,paths=[];
 try{globalThis.fetch=async url=>{paths.push(new URL(url).pathname);return result(
  paths.length===1?{error:'missing'}:
  [{trackName:track.title,artistName:track.artist,duration:206,syncedLyrics:'[00:12.10]Found'}]);
 };
 const lyrics=await autoLyrics(track);
 assert.equal(lyrics.lines[0].text,'Found');
 assert.deepEqual(paths,['/api/get','/api/search']);
 }finally{globalThis.fetch=original}
});
test('non-synced backup is accurately marked as unsynchronized',async()=>{
 const original=globalThis.fetch;let n=0;
 try{globalThis.fetch=async()=>{n++;return result(n===3?{lyrics:'Verse one\nVerse two'}:n===2?[]:{status:404})};
 const lyrics=await autoLyrics(track);
 assert.equal(n,3);assert.equal(lyrics.source,'lyrics.ovh');
 assert.equal(lyrics.synced,false);assert.deepEqual(lyrics.lines,[]);
 }finally{globalThis.fetch=original}
});
test('rate limit never triggers cascading requests',async()=>{
 const original=globalThis.fetch;let n=0;
 try{globalThis.fetch=async()=>{n++;return new Response('rate limited',{status:429,headers:{'retry-after':'80'}})};
 const lyrics=await autoLyrics(track);
 assert.equal(n,1);assert.match(lyrics.status,/limitou/);
 }finally{globalThis.fetch=original}
});
test('AI is not callable without same-origin explicit consent and a configured binding',async()=>{
 const endpoint='https://gnarly-web-pages.pages.dev/api/lyrics-ai';
 const base={method:'POST',headers:{origin:'https://gnarly-web-pages.pages.dev','content-type':'audio/wav'}};
 assert.equal((await transcribeLyrics(new Request(endpoint,{...base,body:'abc'}),{})).status,403);
 assert.equal((await transcribeLyrics(new Request(endpoint,{...base,headers:{...base.headers,origin:'https://evil.test','x-gnarly-audio-consent':'yes'},body:'abc'}),{AI:{run:()=>{throw Error('must not run')}}})).status,403);
 assert.equal((await transcribeLyrics(new Request(endpoint,{...base,headers:{...base.headers,'x-gnarly-audio-consent':'yes'},body:'abc'}),{})).status,503);
});
test('AI transcribes only verified user-supplied audio, preserving real segment times',async()=>{
 const endpoint='https://gnarly-web-pages.pages.dev/api/lyrics-ai';
 const audio=new Uint8Array(1024);audio.set(new TextEncoder().encode('RIFF'),0);
 audio.set(new TextEncoder().encode('WAVE'),8);
 const calls=[];
 const req=new Request(endpoint,{method:'POST',headers:{origin:'https://gnarly-web-pages.pages.dev',
  'x-gnarly-audio-consent':'yes','content-type':'audio/wav','cf-connecting-ip':'192.0.2.44'},
  body:audio});
 const env={AI:{run:async(model,args)=>{calls.push({model,args});return {text:'first\nsecond',segments:[{start:0.9,text:'first'},{start:3.5,text:'second'}]}}}};
 const response=await transcribeLyrics(req,env),data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.source,'whisper-ai');assert.equal(data.lines[0].time,.9);
 assert.match(data.status,/experimental|experimental|experiment|revise/i);
 assert.equal(calls.length,1);
 assert.match(calls[0].model,/whisper-large-v3-turbo/);
 assert.equal(calls[0].args.task,'transcribe');
});
test('short or unsupported AI audio never reaches model',async()=>{
 const endpoint='https://gnarly-web-pages.pages.dev/api/lyrics-ai';let calls=0;
 const req=new Request(endpoint,{method:'POST',headers:{origin:'https://gnarly-web-pages.pages.dev',
  'x-gnarly-audio-consent':'yes','content-type':'audio/wav','cf-connecting-ip':'192.0.2.85'},
  body:new Uint8Array(1024)});
 const output=await transcribeLyrics(req,{AI:{run:()=>{calls++}}});
 assert.equal(output.status,422);assert.equal(calls,0);
});
