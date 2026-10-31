import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FluidVisual} from '../lib/visual-engine.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('unused expensive texture and creative shader programs compile lazily once',()=>{
 const v=Object.create(FluidVisual.prototype),builds=[],registered=[];
 v.classicProgram={type:'classic'};v.creativeProgram=null;v.textureProgram=null;
 v.programFor=fragment=>{builds.push(fragment);return {id:builds.length}};
 v.registerUniforms=program=>registered.push(program);
 assert.equal(v.ensureProgram('classic'),v.classicProgram);
 assert.equal(builds.length,0);
 const creative=v.ensureProgram('creative');
 assert.equal(v.ensureProgram('creative'),creative);
 const texture=v.ensureProgram('texture');
 assert.equal(v.ensureProgram('texture'),texture);
 assert.equal(builds.length,2);
 assert.equal(registered.length,2);
});

test('animated background preserves 60fps while music is active and uses idle cadence when blocked',()=>{
 const visual=source('lib/visual-engine.js'),app=source('app.js');
 assert.match(visual,/this\.playbackActive\?1000\/60:1000\/30/);
 assert.doesNotMatch(visual,/this\.playbackActive\?1:\.82/);
 assert.match(app,/visual\.setPlaybackActive\(active\)/);
 assert.match(visual,/ensureProgram\(texture\?'texture':look\?'creative':'classic'\)/);
 assert.match(visual,/this\.renderScale=Math\.max\(\.65/);
});

test('service worker installs only critical assets, defers bounded offline warmup',()=>{
 const sw=source('sw.js'),app=source('app.js');
 assert.match(sw,/const essentials=\[/);
 assert.match(sw,/Promise\.allSettled\(essentials\.map/);
 assert.doesNotMatch(sw,/Promise\.allSettled\(urls\.map/);
 assert.match(sw,/await Promise\.all\(\[0,1\]\.map/);
 assert.match(sw,/GNARLY_WARM_SHELL/);
 assert.match(app,/requestIdleCallback\(warm,\{timeout:8000\}\)/);
 assert.match(app,/state\.audioState==='loading'/);
});
