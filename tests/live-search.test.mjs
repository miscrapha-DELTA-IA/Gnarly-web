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
 assert.match(code,/const delay=live\?520:0/);
 assert.match(code,/searchPaging\?\.controller\?\.abort\(\)/);
 assert.match(code,/refreshLiveResults\(page\)/);
 assert.match(code,/searchNativeBackend\(query,\{limit:size,signal:controller\.signal\}\)/);
});


test('live search retains verified playable R2 recording over an unverified video of the exact same song',()=>{
 const native={id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB',title:'So FN',
  artist:'Nine Vicious',duration:135,source:'youtube'};
 const cached={id:'youtube:kb8UsWvW5Hw',videoId:'kb8UsWvW5Hw',
  title:'So FN',artist:'Nine Vicious',duration:0,source:'youtube',
  playbackAvailability:'r2'};
 const sorted=personalizedRank('Nine Vicious So FN',[native,cached],
  {history:[native],favorites:[native],originLimited:true});
 assert.equal(sorted.length,1,'do not show two indistinguishable versions');
 assert.equal(sorted[0].id,'youtube:kb8UsWvW5Hw',
  'verified same-song R2 wins even when the old unverified video is in history');
 const inverse=personalizedRank('So FN',[cached,native]);
 assert.equal(inverse[0].id,cached.id,'a later unverified entry cannot displace R2');
});
test('cached audio cannot silently replace differently named songs, versions or different durations',()=>{
 const ordinary=track('youtube:CCCCCCCCCCC','So FN Live','Nine Vicious');
 const cached={id:'youtube:kb8UsWvW5Hw',videoId:'kb8UsWvW5Hw',
  title:'So FN',artist:'Nine Vicious',duration:134,source:'youtube',playbackAvailability:'r2'};
 const otherArtist={...cached,id:'youtube:DDDDDDDDDDD',videoId:'DDDDDDDDDDD',artist:'Another Artist'};
 const ranking=personalizedRank('So FN',[ordinary,otherArtist,cached]);
 assert.equal(ranking.length,3);
 const remaster={...cached,id:'youtube:EEEEEEEEEEE',videoId:'EEEEEEEEEEE',duration:240,playbackAvailability:undefined};
 const together=personalizedRank('So FN',[remaster,cached]);
 assert.equal(together[0].id,remaster.id,'different length must not be forcibly substituted');
 assert.equal(together.length,1,'existing exact-key dedup remains stable');
});
