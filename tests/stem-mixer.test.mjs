import test from 'node:test';import assert from 'node:assert/strict';
import {mapStemFiles,classifyStemFilename,STEM_PRESETS} from '../lib/stem-mixer.js';
test('classify 4-source neural Demucs track filenames',()=>{
 assert.equal(classifyStemFilename('Vocals.wav'),'vocal');assert.equal(classifyStemFilename('drums.m4a'),'drums');assert.equal(classifyStemFilename('bass.wav'),'bass');assert.equal(classifyStemFilename('other.wav'),'other');
});
test('mixer rejects incomplete, ambiguous uploads',()=>{
 const f=['vocals.wav','drums.wav','bass.wav','other.wav'].map(name=>({name}));assert.deepEqual(Object.keys(mapStemFiles(f)),['vocal','drums','bass','other']);
 assert.throws(()=>mapStemFiles(f.slice(0,3)),/4 arquivos/);assert.throws(()=>mapStemFiles([...f,{name:'vocals.mp3'}]),/repetido/);
});
test('true stem presets mute specific sources (never infer source separation)',()=>{
 assert.deepEqual(STEM_PRESETS.karaoke,{vocal:0,drums:1,bass:1,other:1});assert.deepEqual(STEM_PRESETS.acapella,{vocal:1,drums:0,bass:0,other:0});
});
