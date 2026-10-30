import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isVerifiedFullTrack,verifiedFirst,readyQueueCandidates,playbackPriority} from '../lib/verified-playback.js';

const uncached={id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA',source:'youtube',title:'Unknown'};
const cached={id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB',source:'youtube',title:'Ready',playbackAvailability:'r2'};
const audius={id:'audius:abkvg',audiusId:'abkvg',source:'audius',title:'Direct'};
const preview={id:'preview:1',source:'preview',title:'Preview'};
const local={id:'local:one',source:'local',url:'blob:test'};
const offline={...uncached,id:'youtube:CCCCCCCCCCC',videoId:'CCCCCCCCCCC'};
test('catalogue metadata never masquerades as a verified full track',()=>{
 assert.equal(isVerifiedFullTrack(uncached),false);
 assert.equal(isVerifiedFullTrack(cached),true);
 assert.equal(isVerifiedFullTrack(audius),true);
 assert.equal(isVerifiedFullTrack(preview),false);
 assert.equal(isVerifiedFullTrack(local),true);
 assert.equal(isVerifiedFullTrack(offline,{offline:id=>id===offline.id}),true);
 assert.equal(isVerifiedFullTrack({...audius,audiusId:'mismatched'}),false);
 assert.equal(isVerifiedFullTrack({...cached,videoId:'bad-id'}),false);
});
test('verified sources come before incomplete previews and unavailable YouTube IDs',()=>{
 assert.deepEqual(verifiedFirst([uncached,preview,audius,cached,local,offline],
  {offline:id=>id===offline.id}),[local,offline,cached,audius,preview,uncached]);
 assert.equal(playbackPriority(uncached),4);
 assert.equal(playbackPriority(audius),2);
});
test('Smart Mix accepts only verified whole tracks, never arbitrary YouTube listings',()=>{
 assert.deepEqual(readyQueueCandidates([uncached,preview,audius,cached,local]),[local,cached,audius]);
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/const cached=readyQueueCandidates\(/);
 assert.match(source,/const verified=readyQueueCandidates\(candidates/);
 assert.match(source,/searchReadyAudio\(query,\{limit:24,signal:controller\.signal\}\)/);
 assert.match(source,/searchAudius\(query,\{limit:20,signal:controller\.signal\}\)/);
 assert.doesNotMatch(source,/const primary=searchNativeBackend\(query,\{signal:controller\.signal\}\)/);
 assert.match(source,/state\.searchResults=verifiedFirst\(personalizedRank/);
 assert.match(source,/YouTube · áudio não verificado/);
});
