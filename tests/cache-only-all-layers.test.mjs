import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio} from '../functions/fast-audio/[id].js';

const id='ABCDEFGHIJK';
const bytes=new Uint8Array(4096);
bytes.set([0,0,0,24,102,116,121,112,77,52,65,32]);
const req=(headers={})=>new Request('https://gnarly-web-pages.pages.dev/fast-audio/'+id+'?cached-only=1',{headers});
function context(bucket,waitUntil=()=>{},request=req()){
 return {request,params:{id},env:{GNARLY_AUDIO_R2:bucket},waitUntil};
}

test('HTTP 429 cache-only finds exact full audio in Render local cache and promotes into edge R2',async()=>{
 let promoted=null,background;
 const bucket={
  get:async()=>null,
  head:async()=>null,
  put:async(key,body,metadata)=>{promoted={key,body,metadata}}
 };
 const urls=[];
 const response=await handleFastAudio(context(bucket,p=>background=p),async url=>{
  urls.push(url);
  return new Response(bytes,{status:200,headers:{'content-type':'audio/mp4',
   'content-length':String(bytes.length),'content-disposition':'attachment; filename="Cached Title.m4a"'}});
 });
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'cached-render-origin');
 assert.equal((await response.arrayBuffer()).byteLength,bytes.length);
 await background;
 assert.equal(promoted.key,id+'/audio.m4a');
 assert.equal(promoted.metadata.customMetadata.title,'Cached Title');
 assert.equal(urls.length,1);
 assert.match(urls[0],/cache_only=1/);
 assert.doesNotMatch(urls[0],/\/stream\?/);
});

test('cached-only maintains exact byte range and never promotes a partial clip',async()=>{
 let promoted=0;
 const bucket={get:async()=>null,put:async()=>{promoted++}};
 const urls=[],head=[];
 const response=await handleFastAudio(context(bucket,()=>{},
  req({Range:'bytes=0-1023'})),async (url,opts)=>{
  urls.push(url);head.push(opts.headers);
  return new Response(bytes.slice(0,1024),{status:206,headers:{
   'content-type':'audio/mp4','content-length':'1024',
   'content-range':'bytes 0-1023/4096'
  }});
 });
 assert.equal(response.status,206);
 assert.equal(response.headers.get('content-range'),'bytes 0-1023/4096');
 assert.equal((await response.arrayBuffer()).byteLength,1024);
 assert.equal(head[0].Range,'bytes=0-1023');
 assert.equal(promoted,0);
 assert.equal(urls.length,1);
});

test('Render cached-only 404 cannot provoke provider extraction or retries',async()=>{
 const paths=[];
 const response=await handleFastAudio(context({get:async()=>null}),async url=>{
  paths.push(new URL(url).pathname+new URL(url).search);
  return new Response('not cached',{status:404});
 });
 assert.equal(response.status,503);
 assert.equal(paths.length,1);
 assert.ok(paths[0].includes('cache_only=1'));
 assert.ok(!paths[0].includes('/stream'));
});

test('Render cache-only 429 is not retried as a new extraction',async()=>{
 const paths=[];
 const response=await handleFastAudio(context({get:async()=>null}),async url=>{
  paths.push(new URL(url).pathname);
  return new Response('limited',{status:429,headers:{'Retry-After':'300'}});
 });
 assert.equal(response.status,503);
 assert.deepEqual(paths,['/download']);
});
