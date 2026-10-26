import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerformancePads,PAD_NAMES,PAD_KEYS,MIDI_BASE_NOTE,clampBpm,padFromNote,quantizeStep} from '../lib/performance-pads.js';
import {renderPerformancePanel} from '../ui/performance-panel.js';

test('GNARLY MPC exposes exactly 16 distinct pads and compact keyboard bindings',()=>{
 assert.equal(PAD_NAMES.length,16);
 assert.equal(PAD_KEYS.length,16);
 assert.equal(new Set(PAD_NAMES).size,16);
 assert.equal(new Set(PAD_KEYS).size,16);
 assert.equal(padFromNote(36),0);
 assert.equal(padFromNote(51),15);
 assert.equal(padFromNote(52),-1);
 assert.equal(padFromNote(35),-1);
 assert.equal(MIDI_BASE_NOTE,36);
});
test('tempo and 16th-note quantization remain bounded',()=>{
 assert.equal(clampBpm(30),70);
 assert.equal(clampBpm(200),160);
 assert.equal(quantizeStep(0,120),0);
 assert.equal(quantizeStep(.125,120),1);
 assert.equal(quantizeStep(2,120),0);
});
test('performance controls render a navigable grid with opt-in Web MIDI',()=>{
 const pads=new PerformancePads({});
 const html=renderPerformancePanel(pads.snapshot());
 assert.equal((html.match(/data-dj-pad="/g)||[]).length,16);
 assert.equal((html.match(/data-dj-step="/g)||[]).length,16);
 assert.match(html,/data-dj-command="loop"/);
 assert.match(html,/data-dj-command="record"/);
 assert.match(html,/data-dj-command="clear"/);
 assert.match(html,/data-dj-command="midi"/);
 assert.match(html,/aria-label="16 pads de bateria e efeitos"/);
 assert.doesNotMatch(html,/<script/);
});
test('pattern clear does not disturb shared audio graph or recreate context',()=>{
 const shared={ctx:null};const pads=new PerformancePads(shared);
 pads.pattern[0].add(3);pads.pattern[11].add(12);
 assert.equal(pads.snapshot().programmed[0],1);
 pads.clearPattern();
 assert.equal(pads.snapshot().programmed.reduce((sum,n)=>sum+n,0),0);
 assert.strictEqual(pads.engine,shared);
 pads.destroy();
});
test('MIDI note-only LED feedback sends bounded note-on/off without sysex',()=>{
 const messages=[];const pads=new PerformancePads({ctx:{currentTime:1}});
 pads.midi={inputs:new Map(),outputs:new Map([['hardware',{send:(message,at)=>messages.push({message,at})}]])};
 pads.setOutput('hardware');pads.sendLed(5,200,1);
 assert.equal(messages.length,2);
 assert.deepEqual(messages[0].message,[0x90,41,127]);
 assert.deepEqual(messages[1].message,[0x80,41,0]);
 assert.ok(messages[1].at>messages[0].at);
 pads.setOutput('off');pads.sendLed(2,80,1);
 assert.equal(messages.length,2);
 pads.destroy();
});
test('Page build includes performance styles and shared audio engine integration',()=>{
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const script=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
 assert.match(index,/id="performance-button"/);
 assert.match(index,/performance\.css/);
 assert.match(app,/const pads=new PerformancePads\(engine\)/);
 assert.match(app,/case 'performance'/);
 assert.match(app,/pads\.getPulse\(\)/);
 assert.match(script,/performance\.css/);
});
