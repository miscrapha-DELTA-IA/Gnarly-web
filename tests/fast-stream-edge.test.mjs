import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio,validByteRange} from '../functions/fast-audio/[id].js';
import {onRequestPost as prepare} from '../functions/fast-prepare/[id].js';
import {fastPrepareURL,trackAudioURL,isGnarlyPagesHost} from '../lib/playback-source.js';
import {QueueAudioWarmup,canWarmNext} from '../lib/queue-audio-warmup.js';

const audio=new Uint8Array(4096).fill(7);
const track={source:'youtube',id:'youtube:ABCDEFGHIJK',videoId:'ABCDEFGHIJK'};
const request=(path,options={})=>new Request('https://gnarly-web-pages.pages.dev'+path,options);
function mockBucket({present=true,range=false}={}){
 const calls=[];
 const bucket={
  async head(key){calls.push({method:'head',key});return present?{size:audio.length,httpEtag:'"etag"'}:null},
  async get(key,options){calls.push({method:'get',key,options});
   if(!present)return null;
   if(options?.range){
    return {size:audio.length,httpEtag:'"etag"',range:{offset:0,length:128},
     body:new Blob([audio.slice(0,128)],{type:'audio/mp4'}).stream()};
   }
   return {size:audio.length,httpEtag:'"etag"',
    body:new Blob([audio],{type:'audio/mp4'}).stream()};
  }
 };
 return {bucket,calls};
}
test('GNARLY Pages allow-list never routes arbitrary domains to edge',()=>{
 assert.equal(isGnarlyPagesHost('gnarly-web-pages.pages.dev'),true);
 assert.equal(isGnarlyPagesHost('preview.gnarly-web-stage72.pages.dev'),true);
 for(const bad of ['evil.pages.dev','gnarly-web-pages.pages.dev.attacker.com',
                    'localhost','gnarlyweb.netlify.app']){
  assert.equal(isGnarlyPagesHost(bad),false);
 }
 assert.equal(fastPrepareURL({...track,source:'local'}),null);
 assert.ok(trackAudioURL(track).includes('/download'),
   'Node and local test runtime retain the proven backend');
});
test('R2 cache hit returns audio bytes at edge, no Render fetch',async()=>{
 const {bucket,calls}=mockBucket();
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },()=>{throw new Error('origin fetch on cache hit')});
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'r2-edge');
 assert.equal(result.headers.get('accept-ranges'),'bytes');
 assert.equal(result.headers.get('content-length'),'4096');
 assert.equal((await result.arrayBuffer()).byteLength,4096);
 assert.equal(calls[0].key,'ABCDEFGHIJK/audio.m4a');
});
test('Range GET is 206 with proper Content-Range and byte length',async()=>{
 const {bucket}=mockBucket();
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK',{headers:{Range:'bytes=0-127'}}),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },()=>{throw Error('Unexpected upstream fetch')});
 assert.equal(result.status,206);
 assert.equal(result.headers.get('content-range'),'bytes 0-127/4096');
 assert.equal(result.headers.get('content-length'),'128');
 assert.equal((await result.arrayBuffer()).byteLength,128);
});
test('HEAD miss never triggers remote extraction and malformed range/id are rejected',async()=>{
 const {bucket}=mockBucket({present:false});
 const f=()=>{throw Error('Unexpected remote fetch')};
 const head=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK',{method:'HEAD'}),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },f);
 assert.equal(head.status,404);
 assert.equal(head.headers.get('x-gnarly-playback-source'),'cache-miss');
 const bad=await handleFastAudio({
  request:request('/fast-audio/NOTVALID'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'NOTVALID'}
 },f);
 assert.equal(bad.status,400);
 assert.equal(validByteRange('bytes=0-1,4-5'),false);
});
test('R2 miss proxies progressive AAC without buffering or redirects',async()=>{
 const {bucket}=mockBucket({present:false}),calls=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },async(url,options)=>{
  calls.push({url,options});
  return new Response(new Blob([audio],{type:'audio/mp4'}),{
   status:200,headers:{'Content-Type':'audio/mp4','Content-Length':'4096'}
  });
 });
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.includes('/stream?'));
 assert.equal(result.headers.get('x-gnarly-playback-source'),'progressive-origin');
 assert.equal(result.status,200);
});
test('unsupported progressive source falls back to existing full-download route',async()=>{
 const calls=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}
 },async(url)=>{
  calls.push(url);
  return calls.length===1?new Response('no direct AAC',{status:415}):
   new Response(audio,{status:200,headers:{'Content-Type':'audio/mp4'}});
 });
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'extraction-origin');
 assert.equal(calls.length,2);
 assert.ok(calls[1].includes('/download?'));
});
test('preparation endpoint carries one server-validated identity',async()=>{
 const calls=[];
 const result=await prepare({request:request('/fast-prepare/ABCDEFGHIJK',{method:'POST'}),
  params:{id:'ABCDEFGHIJK'}},async(url,options)=>{
   calls.push({url,options});
   return new Response('{"status":"preparing"}',{status:202});
  });
 assert.equal(result.status,202);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 const sent=JSON.parse(calls[0].options.body);
 assert.equal(sent.url,'https://www.youtube.com/watch?v=ABCDEFGHIJK');
 assert.equal((await prepare({request:request('/fast-prepare/BAD',{method:'POST'}),
  params:{id:'BAD'}},()=>{throw Error('unreachable')})).status,400);
});
test('warmup sends one persistent POST rather than aborting Range download',async()=>{
 const calls=[];
 const warmup=new QueueAudioWarmup({fetcher:async(url,options)=>{
  calls.push({url,options});return {status:202};
 }});
 assert.equal(canWarmNext({current:track,next:{...track,id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB'},remaining:60}),true);
 assert.equal(await warmup.start(track),true);
 assert.equal(await warmup.start(track),false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Range,undefined);
 assert.equal(JSON.parse(calls[0].options.body).url,'https://www.youtube.com/watch?v=ABCDEFGHIJK');
});
