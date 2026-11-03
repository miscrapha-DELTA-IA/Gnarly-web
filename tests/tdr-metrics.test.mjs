import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TdrMonitor,tdrSourceForTrack} from '../lib/tdr-metrics.js';

const track={id:'youtube:dQw4w9WgXcQ',videoId:'dQw4w9WgXcQ',source:'youtube',title:'PRIVATE SONG TITLE'};
function harness(){
 let time=0;
 const tdr=new TdrMonitor({now:()=>time,maxSamples:8});
 return {tdr,advance(ms){time+=ms;return time},clock:()=>time};
}
test('TDR starts at track selection, including synchronous work before Play',()=>{
 const h=harness();
 h.tdr.select(11,{source:'youtube',autoplay:true,at:h.clock()});
 h.advance(150);h.tdr.mark(11,'play_intent');
 h.advance(60);h.tdr.playCall(11);
 h.advance(790);h.tdr.playing(11,{position:0});
 const snap=h.tdr.snapshot();
 assert.equal(snap.metric,'TDR');
 assert.equal(snap.definition,'selection_to_first_native_playing');
 assert.equal(snap.automatic.p50Ms,1000);
 assert.equal(snap.phases.selectionToPlay.p50Ms,210);
 assert.equal(snap.phases.playToPlaying.p50Ms,790);
 assert.equal(snap.totals.started,1);
 assert.equal(snap.totals.successful,1);
 assert.equal(snap.bySource.youtube.p50Ms,1000);
});
test('the first advancing media timestamp confirms rather than redefines TDR',()=>{
 const h=harness();h.tdr.select(1,{at:0,source:'youtube'});
 h.advance(20);h.tdr.playCall(1);
 h.advance(380);h.tdr.playing(1,{position:0});
 h.advance(100);assert.equal(h.tdr.confirmProgress(1,.03),false);
 h.advance(110);assert.equal(h.tdr.confirmProgress(1,.15),true);
 const snap=h.tdr.snapshot();
 assert.equal(snap.automatic.p50Ms,400);
 assert.equal(snap.phases.clockConfirmationLag.p50Ms,210);
 assert.equal(snap.recent[0].progressConfirmedMs,610);
 assert.equal(h.tdr.confirmProgress(1,.25),false,'only the first clock advance is stored');
});
test('a real same-recording alternative preserves original selection time and recovery',()=>{
 const h=harness();h.tdr.select(1,{source:'youtube',autoplay:true});
 h.advance(100);h.tdr.playCall(1);
 h.advance(6000);h.tdr.mark(1,'media_error');h.tdr.mark(1,'recovery_started');
 h.advance(100);h.tdr.mark(1,'pc_wait_started');
 h.advance(1500);h.tdr.mark(1,'pc_wait_finished');
 h.advance(2000);h.tdr.select(2,{source:'audius',autoplay:false,handoff:true});
 h.advance(500);h.tdr.playing(2,{position:0});
 const snap=h.tdr.snapshot();
 assert.equal(snap.automatic.p50Ms,10200);
 assert.equal(snap.bySource.audius.p50Ms,10200);
 assert.equal(snap.recovered.p50Ms,10200);
 assert.equal(snap.phases.pcWait.p50Ms,1500);
 assert.equal(snap.totals.handoffs,1);
 assert.equal(snap.totals.selections,1);
 assert.equal(snap.recent[0].hadMediaError,true);
});
test('manual selection and user delay cannot contaminate autoplay TDR statistics',()=>{
 const h=harness();h.tdr.select(1,{autoplay:false,source:'local'});
 h.advance(15000);h.tdr.playCall(1,{source:'local'});
 h.advance(100);h.tdr.playing(1);
 assert.equal(h.tdr.snapshot().automatic.count,0);
 assert.equal(h.tdr.snapshot().manual.p50Ms,15100);
 h.advance(100);h.tdr.select(2,{source:'offline',autoplay:true});
 h.advance(20);h.tdr.playCall(2);
 h.advance(30);h.tdr.playing(2);
 assert.equal(h.tdr.snapshot().automatic.p50Ms,50);
});
test('a terminal error and explicit retry are measured independently',()=>{
 const h=harness();h.tdr.select(1,{source:'youtube',autoplay:true});
 h.advance(1200);h.tdr.mark(1,'recovery_started');
 h.advance(300);h.tdr.finish(1,'terminal_error');
 h.advance(1000);h.tdr.playCall(1,{source:'youtube'});
 h.advance(200);h.tdr.playing(1);
 const snap=h.tdr.snapshot();
 assert.equal(snap.totals.terminalErrors,1);
 assert.equal(snap.terminalFailures.p50Ms,1500);
 assert.equal(snap.automatic.count,0);
 assert.equal(snap.manual.p50Ms,200);
 assert.equal(snap.recent[0].kind,'manual_retry');
 assert.equal(snap.successRatePercent,50);
});
test('cancel and rapid next track never create a false completed TDR',()=>{
 const h=harness();h.tdr.select(1,{source:'youtube'});
 h.advance(50);h.tdr.mark(1,'play_call');
 h.advance(50);h.tdr.select(2,{source:'youtube'});
 assert.equal(h.tdr.playing(1),null,'a stale playing event is not attributed to the next song');
 h.advance(100);h.tdr.finish(2,'user_cancel');
 assert.equal(h.tdr.snapshot().automatic.count,0);
 assert.equal(h.tdr.snapshot().totals.superseded,1);
 assert.equal(h.tdr.snapshot().totals.userCancels,1);
});
test('high latencies, malformed input and bounded memory remain safe',()=>{
 const h=harness();const tdr=h.tdr;
 assert.equal(tdr.select('bad'),false);
 tdr.select(1,{source:'unknown'});h.advance(300000);
 tdr.playCall(1);h.advance(300000);
 assert.equal(tdr.playing(1),null,'expired playback is not reported as a valid success');
 for(let i=2;i<30;i++){
  tdr.select(i,{source:'youtube',at:h.clock()});tdr.playCall(i);
  h.advance(10);tdr.playing(i);
 }
 const snap=tdr.snapshot();
 assert.equal(snap.recent.length,8);
 assert.equal(snap.automatic.count,8);
 assert.ok(snap.totals.selections>20);
});
test('TDR never collects the title, recording ID, URL or artwork',()=>{
 const h=harness();h.tdr.select(1,{source:tdrSourceForTrack(track,{offline:false})});
 h.tdr.playCall(1);h.advance(35);h.tdr.playing(1);
 const serialized=JSON.stringify(h.tdr.snapshot());
 assert.doesNotMatch(serialized,/PRIVATE SONG TITLE|dQw4w9WgXcQ|youtube\.com\/watch|id":|videoId|artwork/i);
 assert.equal(tdrSourceForTrack(track,{offline:true}),'offline');
 assert.equal(tdrSourceForTrack({source:'untrusted'}),'unknown');
});
test('TDR app integration is observational and the legacy streaming metric remains intact',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const metrics=readFileSync(new URL('../lib/tdr-metrics.js',import.meta.url),'utf8');
 assert.match(app,/window\.gnarlyTDRDiagnostics=\(\)=>tdr\.snapshot\(\)/);
 assert.match(app,/const selectedAt=performance\.now\(\)/);
 assert.match(app,/tdr\.select\(playbackSelection,\{at:selectedAt,autoplay,/);
 assert.match(app,/tdr\.playCall\(selection,/);
 assert.match(app,/tdr\.playing\(playbackSelection,/);
 assert.match(app,/tdr\.confirmProgress\(playbackSelection,audio\.currentTime\|\|0\)/);
 assert.match(app,/selectTrack\(alternative,false,\{tdrHandoff:true\}\)/);
 assert.match(app,/signalPlaybackMetric\(playbackMetricErrorSelection===playbackSelection/);
 assert.match(app,/recordStreamingMetric\(\{/);
 assert.doesNotMatch(metrics,/fetch\(|sendBeacon\(|localStorage|sessionStorage|audio\.play\(|audio\.pause\(|audio\.load\(/);
});
