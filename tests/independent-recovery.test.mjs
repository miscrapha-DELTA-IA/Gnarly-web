import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exactIndependentRecording,findIndependentRecording} from '../lib/independent-recovery.js';

const requested={id:'youtube:ABCDEFGHIJK',source:'youtube',videoId:'ABCDEFGHIJK',
 title:'Song (Studio Version)',artist:'Test Artist',duration:185};
const match={id:'audius:ABCdef001',source:'audius',audiusId:'ABCdef001',
 title:'Song (Studio Version)',artist:'Test Artist',duration:186,url:'/audius-audio/ABCdef001'};

test('switch only exact artist/title and near-identical duration, preserving recordings',()=>{
 assert.deepEqual(exactIndependentRecording(requested,[match]),match);
 for(const alternative of [
  {...match,title:'Song (Live Version)'},{...match,title:'Song (Remix)'},
  {...match,artist:'Other Artist'},{...match,duration:188},
  {...match,source:'preview'},{...match,source:'youtube'}]){
  assert.equal(exactIndependentRecording(requested,[alternative]),null);
 }
 assert.equal(exactIndependentRecording({...requested,artist:'YouTube Music'},[match]),null);
 assert.equal(exactIndependentRecording({...requested,duration:0},[match]),null);
 assert.equal(exactIndependentRecording(requested,[match,{...match,id:'audius:DIFFERENT'}]),null,
  'ambiguous duplicate metadata cannot silently overwrite chosen recording');
});

test('a verified alternative can be discovered without any YouTube extraction',async()=>{
 let queries=0;
 const alternate=await findIndependentRecording(requested,{
  search:async(q,opts)=>{
   queries++;assert.match(q,/Test Artist Song/);
   assert.equal(opts.limit,20);
   return [match];
  }
 });
 assert.equal(queries,1);
 assert.deepEqual(alternate,match);
 const canceled=new AbortController();canceled.abort();
 assert.equal(await findIndependentRecording({...requested,videoId:'ZYXWVUTSRQP'},
  {search:()=>{throw Error('should not be called')},signal:canceled.signal}),null);
});

test('Play resets terminal MediaError for same URL without replaying a failed event',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/function prepareNativeAudio[\s\S]*?else if\(audio\.error\)\{[\s\S]*?audio\.load\(\)/);
 assert.match(source,/if\(resetMedia\)\{[\s\S]*?else\{audio\.load\(\);\}/);
 assert.match(source,/async function recoverIndependentAudio[\s\S]*?sourceRouter\.resolve\(track/);
 assert.match(source,/if\(await recoverIndependentAudio\(track,current\)\)return true/);
 assert.match(source,/const source=offlineAudio\(track\.id\)\|\|trackAudioURL\(track,\{\s*attempt\s*\}\)/);
 assert.doesNotMatch(source,/attempt,cacheOnly:attempt===0&&playbackCooldown\.active\(\)/,
  'stale browser cooldown must not force cache-only mode on a genuine Play');
});
