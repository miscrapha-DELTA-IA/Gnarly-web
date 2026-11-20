import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visualWorkload,visualPixelBudget,visualFramePeriod} from '../lib/visual-runtime-budget.js';
import {FluidVisual} from '../lib/visual-engine.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('procedural scene budgets distinguish one-pass classic from expensive texture and layered GNARLY 2',()=>{
 assert.equal(visualWorkload({theme:'ACID',experience:'original'}),'classic');
 assert.equal(visualWorkload({theme:'ACID',experience:'gnarly-texture-topographic-moire'}),'complex');
 assert.equal(visualWorkload({theme:'GNARLY 2'}),'layered');
 assert.equal(visualWorkload({theme:'PRISM CARMINE',experience:'gnarly-exp-caustic-dissection'}),'layered');
 assert.equal(visualWorkload({theme:'ACID',experience:'original',materialLayer:'PRISM CARMINE'}),'layered');
});
test('desktop performance: shader budgets are bounded without shrinking actual cover images',()=>{
 const cold=visualPixelBudget({desktop:true,playing:false});
 const light=visualPixelBudget({desktop:true,playing:true});
 const heavy=visualPixelBudget({desktop:true,playing:true,workload:'complex'});
 const layered=visualPixelBudget({desktop:true,playing:true,workload:'layered'});
 assert.ok(cold<=2600000&&cold>=1500000);
 assert.ok(light<=4600000&&light>heavy);
 assert.ok(heavy>layered&&layered<=2200000);
 assert.ok(visualPixelBudget({desktop:true,playing:false,workload:'layered'})<=1250000);
 assert.ok(visualPixelBudget({desktop:true,playing:true,deviceMemory:2})<=1100000);
 assert.ok(visualPixelBudget({desktop:true,playing:true,saveData:true})<=1250000);
 const css=source('styles.css');
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background \{[\s\S]*?background-size:cover!important;/);
 assert.doesNotMatch(css,/--gnarly-native-art-width/);
});
test('budget respects quality of interaction, audio-first recovery and expensive procedural motion',()=>{
 assert.equal(visualFramePeriod({playing:true}),1000/60);
 assert.equal(visualFramePeriod({interacting:true}),1000/60);
 assert.equal(visualFramePeriod({playing:true,workload:'complex'}),1000/36);
 assert.equal(visualFramePeriod({playing:true,workload:'layered'}),1000/30);
 assert.ok(visualFramePeriod({playing:false,workload:'layered'})>50);
 assert.equal(visualFramePeriod({playing:true,workload:'layered',audioPriority:true}),1000/30);
 assert.equal(visualFramePeriod({playing:true,workload:'layered',audioPriority:true,severeAudioPressure:true}),1000/24);
 assert.equal(visualFramePeriod({playing:true,reduced:true}),1000/12);
});
test('deferred desktop renderer does not allocate a GPU context during app construction',()=>{
 const originals={
  matchMedia:globalThis.matchMedia,
  ResizeObserver:globalThis.ResizeObserver,
  requestAnimationFrame:globalThis.requestAnimationFrame,
  cancelAnimationFrame:globalThis.cancelAnimationFrame,
  document:globalThis.document
 };
 let contexts=0,callbacks=new Map(),seq=0,observed=null;
 globalThis.matchMedia=()=>({matches:false});
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback}observe(el){observed=el}disconnect(){}};
 globalThis.requestAnimationFrame=cb=>{const id=++seq;callbacks.set(id,cb);return id};
 globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
 globalThis.document={hidden:false};
 const canvas={
  getContext:()=>{contexts++;throw Error('context unavailable during construction')},
  getBoundingClientRect:()=>({width:1920,height:1080}),
  addEventListener:()=>{}
 };
 let visual;
 try{
  visual=new FluidVisual(canvas,{deferInit:true});
  assert.equal(contexts,0,'context is not touched during import or startup');
  assert.equal(observed,canvas);
  assert.equal(visual.rendererReady,false);
  assert.equal(visual.running,false);
  visual.setPaused(true);
  assert.equal(callbacks.size,0,'static album art must not schedule animation');
  visual.setPaused(false);
  assert.equal(callbacks.size,1,'procedural scene can resume on demand');
  visual.initializeRenderer=()=>{visual.rendererReady=true;visual.renderFrame=()=>{}};
  const [id,callback]=callbacks.entries().next().value;
  callbacks.delete(id);
  callback(16);
  assert.equal(callbacks.size,1);
  visual.stopLoop();
  assert.equal(callbacks.size,0);
  assert.equal(contexts,0,'the simulated renderer has not touched actual WebGL');
 }finally{
  visual?.stopLoop();
  for(const [name,old] of Object.entries(originals)){
   if(old===undefined)delete globalThis[name];else globalThis[name]=old;
  }
 }
});
test('app waits until the interface first paints and stops decorative spectrum work in static backgrounds',()=>{
 const app=source('app.js'),engine=source('lib/visual-engine.js');
 assert.match(app,/new FluidVisual\(\$\('#fluid-canvas'\),\{deferInit:true\}\)/);
 assert.match(app,/requestIdleCallback\(beginVisual,\{timeout:1500\}\)/);
 assert.match(app,/visual\.setPaused\(ownPhoto\|\|coverPhoto\)/);
 assert.match(app,/if\(document\.hidden\|\|visual\.paused\)\{/);
 assert.match(app,/setTimeout\(\(\)=>syncVisual\(performance\.now\(\)\),document\.hidden\?1000:400\)/);
 assert.match(engine,/if\(this\.running\|\|this\.paused\)return;/);
 assert.match(engine,/this\.classicProgram=null;this\.creativeProgram=null;this\.textureProgram=null/);
 assert.match(engine,/const pixelBudget=visualPixelBudget\(\{/);
});
