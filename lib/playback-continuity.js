/**
 * Playback continuity instrumentation for the ONE native HTMLMediaElement.
 * Read-only: never calls seek(), mutates playbackRate or pauses the song.
 * Separate actual browser clock discontinuities from ordinary timeupdate
 * jitter, deliberate seeks, pause, track changes and background throttling.
 */
const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export function playableBufferAhead(audio){
 const position=Number(audio?.currentTime);
 if(!Number.isFinite(position)||position<0)return null;
 const ranges=audio?.buffered;
 if(!ranges||!Number.isInteger(ranges.length))return null;
 try{
  for(let i=0;i<ranges.length;i++){
   const start=ranges.start(i),end=ranges.end(i);
   if(position>=start-.05&&position<=end+.05)
    return Math.max(0,end-position);
  }
 }catch{/* MediaTimeRanges can change during source selection. */}
 return null;
}
export class PlaybackContinuityMonitor {
 constructor({onInstability=()=>{},now=()=>performance.now()}={}){
  this.onInstability=onInstability;this.now=now;
  this.selection=null;this.source=null;this.last=null;
  this.jumps=0;this.waits=0;this.stalls=0;this.lowBuffers=0;
  this.lastJumpSeconds=0;this.lastBufferedAhead=null;this.lastEvent='idle';
  this.lastLowBufferAt=-Infinity;
 }
 select(selection){
  this.selection=selection;this.source=null;this.last=null;
  this.jumps=this.waits=this.stalls=this.lowBuffers=0;
  this.lastJumpSeconds=0;this.lastBufferedAhead=null;this.lastEvent='selection';
  this.lastLowBufferAt=-Infinity;
 }
 resetClock(){this.last=null}
 transportEvent(type){
  if(type==='waiting'){this.waits++;this.lastEvent='waiting'}
  if(type==='stalled'){this.stalls++;this.lastEvent='stalled'}
  if(type==='seeking'||type==='seeked'||type==='ratechange'){
   this.last=null;this.lastEvent=type;
  }
 }
 sample({position,timeMs=this.now(),rate=1,paused=false,seeking=false,
  visible=true,readyState=0,source=null,bufferedAhead=null,duration=0}={}){
  const time=Number(timeMs),media=Number(position),speed=bounded(rate,.5,2,1);
  if(source!==this.source){this.source=source;this.resetClock()}
  if(paused||seeking||!visible||readyState<2||!Number.isFinite(media)||
    !Number.isFinite(time)||media<0){this.resetClock();return null}
  const ahead=Number.isFinite(bufferedAhead)&&bufferedAhead>=0?bufferedAhead:null;
  this.lastBufferedAhead=ahead;
  const previous=this.last;this.last={time,media,rate:speed};
  if(!previous||time<=previous.time)return null;
  const wall=(time-previous.time)/1000,advance=media-previous.media;
  if(wall>5||Math.abs(speed-previous.rate)>.01||advance<-.06)return null;
  const unexpected=advance-wall*speed;
  // Delayed JS callbacks are accounted for by the wall clock. Count only
  // a significant forward discontinuity beyond normal decoder time jitter.
  if(advance>.45&&unexpected>.32){
   this.jumps++;this.lastJumpSeconds=Number(unexpected.toFixed(3));
   this.lastEvent='forward_jump';
   this.onInstability('forward_jump',{seconds:this.lastJumpSeconds,ahead});
   return 'forward_jump';
  }
  // Buffer pressure is a hint to lighten GPU work, NOT a license to
  // manipulate the audio clock. Exclude the natural last seconds of a song.
  if(ahead!==null&&ahead<.75&&Number(duration)>media+3&&
    time-this.lastLowBufferAt>5000){
   this.lastLowBufferAt=time;this.lowBuffers++;this.lastEvent='low_buffer';
   this.onInstability('low_buffer',{seconds:ahead});
   return 'low_buffer';
  }
  return null;
 }
 snapshot(){
  return {forwardJumps:this.jumps,waiting:this.waits,stalled:this.stalls,
   lowBufferEvents:this.lowBuffers,lastForwardJumpSeconds:this.lastJumpSeconds,
   bufferedAheadSeconds:this.lastBufferedAhead,lastEvent:this.lastEvent};
 }
}
