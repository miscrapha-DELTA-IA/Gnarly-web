/** GNARLY cover-charge: a deferred, *indeterminate* visual loading cue.
 * No fake percentage, audio polling, media requests or animation timers.
 * The only active timer suppresses flashes on fast cache hits.
 */
export const COVER_CHARGE_PHASES=Object.freeze(['loading','buffering','recovering']);
export function createCoverCharge({
 target,delay=170,schedule=(fn,ms)=>setTimeout(fn,ms),
 cancel=handle=>clearTimeout(handle)
}={}){
 let phase='',visible='',timer=null,revision=0;
 function paint(value){
  visible=value;
  if(target){if(value)target.dataset.audioCharge=value;else target.removeAttribute('data-audio-charge')}
 }
 function clearTimer(){
  if(timer!==null){cancel(timer);timer=null}
 }
 function show(next='loading'){
  if(!COVER_CHARGE_PHASES.includes(next))return;
  phase=next;
  ++revision;clearTimer();
  if(visible){paint(next);return}
  const at=revision;
  timer=schedule(()=>{
   timer=null;
   if(at===revision&&phase===next)paint(next);
  },delay);
 }
 function hide(){
  phase='';++revision;clearTimer();
  if(visible)paint('');
 }
 function destroy(){hide()}
 return {show,hide,destroy,get phase(){return phase},get visible(){return visible}};
}
