/**
 * GNARLY music intelligence helpers (no network, no AudioContext mutation).
 * Basic Pitch gives *estimated* note events, never original track MIDI.
 * Chord estimates are heuristic summaries, not Guitariz's ONNX model.
 */
export const PITCH_NAMES=Object.freeze(['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B']);
const MAJOR=[0,4,7],MINOR=[0,3,7];
const bounded=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
export function validateNotes(raw,maxDuration=30){
 if(!Array.isArray(raw))return [];
 return raw.slice(0,6000).filter(n=>
  Number.isFinite(n?.pitchMidi)&&n.pitchMidi>=21&&n.pitchMidi<=108&&
  Number.isFinite(n?.startTimeSeconds)&&n.startTimeSeconds>=0&&n.startTimeSeconds<maxDuration&&
  Number.isFinite(n?.durationSeconds)&&n.durationSeconds>0&&n.durationSeconds<=12
 ).map(n=>({pitchMidi:Math.round(n.pitchMidi),startTimeSeconds:n.startTimeSeconds,
  durationSeconds:Math.min(n.durationSeconds,maxDuration-n.startTimeSeconds),
  amplitude:bounded(n.amplitude??.75,.05,1)}))
  .filter(n=>n.durationSeconds>.03).sort((a,b)=>a.startTimeSeconds-b.startTimeSeconds);
}
export const noteName=midi=>PITCH_NAMES[((Math.round(midi)%12)+12)%12]+(Math.floor(midi/12)-1);
/** Energy-weighted pitch-class profile; silent frames produce no bogus chords. */
export function chordTimeline(raw,{duration=25,step=2}={}){
 const total=bounded(duration,.5,30),notes=validateNotes(raw,total),timeline=[];
 for(let start=0;start<total;start+=step){
  const end=Math.min(total,start+step),pc=new Float64Array(12);
  for(const note of notes){
   if(note.startTimeSeconds>=end)break;
   const overlap=Math.max(0,Math.min(end,note.startTimeSeconds+note.durationSeconds)-Math.max(start,note.startTimeSeconds));
   pc[note.pitchMidi%12]+=overlap*note.amplitude;
  }
  const strength=pc.reduce((a,b)=>a+b,0);
  if(strength<.13){timeline.push({start,end,chord:'—',confidence:0});continue}
  let best={score:-Infinity,chord:'—'},second=-Infinity;
  for(let root=0;root<12;root++)for(const [quality,intervals] of [['',MAJOR],['m',MINOR]]){
   let core=0;for(const interval of intervals)core+=pc[(root+interval)%12];
   const score=core/strength;
   if(score>best.score){second=best.score;best={score,chord:PITCH_NAMES[root]+quality}}
   else if(score>second)second=score;
  }
  const confidence=bounded((best.score-.4)*1.45,0,1);
  timeline.push({start,end,chord:best.score>=.62&&best.score-second>=.055?best.chord:'—',confidence});
 }
 const merged=[];
 for(const item of timeline){
  if(merged.at(-1)?.chord===item.chord){
   merged.at(-1).end=item.end;merged.at(-1).confidence=Math.max(item.confidence,merged.at(-1).confidence);
  }else merged.push({...item});
 }
 return merged;
}
export function harmonySummary(raw,duration=25){
 const notes=validateNotes(raw,duration);
 const profile=new Float64Array(12);
 for(const n of notes)profile[n.pitchMidi%12]+=n.durationSeconds*n.amplitude;
 let tonic=0,best=-1;
 for(let i=0;i<12;i++)if(profile[i]>best){best=profile[i];tonic=i}
 const chords=chordTimeline(notes,{duration});
 const musical=chords.filter(c=>c.chord!=='—');
 return {notes:notes.length,
  tonalCenter:notes.length?PITCH_NAMES[tonic]+' (estimado)':'Indeterminado',
  chords,displayChords:[...new Set(musical.map(c=>c.chord))].slice(0,8)};
}
/** Standard MIDI file type 0, fixed 480 PPQ, 120 BPM. No unclaimed
 * pitch-bend fidelity or fake percussion claims. Input is note events in seconds.
 */
export function notesToMidi(raw,{duration=30,bpm=120}={}){
 const notes=validateNotes(raw,duration);
 if(!notes.length)throw Error('Não há notas confiáveis para exportar.');
 const ppq=480,tempo=60000000/bounded(bpm,50,220);
 const ticks=s=>Math.round(s*1_000_000/tempo*ppq);
 const uint16=n=>[(n>>>8)&255,n&255],uint32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
 const vlq=n=>{let v=Math.max(0,Math.floor(n))>>>0,b=[v&127];while((v>>>=7)>0)b.unshift((v&127)|128);return b};
 const events=[{tick:0,bytes:[0xff,0x51,0x03,(tempo>>>16)&255,(tempo>>>8)&255,tempo&255],order:0}];
 for(const n of notes){
  let a=ticks(n.startTimeSeconds),b=Math.max(a+1,ticks(n.startTimeSeconds+n.durationSeconds));
  events.push({tick:a,bytes:[0x90,n.pitchMidi,Math.round(bounded(n.amplitude,.1,1)*112)],order:2});
  events.push({tick:b,bytes:[0x80,n.pitchMidi,0],order:1});
 }
 events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
 let last=0;const track=[];
 for(const e of events){track.push(...vlq(e.tick-last),...e.bytes);last=e.tick}
 track.push(0,0xff,0x2f,0);
 const header=[0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,...uint16(ppq)];
 return new Uint8Array([...header,0x4d,0x54,0x72,0x6b,...uint32(track.length),...track]);
}
/** Adapt estimated melodic notes to an OPTIONAL 16-pad *sample* pattern.
 * This doesn't claim that pads play the original instrument/MIDI voices.
 */
export function notesToPadPattern(raw,bpm=110){
 const notes=validateNotes(raw,30).filter(n=>n.startTimeSeconds<8);
 const counts=new Map();
 for(const n of notes)counts.set(n.pitchMidi,(counts.get(n.pitchMidi)||0)+n.durationSeconds*n.amplitude);
 const selected=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,16).map(x=>x[0]).sort((a,b)=>a-b);
 const map=new Map(selected.map((pitch,i)=>[pitch,i]));
 const pattern=Array.from({length:16},()=>[]);
 for(const n of notes){
  const pad=map.get(n.pitchMidi);if(pad===undefined)continue;
  const step=Math.round(n.startTimeSeconds*bounded(bpm,70,160)*4/60)%16;
  if(!pattern[pad].includes(step))pattern[pad].push(step);
 }
 return {pattern,pitches:selected,mapped:pattern.reduce((n,s)=>n+s.length,0)};
}
