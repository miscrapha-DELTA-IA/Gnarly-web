import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conserveBackgroundTraffic} from '../lib/network-budget.js';
test('manual network budget works without Network Information API',()=>{
 assert.equal(conserveBackgroundTraffic(undefined,true),true);
 assert.equal(conserveBackgroundTraffic(undefined,false),false);
});
test('conservative automatic network budget uses browser hints',()=>{
 for(const connection of [{saveData:true},{effectiveType:'3g'},{downlink:1.9},{rtt:400}])
  assert.equal(conserveBackgroundTraffic(connection),true);
 for(const connection of [{},{downlink:0,rtt:0},{effectiveType:'4g',downlink:5.36,rtt:58}])
  assert.equal(conserveBackgroundTraffic(connection),false);
});
test('budget only gates optional background work, not selected playback',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function prepareUpcomingAudio\(\)\{\s*if\(lowBandwidthActive\(\)\)return/);
 assert.match(app,/async function cacheNextReadyOffline\(track\)\{\s*if\(lowBandwidthActive\(\)\)return/);
 assert.match(app,/function warmUpcomingAlbumArtwork\(\)\{\s*if\(lowBandwidthActive\(\)\)return/);
 assert.match(app,/if\(!lowBandwidthActive\(\)&&state\.playing/);
 assert.match(app,/if\(el\.id==='low-bandwidth-mode'\)[\s\S]*?queueAudioWarmup\.cancel\(\);cancelNextOfflinePrefetch\(\)/);
 const selected=app.slice(app.indexOf('function primeSelectedRecording('),app.indexOf('const queueAudioWarmup='));
 assert.doesNotMatch(selected,/lowBandwidthActive/);
});
