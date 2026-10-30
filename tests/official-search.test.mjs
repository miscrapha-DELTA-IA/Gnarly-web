import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curateOfficialSearch,unrequestedVersion} from '../lib/official-search.js';
const yt=(id,title='Original Song',artist='Real Artist')=>({
 id:'youtube:'+id,videoId:id,source:'youtube',title,artist,duration:180});
const original=yt('ABCDEFGHIJK');
const cover=yt('BCDEFGHIJKL','Original Song (Cover)');
const remix=yt('CDEFGHIJKLM','Original Song - Slowed & Reverb');
const unrelated=yt('DEFGHIJKLMN','Unrelated Artist Song');
const audius={id:'audius:ABC123',audiusId:'ABC123',source:'audius',
 title:'Original Song',artist:'Real Artist',duration:180};
const jamendo={id:'jamendo:123456',jamendoId:'123456',source:'jamendo',
 title:'Original Song',artist:'Real Artist',duration:180};
const preview={id:'itunes:123',source:'preview',title:'Original Song',
 artist:'Real Artist',url:'https://example.test/preview.m4a',duration:30};

test('official YouTube Music results stay first; independent audio never pollutes Search',()=>{
 const r=curateOfficialSearch('Real Artist Original Song',{
  native:[original,cover,remix],
  ready:[unrelated,original,audius,jamendo],
  previews:[preview]
 });
 assert.equal(r.mode,'youtube-music');
 assert.deepEqual(r.songs.map(x=>x.id),[original.id]);
 assert.ok(!r.songs.some(x=>['audius','jamendo'].includes(x.source)));
});
test('requested remixes and covers remain discoverable when user specifically searches them',()=>{
 assert.equal(unrequestedVersion(remix,'Real Artist Original Song'),true);
 assert.equal(unrequestedVersion(cover,'Real Artist Original Song Cover'),false);
 assert.equal(curateOfficialSearch('Real Artist Original Song cover',{native:[cover]}).songs[0].id,cover.id);
 assert.equal(curateOfficialSearch('Original Song slowed reverb',{native:[remix]}).songs[0].id,remix.id);
});
test('Apple official previews only appear as a clearly separate fallback, never full YouTube',()=>{
 const native=curateOfficialSearch('Real Artist Original Song',{native:[original],previews:[preview]});
 assert.deepEqual(native.songs,[original]);
 const fallback=curateOfficialSearch('Real Artist Original Song',{previews:[preview,audius,jamendo]});
 assert.equal(fallback.mode,'apple-previews');
 assert.deepEqual(fallback.songs,[preview]);
 assert.equal(curateOfficialSearch('no song',{}).mode,'empty');
});
test('cached R2 metadata needs strong song relevance; unrelated ready media do not dominate',()=>{
 const exact=yt('EFGHIJKLMNO');
 const good=curateOfficialSearch('Real Artist Original Song',{ready:[unrelated,exact]});
 assert.deepEqual(good.songs,[exact]);
});
test('Search uses curated native music only and no Audius request on every keystroke',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const area=app.slice(app.indexOf('function refreshLiveResults('),app.indexOf('const searchResultKey='));
 assert.match(area,/curateOfficialSearch\(page.query/);
 assert.doesNotMatch(area,/const audius=searchAudius\(query/);
 assert.doesNotMatch(area,/matchingIndependentTracks/);
 assert.match(app,/const delay=live\?760:0/);
 const recovery=app.slice(app.indexOf('async function recoverIndependentAudio'),app.indexOf('async function recoverNativeAudio'));
 assert.match(recovery,/sourceRouter.resolve\(track/);
});
