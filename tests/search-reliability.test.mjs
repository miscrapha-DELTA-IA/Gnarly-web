import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCatalog,searchNativeBackend,hedgeCatalogue} from '../lib/catalog.js';
import worker from '../src/worker.js';

async function withFetch(fetcher,run){
 const previous=globalThis.fetch;
 globalThis.fetch=fetcher;
 try{return await run()}finally{globalThis.fetch=previous}
}
test('catalogue provider outages reject, while genuine empty searches resolve empty',async()=>{
 await withFetch(async()=>Response.json({error:'temporary'}, {status:503}),async()=>{
  await assert.rejects(searchCatalog('unavailable'),AggregateError);
 });
 await withFetch(async()=>Response.json({results:[]}),async()=>{
  assert.deepEqual(await searchCatalog('empty'),[]);
 });
});
test('malformed provider payloads do not become successful empty results',async()=>{
 await withFetch(async()=>Response.json({error:'invalid payload'}),async()=>{
  await assert.rejects(searchCatalog('malformed'),AggregateError);
 });
});
test('native search recognizes legacy HTTP-200 unavailable status and malformed results',async()=>{
 for(const data of [{results:[],status:'backend_unavailable'},{error:'unavailable'}]){
  await withFetch(async()=>Response.json(data),()=>assert.rejects(searchNativeBackend('test'),/unavailable/));
 }
 await withFetch(async()=>Response.json({results:[],status:'ok'}),async()=>{
  assert.deepEqual(await searchNativeBackend('empty'),[]);
 });
});
test('one usable catalogue still wins when the alternative is unavailable',async()=>{
 const result=await hedgeCatalogue(async()=>{throw Error('provider down')},async()=>[{source:'preview',id:'itunes:1'}],{throwOnFailure:true,delay:0});
 assert.equal(result[0].source,'preview');
});
async function edgeCase(path,fetcher,run){
 const previous=globalThis.caches,entries=new Map(),jobs=[];
 globalThis.caches={default:{
  async match(request){return entries.get(request.url)?.clone()},
  async put(request,response){entries.set(request.url,response.clone())}
 }};
 const request=()=>worker.fetch(new Request('https://gnarly.test'+path),{}, {waitUntil:job=>jobs.push(job)});
 try{return await withFetch(fetcher,()=>run({request,entries,jobs}))}
 finally{globalThis.caches=previous}
}
const appleResult={wrapperType:'track',trackId:1,trackName:'Fixture',artistName:'GNARLY',previewUrl:'https://example.org/preview.m4a'};
test('Worker execution context persists successful public metadata for both search routes',async()=>{
 for(const kind of ['catalog','omnibox']){
  let calls=0;
  await edgeCase('/api/'+kind+'?term=fixture',async(url,options)=>{
   calls++;assert.equal(options.cf.cacheTtlByStatus['400-599'],-1);
   return kind==='catalog'?Response.json({results:[appleResult]}):
    new Response(JSON.stringify({id:'ABCDEFGHIJK',title:'Fixture',artist:'GNARLY'})+'\n');
  },async({request,entries,jobs})=>{
   const first=await request();assert.equal(first.status,200);
   assert.equal(first.headers.get('X-Gnarly-Search-Cache'),'MISS');
   await Promise.all(jobs);
   assert.equal(jobs.length,1,'top-level waitUntil is used by Workers and Pages');
   assert.equal(entries.size,1);
   const cached=await request();assert.equal(cached.status,200);
   assert.equal(cached.headers.get('X-Gnarly-Search-Cache'),'HIT');
   assert.equal(calls,1,'repeat search reuses successful edge metadata');
  });
 }
});
test('failed searches never poison edge cache and can recover on the same URL',async()=>{
 for(const kind of ['catalog','omnibox']){
  let available=false,calls=0;
  await edgeCase('/api/'+kind+'?term=recover',async()=>{
   calls++;
   if(!available)return new Response('temporary',{status:503});
   return kind==='catalog'?Response.json({results:[appleResult]}):
    new Response(JSON.stringify({id:'ABCDEFGHIJK',title:'Recovered'})+'\n');
  },async({request,entries,jobs})=>{
   const failed=await request();
   assert.equal(failed.status,kind==='catalog'?502:503);
   assert.equal(failed.headers.get('cache-control'),'no-store');
   assert.equal(entries.size,0);
   available=true;
   const recovered=await request();
   assert.equal(recovered.status,200);assert.equal((await recovered.json()).results.length,1);
   await Promise.all(jobs);assert.equal(entries.size,1);assert.equal(calls,2);
  });
 }
});
test('empty search responses are not persisted as a catalogue outage',async()=>{
 await edgeCase('/api/catalog?term=empty',async()=>Response.json({results:[]}),async({request,entries,jobs})=>{
  assert.equal((await request()).status,200);
  await Promise.all(jobs);assert.equal(entries.size,0);
 });
});
test('obsolete browser searches cancel the actual edge-to-provider request',async()=>{
 for(const kind of ['catalog','omnibox']){
  const controller=new AbortController();let upstream;
  await withFetch(async(_url,{signal})=>{
   upstream=signal;
   return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  },async()=>{
   const pending=worker.fetch(new Request('https://gnarly.test/api/'+kind+'?term=obsolete',{signal:controller.signal}),{}, {waitUntil:()=>{}});
   assert.ok(upstream&&!upstream.aborted);
   controller.abort();
   const canceled=await pending;
   assert.equal(upstream.aborted,true);
   assert.equal(canceled.headers.get('cache-control'),'no-store');
  });
 }
});

