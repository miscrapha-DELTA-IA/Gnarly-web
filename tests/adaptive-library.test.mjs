import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ADAPTIVE_KEY,AdaptiveLibrary,adaptiveCapacity,adaptiveReadyCandidate,adaptiveScore,adaptiveTrack
} from '../lib/adaptive-library.js';

const storage=()=>{const values=new Map();return {
 getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),
 _values:values
}};
const song=(n,availability='r2')=>{
 const videoId=String(n).padStart(11,'0');
 return {id:'youtube:'+videoId,videoId,source:'youtube',title:'Music '+n,
  artist:'Artist '+Math.floor(n/8),album:'Record',duration:200,playbackAvailability:availability,
  artwork:'https://example.org/album.jpg'};
};
const DAY=86400000;

test('local-only adaptive planner has no provider download, user ID or audio bytes',()=>{
 const store=storage(),now=Date.UTC(2026,10,4,15),lib=new AdaptiveLibrary(store,{now:()=>now});
 assert.equal(lib.record('play',song(0),now),true);
 assert.equal(lib.record('play',song(0),now+500),false,'duplicate event suppressed');
 assert.equal(lib.record('finish',song(0),now),true);
 assert.equal(lib.dailyUsage(now).today,1,'completion is not another distinct play');
 assert.equal(lib.record('play',{...song(0),source:'local'},now),false);
 assert.equal(lib.record('play',{...song(0),videoId:'invalid'},now),false);
 const raw=store.getItem(ADAPTIVE_KEY);
 assert.match(raw,/"plays":1/);
 assert.doesNotMatch(raw,/audio\/download|data:audio|password|email|bearer|token/i);
 assert.equal(new AdaptiveLibrary(store,{now:()=>now}).dailyUsage(now).today,1);
});

test('80 different songs per day create a personalized 55/25-ish stable/rotation split',()=>{
 const now=Date.UTC(2026,10,4,15),store=storage(),lib=new AdaptiveLibrary(store,{now:()=>now});
 for(let n=0;n<80;n++)lib.record('play',song(n),now-n);
 const usage=lib.dailyUsage(now);
 assert.equal(usage.today,80);
 assert.ok(usage.capacity>=80&&usage.capacity<=110);
 const plan=lib.plan({history:Array.from({length:130},(_,n)=>song(n)),now});
 assert.equal(plan.capacity,usage.capacity);
 assert.equal(plan.stable.length,plan.stableSlots);
 assert.equal(plan.rotating.length,plan.rotatingSlots);
 assert.equal(plan.all.length,plan.capacity);
 assert.equal(new Set(plan.all.map(entry=>entry.id)).size,plan.all.length);
 assert.equal(plan.stable.length/plan.capacity>.65,true);
 assert.equal(plan.rotating.length/plan.capacity>.27,true);
});

test('repeated play never pretends to be distinct daily music, and rollups outlive bounded activity feed',()=>{
 const now=Date.UTC(2026,10,4,15),lib=new AdaptiveLibrary(storage(),{now:()=>now});
 for(let i=0;i<250;i++){
  const current=now-20000+i*4;
  lib.record('play',song(i%85),current);
 }
 assert.equal(lib.dailyUsage(now).today,85);
 assert.equal(new AdaptiveLibrary(lib.storage,{now:()=>now}).dailyUsage(now).today,85);
 assert.equal(adaptiveCapacity([2,3,4])>=24,true);
 assert.ok(adaptiveCapacity([300,300,300])<=160);
});

test('finished, liked and recent recordings rank higher than skipped forgotten tracks',()=>{
 const now=Date.UTC(2026,10,4,15),lib=new AdaptiveLibrary(storage(),{now:()=>now});
 const liked=song(1),skipped=song(2),recent=song(3),unknown=song(4);
 lib.record('like',liked,now-20*DAY);
 lib.record('play',skipped,now-10*DAY);
 lib.record('skip',skipped,now-1000);
 lib.record('play',recent,now-4000);
 lib.record('finish',recent,now-2000);
 const plan=lib.plan({favorites:[liked],history:[skipped,recent,unknown],now});
 const rank=id=>plan.all.find(item=>item.id===id.videoId)?.score;
 assert.ok(rank(liked)>rank(skipped));
 assert.ok(rank(recent)>rank(unknown));
 assert.ok(adaptiveScore({plays:4,finishes:4,lastPlay:now},{now})>
  adaptiveScore({plays:4,finishes:4,lastPlay:now-70*DAY},{now}));
});

