import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLRC,lyricIndex} from '../lib/lrc.js';
test('parses timed lyrics in order',()=>{const lyrics=parseLRC('[00:15.32]segundo\n[00:02.50]primeiro');assert.deepEqual(lyrics,[{time:2.5,text:'primeiro'},{time:15.32,text:'segundo'}]);assert.equal(lyricIndex(lyrics,8),0);assert.equal(lyricIndex(lyrics,0),-1)});
test('duplicates multi timestamp lines',()=>{assert.equal(parseLRC('[00:01.00][00:06.25]refrão').length,2)});
test('ignores metadata, empty and invalid',()=>{assert.deepEqual(parseLRC('[ar:Author]\ninvalid'),[])});
