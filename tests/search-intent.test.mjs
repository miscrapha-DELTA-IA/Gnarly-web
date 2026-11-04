import test from 'node:test';
import assert from 'node:assert/strict';
import {fuzzySongMatchScore} from '../lib/search-intent.js';
import {curateOfficialSearch} from '../lib/official-search.js';
import {instantSearch,personalizedRank} from '../lib/live-search.js';

const song=(id,title,artist)=>({id:'youtube:'+id,videoId:id,source:'youtube',title,artist,duration:210});
test('misspelled artist and title are accepted as one relevant official song',()=>{
 const correct=song('ABCDEFGHIJK','So FN','Nine Vicious');
 const unrelated=song('BCDEFGHIJKL','So Fantastic','Another Artist');
 assert.ok(fuzzySongMatchScore(correct,'nine visious so fn')>=75);
 assert.ok(fuzzySongMatchScore(correct,'nine vicious so fn')>=75);
 assert.equal(curateOfficialSearch('nine visious so fn',{native:[unrelated,correct]}).songs[0].id,correct.id);
 assert.equal(curateOfficialSearch('nine visious so fn',{native:[unrelated]}).songs.length,0);
});
test('missing short terms, unrelated titles and unrequested covers stay excluded',()=>{
 const original=song('CDEFGHIJKLM','Neon','Real Artist');
 const cover=song('DEFGHIJKLMN','Neon Cover','Real Artist');
 assert.equal(fuzzySongMatchScore(original,'nein love'),0);
 assert.deepEqual(curateOfficialSearch('neon',{native:[cover,original]}).songs.map(x=>x.id),[original.id]);
 assert.equal(fuzzySongMatchScore(song('EFGHIJKLMNO','Fun','Other'),'fn'),0);
});
test('typo matching works in instant device hints without sacrificing an exact result',()=>{
 const exact=song('FGHIJKLMNOP','Vicious','Nine');
 const near=song('GHIJKLMNOPQ','Victorious','Nine');
 assert.equal(instantSearch('vicous',{history:[exact]}).length,1);
 const ranked=personalizedRank('vicious',[near,exact],{favorites:[near]});
 assert.equal(ranked[0].id,exact.id);
});