test('saved plan keeps stable scores sticky but never adds anything to the player queue',()=>{
 const now=Date.UTC(2026,10,4,15),lib=new AdaptiveLibrary(storage(),{now:()=>now});
 for(let i=0;i<100;i++)lib.record('play',song(i),now-i);
 const manualQueue=[song(99)];
 const first=lib.plan({history:Array.from({length:100},(_,i)=>song(i)),queue:manualQueue,now});
 assert.equal(lib.commitPlan(first),true);
 assert.equal(lib.commitPlan(first),false);
 const next=lib.plan({history:Array.from({length:100},(_,i)=>song(i)),queue:manualQueue,now});
 assert.equal(next.stable[0].id,first.stable[0].id);
 assert.equal(manualQueue.length,1);
 assert.equal(manualQueue[0].id,song(99).id);
});

test('adaptive download candidate must be verified R2, exact ID and absent offline',()=>{
 const now=Date.UTC(2026,10,4,15),lib=new AdaptiveLibrary(storage(),{now:()=>now});
 lib.record('like',song(0,'unknown'),now);
 lib.record('like',song(1),now);
 const plan=lib.plan({now});
 const candidate=adaptiveReadyCandidate(plan);
 assert.equal(candidate.videoId,song(1).videoId,'unknown source is never extracted');
 assert.equal(adaptiveReadyCandidate(plan,{offlineIds:[song(1).id]}),null);
 assert.equal(adaptiveReadyCandidate(plan,{excludeIds:[song(1).id]}),null);
 assert.equal(adaptiveTrack({source:'youtube',videoId:'BAD',title:'Invalid'}),null);
 assert.equal(adaptiveTrack({source:'local',videoId:song(1).videoId,title:'Local'}),null);
});

test('bad browser storage is recoverable and old daily rollups expire',()=>{
 const now=Date.UTC(2026,10,4,15),store=storage();
 store.setItem(ADAPTIVE_KEY,'{truncated');
 const lib=new AdaptiveLibrary(store,{now:()=>now});
 assert.equal(lib.plan().stable.length,0);
 lib.record('play',song(1),now-33*DAY);
 lib.record('play',song(2),now);
 const next=new AdaptiveLibrary(store,{now:()=>now+4*DAY});
 assert.equal(next.days.filter(x=>x.day<='2026-10-02').length,0);
});

test('web integration is opt-in, cache-only, bounded and cannot touch core player transport',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const offline=readFileSync(new URL('../lib/offline-library.js',import.meta.url),'utf8');
 const adaptive=app.slice(app.indexOf('async function cacheAdaptiveReadyOffline()'),
  app.indexOf('function adaptiveLibraryMarkup()'));
 assert.match(app,/adaptiveLibrary\.record\('play',state\.current\)/);
 assert.match(app,/adaptiveLibrary\.record\('finish',state\.current\)/);
 assert.match(app,/adaptiveLibrary\.record\('skip',state\.current\)/);
 assert.match(app,/case 'adaptive-cache-toggle'/);
 assert.match(app,/adaptiveAutoCache=getSetting\('adaptiveAutoCache','no'\)==='yes'/);
 assert.match(adaptive,/!adaptiveAutoCache/);
 assert.match(adaptive,/offlinePrefetchAttempted\.size>=OFFLINE_PREFETCH_SESSION_LIMIT/);
 assert.match(adaptive,/cachedOnly:true/);
 assert.doesNotMatch(adaptive,/\/prepare|\.play\(|audio\.load\(|selectTrack\(|state\.queue\s*=/);
 assert.match(offline,/const url=trackAudioURL\(track,\{cacheOnly:cachedOnly\}\)/);
 assert.match(offline,/if\(!cachedOnly&&\[503,504\]/);
 assert.match(app,/item\.adaptive===true/);
});
