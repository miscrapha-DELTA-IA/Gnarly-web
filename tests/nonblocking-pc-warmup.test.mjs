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
 assert.match(app,/queueAudioWarmup\.reset\(\);cancelSelectedWarmup\(\)/);
 assert.match(app,/function pause\(\)\{coverCharge\.hide\(\);cancelSelectedWarmup\(\)/);
});
test('first tap health gate is read-only and skips prewarming when PC is offline',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const gate=app.slice(app.indexOf('function primeSelectedRecording('),app.indexOf('const queueAudioWarmup=new QueueAudioWarmup'));
 assert.match(gate,/\/pc-node\/status\//);
 assert.match(gate,/method:'GET'/);
 assert.match(gate,/!status\?\.node_online/);
 assert.match(gate,/audio\.readyState>=3/);
 assert.match(gate,/selectedAudioWarmup\.start\(track\)/);
 assert.doesNotMatch(gate,/audio\.src\s*=|audio\.play\(|audio\.load\(/);
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
