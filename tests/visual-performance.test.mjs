import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {FluidVisual} from '../lib/visual-engine.js';
import {paintFallbackFrame} from '../lib/fallback-renderer.js';

function referencePaint(data,width,height,colors,elapsed){
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=x/width*8,b=y/height*12,t=elapsed*.22;
  const f=(Math.sin(a+Math.sin(b*.65+t)*1.5)+Math.cos(b*.8-a*.42+t*.6)+2)/4;
  const color=colors[Math.min(2,Math.floor(Math.max(0,Math.min(.999,f))*3))];
  const k=(y*width+x)*4;
  data[k]=color[0]*255;data[k+1]=color[1]*255;data[k+2]=color[2]*255;data[k+3]=255;
 }
}
const palette=[[.02,.1,.03],[.21,.7,.38],[.87,.96,.3]];
test('Canvas fallback preserves the original wave and palette pixel output',()=>{
 for(const [w,h,t] of [[1,1,0],[19,37,0],[117,203,28.25],[260,390,89.2]]){
  const original=new Uint8ClampedArray(w*h*4),optimized=new Uint8ClampedArray(w*h*4);
  referencePaint(original,w,h,palette,t);
  paintFallbackFrame(optimized,w,h,palette,t);
  let mismatches=0;
  for(let i=0;i<original.length;i++)if(original[i]!==optimized[i])mismatches++;
  assert.ok(mismatches<=original.length*.0005,
   `visual fallback must preserve at least 99.95% color channels (${w}x${h}, mismatches=${mismatches})`);
 }
});

test('visual fallback CPU microbenchmark records relative improvement, not a fabricated FPS',()=>{
 const w=350,h=540,old=new Uint8ClampedArray(w*h*4),fast=new Uint8ClampedArray(w*h*4);
 // One warmup is important: comparing cold JS JIT compilation is misleading.
 referencePaint(old,w,h,palette,20);paintFallbackFrame(fast,w,h,palette,20);
 let baseline=0,optimized=0;
 for(let i=0;i<4;i++){
  let start=performance.now();referencePaint(old,w,h,palette,40+i);baseline+=performance.now()-start;
  start=performance.now();paintFallbackFrame(fast,w,h,palette,40+i);optimized+=performance.now()-start;
 }
 assert.ok(baseline>0&&optimized>0);
 console.log('GNARLY Canvas fallback 350x540 x4: baseline='+baseline.toFixed(2)+
  'ms; optimized='+optimized.toFixed(2)+'ms; speedup='+(baseline/optimized).toFixed(2)+'x (CPU only)');
});

test('stop/start cannot multiply scheduled background animation loops',()=>{
 const prevRAF=globalThis.requestAnimationFrame,prevCancel=globalThis.cancelAnimationFrame,prevDoc=globalThis.document;
 let sequence=0,painted=0;
 const scheduled=new Map();
 globalThis.requestAnimationFrame=fn=>{const id=++sequence;scheduled.set(id,fn);return id};
 globalThis.cancelAnimationFrame=id=>scheduled.delete(id);
 globalThis.document={hidden:false};
 try{
  const visual=Object.create(FluidVisual.prototype);
  Object.assign(visual,{running:false,frameHandle:null,loopEpoch:0,last:0,nextFrameAt:0,
   start:0,paused:false,glLost:false,lastCpuFrameMs:0,renderedFrames:0,
   targetFramePeriod:()=>1000/60,noteFramePacing:()=>{},
   renderFrame:()=>{painted++}});
  visual.draw=visual.draw.bind(visual);
  visual.startLoop();
  assert.equal(scheduled.size,1);
  const oldTick=[...scheduled.values()][0];
  visual.startLoop();
  assert.equal(scheduled.size,1,'reentrant start must not add another callback');
  visual.stopLoop();
  assert.equal(scheduled.size,0,'stop must cancel the actual browser callback');
  visual.startLoop();
  assert.equal(scheduled.size,1);
  oldTick(16);
  assert.equal(scheduled.size,1,'an obsolete callback must not resurrect the previous loop');
  assert.equal(painted,0);
  const [id,current]=scheduled.entries().next().value;
  scheduled.delete(id);current(32);
  assert.equal(scheduled.size,1,'one live callback schedules exactly one successor');
  assert.equal(painted,1);
  visual.stopLoop();
  assert.equal(scheduled.size,0);
 }finally{
  if(prevRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=prevRAF;
  if(prevCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=prevCancel;
  if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
 }
});

test('idle menus temporarily reach 60fps, audio pressure still takes precedence',()=>{
 const v=Object.create(FluidVisual.prototype);
 Object.assign(v,{reduced:false,playbackActive:false,visualInteractionUntil:0,
  nextFrameAt:0,audioPriorityUntil:0,audioPressureCount:0});
 assert.ok(v.targetFramePeriod(100)>33);
 v.prioritizeInteraction(100);
 assert.ok(v.targetFramePeriod(120)<17);
 assert.ok(v.targetFramePeriod(2600)>33,'idle cadence recovers without perpetual GPU load');
 v.playbackActive=true;v.audioPriorityUntil=5000;
 assert.ok(v.targetFramePeriod(2700)>=33,'audio recovery overrides interface priority');
});

test('karaoke sheet only changes the active line; never rebuilds the full modal on a verse',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const begin=app.indexOf('function syncKaraokeSheetHighlight(');
 const end=app.indexOf('function refreshLyricArtwork()',begin);
 assert.ok(begin>=0&&end>begin);
 const code=app.slice(begin,end);
 assert.match(code,/box\.children\[index\]/);
 assert.match(code,/previous\.textContent=/);
 assert.match(code,/next\.innerHTML=renderLyricArtwork/);
 assert.match(code,/syncKaraokeSheetHighlight\(i\)/);
 assert.doesNotMatch(code,/renderSheet\(\)|replaceChildren\(|content\.innerHTML=/);
 assert.match(app,/data-lyric-index="\$\{i\}"/);
 assert.match(app,/window\.gnarlyVisualDiagnostics=\(\)=>visual\.diagnostics\(\)/);
});
