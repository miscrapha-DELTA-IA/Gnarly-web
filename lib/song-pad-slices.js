/**
 * Song-pad preparation: deterministic transient seeking and sixteen short
 * user-triggered AUDIO slices. Compressed music does not carry embedded MIDI
 * notes. MIDI note 36..51 maps to these clips, but does not "transcribe" a song.
 * All processing stays in the browser and uses the existing playback graph.
 */
export const SONG_PAD_COUNT=16;
export const SONG_DECODE_MAX_BYTES=24*1024*1024;
export const SONG_DECODE_MAX_SECONDS=420;
export const SONG_CLIP_SECONDS=.62;
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
export function displaySongTime(seconds){
 const n=Math.max(0,Math.floor(finite(seconds)));
 return String(Math.floor(n/60))+':'+String(n%60).padStart(2,'0');
}
/** Low-cost onset-adjacent regions, spread across the complete track.
 * Returns offsets (not note pitches). Uses a fixed set of energy windows and
 * permits PCM buffer extraction ONLY after audio was legitimately decoded.
 */
export function detectSongPadOffsets(channel,sampleRate,duration,count=SONG_PAD_COUNT){
 if(!channel?.length||!(sampleRate>0)||!(duration>0))return [];
 const maxOffset=Math.max(0,duration-SONG_CLIP_SECONDS);
 const window=Math.max(128,Math.round(sampleRate*.025));
 const energies=[];
 for(let start=0;start<channel.length;start+=window){
  let sum=0,checked=0;
  const stride=Math.max(1,Math.floor(window/96));
  const end=Math.min(channel.length,start+window);
  for(let i=start;i<end;i+=stride){const v=channel[i];sum+=v*v;checked++}
  energies.push(Math.sqrt(sum/Math.max(1,checked)));
 }
 const results=[];
 for(let pad=0;pad<count;pad++){
  const bandStart=duration*(pad+.08)/count;
  const bandEnd=duration*(pad+.91)/count;
  const a=Math.max(1,Math.floor(bandStart*sampleRate/window));
  const b=Math.min(energies.length-1,Math.ceil(bandEnd*sampleRate/window));
  let selected=a,best=-1;
  for(let i=a;i<=b;i++){
   const previous=energies[Math.max(0,i-2)];
   const onset=Math.max(0,energies[i]-previous);
   const score=onset*2.1+energies[i]*.38;
   if(score>best){best=score;selected=i}
  }
  const offset=Math.min(maxOffset,Math.max(0,selected*window/sampleRate-.015));
  results.push(Number(offset.toFixed(3)));
 }
 return results;
}
/** Copy ONLY sixteen short clips, then release the full decoded track.
 * No persistent full-track AudioBuffer, no waveform drawing or request loop.
 */
export function createSongPadClips(decoded,context){
 if(!decoded||!context?.createBuffer||!decoded.numberOfChannels)return [];
 const offsets=detectSongPadOffsets(decoded.getChannelData(0),decoded.sampleRate,decoded.duration);
 return offsets.map((offset,i)=>{
  const start=Math.min(decoded.length-1,Math.max(0,Math.floor(offset*decoded.sampleRate)));
  const frames=Math.min(Math.max(1,Math.floor(SONG_CLIP_SECONDS*decoded.sampleRate)),decoded.length-start);
  const sample=context.createBuffer(Math.min(2,decoded.numberOfChannels),frames,decoded.sampleRate);
  for(let ch=0;ch<sample.numberOfChannels;ch++){
   sample.getChannelData(ch).set(decoded.getChannelData(ch).subarray(start,start+frames));
  }
  return {index:i,offset,duration:frames/decoded.sampleRate,buffer:sample};
 });
}
/** Bounded stream reader: do not download/decode arbitrarily huge remote songs. */
export async function loadSongBytes(url,{signal,maxBytes=SONG_DECODE_MAX_BYTES}={}){
 const response=await fetch(url,{signal,mode:'cors',credentials:'omit'});
 if(!response.ok)throw Error('Faixa indisponível para criar pads.');
 const length=Number(response.headers.get('content-length')||0);
 if(length>maxBytes)throw Error('Faixa muito grande para pads locais.');
 if(!response.body?.getReader){
  const data=await response.arrayBuffer();
  if(data.byteLength>maxBytes)throw Error('Faixa muito grande para pads locais.');
  return data;
 }
 const reader=response.body.getReader(),parts=[];
 let bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes)throw Error('Faixa muito grande para pads locais.');
   parts.push(value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error}
 const combined=new Uint8Array(bytes);
 let cursor=0;for(const chunk of parts){combined.set(chunk,cursor);cursor+=chunk.byteLength}
 return combined.buffer;
}
