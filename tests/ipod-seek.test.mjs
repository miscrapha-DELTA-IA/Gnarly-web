import test from 'node:test';
import assert from 'node:assert/strict';
import {seekWindow,clampSeek,angularDelta,rotationSeconds,timeText} from '../lib/ipod-seek.js';
const media=(duration,ranges)=>({duration,seekable:{length:ranges.length,start:i=>ranges[i][0],end:i=>ranges[i][1]}});
test('only real finite native duration and available byte ranges enable navigation',()=>{
 for(const duration of [NaN,Infinity,0,-1])assert.equal(seekWindow(media(duration,[[0,20]])),null);
 assert.equal(seekWindow(media(120,[])),null);
 assert.equal(seekWindow({duration:120,seekable:{get length(){throw Error('not ready')}}}),null);
 const w=seekWindow(media(120,[[5,40],[60,200]]));assert.deepEqual(w.ranges,[[5,40],[60,120]]);
 assert.equal(clampSeek(-50,w),5);assert.equal(clampSeek(500,w),120);assert.equal(clampSeek(47,w),40);assert.equal(clampSeek(58,w),60);assert.equal(clampSeek(70,w),70);assert.equal(clampSeek(NaN,w),null);
});
test('circular deltas cross the angular seam continuously in both directions',()=>{
 const rad=x=>x*Math.PI/180;
 assert.ok(Math.abs(angularDelta(rad(359),rad(1))-rad(2))<1e-10);
 assert.ok(Math.abs(angularDelta(rad(1),rad(359))+rad(2))<1e-10);
 assert.ok(angularDelta(rad(10),rad(20))>0);assert.ok(angularDelta(rad(20),rad(10))<0);
});
test('fine adjustments stay small and rapid rotation accelerates within a bounded gain',()=>{
 const tiny=rotationSeconds(.04,100),slow=rotationSeconds(.2,100),fast=rotationSeconds(.2,16);
 assert.ok(tiny>0&&tiny<.5);assert.ok(fast>slow&&fast<=slow*2);
 assert.equal(rotationSeconds(-.2,16),-fast);assert.equal(rotationSeconds(0,0),0);
 assert.equal(timeText(123.9),'2:03');assert.equal(timeText(-10),'0:00');
});
