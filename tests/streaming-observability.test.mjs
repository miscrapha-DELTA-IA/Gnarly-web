import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {audioSourceCategory,recordStreamingMetric} from '../lib/streaming-metrics.js';

test('categorizes audio transport without sending recording identifiers',()=>{
 assert.equal(audioSourceCategory('https://gnarly-web-pages.pages.dev/fast-audio/ABCDEFGHIJK'),'fast_edge');
 assert.equal(audioSourceCategory('https://nightcorelab.onrender.com/download?url=private'),'render');
 assert.equal(audioSourceCategory('blob:local-file'),'offline');
 assert.equal(audioSourceCategory('https://gnarly-web-pages.pages.dev/audius-audio/track'),'independent');
});
test('reports only bounded anonymous categories in the background',async()=>{
 let calls=0,endpoint;
 const sendBeacon=(url,body)=>{endpoint=url;calls++;return body.text().then(t=>JSON.parse(t))};
 // sendBeacon returning a Promise is nonstandard, so use a synchronous
 // fake to verify payload through its captured Blob after submission.
 let packet;
 const accepted=recordStreamingMetric({
  event:'recovered_audio',source:'fast_edge',ms:34931,code:0
 },{sendBeacon:(url,blob)=>{endpoint=url;packet=blob;return true},fetcher:()=>{throw Error('Do not fetch')}});
 assert.equal(accepted,true);
 assert.equal(endpoint,'https://nightcorelab.onrender.com/v1/playback-metric');
 const payload=JSON.parse(await packet.text());
 assert.deepEqual(payload,{event:'recovered_audio',source:'fast_edge',ms:34931,code:0});
 assert.equal(Object.keys(payload).length,4);
 assert.equal(recordStreamingMetric({event:'play_cancelled',source:'unknown',ms:-20,code:0},
  {sendBeacon:()=>{calls++;return true}}),false);
 assert.equal(calls,0);
});
test('blocked telemetry never changes the player or throws',async()=>{
 let invoked=0;
 const sent=recordStreamingMetric({event:'initial_media_error',source:'render',ms:17010,code:4},
  {sendBeacon:()=>{throw Error('blocked')},
   fetcher:()=>{invoked++;return Promise.reject(new Error('network'))}});
 assert.equal(sent,true);
 assert.equal(invoked,1);
 await new Promise(resolve=>setTimeout(resolve,0));
});
test('a PC recovery retains its own polling timeout without an additional 20s media watchdog',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function recoverNativeAudio(');
 const end=app.indexOf('function stopUnresponsivePlayback(',start);
 assert.ok(start>0&&end>start);
 const recovery=app.slice(start,end);
 assert.match(recovery,/playbackStallGuard\.clear\(\)/);
 assert.doesNotMatch(recovery,/watchPlayback\(track,selection,'startup'\)/);
 assert.match(recovery,/waitForPCNodeReady\(track\.videoId,/);
 assert.match(app,/signalPlaybackMetric\('initial_media_error',audio\.error\.code\|\|0\)/);
 assert.match(app,/if\(!recoveryOperation&&state\.audioState!=='recovering'\)/);
 assert.match(app,/signalPlaybackMetric\(playbackMetricErrorSelection===playbackSelection/);
});
