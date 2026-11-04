/** Exact-recording rebuffer recovery policy.
 * A waiting/stalled event alone is not corruption. Give the native decoder
 * a bounded opportunity to make real media-clock progress before changing
 * a source, and never touch healthy audio or natural track endings.
 */
export function midstreamStallConfirmed({
  phase='startup', startedAt=0, position=0, duration=0,
  paused=false, ended=false, seeking=false
}={}) {
  const start=Number(startedAt),now=Number(position),end=Number(duration);
  if(phase!=='rebuffer'||paused||ended||seeking||
     !Number.isFinite(start)||!Number.isFinite(now)||now<6)return false;
  if(Number.isFinite(end)&&end>0&&now>=end-5)return false;
  return now-start<1.5;
}
/** Seek only within the newly decoded recording. Never guess a clock from
 * album metadata or jump to the end of a short/corrupt file.
 */
export function midstreamResumeAt(position,decodedDuration) {
  const now=Number(position),length=Number(decodedDuration);
  if(!Number.isFinite(now)||now<6||
     !Number.isFinite(length)||length<=now+2)return 0;
  return Math.max(0,Math.min(length-2,now-.25));
}
