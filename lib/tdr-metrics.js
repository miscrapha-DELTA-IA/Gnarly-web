/**
 * GNARLY TDR (Tempo de Reprodução): selection -> first native 'playing'.
 *
 * Session-local, bounded, read-only telemetry. No track IDs, titles, URLs,
 * cookies, timestamps from the wall clock or network requests are collected.
 * Browser 'playing' is the best available proxy for audible start, NOT a
 * measurement of speakers or human-perceived sound. The first subsequent
 * media-clock advance is recorded as independent corroboration.
 *
 * Never alter HTMLMediaElement, extraction, recovery, queue or cache behavior.
 */
const SOURCES=new Set(['youtube','offline','local','audius','jamendo','preview','unknown']);
const PHASES=new Set([
 'play_intent','source_attached','play_call','prewarm_requested','media_error',
 'recovery_started','pc_wait_started','pc_ready','pc_wait_finished',
 'r2_sync_started','r2_sync_finished','alternative_started','waiting','stalled'
]);
const MAX_TDR_MS=600000;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const duration=(a,b)=>Math.max(0,Math.round(b-a));
const ms=(value)=>finite(value)?Math.round(value):null;
const percent=(numerator,denominator)=>denominator?Math.round(numerator/denominator*1000)/10:null;
const median=(arr,p)=>{
 if(!arr.length)return null;
 const sorted=arr.slice().sort((a,b)=>a-b);
 const point=(sorted.length-1)*p,lo=Math.floor(point),hi=Math.ceil(point);
 return Math.round(sorted[lo]+(sorted[hi]-sorted[lo])*(point-lo));
};
const summarize=values=>({
 count:values.length,
 p50Ms:median(values,.5),p90Ms:median(values,.9),
 p95Ms:median(values,.95),meanMs:values.length?
  Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null
});
const safeSource=value=>SOURCES.has(value)?value:'unknown';

