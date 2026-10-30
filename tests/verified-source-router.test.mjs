import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VerifiedSourceRouter,probePlayableAudio,audioHeaderAndSignature} from '../lib/verified-source-router.js';
import {searchJamendo,jamendoPlaybackURL} from '../lib/jamendo-catalog.js';
import {normalizeJamendoTrack,onRequestGet} from '../functions/api/jamendo-search.js';
import {handleJamendoAudio,allowedJamendoOrigin} from '../functions/jamendo-audio/[id].js';
import {exactIndependentRecording} from '../lib/independent-recovery.js';

const selected={id:'youtube:abcdefghijk',source:'youtube',videoId:'abcdefghijk',
 title:'Exactly This Mix',artist:'Original Artist',duration:190};
const audius={id:'audius:AuD1234',source:'audius',audiusId:'AuD1234',
 title:selected.title,artist:selected.artist,duration:191,url:'/audius-audio/AuD1234'};
const jamendo={id:'jamendo:123456',source:'jamendo',jamendoId:'123456',
 title:selected.title,artist:selected.artist,duration:189,url:'/jamendo-audio/123456'};
const mp3=new Uint8Array([73,68,51,4,0,0,0,0,0,1,255,251]);
const playable=()=>new Response(mp3,{status:206,headers:{'Content-Type':'audio/mpeg',
 'Content-Range':'bytes 0-11/1200','Content-Length':'12'}});

test('probes only first-party canonical ID URL and validates actual audio bytes',async()=>{
 let calls=0;
 const accepted=await probePlayableAudio('/audius-audio/AuD1234',{fetcher:async(url,options)=>{
  calls++;
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Range,'bytes=0-2047');
  assert.equal(options.credentials,'omit');
  return playable();
 }});
 assert.equal(accepted,true);assert.equal(calls,1);
 for(const url of ['https://evil.example/audio.mp3','/audius-audio/../oops',
  '/jamendo-audio/abc','/fast-audio/abcdefghijk']){
  assert.equal(await probePlayableAudio(url,{fetcher:()=>{throw Error('must not fetch')}}),false);
 }
 assert.equal(await probePlayableAudio('/audius-audio/AuD1234',{
  fetcher:async()=>new Response('<html>404</html>',{status:200,headers:{'Content-Type':'text/html'}})
 }),false);
 assert.equal(await probePlayableAudio('/audius-audio/AuD1234',{
  fetcher:async()=>new Response(new Uint8Array([60,104,116,109,108]),{
   headers:{'Content-Type':'audio/mpeg'}})
 }),false);
 assert.equal(audioHeaderAndSignature('audio/mp4',new Uint8Array([0,0,0,18,102,116,121,112])),true);
});

test('race providers and choose first VERIFIED playable exact match, not first metadata hit',async()=>{
 const calls=[];
 const r=new VerifiedSourceRouter({
  providers:[
   {id:'fast-broken',search:async()=>[audius],url:()=>'/audius-audio/AuD1234'},
   {id:'verified',search:async()=>[jamendo],url:jamendoPlaybackURL}
  ],
  probe:async url=>{calls.push(url);return url==='/jamendo-audio/123456'}
 });
 const result=await r.resolve(selected);
 assert.equal(result.source,'jamendo');
 assert.equal(result.verifiedAudioURL,'/jamendo-audio/123456');
 assert.equal(calls.length,2);
 assert.equal(r.snapshot().verified.failures,0);
 assert.equal(r.snapshot()['fast-broken'].failures,1);
});

test('metadata-only match does not create a playable source or switch recording',async()=>{
 let probes=0;
 const r=new VerifiedSourceRouter({providers:[
  {id:'a',search:async()=>[{...audius,artist:'Different'}],url:()=>audius.url},
  {id:'b',search:async()=>[{...jamendo,title:'Exactly This Mix (Live)'}],url:()=>jamendo.url}
 ],probe:async()=>{probes++;return true}});
 assert.equal(await r.resolve(selected),null);assert.equal(probes,0);
 assert.equal(exactIndependentRecording(selected,[jamendo]),jamendo);
 assert.equal(exactIndependentRecording(selected,[jamendo,{...jamendo,id:'jamendo:222',jamendoId:'222'}]),null);
 // URL validation occurs in the canonical provider adapter and probe, not metadata comparison.
});

test('change of song cancels an in-flight provider without retrying the blocked origin',async()=>{
 let release;let signal;
 const r=new VerifiedSourceRouter({providers:[{id:'slow',
  search:async(_q,o)=>{signal=o.signal;await new Promise(done=>release=done);return [audius]},
  url:()=>audius.url
 }],probe:async()=>true});
 const old=r.resolve(selected);
 r.cancel();assert.equal(signal.aborted,true);
 release();assert.equal(await old,null);
});

