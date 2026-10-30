import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAudiusTrack,onRequestGet} from '../functions/api/audius-search.js';
import {handleAudiusAudio,allowedAudiusMediaOrigin} from '../functions/audius-audio/[id].js';
import {audiusPlaybackURL,searchAudius} from '../lib/audius-catalog.js';
import {personalizedRank} from '../lib/live-search.js';
import {OmniboxSession} from '../lib/omnibox.js';
import worker from '../src/worker.js';

const raw=(override={})=>({
 id:'aB12345',title:'Sound of the Coast',
 user:{name:'Gnarly Composer',is_verified:true},duration:187,
 is_streamable:true,is_available:true,is_stream_gated:false,
 artwork:{'480x480':'https://audius.co/cover.jpg'},...override
});
const track=normalizeAudiusTrack(raw());

test('only open full length Audius recordings are accepted, no previews or gated music',()=>{
 assert.equal(track.source,'audius');
 assert.equal(track.url,'/audius-audio/aB12345');
 assert.equal(track.id,'audius:aB12345');
 for(const candidate of [
  {is_streamable:false},{is_stream_gated:true},{is_unlisted:true},
  {stream_conditions:{follow_user_id:'1'}},{access:{stream:false}},
  {duration:12},{id:'https://bad.example/x'},{user:{name:''}}
 ])assert.equal(normalizeAudiusTrack(raw(candidate)),null);
 assert.equal(audiusPlaybackURL(track),track.url);
 assert.equal(audiusPlaybackURL({...track,id:'youtube:abcdefghijk'}),null);
 assert.equal(audiusPlaybackURL({...track,audiusId:'bad/id'}),null);
});

test('catalogue stays independent of the YouTube backend with strictly derived stream URLs',async()=>{
 let calls=0;
 const request=new Request('https://gnarly.test/api/audius-search?term=sound&limit=12');
 const response=await onRequestGet({request},async(url,options)=>{
  calls++;
  assert.match(url,/^https:\/\/api\.audius\.co\/v1\/tracks\/search\?/);
  assert.equal(new URL(url).searchParams.get('app_name'),'Gnarly');
  assert.equal(options.redirect,'error');
  return Response.json({data:[raw(),raw({id:'other123',is_stream_gated:true})]});
 });
 assert.equal(response.status,200);
 const rows=(await response.json()).results;
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,track.id);
 assert.equal(calls,1);
 const client=await searchAudius('sound',{fetcher:async(url)=> {
  assert.match(url,/^\/api\/audius-search\?/);
  return Response.json({results:rows,status:'ok'});
 }});
 assert.equal(client[0].source,'audius');
 const rejected=await searchAudius('sound',{fetcher:async()=>Response.json({
  status:'ok',results:[{...track,url:'https://evil.example/audio.mp3'}]
 })});
 assert.deepEqual(rejected,[]);
});

test('verified Audius metadata survives the Omnibox cache and cannot be mistaken for a YouTube ID',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
 const a=new OmniboxSession(storage);
 a.cacheResults('sound',[track]);
 const b=new OmniboxSession(storage);
 assert.equal(b.fromCache('sound')?.results[0].url,track.url);
 assert.equal(b.fromCache('sound')?.results[0].source,'audius');
 const fake={...track,audiusId:'wrong' };
 a.cacheResults('bad',[fake]);
 assert.equal(a.fromCache('bad'),null);
});

test('Audius and YouTube results stay distinct, Audius ranks first when origin is limited',()=>{
 const youtube={id:'youtube:abcdefghijk',videoId:'abcdefghijk',source:'youtube',
  title:track.title,artist:track.artist,duration:track.duration};
 const output=personalizedRank('Sound of the Coast',[youtube,track],{originLimited:true});
 assert.equal(output.length,2);
 assert.equal(output[0].source,'audius');
});

test('the audio proxy only accepts trusted HTTPS Audius and storage endpoints',()=>{
 for(const uri of [
  'https://api.audius.co/v1/tracks/aB12345/stream',
  'https://discovery.audius.co/test',
  'https://validator.example.r2.cloudflarestorage.com/file'
 ])assert.equal(allowedAudiusMediaOrigin(uri),true);
 for(const uri of [
  'http://api.audius.co/stream','https://user:pass@api.audius.co',
  'https://evil.example/file','https://audius.co.evil.example/file',
  'https://169.254.169.254/metadata','file:///etc/passwd'
 ])assert.equal(allowedAudiusMediaOrigin(uri),false);
});

test('Audius streaming uses same-origin native audio body and honors partial Range',async()=>{
 const audio=new Uint8Array([73,68,51,0,0,1]);let seen=0;
 const res=await handleAudiusAudio({
  request:new Request('https://gnarly.test/audius-audio/aB12345',{
   headers:{Range:'bytes=0-5'}}),params:{id:'aB12345'}
 },async(url,opts)=>{
  seen++;
  assert.equal(new URL(url).hostname,'api.audius.co');
  assert.equal(opts.headers.Range,'bytes=0-5');
  return new Response(audio,{status:206,headers:{
   'Content-Type':'audio/mpeg','Content-Range':'bytes 0-5/6','Content-Length':'6'}});
 });
 assert.equal(seen,1);
 assert.equal(res.status,206);
 assert.equal(res.headers.get('X-Gnarly-Playback-Source'),'audius-native');
 assert.equal(res.headers.get('Content-Range'),'bytes 0-5/6');
 assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],[...audio]);
});

test('an untrusted redirect, invalid content type and real provider throttles fail closed',async()=>{
 const request=new Request('https://gnarly.test/audius-audio/aB12345');
 const ctx={request,params:{id:'aB12345'}};
 let result=await handleAudiusAudio(ctx,async()=>new Response(null,{status:302,
  headers:{Location:'https://evil.example/secret'}}));
 assert.equal(result.status,502);
 result=await handleAudiusAudio(ctx,async()=>Response.json({message:'not audio'}));
 assert.equal(result.status,502);
 result=await handleAudiusAudio(ctx,async()=>new Response('limited',{status:429,
  headers:{'Retry-After':'40'}}));
 assert.equal(result.status,429);
 assert.equal(result.headers.get('Retry-After'),'40');
});

test('Cloudflare Worker dispatch matches Pages routes, never a third-party iframe',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({data:[raw()]});
 try{
  const search=await worker.fetch(new Request('https://gnarly.test/api/audius-search?term=sample'),{},
   {waitUntil:()=>{}});
  assert.equal(search.status,200);
  assert.equal((await search.json()).results[0].source,'audius');
 }finally{globalThis.fetch=originalFetch;}
 const reject=await worker.fetch(new Request('https://gnarly.test/audius-audio/bad!'),{},
  {waitUntil:()=>{}});
 assert.equal(reject.status,400);
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/const audius=searchAudius\(query/);
 assert.match(source,/track.source==='audius'\?audiusPlaybackURL\(track\):track.url/);
 assert.match(source,/Audius · música completa/);
 assert.match(source,/track.source==='audius'\?'O Audius não conseguiu/);
});
