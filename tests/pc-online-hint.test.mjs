import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PcOnlineHint} from '../functions/_lib/pc-online-hint.js';
import {originCooldown} from '../functions/fast-audio/[id].js';

test('only a recent, explicitly confirmed positive PC status can skip an RTT',()=>{
 let now=1000;
 const hint=new PcOnlineHint({now:()=>now,ttlMs:10000});
 assert.equal(hint.available(),false);
 hint.markHealthy();assert.equal(hint.available(),true);
 now+=9999;assert.equal(hint.available(),true);
 now+=1;assert.equal(hint.available(),false);
 hint.markHealthy();hint.invalidate();assert.equal(hint.available(),false);
});

test('edge can reuse a positive PC hint without any status request',async()=>{
 const hint=new PcOnlineHint({ttlMs:10000});
 let calls=0;
 const fetcher=async(url)=>{
  calls++;
  return Response.json({status:'ready',pc_node_online:true,youtube_retry_after:0});
 };
 const first=await originCooldown(fetcher,null,{hint,videoId:'AAAAAAAAAAA'});
 assert.equal(first.pcNodeOnline,true);
 assert.equal(calls,1);
 const second=await originCooldown(fetcher,null,{hint,videoId:'BBBBBBBBBBB'});
 assert.equal(second.positiveHint,true);
 assert.equal(calls,1,'short-lived confirmed PC status skips a duplicate Render health RTT');
 hint.invalidate();
 await originCooldown(fetcher,null,{hint,videoId:'CCCCCCCCCCC'});
 assert.equal(calls,2);
});
test('provider cooldown is never cached as a healthy PC status',async()=>{
 const hint=new PcOnlineHint({ttlMs:10000});
 const response=await originCooldown(async()=>
  Response.json({status:'ready',pc_node_online:true,youtube_retry_after:91}),
  null,{hint,videoId:'AAAAAAAAAAA'});
 assert.equal(response.retryAfter,'91');
 assert.equal(hint.available(),false);
});
test('first Play avoids competitive prepare when R2 metadata is already verified',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const prime=app.slice(app.indexOf('function primeSelectedRecording('),
  app.indexOf('const queueAudioWarmup=new QueueAudioWarmup'));
 assert.match(prime,/track\.playbackAvailability==='r2'/);
 assert.match(prime,/selectedAudioWarmup\.start\(track\)/);
 assert.doesNotMatch(prime,/audio\.play\(|audio\.src\s*=/);
});
