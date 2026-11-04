/** Independent evidence for a suspected phantom audio tail.
 * Never construct a WebAudio graph merely to diagnose duration.
 * Native iOS playback and lock-screen behavior must remain intact.
 */
import {mediaTimeline} from './media-duration.js';

export function audioRms(analyser,buffer){
 if(!analyser||typeof analyser.getByteTimeDomainData!=='function'||
  !(buffer instanceof Uint8Array)||buffer.length!==analyser.fftSize)return null;
 try{
  analyser.getByteTimeDomainData(buffer);
  let squared=0;
  for(const n of buffer){const sample=(n-128)/128;squared+=sample*sample}
  return Math.sqrt(squared/buffer.length);
 }catch{return null}
}
export class SilentTailMonitor{
 constructor({silenceSeconds=11,minWallMs=8000}={}){
  this.silenceSeconds=silenceSeconds;this.minWallMs=minWallMs;
  this.reset();
 }
 reset(){
  this.audibleBefore=false;this.audibleExtended=false;
  this.silencePosition=null;this.silenceWall=null;
  this.lastPosition=null;this.confirmed=false;
  this.samples=null;
 }
 read(analyser){
  if(!analyser?.fftSize)return null;
  if(this.samples?.length!==analyser.fftSize)
   this.samples=new Uint8Array(analyser.fftSize);
  return audioRms(analyser,this.samples);
 }
 sample({mediaDuration=0,catalogDuration=0,source='',offline=false,
  currentTime=0,rms=null,valid=false,now=0,paused=false,seeking=false}={}){
  const timing=mediaTimeline({mediaDuration,catalogDuration,source,offline});
  const position=Number(currentTime);
  if(!timing.suspectedDouble){this.reset();return false}
  if(!valid||paused||seeking||!Number.isFinite(rms)||!Number.isFinite(position)||
   !Number.isFinite(now)||position<0){
   this.silencePosition=this.silenceWall=this.lastPosition=null;
   return false;
  }
  // Clock jumps from seeks or a throttled background tab never count as
  // continuous decoded silence, even after a prior audible sample.
  const jumped=this.lastPosition!==null&&
    (position<this.lastPosition-.2||position-this.lastPosition>3);
  this.lastPosition=position;
  if(jumped)this.silencePosition=this.silenceWall=null;
  if(position<catalogDuration-4&&rms>.012)this.audibleBefore=true;
  if(position<timing.ghostEndAt){
   this.silencePosition=this.silenceWall=null;
   return false;
  }
  if(rms>.012){
   // Real audio beyond nominal end proves a legitimate longer recording.
   this.audibleExtended=true;
   this.silencePosition=this.silenceWall=null;
   return false;
  }
  if(this.audibleExtended||!this.audibleBefore||rms>=.003){
   this.silencePosition=this.silenceWall=null;
   return false;
  }
  if(this.silencePosition===null){
   this.silencePosition=position;this.silenceWall=now;
  }
  if(!jumped&&position-this.silencePosition>=this.silenceSeconds&&
   now-this.silenceWall>=this.minWallMs){
   this.confirmed=true;
  }
  return this.confirmed;
 }
}
