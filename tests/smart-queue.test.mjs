import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendUnique,commitPlaying,moveTrack,removeTrack,shuffleUpcoming,radioQuery,chooseSmartTracks,PlaylistLibrary,AudioConnectionWarmup,effectiveMode} from '../lib/smart-queue.js';
const tr=(id,artist='AURORA',album='All My Demons')=>({id:'youtube:'+id,videoId:id,source:'youtube',title:'Song '+id,artist,album,duration:220,artwork:'https://example.com/a.jpg'});
const a=tr('AAAAAAAAAAA'),b=tr('BBBBBBBBBBB'),c=tr('CCCCCCCCCCC'),d=tr('DDDDDDDDDDD','Another Artist','Other');
test('queue keeps manually selected order, blocks duplicates and current song',()=>{
 const q=appendUnique([a,b],[a,c,d,c],b.id);assert.deepEqual(q.map(x=>x.id),[a.id,b.id,c.id,d.id]);
 assert.deepEqual(commitPlaying(q,c.id).map(x=>x.id),[a.id,b.id,d.id]);
 assert.deepEqual(q.map(x=>x.id),[a.id,b.id,c.id,d.id],'immutable until confirmed playback');
 assert.deepEqual(moveTrack(q,c.id,-1).map(x=>x.id),[a.id,c.id,b.id,d.id]);
 assert.deepEqual(removeTrack(q,b.id).map(x=>x.id),[a.id,c.id,d.id]);
});
test('shuffle randomizes only upcoming tracks and keeps audio identities/provenance intact',()=>{
 const source=[a,b,c,d],after=shuffleUpcoming(source,()=>0);
 assert.deepEqual(after.map(x=>x.id),[b.id,c.id,d.id,a.id]);
 assert.deepEqual(source.map(x=>x.id),[a.id,b.id,c.id,d.id]);
 assert.equal(shuffleUpcoming([],()=>0).length,0);
 assert.deepEqual(shuffleUpcoming([a],()=>0),[a]);
 const auto={...c,smartAuto:true};
 assert.equal(shuffleUpcoming([a,auto],()=>0)[0].smartAuto,true);
});
test('no catalog lookup for missing/unverified artist or album',()=>{
 assert.equal(radioQuery('artist',{...a,artist:'YouTube Music'}),'');
 assert.equal(radioQuery('album',{...a,album:''}),'');
 assert.equal(radioQuery('album',a),'AURORA All My Demons');
 assert.equal(effectiveMode('broken'),'off');
});
test('album/artist only auto-queue exact credits, not matching titles on other recordings',()=>{
 const lookalike={...a,id:'youtube:EEEEEEEEEEE',videoId:'EEEEEEEEEEE',artist:'Other'};
 assert.deepEqual(chooseSmartTracks({mode:'album',anchor:a,candidates:[a,b,d,lookalike]}).map(t=>t.id),[b.id]);
 assert.deepEqual(chooseSmartTracks({mode:'artist',anchor:a,candidates:[a,b,c,d]}).map(t=>t.id),[b.id,c.id]);
 assert.deepEqual(chooseSmartTracks({mode:'artist',anchor:a,candidates:[b,c],existing:[b]}).map(t=>t.id),[c.id]);
});
test('mix prioritizes existing credit, excludes recently heard and preview-only suggestions',()=>{
 const preview={...b,id:'itunes:1',source:'preview'};
 const tracks=chooseSmartTracks({mode:'mix',anchor:a,candidates:[preview,b,c,d],recent:[b]});
 assert.deepEqual(tracks.map(t=>t.id),[c.id]);
});
test('named playlists persist metadata, dedupe and never persist local blob URLs',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const lib=new PlaylistLibrary(store);
 assert.equal(lib.create('Road Trip'),true);
 assert.equal(lib.add('Road Trip',a),true);
 assert.equal(lib.add('Road Trip',a),false);
 assert.equal(lib.add('Road Trip',{id:'local:1',source:'local',title:'Owned',url:'blob:abc'}),false);
 assert.deepEqual(new PlaylistLibrary(store).tracks('Road Trip').map(t=>t.id),[a.id]);
 assert.equal(lib.remove('Road Trip',a.id),true);
 assert.equal(lib.delete('Meu Mix'),false);
 assert.equal(lib.delete('Road Trip'),true);
});
test('wakeup can happen once without awaiting or downloading media',async()=>{
 const calls=[];const warm=new AudioConnectionWarmup((url,options)=>{calls.push({url,options});return Promise.reject(Error('offline'));});
 warm.start();warm.start();
 await Promise.resolve();
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/\/health$/);
 assert.equal(calls[0].options.mode,'no-cors');
 assert.doesNotMatch(calls[0].url,/download/);
});

test('player integration keeps source identity and queue transitions transactional',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/tr\.source\s*=\s*['"]preview['"]/,'Rendering must not overwrite the selected audio source');
 assert.match(code,/if\(fromQueue\)\{\s*state\.queue=commitPlaying\(state\.queue,track\.id\)/,'Selection must advance queue BEFORE loading audio');
 assert.match(code,/let candidate=state\.queue\[0\]/,'Next must pick the actual pending head');
 assert.doesNotMatch(code,/pendingQueueId/,'An item must not remain stuck in queue until playing');
 assert.match(code,/function renderQueuePanel\(\)/);
 assert.match(code,/audioWarmup\.start\(\)/);
 assert.match(code,/handlePanelClick/);
});
