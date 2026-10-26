import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNotes,chordTimeline,harmonySummary,notesToMidi,notesToPadPattern,noteName} from '../lib/music-note-intelligence.js';
import {PerformancePads} from '../lib/performance-pads.js';
import {renderPerformancePanel} from '../ui/performance-panel.js';

const note=(pitch,start,length=.7)=>({pitchMidi:pitch,startTimeSeconds:start,durationSeconds:length,amplitude:.8});
const triad=[note(60,0,2),note(64,0,2),note(67,0,2)];
test('Notes are bounded and never imply embedded original MIDI',()=>{
 assert.deepEqual(validateNotes([note(-1,0),note(60,-3),note(60,0),{pitchMidi:NaN}],3).length,1);
 assert.equal(noteName(60),'C4');assert.equal(noteName(69),'A4');
 assert.equal(validateNotes([{...note(60,0),durationSeconds:10}],3)[0].durationSeconds,3);
});
test('Chord intervals recognize simple C major and A minor, reject silence',()=>{
 assert.equal(chordTimeline(triad,{duration:2})[0].chord,'C');
 const minor=[note(57,0,2),note(60,0,2),note(64,0,2)];
 assert.equal(chordTimeline(minor,{duration:2})[0].chord,'Am');
 assert.equal(chordTimeline([],{duration:2})[0].chord,'—');
 const sum=harmonySummary(triad,2);
 assert.ok(sum.displayChords.includes('C'));
 assert.equal(sum.notes,3);
});
test('SMF MIDI notes export has correct standard header, track size, terminator',()=>{
 const bytes=notesToMidi([note(60,.5,.25),note(64,1.25,.5)]);
 assert.equal(new TextDecoder().decode(bytes.subarray(0,4)),'MThd');
 assert.equal(new TextDecoder().decode(bytes.subarray(14,18)),'MTrk');
 const size=(bytes[18]*16777216+bytes[19]*65536+bytes[20]*256+bytes[21]);
 assert.equal(size,bytes.length-22);
 assert.deepEqual(Array.from(bytes.subarray(-4)),[0,255,47,0]);
 assert.throws(()=>notesToMidi([]),/notas/);
});
test('Transcribed melodic notes map only to explicit 16-step pads',()=>{
 const notes=[note(60,0,.25),note(64,.2,.25),note(67,.5,.25),note(60,1.5,.2)];
 const converted=notesToPadPattern(notes,120);
 assert.equal(converted.pattern.length,16);
 assert.ok(converted.mapped>0);
 assert.ok(converted.pitches.includes(60));
 const shared={ctx:null};
 const pads=new PerformancePads(shared);
 assert.ok(pads.applyNotePattern(notes)>0);
 assert.strictEqual(pads.engine,shared);
 assert.equal(pads.snapshot().programmed.reduce((a,b)=>a+b,0),converted.mapped);
 pads.destroy();
});
test('GNARLY DJ keeps 16 pads and opt-in audio intelligence',()=>{
 const pads=new PerformancePads({ctx:null});
 const markup=renderPerformancePanel({...pads.snapshot(),intelligence:{
  busy:false,ready:true,notes:3,tonalCenter:'C (estimado)',displayChords:['C','Am'],
  status:'Análise disponível'}});
 assert.equal((markup.match(/data-dj-pad="/g)||[]).length,16);
 for(const action of ['analyze-midi','save-midi','map-midi'])assert.match(markup,new RegExp('data-dj-command="'+action+'"'));
 assert.match(markup,/C \(estimado\)/);
 assert.match(markup,/Análise disponível/);
 assert.doesNotMatch(markup,/<script/);
});
test('MIDI work is deferred, bounded and separate from the WebAudio player',()=>{
 const client=readFileSync(new URL('../lib/audio-midi-transcriber.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../lib/basic-pitch-worker.js',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(client,/new Worker\(/);
 assert.match(client,/25/);assert.match(client,/10\*1024\*1024/);
 assert.match(worker,/BasicPitch/);
 assert.match(build,/basic-pitch-worker/);
 assert.match(build,/group1-shard1of1\.bin/);
 assert.match(index,/id="dj-midi-import"/);
 assert.doesNotMatch(client,/ytimg\.com|youtube\.com|\/download/);
});
