import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timedWindows,analyzeVoice,KaraokeLiveScore} from '../lib/karaoke-live-score.js';
import {KaraokeMicrophone} from '../lib/karaoke-microphone.js';
import {karaokeStageMarkup} from '../ui/karaoke-stage.js';
const lines=[{time:2,text:'Hello there'},{time:4,text:'A new verse'},{time:6,text:'Final verse'}];
test('only valid timed lyric lines create scoring intervals',()=>{
 assert.deepEqual(timedWindows(lines,10).map(x=>[x.start,x.end]),[[2,4],[4,6],[6,10]]);
 assert.deepEqual(timedWindows([{text:'untimed'},null],12),[]);
 const gaps=timedWindows([{time:1,text:'a'},{time:40,text:'b'}],50);
 assert.equal(gaps[0].end,15,'never score unbounded silent gaps');
});
test('microphone autocorrelation detects the pitch of a real synthetic vocal tone',()=>{
 const rate=44100,count=4096,samples=Float32Array.from({length:count},(_,i)=>0.2*Math.sin(2*Math.PI*220*i/rate));
 const frame=analyzeVoice(samples,rate);
 assert.ok(frame.voiced,'should detect a pitched microphone waveform');
 assert.ok(Math.abs(frame.hz-220)<12,'pitch should approximate A3: '+frame.hz);
 const silence=analyzeVoice(new Float32Array(4096),rate);
 assert.equal(silence.voiced,false);assert.equal(silence.hz,null);
});
test('score derives from actual voiced source-time, not UI rendering frequency',()=>{
 const scorer=new KaraokeLiveScore();
 assert.equal(scorer.start(lines,2,10),true);
 const voice={rms:.18,hz:220,confidence:.95,voiced:true};
 for(let t=2.1;t<4.01;t+=.1)scorer.tick(t,true,voice);
 const snapshot=scorer.snapshot();
 assert.ok(snapshot.score>0);
 assert.ok(snapshot.accuracy>0);
 assert.equal(snapshot.hasReference,false,'never invent verified harmonic reference');
 assert.ok(snapshot.judged>=1);
 assert.ok(snapshot.combo>=1);
 const before=snapshot.score;
 scorer.tick(18,true,voice);
 assert.equal(scorer.snapshot().score,before,'large seek cannot create points');
 scorer.tick(18.1,false,voice);
 assert.equal(scorer.snapshot().score,before,'pause cannot create points');
});
test('opening at the middle of a song skips old verses and not score backwards',()=>{
 const scorer=new KaraokeLiveScore();
 assert.equal(scorer.start(lines,4.2,10),true);
 const voice={rms:0,hz:null,confidence:0,voiced:false};
 scorer.tick(4.4,true,voice);
 assert.equal(scorer.snapshot().score,0);
 scorer.tick(1.0,true,voice);
 assert.equal(scorer.snapshot().score,0);
 assert.equal(scorer.start([],0,50),false);
});
test('microphone is never requested by construction; permission only on start',async()=>{
 let requests=0;
 const stream={active:true,getTracks:()=>[{stop(){},addEventListener(){}}]};
 class FakeAnalyser{fftSize=4096;connect(){}disconnect(){}getFloatTimeDomainData(x){x.fill(0)}}
 class FakeContext{
  state='running';sampleRate=44100;destination={};
  createMediaStreamSource(){return {connect(){},disconnect(){}}}
  createAnalyser(){return new FakeAnalyser()}
  createGain(){return {gain:{value:1},connect(){},disconnect(){}}}
  resume(){return Promise.resolve()}
  close(){this.state='closed';return Promise.resolve()}
 }
 const fake=new KaraokeMicrophone({mediaDevices:{getUserMedia:async()=>{requests++;return stream}},AudioContextClass:FakeContext});
 assert.equal(requests,0);
 await fake.start();assert.equal(requests,1);
 fake.stop();assert.equal(fake.timer,null);
 assert.equal(fake.frameNow().voiced,false);
});
test('expanded karaoke preserves same HTMLAudioElement and renders safe controls',()=>{
 const ui=karaokeStageMarkup();
 for(const key of ['karaoke-stage-close','karaoke-voice-toggle','karaoke-voice-record','karaoke-caption-settings','karaoke-follow-live','karaoke-reader-lines','karaoke-stage-play','karaoke-stage-fullscreen','karaoke-stage-feedback'])
  assert.ok(ui.includes('id="'+key+'"'));
 assert.doesNotMatch(ui,/<audio\b|<iframe\b|autoplay/,'stage must not create a second player');
 assert.doesNotMatch(ui,/<script\b/);
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
 assert.match(index,/id="karaoke-expand-button"/);
 assert.match(index,/karaoke-stage\.css/);
 assert.match(build,/karaoke-stage\.css/);
 assert.match(app,/karaokeStage\.open\(e\.currentTarget\)/);
 assert.match(app,/karaokeStage\.resetForTrack\(\)/);
 assert.match(app,/karaokeStage\.destroy\(\)/);
 assert.match(app,/onMicConflict:/);
});

test('expanded-stage scroll and controls are owned by karaoke, not the page or queue',()=>{
 const js=readFileSync(new URL('../ui/karaoke-stage.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../karaoke-stage.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/active\.scrollIntoView/);
 assert.match(js,/reader\.scrollTo\(/);
 assert.match(js,/centerActiveLine\(active(?:,\{instant:[^}]+\})?\)/);
 assert.match(js,/case 'karaoke-stage-fullscreen'/);
 assert.match(js,/case 'karaoke-stage-play'/);
 assert.match(js,/karaoke-stage-feedback/);
 assert.match(css,/\.karaoke-stage:not\(\[hidden\]\)/);
 assert.match(css,/\.karaoke-stage-header\{/);
 assert.match(css,/\.karaoke-stage-font-menu:not\(\[hidden\]\)/);
 assert.match(app,/onFullscreen:\(\)=>\{void fullscreen\.toggle\(\)\}/);
 assert.match(app,/onPlayPause:\(\)=>\{if\(!audio\.paused/);
 assert.match(app,/ListeningMemory|listeningMemory/,'smart queue/music memory must remain integrated');
});
