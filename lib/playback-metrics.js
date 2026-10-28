/** Anonymous, in-memory diagnostics. No URLs, titles, identifiers or uploads.
 * Bounded history is available to development tools via snapshot(). Native
 * 'playing' measures browser readiness, not acoustic output at a speaker.
 */
export class PlaybackMetrics{
 constructor({now=()=>performance.now(),capacity=120}={}){
  this.now=now;this.capacity=capacity;this.samples=[];this.active=null;
 }
 begin(kind='play',source='remote'){
  this.finish();
  this.active={kind,source,started:this.now(),playingAt:null,startupMs:null,
   firstByteMs:null,rebufferEvents:0,bufferingMs:0,listeningMs:0,
   waitingAt:null,runningAt:null,failed:false,recoveries:0,mediaRequests:0};
 }
 playing(){
  const a=this.active;if(!a)return;
  const now=this.now();
  if(a.playingAt===null){a.playingAt=now;a.startupMs=now-a.started}
  if(a.waitingAt!==null){a.bufferingMs+=now-a.waitingAt;a.waitingAt=null}
  if(a.runningAt===null)a.runningAt=now;
 }
 waiting(){
  const a=this.active;if(!a||a.playingAt===null||a.waitingAt!==null)return;
  this.pause();a.rebufferEvents++;a.waitingAt=this.now();
 }
 pause(){
  const a=this.active;if(!a)return;
  const now=this.now();
  if(a.runningAt!==null){a.listeningMs+=now-a.runningAt;a.runningAt=null}
  if(a.waitingAt!==null){a.bufferingMs+=now-a.waitingAt;a.waitingAt=null}
 }
 failure(){if(this.active)this.active.failed=true}
 recovery(){if(this.active)this.active.recoveries++}
 resource(entry){
  const a=this.active;
  if(!a||entry.startTime<a.started||entry.responseStart<a.started)return;
  a.mediaRequests++;
  if(a.firstByteMs===null)this.firstByte(entry.responseStart-a.started);
 }
 firstByte(ms){if(this.active&&Number.isFinite(ms)&&ms>=0)this.active.firstByteMs=ms}
 finish(){
  if(!this.active)return;
  this.pause();this.samples.push({...this.active});this.active=null;
  if(this.samples.length>this.capacity)this.samples.shift();
 }
 snapshot(){
  const samples=this.samples.map(x=>({...x}));
  if(this.active){
   const a={...this.active},now=this.now();
   if(a.runningAt!==null)a.listeningMs+=now-a.runningAt;
   if(a.waitingAt!==null)a.bufferingMs+=now-a.waitingAt;
   samples.push(a);
  }
  const times=samples.map(x=>x.startupMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile=p=>times.length?times[Math.max(0,Math.ceil(times.length*p)-1)]:null;
  const listening=samples.reduce((n,x)=>n+x.listeningMs,0);
  const buffering=samples.reduce((n,x)=>n+x.bufferingMs,0);
  const events=samples.reduce((n,x)=>n+x.rebufferEvents,0);
  return {samples,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),
   bufferingRatio:listening+buffering?buffering/(listening+buffering):0,
   rebufferEventsPerHour:listening?events*3600000/listening:null,
   failures:samples.filter(x=>x.failed).length,
   recoveries:samples.reduce((n,x)=>n+x.recoveries,0)};
 }
}
export const playbackMetrics=new PlaybackMetrics();
