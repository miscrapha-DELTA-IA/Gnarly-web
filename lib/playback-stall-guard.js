/** A deadline for the CURRENT audio request, never a fake progress bar.
 * Repeated waiting/stalled events cannot postpone a deadline forever.
 * Selecting another track, pausing or hearing actual audio cancels it.
 */
export class PlaybackStallGuard {
 constructor({schedule=(fn,ms)=>setTimeout(fn,ms),
              cancel=handle=>clearTimeout(handle),
              startupMs=20000,rebufferMs=12000}={}){
  this.schedule=schedule;this.cancelTimer=cancel;
  this.startupMs=startupMs;this.rebufferMs=rebufferMs;
  this.timer=null;this.key=null;this.generation=0;
 }
 arm({selection,phase='startup',onTimeout}={}){
  if(typeof onTimeout!=='function')return;
  const key=String(selection)+'|'+(phase==='rebuffer'?'rebuffer':'startup');
  if(this.timer!==null&&this.key===key)return;
  this.clear();
  this.key=key;
  const generation=this.generation;
  this.timer=this.schedule(()=>{
   if(generation!==this.generation||this.key!==key)return;
   this.timer=null;this.key=null;
   onTimeout();
  },phase==='rebuffer'?this.rebufferMs:this.startupMs);
 }
 clear(){
  ++this.generation;
  if(this.timer!==null)this.cancelTimer(this.timer);
  this.timer=null;this.key=null;
 }
}