test('old backend local search 429 is classified as busy 503 with no upstream lock',async()=>{
 let calls=0;
 await edgeCase('/api/omnibox?term=limited',async()=>{
  calls++;
  return new Response('local worker busy',{status:429,headers:{'Retry-After':'45'}});
 },async({request,entries})=>{
  const blocked=await request();
  assert.equal(blocked.status,503);
  assert.equal(blocked.headers.get('Retry-After'),'1');
  assert.equal(blocked.headers.get('X-Search-Error'),'search_busy');
  assert.equal((await blocked.json()).status,'backend_busy');
  assert.equal(entries.size,0);
  assert.equal(calls,1);
 });
});
test('explicit genuine upstream 429 retains rate limit and never enters search metadata cache',async()=>{
 await edgeCase('/api/omnibox?term=provider-limited',async()=>new Response('blocked',{status:429,
  headers:{'Retry-After':'45','X-Search-Error':'upstream_rate_limited'}}),
  async({request,entries})=>{
   const response=await request();
   assert.equal(response.status,429);
   assert.equal((await response.json()).status,'upstream_rate_limited');
   assert.equal(response.headers.get('Retry-After'),'45');
   assert.equal(entries.size,0);
 });
});
test('busy local metadata can retry once and recover immediately without cooldown',async()=>{
 let calls=0;
 const term='busy-retry-'+Date.now();
 await withFetch(async()=>{
  calls++;
  if(calls===1)return Response.json({results:[],status:'backend_busy'},{
   status:503,headers:{'X-Search-Error':'search_busy','Retry-After':'1'}});
  return Response.json({results:[{source:'youtube',id:'youtube:ABCDEFGHIJK',
   videoId:'ABCDEFGHIJK',title:'Original',artist:'Real Artist'}],status:'ok'});
 },async()=>{
  const recovered=await searchNativeBackend(term);
  assert.equal(recovered[0].title,'Original');
  assert.equal(calls,2);
 });
});
test('verified complete-track metadata remains useful on a short catalogue outage',async()=>{
 const key='gnarly-stale-search-'+Date.now();
 let now=Date.now(),calls=0;
 const fixture={id:'youtube:ABCDEFGHIJK',videoId:'ABCDEFGHIJK',source:'youtube',title:'Still available metadata'};
 await withFetch(async()=>{
  calls++;
  return Response.json({results:[fixture],status:'ok'});
 },async()=>{
  const first=await searchNativeBackend(key,{limit:5,now:()=>now});
  assert.deepEqual(first,[fixture]);
  now+=4*60*1000;
  assert.deepEqual(await searchNativeBackend(key,{limit:5,now:()=>now}),[fixture]);
  assert.equal(calls,1,'a recent positive result avoids provider requests');
 });
 now+=16*60*1000;
 await withFetch(async()=>{calls++;return Response.json({error:'backend unavailable'},{status:503})},async()=>{
  assert.deepEqual(await searchNativeBackend(key,{limit:5,now:()=>now}),[fixture]);
  assert.equal(calls,2,'short outage returns real previously verified metadata');
  now+=3*60*60*1000;
  await assert.rejects(searchNativeBackend(key,{limit:5,now:()=>now}));
 });
});
test('browser backs off after explicit search 429 while retaining prior successful metadata',async()=>{
 let calls=0;
 const live='gnarly-fixture-'+Date.now();
 await withFetch(async()=>{calls++;return Response.json({results:[{id:'youtube:ABCDEFGHIJK',source:'youtube',videoId:'ABCDEFGHIJK',title:'Fixture'}],status:'ok'})},async()=>{
  assert.equal((await searchNativeBackend(live,{limit:9})).length,1);
  assert.equal((await searchNativeBackend(live,{limit:9})).length,1);
  assert.equal(calls,1,'positive metadata is reused instead of asking Render again');
 });
 await withFetch(async()=>{calls++;return new Response('rate limit',{status:429,headers:{'Retry-After':'30'}})},async()=>{
  await assert.rejects(searchNativeBackend(live+'-other'),/429/);
  await assert.rejects(searchNativeBackend(live+'-yet-another'),/rate limited/);
  assert.equal(calls,2,'backoff prevents a repeated provider storm');
  assert.equal((await searchNativeBackend(live,{limit:9})).length,1,'cached metadata remains usable during cooldown');
 });
});
