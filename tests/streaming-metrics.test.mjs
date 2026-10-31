import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordStreamingMetric,audioSourceCategory} from '../lib/streaming-metrics.js';

test('streaming phase timings are anonymous, bounded and nonblocking',async()=>{
 const payloads=[];
 const events=['pc_queued','pc_ready','first_buffer','rebuffer','recovery_started',
  'duration_reported_long','duration_overrun'];
 for(const event of events){
  const accepted=recordStreamingMetric({event,source:'fast_edge',ms:31000,code:0},{
   sendBeacon:(_url,body)=>{payloads.push(body);return true;},
   fetcher:null,endpoint:'https://example.org/v1/playback-metric'
  });
  assert.equal(accepted,true,event);
 }
 assert.equal(payloads.length,events.length);
 for(const body of payloads){
  const data=JSON.parse(await body.text());
  assert.deepEqual(Object.keys(data).sort(),['code','event','ms','source']);
  assert.equal(data.ms,31000);
  assert.equal(data.source,'fast_edge');
  assert.equal(JSON.stringify(data).includes('youtube.com'),false);
 }
 assert.equal(recordStreamingMetric({event:'unknown',source:'fast_edge',ms:10,code:0},
  {sendBeacon:()=>{throw Error('unexpected beacon')}}),false);
 assert.equal(recordStreamingMetric({event:'pc_ready',source:'fast_edge',ms:-1,code:0}),false);
});

test('R2 playback remains the default; PC preparation is independent',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/cachedNativeAvailable\(track\)/);
 assert.match(source,/new URL\('\/pc-node\/prepare\/'\+id,NATIVE_BACKEND\)/);
 assert.match(source,/const start=audio\.play\(\),unlock=resumePlayerAudio\(\)/);
 assert.match(source,/audiblePlaybackVersion===audibleVersionAtRecovery/);
 assert.match(source,/if\(state\.audioState==='playing'&&!state\.userPaused&&!audio\.paused&&audio\.readyState>=3\)return/);
});

test('source classification preserves the R2-first diagnostic split',()=>{
 assert.equal(audioSourceCategory('/fast-audio/PvHL6FfmWJE'),'fast_edge');
 assert.equal(audioSourceCategory('https://nightcorelab.onrender.com/download?url=x'),'render');
 assert.equal(audioSourceCategory('blob:local'),'offline');
});

test('duration anomalies distinguish header length from audio confirmed beyond official song',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function checkDurationAnomaly\(\{confirmPlayback=false\}=\{\}\)/);
 assert.match(app,/difference<=Math\.max\(25,expected\*\.2\)/);
 assert.match(app,/audio\.paused\|\|audio\.ended\|\|Number\(audio\.currentTime\)<=expected\+3/);
 assert.match(app,/signalPlaybackMetric\('duration_reported_long',0,/);
 assert.match(app,/signalPlaybackMetric\('duration_overrun',0,/);
 assert.doesNotMatch(app,/audio\.currentTime=expected/);
});
