/** Native-media seek bounds and circular gesture math; no player or timers. */
export function seekWindow(audio){
 const duration=Number(audio?.duration);
 if(!Number.isFinite(duration)||duration<=0)return null;
 const ranges=[];
 try{for(let i=0;i<audio.seekable.length;i++){
  const start=Math.max(0,audio.seekable.start(i)),end=Math.min(duration,audio.seekable.end(i));
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)ranges.push([start,end]);
 }}catch{return null}
 return ranges.length?{duration,ranges,min:ranges[0][0],max:ranges.at(-1)[1]}:null;
}
export function clampSeek(seconds,window){
 if(!window||!Number.isFinite(seconds))return null;
 let nearest=window.min,distance=Infinity;
 for(const [start,end] of window.ranges){
  if(seconds>=start&&seconds<=end)return seconds;
  for(const edge of [start,end])if(Math.abs(seconds-edge)<distance){nearest=edge;distance=Math.abs(seconds-edge)}
 }
 return nearest;
}
export const angularDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function rotationSeconds(radians,elapsedMs){
 // One slow revolution = 60 seconds; fast continuous turns reach at most 2×.
 const velocity=Math.abs(radians)/Math.max(16,elapsedMs);
 const gain=1+Math.min(1,Math.max(0,(velocity-.006)/.018));
 return radians/(Math.PI*2)*60*gain;
}
export function timeText(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}