export class TdrMonitor{
 constructor({now=()=>performance.now(),maxSamples=96}={}){
  this.now=now;this.maxSamples=Math.max(8,Math.min(256,Math.trunc(maxSamples)||96));
  this.current=null;this.awaitingProgress=null;this.samples=[];this.failures=[];
  this.totals={selections:0,started:0,successful:0,terminalErrors:0,
   userCancels:0,superseded:0,handoffs:0};
 }
 select(selection,{at=this.now(),source='unknown',autoplay=true,readyHint=false,handoff=false}={}){
  if(!Number.isInteger(selection)||selection<0||!finite(at))return false;
  if(handoff&&this.current?.pending){
   this.current.selection=selection;
   this.current.source=safeSource(source);this.current.handoffs++;
   this.totals.handoffs++;
   return true;
  }
  if(this.current?.pending)this.finish(this.current.selection,'superseded',at);
  this.awaitingProgress=null;
  this.current={selection,at,source:safeSource(source),autoplay:!!autoplay,
   readyHint:!!readyHint,handoffs:0,pending:true,marks:{},playCalls:0};
  this.totals.selections++;
  return true;
 }
 mark(selection,phase,at=this.now()){
  const c=this.current;
  if(!c?.pending||c.selection!==selection||!PHASES.has(phase)||
     !finite(at)||at<c.at)return false;
  if(!(phase in c.marks))c.marks[phase]=at;
  if(phase==='play_call')c.playCalls++;
  return true;
 }
 playCall(selection,{at=this.now(),source='unknown'}={}){
  // A user can explicitly retry the same selected song after a terminal error.
  // That is NOT selection-to-playback: classify it as an isolated manual retry.
  if(!this.current||this.current.selection!==selection||!this.current.pending){
   this.select(selection,{at,source,autoplay:false});
   this.current.retry=true;
  }
  if(this.current?.marks.play_call===undefined)this.totals.started++;
  this.mark(selection,'play_call',at);
 }
 playing(selection,{at=this.now(),position=0}={}){
  const c=this.current;
  if(!c?.pending||c.selection!==selection||!finite(at)||at<c.at)return null;
  const tdr=duration(c.at,at);
  if(tdr>MAX_TDR_MS)return this.finish(selection,'expired',at),null;
  const mark=c.marks,playAt=mark.play_call??null;
  const sample={
   kind:c.autoplay?'automatic':c.retry?'manual_retry':'manual',
   source:c.source,readyHint:c.readyHint,handoffs:c.handoffs,
   tdrMs:tdr,selectionToPlayMs:playAt===null?null:duration(c.at,playAt),
   playToPlayingMs:playAt===null?null:duration(playAt,at),
   // Diagnostic subphases are observational, not mutually exclusive and
   // must never be added to claim a longer total TDR.
   timeToRecoveryMs:mark.recovery_started===undefined?null:duration(c.at,mark.recovery_started),
   pcWaitMs:mark.pc_wait_started===undefined||mark.pc_wait_finished===undefined?
    null:duration(mark.pc_wait_started,mark.pc_wait_finished),
   r2SyncMs:mark.r2_sync_started===undefined||mark.r2_sync_finished===undefined?
    null:duration(mark.r2_sync_started,mark.r2_sync_finished),
   recovered:mark.recovery_started!==undefined||c.handoffs>0,
   hadMediaError:mark.media_error!==undefined,
   hadWaiting:mark.waiting!==undefined,
   hadStall:mark.stalled!==undefined,
   playCalls:c.playCalls,
   // Upper-bound corroboration arrives via normal HTMLMediaElement timeupdate.
   progressConfirmedMs:null,confirmationLagMs:null
  };
  this.samples.push(sample);
  if(this.samples.length>this.maxSamples)this.samples.shift();
  this.totals.successful++;
  this.awaitingProgress={selection,sample,position:finite(position)?position:0,at};
  this.current=null;
  return {...sample};
 }
 confirmProgress(selection,position,at=this.now()){
  const p=this.awaitingProgress;
  if(!p||p.selection!==selection||!finite(position)||!finite(at)||
     at<p.at||position<p.position+.04)return false;
  p.sample.progressConfirmedMs=duration(p.at-p.sample.tdrMs,at);
  p.sample.confirmationLagMs=duration(p.at,at);
  this.awaitingProgress=null;
  return true;
 }
 finish(selection,reason='cancelled',at=this.now()){
  const c=this.current;
  if(!c?.pending||c.selection!==selection)return false;
  if(reason==='terminal_error')this.totals.terminalErrors++;
  else if(reason==='superseded')this.totals.superseded++;
  else if(reason==='user_cancel')this.totals.userCancels++;
  const elapsed=finite(at)?Math.min(MAX_TDR_MS,duration(c.at,at)):null;
  if(reason==='terminal_error'&&elapsed!==null){
   this.failures.push({source:c.source,elapsedMs:elapsed,hadRecovery:c.marks.recovery_started!==undefined});
   if(this.failures.length>this.maxSamples)this.failures.shift();
  }
  this.current=null;
  this.awaitingProgress=null;
  return true;
 }
 snapshot(){
  const samples=this.samples,automatic=samples.filter(x=>x.kind==='automatic');
  const manual=samples.filter(x=>x.kind!=='automatic');
  const sourceNames=[...new Set(samples.map(x=>x.source))];
  const phases={selectionToPlay: summarize(automatic.map(x=>x.selectionToPlayMs).filter(finite)),
   playToPlaying:summarize(automatic.map(x=>x.playToPlayingMs).filter(finite)),
   pcWait:summarize(automatic.map(x=>x.pcWaitMs).filter(finite)),
   r2Sync:summarize(automatic.map(x=>x.r2SyncMs).filter(finite)),
   clockConfirmationLag:summarize(automatic.map(x=>x.confirmationLagMs).filter(finite))};
  return {
   metric:'TDR',definition:'selection_to_first_native_playing',
   caveat:'playing is a browser signal, not physical speaker output; progress confirms decoded media clock',
   unit:'ms',scope:'current_browser_session',maxSamples:this.maxSamples,
   totals:{...this.totals},
   automatic:summarize(automatic.map(x=>x.tdrMs)),
   manual:summarize(manual.map(x=>x.tdrMs)),
   recovered:summarize(automatic.filter(x=>x.recovered).map(x=>x.tdrMs)),
   withoutRecovery:summarize(automatic.filter(x=>!x.recovered).map(x=>x.tdrMs)),
   terminalFailures:summarize(this.failures.map(x=>x.elapsedMs)),
   bySource:Object.fromEntries(sourceNames.map(source=>[
    source,summarize(automatic.filter(x=>x.source===source).map(x=>x.tdrMs))
   ])),
   phases,
   successRatePercent:percent(this.totals.successful,
    this.totals.successful+this.totals.terminalErrors),
   inProgress:this.current?{kind:this.current.autoplay?'automatic':'manual',
    source:this.current.source,elapsedMs:duration(this.current.at,this.now()),
    phase:this.current.marks.recovery_started!==undefined?'recovering':
     this.current.marks.play_call!==undefined?'connecting':'selected'}:null,
   recent:samples.slice(-12).map(x=>({...x}))
  };
 }
}
export function tdrSourceForTrack(track,{offline=false}={}){
 if(offline)return 'offline';
 return safeSource(track?.source);
}
