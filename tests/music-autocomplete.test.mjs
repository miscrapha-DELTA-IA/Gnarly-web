import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchMusicSuggestions,credibleCorrection,mergeSearchSuggestions,
 localMusicSuggestions} from '../lib/music-autocomplete.js';
import {cleanSuggestions,onRequestGet} from '../functions/api/suggest.js';
import {OmniboxSession} from '../lib/omnibox.js';
import {fuzzySongMatchScore} from '../lib/search-intent.js';
import worker from '../src/worker.js';

test('real provider suggestion decoder is bounded, deduped and neutral',()=>{
 assert.deepEqual(cleanSuggestions(['midnight city','Midnight City','midnight city m83',
  42,'a'.repeat(120),'A <bad>'], 'midnigth city',3).slice(0,2),
 ['midnight city','midnight city m83']);
 assert.deepEqual(cleanSuggestions([], 'city'),[]);
});
test('native autocomplete proxy forwards only typed query and never media URLs',async()=>{
 const before=globalThis.fetch;
 const seen=[];
 globalThis.fetch=async (url,options)=>{
  seen.push({url:String(url),options});
  return Response.json(['nine vicious','nine vicious so fn']);
 };
 try{
  const r=await onRequestGet({
   request:new Request('https://example.org/api/suggest?q=ninne%20vicous'),
   env:{GNARLY_BACKEND_URL:'https://backend.example'}
  });
  const payload=await r.json();
  assert.equal(r.status,200);
  assert.deepEqual(payload.suggestions,['nine vicious','nine vicious so fn']);
  assert.equal(seen.length,1);
  assert.match(seen[0].url,/https:\/\/backend\.example\/v1\/suggest\?q=ninne\+vicous/);
  assert.ok(!seen[0].url.includes('/stream')&&!seen[0].url.includes('/download'));
  assert.ok(seen[0].options.signal,'upstream bounded timeout required');
 }finally{globalThis.fetch=before}
});
test('autocomplete is available in the standalone Cloudflare Worker too',async()=>{
 const before=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(['midnight city']);
 try{
  const r=await worker.fetch(new Request('https://gnarly.test/api/suggest?q=midnigth'),
   {GNARLY_BACKEND_URL:'https://backend.example'},{waitUntil:()=>{}});
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).suggestions,['midnight city']);
 }finally{globalThis.fetch=before}
});
test('bad suggestion server results never become cached imaginary songs',async()=>{
 const before=globalThis.fetch;
 globalThis.fetch=async()=>new Response('upstream failure',{status:503});
 try{
  const r=await onRequestGet({request:new Request('https://example.org/api/suggest?q=something'),
   env:{}});
  assert.equal(r.status,503);
  assert.equal(r.headers.get('cache-control'),'no-store');
 }finally{globalThis.fetch=before}
});
test('autocomplete recognizes common typos and adjacent letter transpositions',()=>{
 assert.equal(credibleCorrection('midnigth city',['midnight city']),'midnight city');
 assert.equal(credibleCorrection('ninne vicous',['nine vicious','nine vicious so fn']),'nine vicious');
 assert.equal(credibleCorrection('sweater weathr',['sweater weather']),'sweater weather');
 const track={title:'Midnight City',artist:'M83'};
 assert.ok(fuzzySongMatchScore(track,'midnigth city')>=82);
});
test('autocomplete refuses to silently change style, version or ambiguous spelling',()=>{
 assert.equal(credibleCorrection('nightcore',['nightcore remix','nightcore song']),null);
 assert.equal(credibleCorrection('so fn',['so fun']),null);
 assert.equal(credibleCorrection('halo',['halos','haloo']),null);
 assert.equal(credibleCorrection('blinding lights',['blinding lights remix']),null);
});
test('personal artist/title suggestions join public autocomplete but do not fabricate songs',()=>{
 const l=localMusicSuggestions('mid',{
  favorites:[{title:'Midnight City',artist:'M83'}],
  history:[{title:'Midnight Rain',artist:'Taylor Swift'}],
 });
 assert.ok(l.includes('Midnight City'));
 assert.ok(l.includes('Midnight Rain'));
 assert.ok(!l.includes('M83'));
 const suggestions=mergeSearchSuggestions('mid',{local:l,remote:['midnight city lyrics','midnight city remix'],max:5});
 assert.ok(suggestions.includes('Midnight City'));
 assert.ok(suggestions.some(s=>s.includes('lyrics')));
});
test('suggestion fetcher memoizes valid queries and never retries on prefix blur',async()=>{
 const calls=[];
 const fetcher=async (url,options)=>{
  calls.push({url,options});
  return Response.json({suggestions:['midnight city','midnight city m83']});
 };
 const one=await fetchMusicSuggestions('midnigth',{fetcher});
 const two=await fetchMusicSuggestions('midnigth',{fetcher});
 assert.deepEqual(one,two);assert.equal(calls.length,1);
 assert.match(calls[0].url,/\/api\/suggest\?q=midnigth/);
 assert.equal(calls[0].options.credentials,'omit');
 assert.deepEqual(await fetchMusicSuggestions('mi',{fetcher}),[]);
 assert.equal(calls.length,1);
});
test('submitted queries persist on device, transient typed prefixes do not',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const session=new OmniboxSession(store);
 session.setQuery('ninne v');
 assert.deepEqual(session.recentQueries(),[]);
 session.rememberQuery('Nine Vicious');
 session.rememberQuery('nine vicious');
 session.rememberQuery('Midnight City');
 assert.deepEqual(session.recentQueries(),['Midnight City','nine vicious']);
 assert.equal(new OmniboxSession(store).recentQueries()[0],'Midnight City');
});
test('suggestions support quick click and accessible keyboard without recreating the search field',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/id="search-suggestions"/);
 assert.match(app,/data-search-suggest/);
 assert.match(app,/renderSearchSuggestions\(searchPaging\)/);
 assert.match(app,/scheduleMusicSuggestions\(page,\{live\}\)/);
 assert.match(app,/credibleCorrection\(page\.query,page\.remoteSuggestions\)/);
 assert.match(app,/e\.key==='ArrowDown'/);
 assert.match(app,/e\.key==='Escape'/);
 assert.match(app,/const delay=live\?520:0/);
});
