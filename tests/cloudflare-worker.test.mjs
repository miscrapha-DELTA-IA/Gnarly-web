import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';

const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url),'utf8'));
const route=(path,method='GET',body)=>worker.fetch(
 new Request('https://gnarly-web.test'+path, {
  method, ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
 }),
 {ASSETS:{fetch:async request=>new Response('ASSET: '+new URL(request.url).pathname,{status:200})}},
 {waitUntil:()=>{}}
);
test('Wrangler uploads only dist, never node_modules or the git root',()=>{
 assert.equal(config.assets.directory,'./dist');
 assert.equal(config.main,'./src/worker.js');
 assert.deepEqual(config.assets.run_worker_first,['/api/*']);
 assert.notEqual(config.assets.directory,'.');
});
test('Worker returns only staged static assets on non-API paths',async()=>{
 const root=await route('/');assert.equal(root.status,200);assert.equal(await root.text(),'ASSET: /');
 const css=await route('/styles.css');assert.equal(await css.text(),'ASSET: /styles.css');
});
test('Worker uses native 400 and 405 for catalogue; unknown APIs are 404',async()=>{
 const bad=await route('/api/catalog?term=x');assert.equal(bad.status,400);
 const rejected=await route('/api/catalog','POST',{});assert.equal(rejected.status,405);assert.equal(rejected.headers.get('allow'),'GET');
 const missing=await route('/api/not-defined');assert.equal(missing.status,404);
});
test('Omnibox and stem admission retain edge validation',async()=>{
 const omnibox=await route('/api/omnibox?term=x');assert.equal(omnibox.status,400);
 const ticket=await route('/api/stems-ticket','POST',{sha256:'bad',bytes:20,seconds:5});assert.equal(ticket.status,400);
 assert.equal((await route('/api/stems-ticket')).status,405);
});
