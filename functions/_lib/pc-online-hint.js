/** Short, positive-only hint for a healthy connected PC audio node.
 * Used only after the trusted origin confirms it. A short TTL avoids repeating
 * the /playback-status roundtrip across adjacent selections on the same edge.
 * /download still enforces origin cooldown, ID and audio validation.
 */
export class PcOnlineHint {
 constructor({now=()=>Date.now(),ttlMs=10000}={}){
  this.now=now;
  this.ttlMs=Math.max(0,Math.min(20000,Number(ttlMs)||0));
  this.expires=0;
 }
 available(){return this.ttlMs>0&&this.now()<this.expires}
 markHealthy(){this.expires=this.now()+this.ttlMs}
 invalidate(){this.expires=0}
}
