import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlaybackStallGuard} from '../lib/playback-stall-guard.js';

function clock(){
 const jobs=new Map();let id=0;
 const guard=new PlaybackStallGuard({
  schedule:(fn,ms)=>{const key=++id;jobs.set(key,{fn,ms});return key},
  cancel:key=>jobs.delete(key),startupMs:20000,rebufferMs:12000
 });
 return {guard,jobs,fire(){for(const [key,job] of [...jobs]){jobs.delete(key);job.fn()}}};
}
test('repeated waiting events must not reset a playback deadline',()=>{
 const {guard,jobs,fire}=clock();let timeouts=0;
 guard.arm({selection:1,phase:'startup',onTimeout:()=>timeouts++});
 const original=jobs.keys().next().value;
 for(let i=0;i<30;i++)guard.arm({selection:1,phase:'startup',onTimeout:()=>timeouts++});
 assert.equal(jobs.size,1);
 assert.equal(jobs.keys().next().value,original);
 assert.equal(jobs.values().next().value.ms,20000);
 fire();assert.equal(timeouts,1);
});
test('a new track or a user pause cancels any obsolete callback',()=>{
 const {guard,jobs,fire}=clock();let old=0,fresh=0;
 guard.arm({selection:10,onTimeout:()=>old++});
 const stale=jobs.values().next().value.fn;
 guard.arm({selection:11,onTimeout:()=>fresh++});
 stale();assert.equal(old,0);
 fire();assert.equal(fresh,1);
 guard.arm({selection:12,onTimeout:()=>fresh++});
 guard.clear();fire();assert.equal(fresh,1);
});
test('buffering after confirmed audio starts has a shorter bounded deadline',()=>{
 const {guard,jobs}=clock();
 guard.arm({selection:4,phase:'rebuffer',onTimeout:()=>{}});
 assert.equal(jobs.values().next().value.ms,12000);
});
test('GNARLY only marks playback audible at playing; stalled media cancels its native source',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/function stopUnresponsivePlayback\(track,selection\)/);
 assert.match(source,/state\.userPaused=true;[\s\S]*?audio\.removeAttribute\('src'\);[\s\S]*?audio\.load\(\)/);
 assert.match(source,/watchPlayback\(state\.current,playbackSelection/);
 assert.match(source,/audio\.addEventListener\('playing',[\s\S]*?playbackStallGuard\.clear\(\);state\.playing=true/);
 const start=source.slice(source.indexOf("audio.addEventListener('play'"),source.indexOf("audio.addEventListener('pause'"));
 assert.doesNotMatch(start,/state\.playing=true/);
});