test('providers trip isolated circuits only after repeated stream failures',async()=>{
 const r=new VerifiedSourceRouter({providers:[
  {id:'bad',search:async()=>[audius],url:()=>audius.url},
  {id:'good',search:async()=>[jamendo],url:()=>jamendo.url}
 ],probe:async url=>url.includes('jamendo')});
 for(let n=0;n<3;n++){
  const win=await r.resolve({...selected,videoId:'x'+n+'bcdefghij'});
  assert.equal(win.source,'jamendo');
 }
 assert.equal(r.snapshot().bad.failures,3);
 assert.ok(r.snapshot().bad.disabledUntil>0);
 assert.equal(r.snapshot().good.failures,0);
});

test('Jamendo metadata is canonical and never trusts unvalidated remote URL from clients',async()=>{
 const raw={id:123456,name:'Exactly This Mix',artist_name:'Original Artist',
  duration:190,album_name:'Test Album',audio:'https://prod-1.storage.jamendo.com/something'};
 assert.equal(normalizeJamendoTrack(raw).url,'/jamendo-audio/123456');
 assert.equal(jamendoPlaybackURL(jamendo),jamendo.url);
 assert.equal(normalizeJamendoTrack({...raw,audio:'http://evil.example/foo'}),null);
 assert.equal(normalizeJamendoTrack({...raw,id:'../../secret'}),null);
 const input=await searchJamendo('Original Artist Exactly This Mix',{fetcher:async url=>{
  assert.match(url,/^\/api\/jamendo-search\?term=/);
  return Response.json({status:'ok',results:[jamendo]});
 }});
 assert.equal(input.length,1);
 const bad=await searchJamendo('Test',{fetcher:async()=>Response.json({status:'ok',
  results:[{...jamendo,url:'https://evil.example/foo'}]})});
 assert.deepEqual(bad,[]);
});

test('Jamendo API stays disabled without its own Client ID; when configured sends only canonical rows',async()=>{
 const request=new Request('https://gnarly.test/api/jamendo-search?term=Exact&limit=8');
 const missing=await onRequestGet({request,env:{}},()=>{throw Error('no call')});
 assert.equal(missing.status,503);
 assert.equal((await missing.json()).status,'not_configured');
 let calls=0;
 const result=await onRequestGet({request,env:{JAMENDO_CLIENT_ID:'12345678'}},async url=>{
  calls++;
  assert.equal(new URL(url).hostname,'api.jamendo.com');
  assert.equal(new URL(url).searchParams.get('search'),'Exact');
  return Response.json({headers:{status:'success'},results:[{
   id:123456,name:'Exactly This Mix',artist_name:'Original Artist',
   duration:190,audio:'https://prod-1.storage.jamendo.com/file.mp3'}]});
 });
 assert.equal(calls,1);assert.equal(result.status,200);
 assert.equal((await result.json()).results[0].id,'jamendo:123456');
});

test('Jamendo transport follows only trusted storage host and passes native audio through',async()=>{
 assert.equal(allowedJamendoOrigin('https://prod-1.storage.jamendo.com/song.mp3'),true);
 for(const uri of ['https://evil.example/audio.mp3','http://api.jamendo.com',
  'https://api.jamendo.com.evil.com/','https://127.0.0.1:443/foo']){
  assert.equal(allowedJamendoOrigin(uri),false);
 }
 const visited=[];
 const response=await handleJamendoAudio({
  request:new Request('https://gnarly.test/jamendo-audio/123456',{headers:{Range:'bytes=0-2047'}}),
  params:{id:'123456'},env:{JAMENDO_CLIENT_ID:'12345678'}
 },async url=>{
  visited.push(url);
  return visited.length===1?new Response(null,{status:302,headers:{
   Location:'https://prod-1.storage.jamendo.com/song.mp3'
  }}):playable();
 });
 assert.equal(response.status,206);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'jamendo-native');
 assert.equal((await response.arrayBuffer()).byteLength,mp3.byteLength);
 assert.equal(visited.length,2);
 const attacker=await handleJamendoAudio({
  request:new Request('https://gnarly.test/jamendo-audio/123456'),
  params:{id:'123456'},env:{JAMENDO_CLIENT_ID:'12345678'}
 },async()=>new Response(null,{status:302,headers:{Location:'https://evil.example/song.mp3'}}));
 assert.equal(attacker.status,502);
});

test('GNARLY media starts first and independent verification cannot block user play()',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const play=app.slice(app.indexOf('async function play(){'),app.indexOf('function pause(){'));
 assert.match(play,/const start=audio\.play\(\),unlock=resumePlayerAudio\(\)/);
 assert.match(play,/void sourceRouter\.resolve\(track\)\.then/);
 assert.ok(play.indexOf('const start=audio.play(),unlock=resumePlayerAudio()')<
  play.indexOf('void sourceRouter.resolve(track).then'));
 assert.match(play,/if\(!alternative\|\|!stillSelected\(\)\|\|recoveryOperation/);
 assert.match(app,/async function recoverIndependentAudio\(track,isCurrent,verifiedAlternative=null\)/);
 assert.match(app,/verifiedAlternative\|\|await sourceRouter\.resolve\(track/);
 assert.match(app,/audio\.addEventListener\('playing',[\s\S]*?sourceRouter\.cancel\(\)/);
});
