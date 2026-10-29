import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LyricSyncWorkshop,serializeManualLRC,manualLyricKey} from '../lib/lyric-sync-workshop.js';
import {parseLRC} from '../lib/lrc.js';
const track={id:'youtube:ABCDEFGHIJK',title:'A new track',artist:'Unknown'};
function storage(){
 const map=new Map();
 return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};
}
test('tap-to-sync captures actual media times in strict order and saves complete LRC',()=>{
 const db=storage(),studio=new LyricSyncWorkshop({storage:db});
 assert.equal(studio.start(track,['First line','Second line','Third line']),true);
 assert.deepEqual(studio.progress,{marked:0,total:3});
 assert.equal(studio.mark(1.28),true);
 assert.equal(studio.mark(1.20),false,'never invent nonmonotonic timestamps');
 assert.equal(studio.mark(4.8),true);
 assert.equal(studio.finish(track),null,'must record every line');
 assert.equal(studio.undo(),4.8);
 assert.equal(studio.mark(4.85),true);
 assert.equal(studio.mark(9.3),true);
 const result=studio.finish(track);
 assert.equal(result.synced,true);
 assert.equal(result.lines[0].time,1.28);
 assert.equal(result.lines[2].time,9.3);
 const restored=new LyricSyncWorkshop({storage:db}).load({...track,artist:'Real Artist',title:'Better metadata'});
 assert.deepEqual(restored.lines,result.lines,'canonical ID survives metadata enrichment');
 const lrc=serializeManualLRC(restored.lines);
 assert.deepEqual(parseLRC(lrc),restored.lines);
 assert.match(lrc,/\[00:01\.28\]First line/);
});
test('cancel, duplicate timings, wrong track, and insufficient text fail safely',()=>{
 const studio=new LyricSyncWorkshop({storage:storage()});
 assert.equal(studio.start(track,['Only one']),false);
 assert.equal(studio.start(track,['A','B']),true);
 assert.equal(studio.mark(0),true);
 assert.equal(studio.mark(0),false);
 assert.equal(studio.finish({...track,id:'youtube:BBBBBBBBBBB'}),null);
 studio.clear();
 assert.equal(studio.active,false);
 assert.equal(studio.load(track),null);
 assert.equal(manualLyricKey({}), '');
 assert.equal(serializeManualLRC([{time:1,text:'Incomplete'}]),'');
});
test('untrusted/corrupt storage is ignored; no cross-recording lyric leakage',()=>{
 const db=storage(),studio=new LyricSyncWorkshop({storage:db});
 studio.start(track,['Hi','Bye']);studio.mark(1);studio.mark(4);studio.finish(track);
 assert.equal(studio.load({...track,id:'youtube:BBBBBBBBBBB'}),null);
 db.setItem('gnarly.web.manual-lyric-sync.v1','{"invalid":true}');
 assert.equal(studio.load(track),null);
});
test('automatically selected lyrics never override saved real manual timestamps',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/const manual=lyricWorkshop\.load\(track\)/);
 assert.match(app,/const immediate=manual\|\|cachedAutoLyrics\(track\)/);
 assert.match(app,/lyricWorkshop\.active\|\|/);
 assert.match(app,/state\.lyricsAbort\?\.abort\(\);state\.lyricsLoading=false/);
 assert.match(app,/case 'lyrics-sync-mark'/);
 assert.match(app,/case 'lyrics-sync-undo'/);
 assert.match(app,/case 'lyrics-sync-export'/);
 assert.match(app,/if\(lyricsAIAutoSession&&track\.source==='local'&&track\.file&&!state\.lyricsSynced/);
 const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(styles,/\.lyric-sync-workshop/);
});
test('a broad LRCLIB search is strict about artist and version, without fabricated timing',async()=>{
 const {autoLyrics}=await import('../lib/lyrics-auto.js');
 const old=globalThis.fetch,paths=[];
 const needle={id:'youtube:new-xyz',title:'Boreal Glow',artist:'Eclipse Group',duration:192};
 globalThis.fetch=async url=>{
  const u=new URL(url);paths.push(u.pathname+(u.searchParams.has('q')?':broad':''));
  if(u.pathname==='/api/get')return Response.json({status:404});
  if(u.pathname==='/api/search'&&!u.searchParams.has('q'))return Response.json([]);
  return Response.json([{trackName:needle.title,artistName:'Wrong Singer',duration:192,
   syncedLyrics:'[00:12.00]Wrong line'},
   {trackName:needle.title,artistName:needle.artist,duration:192,
    syncedLyrics:'[00:13.00]Correct line'}]);
 };
 try{
  const result=await autoLyrics(needle);
  assert.equal(result.synced,true);assert.equal(result.lines[0].time,13);
  assert.deepEqual(paths,['/api/get','/api/search','/api/search:broad']);
 }finally{globalThis.fetch=old}
});
