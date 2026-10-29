import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instantSearch,personalizedRank} from '../lib/live-search.js';
const track=(id,title,artist='Demo',source='youtube')=>({id,title,artist,source,duration:200});
test('first letter reveals relevant favorites and history instantly without waiting for network',()=>{
 const favorite=track('favorite','Aquarela'),played=track('played','Aurora'),
  unrelated=track('other','Música distante');
 const list=instantSearch('a',{favorites:[favorite],history:[played,unrelated]});
 assert.equal(list[0].id,'favorite');
 assert.ok(list.some(x=>x.id==='played'));
 assert.ok(!list.some(x=>x.id==='other'));
});
test('favorites and play history guide equally relevant results, not unrelated songs',()=>{
 const newer=track('new','Aurora Digital','New Artist');
 const listened=track('played','Aurora Tardia','Familiar');
 const liked=track('fav','Aurora Bonita','Favorite');
 const results=personalizedRank('aurora',[newer,listened,liked],
  {favorites:[liked],history:[{...listened,plays:5,lastPlayed:Date.now()}]});
 assert.equal(results[0].id,'fav');
 assert.equal(results[1].id,'played');
 assert.equal(results.length,3);
});
test('exact title stays stronger than an unrelated loved artist',()=>{
 const exact=track('exact','Neon','Stranger');
 const weak=track('weak','Neon After Dark','Loved');
 const ranked=personalizedRank('neon',[weak,exact],{favorites:[weak]});
 assert.equal(ranked[0].id,'exact');
});
test('local suggestion engine avoids duplicates across favorites playlists and history',()=>{
 const song=track('one','Coração do Sol','Ana');
 const duplicate={...song,id:'other'};
 const result=instantSearch('c',{favorites:[song],history:[duplicate],playlists:[song]});
 assert.deepEqual(result.map(x=>x.id),['one']);
});
test('live input is debounced and obsolete provider requests are canceled',()=>{
 const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(code,/if\(el\.id==='search-term'\)\{void runSearch\(el\.value,\{live:true\}\)/);
 assert.match(code,/if\(live&&query\.length<3\)\{/);
 assert.match(code,/const delay=live\?420:0/);
 assert.match(code,/searchPaging\?\.controller\?\.abort\(\)/);
 assert.match(code,/refreshLiveResults\(page\)/);
 assert.match(code,/searchNativeBackend\(query,\{limit:size,signal:controller\.signal\}\)/);
});
