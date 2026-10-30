import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {songSearchKey,songMatchScore,matchingIndependentTracks,rankRequestedSongFirst} from '../lib/song-first.js';
const target={id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA',source:'youtube',
 title:'So FN',artist:'Nine Vicious',duration:172};
const junk={id:'audius:abkvg',audiusId:'abkvg',source:'audius',
 title:'Electronic Dance Track',artist:'Unknown Artist',duration:180};
const other={id:'youtube:BBBBBBBBBBB',source:'youtube',videoId:'BBBBBBBBBBB',
 title:'A Different Song',artist:'Another Artist'};
const identical={id:'youtube:CCCCCCCCCCC',source:'youtube',videoId:'CCCCCCCCCCC',
 title:'So FN',artist:'Nine Vicious',playbackAvailability:'r2',duration:172};
test('requested song remains above unrelated fully playable sources',()=>{
 assert.deepEqual(rankRequestedSongFirst([junk,other,target],'Nine Vicious So FN'),[target,junk,other]);
 assert.equal(rankRequestedSongFirst([junk,target],'Nine Vicious So FN')[0].id,target.id);
});
test('availability can break a tie ONLY between the same identified recording',()=>{
 const output=rankRequestedSongFirst([target,junk,identical],'Nine Vicious So FN');
 assert.deepEqual(output.map(x=>x.id),[identical.id,target.id,junk.id]);
});
test('another remix or unrelated open-source song cannot displace a specific query',()=>{
 const remix={...junk,title:'So FN - Live Remix',artist:'Nine Vicious'};
 const output=rankRequestedSongFirst([junk,remix,target],'Nine Vicious So FN');
 assert.equal(output[0].id,target.id);
});
test('independent Audius options must match all query terms, never fill unrelated results',()=>{
 assert.deepEqual(matchingIndependentTracks([junk,{...junk,title:'So FN',artist:'Nine Vicious'}],'Nine Vicious So FN')
  .map(x=>x.title),['So FN']);
 assert.equal(songSearchKey('Música São Fn'),'musica sao fn');
});
test('empty discovery does not pollute the home feed with unrelated R2 and Audius catalogues',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const discovery=app.slice(app.indexOf('async function fetchSearchDiscovery('),app.indexOf('function refreshLiveResults('));
 assert.match(discovery,/page.remote=originals/);
 assert.doesNotMatch(discovery,/searchReadyAudio\(''/);
 assert.doesNotMatch(discovery,/searchAudius\(mainQuery/);
 assert.match(app,/state\.searchResults=rankRequestedSongFirst\(personalizedRank/);
 assert.doesNotMatch(app,/state\.searchResults=verifiedFirst\(personalizedRank/);
});
