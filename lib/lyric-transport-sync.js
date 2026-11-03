/**
 * Continuous precision for visible timed lyrics; bounded otherwise.
 * HTMLMediaElement "timeupdate" commonly fires only ~4 Hz, so the first
 * LRC changes may look late beyond the opening seconds. Sample the actual
 * currentTime (never Date.now prediction) throughout the song while actual
 * synchronized captions are visible, or briefly after a seek/resume.
 *
 * No media requests, AudioContext or fake timestamps. Native timeupdate
 * remains a fallback, and hidden/paused transport stops frame work.
 */
export class LyricTransportSync {
 constructor({
  audio,getSelection,onFrame,keepPrecise=()=>false,
  requestFrame=callback=>requestAnimationFrame(callback),
  cancelFrame=handle=>cancelAnimationFrame(handle),
  isVisible=()=>!globalThis.document?.hidden,
  minIntervalMs=30,openingSeconds=14,recheckMs=1500,maxWallMs=30000
 }={}){
  this.audio=audio;
  this.getSelection=getSelection;
  this.onFrame=onFrame;
  this.keepPrecise=keepPrecise;
  this.requestFrame=requestFrame;
  this.cancelFrame=cancelFrame;
  this.isVisible=isVisible;
  this.minIntervalMs=minIntervalMs;
  this.openingSeconds=openingSeconds;
  this.recheckMs=recheckMs;
  this.maxWallMs=maxWallMs;
  this.handle=null;
  this.revision=0;
 }
 stop(){
  ++this.revision;
  if(this.handle!==null)this.cancelFrame(this.handle);
  this.handle=null;
 }
 start(){
  this.stop();
  const audio=this.audio;
  if(!audio||audio.paused||audio.ended||!this.isVisible())return false;
  const selection=this.getSelection();
  const revision=this.revision;
  const early=(Number(audio.currentTime)||0)<this.openingSeconds;
  let begun=null,last=-Infinity;
  // A precise initial refresh is useful even if a browser has not emitted
  // its first timeupdate yet.
  this.onFrame();
  const step=stamp=>{
   this.handle=null;
   if(this.revision!==revision||selection!==this.getSelection()||
      audio.paused||audio.ended||!this.isVisible())return;
   if(begun===null)begun=stamp;
   const elapsed=stamp-begun;
   if(stamp-last>=this.minIntervalMs){
    last=stamp;
    this.onFrame();
   }
   const stillEarly=early&&(Number(audio.currentTime)||0)<this.openingSeconds;
   const withinWindow=early?elapsed<this.maxWallMs:elapsed<this.recheckMs;
   // Continue the accurate clock for every verse, not just the introduction.
   // Without visible timed lyrics, the original limited work budget applies.
   if(this.keepPrecise()||(stillEarly&&withinWindow||!early&&withinWindow))
    this.handle=this.requestFrame(step);
  };
  this.handle=this.requestFrame(step);
  return true;
 }
}
