import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fastPrepareURL} from '../lib/playback-source.js';
import {QueueAudioWarmup} from '../lib/queue-audio-warmup.js';

const song={source:'youtube',videoId:'ABCDE123456',id:'youtube:ABCDE123456',title:'Example'};
test('initial Play remains synchronous; speculative preparation is never awaited',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const play=app.slice(app.indexOf('async function play(){'),app.indexOf('function pause(){'));
 assert.match(play,/const start=audio\.play\(\),unlock=resumePlayerAudio\(\);/);
 assert.match(play,/primeSelectedRecording\(track,selection\);/);
 assert.ok(play.indexOf('const start=audio.play(),unlock=resumePlayerAudio();') <
  play.indexOf('primeSelectedRecording(track,selection);'));
 assert.ok(play.indexOf('primeSelectedRecording(track,selection);') <
  play.indexOf('await Promise.all([unlock,start])'));
 assert.doesNotMatch(play,/await primeSelectedRecording/);
 assert.match(app,/queueAudioWarmup\.reset\(\);resetQueuePrecache\(\);cancelAutoSaveNext\(\);[\s\S]*?cancelSelectedWarmup\(\)/);
 assert.match(app,/function pause\(\)\{(?:tdr\.finish\([^;]+\);)?(?:refreshTdrPanel\(\);)?coverCharge\.hide\(\);clearNextDiscoveryStatus\(\);navigationRevision\+\+;nextDiscovery=null;invalidateSmartFill\(\);cancelSelectedWarmup\(\)/);
});
test('first tap directly prewarms one exact recording without a redundant GET status gate',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const gate=app.slice(app.indexOf('function primeSelectedRecording('),app.indexOf('const queueAudioWarmup=new QueueAudioWarmup'));
 assert.match(gate,/selectedAudioWarmup\.start\(track\)/);
 assert.match(gate,/selectedWarmupId===id/);
 assert.match(gate,/playbackSelection!==selection\|\|state\.userPaused/);
 assert.doesNotMatch(gate,/\/pc-node\/status\/|await fetch\(|method:'GET'/);
 assert.doesNotMatch(gate,/audio\.src\s*=|audio\.play\(|audio\.load\(/);
});
test('edge holds the original media request through the PC fast-start window',()=>{
 const edge=readFileSync(new URL('../functions/fast-audio/[id].js',import.meta.url),'utf8');
 assert.match(edge,/originTimeoutMs=30000,originProbe=true/);
 assert.match(edge,/if\(env\?\.GNARLY_AUDIO_R2\)\{/);
});
test('speculative first Play only requests exact song via existing R2-first preparation route',async()=>{
 const calls=[];
 const warmup=new QueueAudioWarmup({
  fetcher:async(url,opts)=>{
   calls.push({url,opts});
   return new Response(JSON.stringify({status:'cached'}),{status:200});
  },
  now:()=>1000
 });
 assert.equal(fastPrepareURL(song)?.startsWith('https://nightcorelab.onrender.com/prepare'),true);
 assert.equal(await warmup.start(song),true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].opts.method,'POST');
 assert.equal(JSON.parse(calls[0].opts.body).url,'https://www.youtube.com/watch?v=ABCDE123456');
 assert.equal(await warmup.start(song),false,'no duplicate preparation');
});
