import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {audioRms,SilentTailMonitor} from '../lib/silent-tail-monitor.js';
import {mediaTimeline,shouldFinishGhostTail} from '../lib/media-duration.js';

const track={source:'youtube',mediaDuration:390,catalogDuration:192,offline:false};
const sample=(monitor,currentTime,rms=.04,now=currentTime*1000,overrides={})=>
 monitor.sample({...track,currentTime,rms,now,valid:true,...overrides});

test('RMS observations require a real running analyser and do not create audio contexts',()=>{
 const bytes=new Uint8Array(8),analyser={fftSize:8,
  getByteTimeDomainData(dst){dst.set([128,129,124,132,126,127,129,127])}};
 const rms=audioRms(analyser,bytes);
 assert.ok(rms>0&&rms<.03);
 assert.equal(audioRms(null,bytes),null);
 assert.equal(audioRms(analyser,new Uint8Array(4)),null);
});

test('a real extended recording overrides provisional near-double duration after sound is observed beyond catalogue',()=>{
 const guard=new SilentTailMonitor();
 assert.equal(sample(guard,100,.08,1000),false);
 assert.equal(sample(guard,204,.04,2000),false);
 assert.equal(guard.audibleExtended,true);
 assert.equal(mediaTimeline({...track,audibleExtended:guard.audibleExtended}).duration,390);
 for(let t=205;t<224;t++)assert.equal(sample(guard,t,0,2000+(t-204)*1000),false);
 assert.equal(guard.confirmed,false,'later quiet passages must not end a legitimate long edit');
 guard.cancelSilence();
 assert.equal(guard.audibleExtended,true);
});

test('silence confirmed only from actual samples with prior audio and 11 continuous seconds',()=>{
 const guard=new SilentTailMonitor();
 assert.equal(sample(guard,150,.05,1000),false);
 for(let t=205;t<=215;t++)assert.equal(sample(guard,t,0,(t-204)*1000),false);
 assert.equal(sample(guard,216,0,12000),true);
 assert.equal(shouldFinishGhostTail({...track,currentTime:216,confirmedSilentTail:guard.confirmed}),true);
});
test('no waveform, mute, pause, seek, background and discontinuities never trigger ghost completion',()=>{
 const guard=new SilentTailMonitor();
 sample(guard,120,.04,1000);
 assert.equal(sample(guard,205,null,2000,{valid:false}),false);
 assert.equal(sample(guard,206,0,3000,{paused:true}),false);
 assert.equal(sample(guard,207,0,4000,{seeking:true}),false);
 for(let t=208;t<215;t++)sample(guard,t,0,t*1000);
 guard.cancelSilence();
 assert.equal(sample(guard,216,0,216000),false);
 assert.equal(guard.confirmed,false);
 const empty=new SilentTailMonitor();
 for(let t=205;t<230;t++)sample(empty,t,0,t*1000);
 assert.equal(empty.confirmed,false,'cannot infer silence without prior observed audible signal');
});
test('only approximate 2x of a known remote song can be provisionally reconciled',()=>{
 assert.equal(mediaTimeline({...track}).duration,192);
 for(const source of ['local','preview','audius','jamendo']){
  assert.equal(mediaTimeline({...track,source}).duration,390,source);
 }
 assert.equal(mediaTimeline({...track,offline:true}).duration,390);
 assert.equal(mediaTimeline({...track,mediaDuration:450}).duration,450);
 assert.equal(mediaTimeline({...track,catalogDuration:0}).duration,390);
 assert.equal(mediaTimeline({...track,catalogDuration:12}).duration,390);
});
test('app uses measured waveform only when a WebAudio graph already exists',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/\!\!engine\.mediaSource\&\&\!engine\.nativeTransport/);
 assert.match(app,/silentTailMonitor\.read\(engine\.analyser\)/);
 assert.match(app,/confirmedSilentTail:silent/);
 assert.match(app,/silentTailMonitor\.reset\(\)/);
 assert.match(app,/silentTailMonitor\.cancelSilence\(\)/);
});
