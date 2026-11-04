import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discoveryQueries,mixDiscoveryFeed} from '../lib/search-discovery.js';
import {songFingerprint} from '../lib/listening-intelligence.js';

const song=(id,artist='Demo',source='youtube')=>({
 id:'youtube:'+id,videoId:id,artist,title:'Canção '+id,source,duration:180
});
test('blank query has two bounded, distinct searches even for a new listener',()=>{
 const queries=discoveryQueries({now:0});
 assert.equal(queries.length,2);
 assert.ok(queries.every(q=>q.length));
 assert.notEqual(queries[0],queries[1]);
});
test('discovery respects learned favorite artist but always includes broad exploration',()=>{
 const memory={affinityArtists:()=>['Aurora','Florence']};
 const queries=discoveryQueries({memory,now:0});
 assert.deepEqual(queries,['Aurora','Florence']);
});
test('blank-query feed interleaves favorites history playlists and verified discoveries',()=>{
 const liked=song('AAAAAAAAAAA','Liked');
 const played=song('BBBBBBBBBBB','Played');
 const saved=song('CCCCCCCCCCC','Saved');
 const remote=[song('DDDDDDDDDDD','New1'),song('EEEEEEEEEEE','New2'),
   song('FFFFFFFFFFF','New3'),song('GGGGGGGGGGG','New4')];
 const result=mixDiscoveryFeed({favorites:[liked],history:[played],
  playlists:[saved],remote,max:12});
 assert.equal(result[0].id,liked.id);
 assert.ok(result.some(t=>t.id===played.id));
 assert.ok(result.some(t=>t.id===saved.id));
 assert.ok(result.some(t=>remote.some(r=>r.id===t.id)));
 assert.ok(result.indexOf(played)<result.length-1);
});
test('empty search never fabricates tracks and does not repeat across providers',()=>{
 const first=song('AAAAAAAAAAA','Ana');
 const same={...first,id:'youtube:ZZZZZZZZZZZ',videoId:'ZZZZZZZZZZZ'};
 const result=mixDiscoveryFeed({favorites:[first],history:[same],
  remote:[same,song('BBBBBBBBBBB','Another')],current:first,max:12});
 assert.ok(!result.some(t=>t.id===first.id||t.id===same.id));
 assert.equal(result.length,1);
 assert.deepEqual(mixDiscoveryFeed({}),[]);
});
test('unrelated earlier searches cannot linger in personalized blank discovery',()=>{
 const known=song('AAAAAAAAAAA','Loved'),old=song('BBBBBBBBBBB','Unrelated');
 const results=mixDiscoveryFeed({favorites:[known],previous:[old]});
 assert.ok(results.some(x=>x.id===known.id));
 assert.ok(!results.some(x=>x.id===old.id));
});
test('discovery still shows saved tracks when remote catalogue is unavailable',()=>{
 const offline=song('AAAAAAAAAAA','Offline','local');
 const fromPlaylist=song('BBBBBBBBBBB','Playlist');
 const result=mixDiscoveryFeed({offline:[offline],playlists:[fromPlaylist],remote:[]});
 assert.deepEqual(new Set(result.map(t=>t.id)),new Set([offline.id,fromPlaylist.id]));
});
test('new discovery suppresses recently replayed or skipped recordings',()=>{
 const liked=song('AAAAAAAAAAA','Taste');
 const replay=song('BBBBBBBBBBB','Taste');
 const fresh=song('CCCCCCCCCCC','Taste');
 const unrelated=song('DDDDDDDDDDD','Random Artist');
 const now=Date.now();
 const memory={events:[{type:'play',key:songFingerprint(replay),artist:replay.artist,
  title:replay.title,at:now},{type:'skip',key:songFingerprint(unrelated),
  artist:unrelated.artist,title:unrelated.title,at:now}],
  profile:()=>({artists:new Map([['taste',9]])})};
 const feed=mixDiscoveryFeed({favorites:[liked],remote:[replay,fresh,unrelated],
  memory,max:12});
 assert.ok(feed.some(x=>x.id===fresh.id));
 assert.ok(!feed.some(x=>x.id===replay.id||x.id===unrelated.id));
});
test('discovery caps random new artists when history supports known favorites',()=>{
 const favorite=song('AAAAAAAAAAA','Taste');
 const random=Array.from({length:13},(_,i)=>song(
  String(i).padStart(11,'0'),'Unrelated'+i));
 const feed=mixDiscoveryFeed({favorites:[favorite],remote:random,max:24});
 const unknown=feed.filter(x=>x.artist!=='Taste');
 assert.ok(unknown.length<=3,'at most one unrelated artist per eight positions');
 assert.ok(feed.some(x=>x.id===favorite.id));
 const newListener=mixDiscoveryFeed({remote:random,max:24});
 assert.ok(newListener.length>unknown.length,
  'people with no history must still get broad new music discovery');
});

test('search tab starts a mixed feed without typing and leaving search aborts old work on typing',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/if\(which==='search'\)\{void runSearch\(state\.searchTerm,\{live:true\}\)/);
 assert.match(app,/if\(!query\)\{[\s\S]*?refreshSearchDiscovery\(page,\{loading:!page\.remote\.length\}\)/);
 assert.match(app,/searchPaging\?\.controller\?\.abort\(\)/);
 assert.match(app,/searchNativeBackend\(query,\{[\s\S]*?limit:14,signal:page\.controller\.signal/);
});
