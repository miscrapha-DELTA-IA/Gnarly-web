import test from 'node:test';
import assert from 'node:assert/strict';
import {StemMixer} from '../lib/stem-mixer.js';

function harness(){
 const clock={currentTime:30,playbackRate:1,preservesPitch:true,paused:false,seeking:false};
 const mixer=new StemMixer({setOriginalGain(){}},clock);
 mixer.ready=true;
 const stems=Array.from({length:4},()=>{
  let position=30,seekCount=0;
  return {readyState:4,paused:false,seeking:false,playbackRate:1,preservesPitch:true,
   get currentTime(){return position},
   set currentTime(t){position=t;seekCount++},
   get seekCount(){return seekCount}};
 });
 stems.forEach((el,i)=>mixer.entries.set(String(i),{el}));
 return {clock,mixer,stems};
}
test('normal decoder clock jitter never seeks or rewrites rate',()=>{
 const {clock,mixer,stems}=harness();
 for(let i=0;i<100;i++){
  clock.currentTime=30+i*.25;
  for(const el of stems)el.currentTime=clock.currentTime+(i%2?.12:-.12);
  // Reset counting baseline for simulated decoder advance.
  const before=stems.map(el=>el.seekCount);
  mixer.sync();
  assert.deepEqual(stems.map(el=>el.seekCount),before);
 }
});
test('single transient drift does not trigger a hard seek',()=>{
 const {clock,mixer,stems}=harness();
 stems[0].currentTime=29;
 const before=stems[0].seekCount;
 mixer.sync();clock.currentTime=30.25;stems[0].currentTime=30.25;
 mixer.sync();
 assert.equal(stems[0].seekCount,before);
});
test('persistent severe drift is corrected once, not on each timeupdate',()=>{
 const {mixer,stems}=harness();
 const oldNow=Date.now;let now=10000;
 try{
  Date.now=()=>now;stems[0].currentTime=28;
  const before=stems[0].seekCount;
  mixer.sync();now+=1200;mixer.sync();
  assert.equal(stems[0].seekCount,before+1);
  mixer.sync();assert.equal(stems[0].seekCount,before+1);
 }finally{Date.now=oldNow}
});
test('explicit seek still aligns stems immediately',()=>{
 const {clock,mixer,stems}=harness();
 clock.currentTime=90;mixer.seek();
 assert.ok(stems.every(el=>el.currentTime===90));
});
