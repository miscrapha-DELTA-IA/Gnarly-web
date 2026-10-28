import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';

const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url),'utf8'));
const route=(path,method='GET',body,bindings={})=>worker.fetch(
 new Request('https://gnarly-web.test'+path, {
  method, ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
 }),
 {ASSETS:{fetch:async request=>new Response('ASSET: '+new URL(request.url).pathname,{status:200})},...bindings},
 {waitUntil:()=>{}}
);
test('Wrangler uploads only dist, never node_modules or the git root',()=>{
 assert.equal(config.assets.directory,'./dist');
 assert.equal(config.main,'./src/worker.js');
 assert.deepEqual(config.assets.run_worker_first,['/api/*','/fast-audio/*','/fast-prepare/*']);
 assert.deepEqual(config.r2_buckets,[{binding:'GNARLY_AUDIO_R2',bucket_name:'gnarly-cache'}]);
 assert.notEqual(config.assets.directory,'.');
});
test('Worker returns only staged static assets on non-API paths',async()=>{
 const root=await route('/');assert.equal(root.status,200);assert.equal(await root.text(),'ASSET: /');
 const css=await route('/styles.css');assert.equal(await css.text(),'ASSET: /styles.css');
});
test('Worker uses native 400 and 405 for catalogue; unknown APIs are 404',async()=>{
 const bad=await route('/api/catalog?term=');assert.equal(bad.status,400);
 const rejected=await route('/api/catalog','POST',{});assert.equal(rejected.status,405);assert.equal(rejected.headers.get('allow'),'GET');
 const missing=await route('/api/not-defined');assert.equal(missing.status,404);
});
test('Omnibox and stem admission retain edge validation',async()=>{
 const omnibox=await route('/api/omnibox?term=');assert.equal(omnibox.status,400);
 const ticket=await route('/api/stems-ticket','POST',{sha256:'bad',bytes:20,seconds:5});assert.equal(ticket.status,400);
 assert.equal((await route('/api/stems-ticket')).status,405);
});

test('Worker streams R2 cache hits and byte ranges through the first-party fast route',async()=>{
 const body=new Uint8Array(2048).fill(8);
 const reads=[];
 const bucket={
  async get(key,{range}={}){reads.push({key,range});return {size:body.length,httpEtag:'"etag"',body:new Blob([body],{type:'audio/mp4'}).stream()}},
  async head(key){reads.push({key,head:true});return {size:body.length,httpEtag:'"etag"'}}
 };
 const get=await route('/fast-audio/ABCDEFGHIJK','GET',null,{GNARLY_AUDIO_R2:bucket});
 assert.equal(get.status,200);
 assert.equal(get.headers.get('x-gnarly-playback-source'),'r2-edge');
 assert.equal((await get.arrayBuffer()).byteLength,2048);
 assert.equal(reads[0].key,'ABCDEFGHIJK/audio.m4a');
 const head=await route('/fast-audio/ABCDEFGHIJK','HEAD',null,{GNARLY_AUDIO_R2:bucket});
 assert.equal(head.status,200);
 assert.equal(head.headers.get('content-length'),'2048');
});
test('Worker rejects malformed audio identities and disallowed preparation methods',async()=>{
 const bad=await route('/fast-audio/invalid');
 assert.equal(bad.status,400);
 const invalidPreparation=await route('/fast-prepare/invalid','POST',{});
 assert.equal(invalidPreparation.status,400);
 const wrongMethod=await route('/fast-prepare/ABCDEFGHIJK','GET');
 assert.equal(wrongMethod.status,405);
 assert.equal(wrongMethod.headers.get('allow'),'POST');
});
