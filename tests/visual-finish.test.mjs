import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classicFragment,creativeFragment} from '../lib/metal-shader-port.js';
import {textureFragment} from '../lib/texture-shader.js';
import {finishedShader,improveCreativeEdges,GNARLY_FINISH_GLSL} from '../lib/visual-finish.js';
const engine=readFileSync(new URL('../lib/visual-engine.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('finish is one-pass and source materials remain independent',()=>{
 for(const shader of [classicFragment,improveCreativeEdges(creativeFragment),textureFragment]){
  const final=finishedShader(shader);
  assert.equal((final.match(/void main\(\)/g)||[]).length,1);
  assert.equal((final.match(/gnarlyFinish\(fragColor\.rgb,gl_FragCoord\.xy\)/g)||[]).length,1);
  assert.ok(final.includes('gl_FragCoord'));
  assert.ok(final.includes('fragColor.rgb=gnarlyFinish'));
 }
 assert.match(GNARLY_FINISH_GLSL,/0\.68\/255\.0/);
 assert.doesNotMatch(GNARLY_FINISH_GLSL,/sampler2D|texture\(|blur|uniform/);
});
test('Native creative geometry gains analytical anti-aliasing for toner and contour',()=>{
 const shader=improveCreativeEdges(creativeFragment);
 assert.match(shader,/fwidth\(v\)/);
 assert.match(shader,/fwidth\(dist\)/);
 assert.match(shader,/universeEval/);
 assert.match(shader,/universePrintDots/);
 assert.notEqual(shader,creativeFragment);
});
test('GPU remains full resolution and uses refresh-neutral paced rendering',()=>{
 assert.match(engine,/Math\.sqrt\(pixelBudget\/Math\.max\(1,cssWidth\*cssHeight\)\)/);
 assert.match(engine,/this\.playbackActive\?1000\/60:1000\/30/);
 assert.match(engine,/this\.nextFrameAt=Math\.max\(now-period,this\.nextFrameAt\)\+period/);
 assert.match(engine,/g\.uniform1f\(u\.time,elapsed\)/);
 assert.doesNotMatch(engine,/this\.songDuration>0\?this\.songTime:elapsed/);
 assert.match(css,/#gnarly-background #fluid-canvas/);
});
