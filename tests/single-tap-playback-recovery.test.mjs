import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AudioDeliveryRecovery,retryableMediaFailure} from '../lib/audio-delivery.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const track={id:'youtube:ABCDEFGHIJK',videoId:'ABCDEFGHIJK',source:'youtube'};

test('a watchdog timeout remains retryable after audio.load clears MediaError',()=>{
 assert.equal(retryableMediaFailure({name:'TimeoutError'},null),true);
 assert.equal(retryableMediaFailure({name:'AudioStartTimeoutError'},null),true);
 assert.equal(retryableMediaFailure({name:'NetworkError'},null),true);
 assert.equal(retryableMediaFailure({name:'NotAllowedError'},null),false);
 assert.equal(retryableMediaFailure({name:'AbortError'},null),false);
});

test('watchdog can recover a matching recording even after the browser error was cleared',async()=>{
 const recovery=new AudioDeliveryRecovery({delays:[0,0],wait:async()=>{}});
 recovery.select(track);
 let calls=0;
 const success=await recovery.retry({
  track,error:{name:'TimeoutError'},mediaError:null,isCurrent:()=>true,
  restart:async attempt=>{calls++;return attempt===2}
 });
 assert.equal(success,true);
 assert.equal(calls,2);
});

test('single Play is coalesced without moving audio.play away from the original gesture',()=>{
 const play=app.slice(app.indexOf('async function play(){'),app.indexOf('function pause(){'));
 assert.match(play,/if\(playStartOperation\?\.selection===selection&&playStartOperation\.epoch===epoch\)/);
 assert.match(play,/return playStartOperation\.promise/);
 assert.match(play,/const flight=\{selection,epoch,promise:shared\};playStartOperation=flight;/);
 assert.match(play,/const start=audio\.play\(\),unlock=resumePlayerAudio\(\)/);
 assert.doesNotMatch(play,/Promise\.resolve\(\)\.then\(\(\)=>audio\.play/);
 assert.match(play,/finally\{\s*if\(playStartOperation===flight\)playStartOperation=null;\s*resolvePending\(\);/);
});

test('pause and selection invalidate prior intents so old promises cannot own playback',()=>{
 const select=app.slice(app.indexOf('function selectTrack('),app.indexOf('function pause(){'));
 const pause=app.slice(app.indexOf('function pause(){'),app.indexOf('let nextDiscovery=null;',app.indexOf('function pause(){')));
 assert.match(select,/playbackSelection\+\+;navigationRevision\+\+;playbackIntentEpoch\+\+;playStartOperation=null/);
 assert.match(pause,/playbackIntentEpoch\+\+;playStartOperation=null;/);
 assert.match(app,/!state\.userPaused&&\s*playbackIntentEpoch===epoch/);
});

test('a late response can never paint MediaError4 on top of confirmed playback',()=>{
 const report=app.slice(app.indexOf('function isAudioAlreadyPlaying(){'),app.indexOf('function reportAudioStatus('));
 assert.match(report,/state\.audioState==='playing'&&!state\.userPaused&&!audio\.paused/);
 assert.match(report,/if\(isAudioAlreadyPlaying\(\)\)\{/);
 assert.match(report,/reportAudioStatus\(''\);return;/);
 const recovery=app.slice(app.indexOf('async function recoverNativeAudio('),app.indexOf('function stopUnresponsivePlayback('));
 assert.match(recovery,/const current=\(\)=>[\s\S]*?!isAudioAlreadyPlaying\(\)/);
});

test('cache reconciliation reuses an already accepted job with a bounded 46-second first-tap window',()=>{
 const helper=app.slice(app.indexOf('async function awaitAlreadyPreparingCache('),app.indexOf('async function resumeCompletedPCNode('));
 assert.match(helper,/selectedAudioWarmup\.last!==id/);
 assert.match(helper,/const deadline=playbackStartedAt\+46000/);
 assert.match(helper,/await resumeCachedNative\(track,isCurrent\)/);
 assert.match(helper,/while\(isCurrent\(\)&&performance\.now\(\)<deadline\)/);
 assert.doesNotMatch(helper,/selectedAudioWarmup\.start\(|\/download\?|\/stream\?/);
});
