import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lyricIndex} from '../lib/lrc.js';
import {LyricTransportSync} from '../lib/lyric-transport-sync.js';

function harness({position=0,keepPrecise=()=>false}={}){
 const audio={currentTime:position,paused:false,ended:false};
 let selection=3,seq=0,stamp=0;
 const callbacks=new Map(),times=[];
 const lines=[{time:0,text:'Intro'},{time:.08,text:'First word'},{time:.16,text:'Second word'}];
 const sync=new LyricTransportSync({
  audio,getSelection:()=>selection,keepPrecise,
  onFrame:()=>times.push({time:audio.currentTime,index:lyricIndex(lines,audio.currentTime)}),
  requestFrame:callback=>{const id=++seq;callbacks.set(id,callback);return id},
  cancelFrame:id=>callbacks.delete(id),isVisible:()=>true
 });
 return {audio,sync,times,callbacks,
  advance(ms,positionValue){
   stamp+=ms;
   if(positionValue!==undefined)audio.currentTime=positionValue;
   for(const [id,callback] of [...callbacks]){callbacks.delete(id);callback(stamp)}
  },
  selectNext(){selection++}
 };
}
test('opening lyric timestamps change in under 100 ms without waiting for media timeupdate',()=>{
 const h=harness();
 assert.equal(h.sync.start(),true);
 assert.equal(h.times[0].index,0,'initial text is refreshed in the playing event');
 h.advance(16,.09);
 assert.equal(h.times.at(-1).index,1,'first line is read directly from actual media currentTime');
 h.advance(16,.17); // 32 ms since last completed precision frame
 h.advance(16,.17);
 assert.equal(h.times.at(-1).index,2,'new verse appears before the usual 250ms native callback');
 h.sync.stop();
 assert.equal(h.callbacks.size,0);
});
test('clock uses actual media position and never advances captions during buffering',()=>{
 const h=harness();h.sync.start();
 for(let i=0;i<9;i++)h.advance(16,0);
 assert.ok(h.times.every(x=>x.index===0&&x.time===0));
 h.audio.currentTime=.18;h.advance(48);
 assert.equal(h.times.at(-1).index,2);
});
test('pause, track switch and ended event stop obsolete frame work',()=>{
 const h=harness();h.sync.start();
 h.audio.paused=true;h.advance(16);
 assert.equal(h.callbacks.size,0);
 h.audio.paused=false;h.sync.start();
 const [handle,old]=h.callbacks.entries().next().value;
 h.selectNext();h.callbacks.delete(handle);old(160);
 assert.equal(h.callbacks.size,0,'previous track never reschedules frame work');
 h.sync.start();h.audio.ended=true;h.advance(16);
 assert.equal(h.callbacks.size,0);
 h.audio.ended=false;h.sync.start();h.sync.stop();
 assert.equal(h.callbacks.size,0);
});
test('seeking after opening uses a brief resynchronization window',()=>{
 const h=harness({position:45});h.sync.start();
 assert.equal(h.times.length,1);
 for(let i=0;i<99;i++)h.advance(16,45+i*.02);
 assert.equal(h.callbacks.size,0,'long tracks do not consume a per-frame lyric loop');
});
test('the existing app keeps timeupdate fallback and aligns both lyric surfaces on playing',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../ui/karaoke-stage.js',import.meta.url),'utf8');
 assert.match(app,/const lyricTransportSync=new LyricTransportSync/);
 assert.match(app,/onFrame:\(\)=>syncLyrics\(\{precise:true\}\)/);
 assert.match(app,/audio\.addEventListener\('timeupdate',\(\)=>\{[\s\S]*?updateProgress\(\);syncLyrics\(\)/);
 assert.match(app,/state\.audioState='playing';reportAudioStatus\(''\);lyricTransportSync\.start\(\)/);
 assert.match(app,/audio\.addEventListener\('pause',\(\)=>\{lyricTransportSync\.stop\(\)/);
 assert.match(app,/audio\.addEventListener\('seeked',\(\)=>\{[\s\S]*?lyricTransportSync\.start\(\)/);
 assert.match(stage,/centerActiveLine\(active,\{instant:force\|\|index<2\|\|time<6\}\)/);
 assert.match(stage,/behavior:instant\|\|this\.reducedMotion\?'instant':'smooth'/);
});

test('synchronized lyrics stay accurate at 1, 20 and 60 seconds',()=>{
 let needed=true;
 const h=harness({position:20,keepPrecise:()=>needed});
 assert.equal(h.sync.start(),true);
 h.advance(16,20.016);
 h.advance(1600,21.616);
 h.advance(32000,53.616);
 assert.equal(h.callbacks.size,1,'continuous timed-lyric monitoring survives 30 seconds');
 const before=h.times.length;
 h.advance(48,53.664);
 assert.ok(h.times.length>before,'the next lyric frame does not depend on 4 Hz timeupdate');
 needed=false;
 h.advance(48,53.712);
 assert.equal(h.callbacks.size,0,'untimed/hidden lyrics revert to bounded work');
});

test('active precision follows native audio time, never guesses progress during a stall',()=>{
 const h=harness({position:65,keepPrecise:()=>true});
 h.sync.start();
 for(let i=0;i<12;i++)h.advance(48,65);
 assert.ok(h.times.every(x=>x.time===65),'no artificial lyric progress while buffering');
 h.audio.paused=true;h.advance(48,65);
 assert.equal(h.callbacks.size,0,'pausing cancels all precision frame callbacks');
});

test('late LRCLIB results and one retry never alter the audio extraction pipeline',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const recovery=app.slice(app.indexOf('let lyricUpgradeTimer='),app.indexOf('let lyricsAIController='));
 assert.match(recovery,/scheduleLyricUpgrade\(track,ac\)/);
 assert.match(recovery,/autoLyrics\(track,\{signal:ac\.signal,preferSynced:true\}\)/);
 assert.match(recovery,/playbackSelection!==selection\|\|state\.current!==track/);
 assert.match(recovery,/rateLimited\?70000:25000/);
 assert.doesNotMatch(recovery,/audio\.(?:play|pause|src|load)\s*\(/);
 const clock=app.slice(app.indexOf('const lyricTransportSync=new LyricTransportSync'),app.indexOf('function syncLyrics('));
 assert.match(clock,/keepPrecise:/);
 assert.match(clock,/state\.lyricsSynced&&state\.lyrics\.length>0/);
 assert.match(clock,/displayStore\.isVisible\('lyrics'\)\|\|karaokeStage\.opened/);
 const metadata=app.slice(app.indexOf('const newLyrics=lyricsIdentity(track)'),app.indexOf("if(state.sheet==='search')displaySearch",app.indexOf('const newLyrics=lyricsIdentity(track)')));
 assert.match(metadata,/durationChanged&&!state\.lyricsSynced/,'metadata duration alone must not blank LRC');
});

test('restoring a cached LRC mid-track reactivates precision immediately',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const body=app.slice(app.indexOf('async function loadAutoLyrics(track){'),app.indexOf('let lyricsAIController='));
 assert.match(body,/state\.lyricsStatus=immediate\?\.status[\s\S]*?syncLyrics\(\);[\s\S]*?if\(state\.lyricsSynced&&!audio\.paused&&!audio\.ended&&!document\.hidden\)\s*lyricTransportSync\.start\(\);[\s\S]*?if\(manual\|\|immediate\?\.synced\)return/);
});
