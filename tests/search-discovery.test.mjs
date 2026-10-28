import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discoveryQueries,mixDiscoveryFeed} from '../lib/search-discovery.js';

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
 assert.deepEqual(queries,['Aurora','hip hop']);
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
test('discovery still shows saved tracks when remote catalogue is unavailable',()=>{
 const offline=song('AAAAAAAAAAA','Offline','local');
 const fromPlaylist=song('BBBBBBBBBBB','Playlist');
 const result=mixDiscoveryFeed({offline:[offline],playlists:[fromPlaylist],remote:[]});
 assert.deepEqual(new Set(result.map(t=>t.id)),new Set([offline.id,fromPlaylist.id]));
});
test('search tab starts a mixed feed without typing and leaving search aborts old work on typing',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/if\(which==='search'\)\{void runSearch\(state\.searchTerm,\{live:true\}\)/);
 assert.match(app,/if\(!query\)\{[\s\S]*?refreshSearchDiscovery\(page,\{loading:!page\.remote\.length\}\)/);
 assert.match(app,/searchPaging\?\.controller\?\.abort\(\)/);
 assert.match(app,/searchNativeBackend\(query,\{[\s\S]*?limit:14,signal:page\.controller\.signal/);
});
