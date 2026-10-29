import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ListeningMemory,MEMORY_KEY,songFingerprint,sameRecording,recommendTracks,retainManualQueue,markAutoTracks,discoverySuggestions} from '../lib/listening-intelligence.js';
const t=(id,artist='AURORA',album='All My Demons',title='Track '+id)=>({
 id:'youtube:'+id,videoId:id,source:'youtube',artist,album,title,duration:210,artwork:'https://example.com/art.png'});
const anchor=t('AAAAAAAAAAA'),a=t('BBBBBBBBBBB'),b=t('CCCCCCCCCCC','AURORA','Infections Of A Different Kind'),c=t('DDDDDDDDDDD','AURORA','All My Demons'),d=t('EEEEEEEEEEE','Florence','Ceremonials'),e=t('FFFFFFFFFFF','Florence','How Big'),f=t('GGGGGGGGGGG','Other','Other');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),_values:m}};
test('local memory is bounded, reloadable and never saves audio stream or user identifiers',()=>{
 const store=storage(),mem=new ListeningMemory(store),now=Date.now();
 assert.equal(mem.record('play',a,now),true);
 assert.equal(mem.record('play',a,now+400),false);
 mem.record('finish',a,now+1000);mem.record('like',d,now+2000);
 const sameOrigin=new ListeningMemory(store);
 assert.equal(sameOrigin.events.length,3);
 assert.equal(sameOrigin.profile(now+3000).artists.get('aurora')>0,true);
 assert.equal(sameOrigin.affinityArtists('AURORA')[0],'florence');
 assert.ok(store.getItem(MEMORY_KEY).includes('"events"'));
 assert.doesNotMatch(store.getItem(MEMORY_KEY),/email|audioUrl|password|listeningSeconds/i);
 for(let n=0;n<200;n++)mem.record('play',t('BBBBBBBBBBB','AURORA','Other','Listen '+n),now+n*3000);
 assert.ok(new ListeningMemory(store).events.length<=180);
 mem.clear();assert.equal(new ListeningMemory(store).events.length,0);
});
test('identity matching blocks distinct provider URLs to the same recording but not legitimate versions',()=>{
 assert.equal(sameRecording(a,{...a,id:'youtube:ZZZZZZZZZZZ',videoId:'ZZZZZZZZZZZ'}),true);
 assert.equal(sameRecording(a,{...a,id:'youtube:ZZZZZZZZZZZ',videoId:'ZZZZZZZZZZZ',duration:300}),false);
 assert.equal(sameRecording(a,{...a,id:'itunes:90',videoId:null,source:'preview'}),true);
 assert.notEqual(songFingerprint(a),songFingerprint(b));
});
test('Artist and Album are genuinely distinct; mix can include liked adjacent artists',()=>{
 const mem=new ListeningMemory(storage());mem.record('like',d);
 const candidates=[anchor,a,b,c,d,e,f];
 const sameArtist=recommendTracks({mode:'artist',anchor,candidates,memory:mem,max:7});
 assert.deepEqual(new Set(sameArtist.map(x=>x.id)),new Set([a.id,b.id,c.id]));
 const album=recommendTracks({mode:'album',anchor,candidates,memory:mem,max:7});
 assert.deepEqual(new Set(album.map(x=>x.id)),new Set([a.id,c.id]));
 const mix=recommendTracks({mode:'mix',anchor,candidates,memory:mem,max:7});
 assert.ok(mix.some(x=>x.artist==='Florence'),'mix should use a learned adjacent liked artist');
 assert.ok(mix.some(x=>x.artist==='AURORA'),'mix must keep the anchor artist');
 assert.ok(!mix.some(x=>x.artist==='Other'),'unlearned distant artist is not inferred');
 assert.deepEqual(recommendTracks({mode:'album',anchor:{...anchor,album:''},candidates,memory:mem}),[]);
});
test('recent playback and exposure change suggestions, forced refresh rotates first choice',()=>{
 const mem=new ListeningMemory(storage()),now=Date.now();
 const candidates=[a,c,b];
 const first=recommendTracks({mode:'artist',anchor,candidates,memory:mem,max:1,revision:0,now});
 assert.equal(first.length,1);
 mem.expose(first,'artist',now);
 mem.record('play',first[0],now);
 mem.record('finish',first[0],now+1000);
 const second=recommendTracks({mode:'artist',anchor,candidates,memory:mem,max:1,revision:1,now:now+2000});
 assert.notEqual(first[0].id,second[0].id);
});
test('manual queue survives mode switch and automatic provenance can be promoted',()=>{
 const manual=[a,b],auto=markAutoTracks([c,d],'artist'),queue=[manual[0],...auto,manual[1]];
 assert.deepEqual(retainManualQueue(queue).map(t=>t.id),[a.id,b.id]);
 assert.deepEqual(markAutoTracks([d],'mix').map(t=>t._gnarlyAutoMode),['mix']);
 assert.equal(manual[0]._gnarlyAutoMode,undefined);
});
test('consumed session recordings and provider aliases do not immediately refill the automatic queue',()=>{
 const alias={...a,id:'youtube:ZZZZZZZZZZZ',videoId:'ZZZZZZZZZZZ'};
 const result=recommendTracks({mode:'mix',anchor,candidates:[a,alias,b,c],recent:[a,b]});
 assert.deepEqual(result.map(x=>x.id),[c.id]);
 // A manually pending recording still stays in its original queue order;
 // recommendation filtering does not mutate the existing tail.
 const pending=[a,b];
 recommendTracks({mode:'mix',anchor,candidates:[a,b,c],existing:pending,recent:[a,b]});
 assert.deepEqual(pending,[a,b]);
});
test('Omnibox empty discovery is independent from active queue and does not repeat rows',()=>{
 const mem=new ListeningMemory(storage());mem.record('like',d);
 const rows=discoverySuggestions({history:[a,b,c,d,d],favorites:[d,a],queue:[b,anchor],memory:mem});
 assert.ok(!rows.some(x=>x.id===b.id));
 assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
 assert.equal(rows[0].id,d.id);
});
test('no automatic cross-artist guesses from unknown artists or non-playable previews',()=>{
 const memory=new ListeningMemory(storage());
 const preview={...a,id:'itunes:2',source:'preview',videoId:null};
 assert.deepEqual(recommendTracks({mode:'mix',anchor:{...anchor,artist:'YouTube Music'},candidates:[d,a],memory}),[]);
 assert.deepEqual(recommendTracks({mode:'artist',anchor,candidates:[preview],memory}),[]);
});
test('integration maintains manual entries and only logs actual audio playback, not selection',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/state\.queue=retainManualQueue\(state\.queue\)/);
 assert.match(source,/markAutoTracks\(choices,mode\)/);
 assert.match(source,/listeningMemory\.record\('play',state\.current\)/);
 assert.match(source,/listeningMemory\.record\('finish',state\.current\)/);
 assert.match(source,/audio\.addEventListener\('playing',[\s\S]*?listeningMemory\.record\('play'/);
 // Listening signals personalize matching results but cannot inject unrelated history.
 assert.doesNotMatch(source,/discoverySuggestions\(/);
 assert.match(source,/instantSearch\(query,options\)/);
 assert.match(source,/personalizedRank\(page\.query,\[\.\.\.page\.local,\.\.\.available\]/);
 assert.match(source,/case 'taste-reset'/);
});
