import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationCandidates,publicationQuery} from '../lib/publication-candidates.js';
import {waitForPCNodeReady} from '../lib/pc-node-recovery.js';
const track=(videoId,extra={})=>({source:'youtube',id:'youtube:'+videoId,videoId,title:'One Hundred Years (2005 Remaster)',artist:'The Cure',album:'Pornography',duration:402,...extra});
const original=track('A0cMu3fhw2M'),candidate=track('pHs9aEXGKPg');
test('same metadata distinct ID remains a candidate, not an alias',()=>{
 assert.deepEqual(publicationCandidates(original,[original,candidate,candidate]),[candidate]);
 assert.equal(original.videoId,'A0cMu3fhw2M');
 assert.match(publicationQuery(original),/2005 Remaster/);
});
test('exclude remaster, cover, duration, album, conflicting ISRC and unknowns',()=>{
 for(const extra of [{title:'One Hundred Years (Live)'},{title:'One Hundred Years (2010 Remaster)'},{artist:'Cover Artist'},{duration:390},{album:''},{album:'Other'},{duration:0},{source:'preview'}])
  assert.deepEqual(publicationCandidates(original,[track('pHs9aEXGKPg',extra)]),[]);
 assert.deepEqual(publicationCandidates({...original,isrc:'A'},[{...candidate,isrc:'B'}]),[]);
 assert.equal(publicationQuery({...original,album:''}),'');
});
test('unavailable publication never auto-retries, exposes failure category',async()=>{
 let calls=0,reason;
 const result=await waitForPCNodeReady(original.videoId,{prepare:true,autoRetryTimeout:true,
  fetcher:async()=>{calls++;return {ok:true,json:async()=>({state:'failed',failure_category:'publication_unavailable',node_online:true,retry_after_seconds:0})}},
  onFailure:value=>{reason=value}});
 assert.equal(result,'failed');assert.equal(reason,'publication_unavailable');assert.equal(calls,2);
});
