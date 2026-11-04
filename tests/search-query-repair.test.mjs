import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestedKnownQuery} from '../lib/search-query-repair.js';

const track=(title,artist)=>({id:'catalogue:'+title,title,artist});

test('a credible two-word artist misspelling can be repaired from a real favorite',()=>{
 assert.equal(suggestedKnownQuery('ninne vicous',
  [track('So FN','Nine Vicious')]),'Nine Vicious');
});
test('song title spelling repairs adjacent letter mistakes, retaining true credits',()=>{
 assert.equal(suggestedKnownQuery('midnigth city',
  [track('Midnight City','M83')]),'Midnight City');
});
test('exact, unfinished and ambiguous input is never silently rewritten',()=>{
 const known=[track('So FN','Nine Vicious'),track('Midnight City','M83')];
 assert.equal(suggestedKnownQuery('Nine Vicious',known),null);
 assert.equal(suggestedKnownQuery('nine vic',known),null);
 assert.equal(suggestedKnownQuery('so fn',known),null);
 assert.equal(suggestedKnownQuery('a',known),null);
 assert.equal(suggestedKnownQuery('all completely unrelated content',known),null);
 assert.equal(suggestedKnownQuery('ninne vicous',
  [track('Song A','Nine Vicious'),track('Song B','Nine Vicious')]),'Nine Vicious');
});
test('search repair changes only public lookup terms, not player URLs or IDs',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/suggestedKnownQuery\(page\.query,known\)/);
 assert.match(app,/page\.repairStarted\|\|page\.nativeFailed/);
 assert.match(app,/searchNativeBackend\(proposed,\{/);
 assert.match(app,/limit:14,signal:page\.controller\.signal/);
 assert.match(app,/page\.correctedNative=songs/);
 assert.match(app,/curateOfficialSearch\(page\.correctedQuery,\{native:page\.correctedNative/);
 assert.match(app,/Busca aproximada/);
});
