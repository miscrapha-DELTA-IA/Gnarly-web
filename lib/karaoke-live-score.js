// GNARLY Web microphone-evidence scorer inspired by the native KaraokeScoringEngine.
// Pure, source-time bounded, does not use backing-track audio as voice evidence.
export function timedWindows(lines=[],duration=0){
 if(!Array.isArray(lines))return [];
 const clean=lines.map((x,i)=>({id:i,start:Number(x?.time),text:String(x?.text||'').trim()}))
   .filter(x=>Number.isFinite(x.start)&&x.start>=0&&x.text).sort((a,b)=>a.start-b.start);
 const total=Number.isFinite(duration)&&duration>0?duration:Infinity;
 return clean.map((x,i)=>{
  const next=clean[i+1]?.start??Math.min(total,x.start+8);
  return {...x,end:Math.min(total,next,x.start+14)};
 }).filter(x=>x.end>x.start+.12);
}
export function analyzeVoice(samples,sampleRate){
 const rate=Number(sampleRate);
 if(!samples||samples.length<256||!Number.isFinite(rate)||rate<4000)
  return {rms:0,hz:null,confidence:0,voiced:false};
 const stride=Math.max(1,Math.floor(rate/11025));
 const count=Math.min(2048,Math.floor(samples.length/stride));
 if(count<256)return {rms:0,hz:null,confidence:0,voiced:false};
 // Keep the most recent samples, reduce the microphone analysis to <= 2k samples.
 const values=new Float32Array(count),from=samples.length-count*stride;
 let mean=0;
 for(let i=0;i<count;i++){values[i]=Number(samples[from+i*stride])||0;mean+=values[i]}
 mean/=count;
 let squared=0;
 for(let i=0;i<count;i++){values[i]-=mean;squared+=values[i]*values[i]}
 const rms=Math.sqrt(squared/count);
 if(rms<.009)return {rms,hz:null,confidence:0,voiced:false};
 const downRate=rate/stride;
 const minLag=Math.max(2,Math.floor(downRate/1000));
 const maxLag=Math.min(Math.floor(count/2),Math.ceil(downRate/70));
 let best=0,peakLag=0;
 // Normalized autocorrelation: never use the music spectrum or spectral centroid as pitch.
 for(let lag=minLag;lag<=maxLag;lag++){
  let cross=0,aa=0,bb=0;
  for(let i=0;i<count-lag;i+=2){
   const x=values[i],y=values[i+lag];cross+=x*y;aa+=x*x;bb+=y*y;
  }
  const correlation=cross/Math.sqrt(Math.max(1e-12,aa*bb));
  if(correlation>best){best=correlation;peakLag=lag}
 }
 if(best<.63||!peakLag)return {rms,hz:null,confidence:best,voiced:false};
 const hz=downRate/peakLag;
 return {rms,hz,confidence:best,voiced:hz>=70&&hz<=1000};
}
export class KaraokeLiveScore {
 constructor(){this.stop()}
 stop(){
  this.active=false;this.windows=[];this.cursor=0;this.lastTime=null;
  this.score=0;this.total=0;this.earned=0;this.combo=0;this.bestCombo=0;this.rating='';
  this.verseElapsed=0;this.verseEarned=0;this.judged=0;this.hasReference=false;
  this.voice={rms:0,hz:null,confidence:0,voiced:false};
  this.restarted=false;this.mode='synced';this.presenceWindow=0;
 }
 start(lines,at=0,duration=0){
  this.stop();this.mode='synced';this.windows=timedWindows(lines,duration);
  if(!this.windows.length)return false;
  this.active=true;this.lastTime=Number.isFinite(at)?Math.max(0,at):0;
  this.cursor=this.windows.findIndex(w=>w.end>this.lastTime);
  if(this.cursor<0)this.cursor=this.windows.length;
  return true;
 }
 /** When no verified LRC timing exists, score *only captured vocal presence*.
  * This is explicitly not a lyric, pitch, note or rhythm accuracy judgement.
  * Playback time is the sole clock. Never award points while paused.
  */
 startPresence(at=0,duration=0){
  this.stop();this.mode='presence';
  const start=Number.isFinite(at)?Math.max(0,at):0;
  this.active=true;this.lastTime=start;this.presenceWindow=start;
  const end=Number.isFinite(duration)&&duration>start?duration:Infinity;
  this.windows=[{id:0,start,end}];return true;
 }
 retime(lines,at=0,duration=0){
  const earned={score:this.score,total:this.total,earned:this.earned,
   combo:this.combo,bestCombo:this.bestCombo,judged:this.judged,rating:this.rating};
  const valid=Array.isArray(lines)&&timedWindows(lines,duration).length>0;
  if(valid)this.start(lines,at,duration);else this.startPresence(at,duration);
  Object.assign(this,earned);
  return this.active;
 }
 snapshot(){
  return {mode:this.mode,active:this.active,score:Math.floor(this.score),combo:this.combo,bestCombo:this.bestCombo,
   multiplier:Math.min(4,1+Math.floor(this.combo/3)),accuracy:this.total?Math.round(100*this.earned/this.total):0,
   rating:this.rating,judged:this.judged,voice:this.voice,hasReference:false,restarted:this.restarted};
 }
 finishVerse(){
  if(this.verseElapsed<=0)return;
  const fraction=this.verseEarned/this.verseElapsed;
  this.rating=fraction>=.88?'PERFEITO ✨':fraction>=.72?'ÓTIMO 🔥':fraction>=.53?'BOM · NO RITMO':'QUASE';
  this.combo=fraction>=.67?this.combo+1:0;this.bestCombo=Math.max(this.bestCombo,this.combo);
  this.judged++;this.verseElapsed=0;this.verseEarned=0;
 }
 tick(time,playing,voice){
  const now=Number(time);
  if(!this.active||!Number.isFinite(now))return this.snapshot();
  const delta=now-(this.lastTime??now);
  this.voice=voice||{rms:0,hz:null,confidence:0,voiced:false};
  if(delta<-.05||delta>.8){
   // Resuming after stalls, seeking and tab suspension must not fabricate score.
   this.lastTime=now;this.restarted=true;return this.snapshot();
  }
  if(!playing){this.lastTime=now;return this.snapshot()}
  if(delta<=0)return this.snapshot();
  const previous=this.lastTime;this.lastTime=now;this.restarted=false;
  while(this.cursor<this.windows.length){
   const line=this.windows[this.cursor];
   if(line.start>=now)break;
   const begin=Math.max(previous,line.start),end=Math.min(now,line.end);
   if(end>begin){
    const dt=end-begin;
    // Lower confidence for breathy singing must not silently erase vocal
    // presence; ambient noise with no harmonicity still scores zero.
    const voiced=Boolean(this.voice.voiced)||
      (Number(this.voice.rms)>=.016&&Number(this.voice.confidence)>=.38);
    const onset=Math.abs(now-line.start)<=.4;
    const quality=voiced?(this.mode==='presence'?.70:(onset?1:.90)):0;
    this.total+=dt;this.earned+=dt*quality;
    this.verseElapsed+=dt;this.verseEarned+=dt*quality;
    this.score+=(this.mode==='presence'?72:100)*dt*quality*
      Math.min(4,1+Math.floor(this.combo/3));
    if(this.mode==='presence'&&now-this.presenceWindow>=3.5){
     // Frequent genuine feedback instead of a combo only at song end.
     this.finishVerse();this.presenceWindow=now;
    }
   }
   if(now>=line.end){this.finishVerse();this.cursor++}else break;
  }
  return this.snapshot();
 }
 finish(){if(this.active){this.finishVerse();this.active=false}return this.snapshot()}
}
