import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitCompactLyricContent} from '../lib/compact-karaoke-layout.js';

function fixture(height=160){
 let scale=1;
 const hud={hidden:false,style:{setProperty(name,value){assert.equal(name,'--gnarly-hud-fit-scale');scale=Number(value)}}};
 const line={scrollTop:45,clientHeight:100,clientWidth:310,scrollWidth:308,
  dataset:{},get scrollHeight(){return Math.ceil(height*scale)}};
 return {hud,line,get scale(){return scale}};
}
test('short stanzas retain full typography while staying in the fixed slot',()=>{
 const {hud,line}=fixture(70);
 assert.deepEqual(fitCompactLyricContent(hud,line),{fitted:true,scrollable:false,scale:1});
 assert.equal(line.scrollTop,0);
 assert.equal(line.dataset.compactScrollable,'false');
});
test('multi-line stanzas shrink locally, without changing the container size',()=>{
 const f=fixture(160);
 const result=fitCompactLyricContent(f.hud,f.line);
 assert.equal(result.scrollable,false);
 assert.ok(result.scale<1&&result.scale>=.6);
 assert.equal(f.line.clientHeight,100);
 assert.equal(f.line.scrollHeight<=f.line.clientHeight+2,true);
});
test('exceptionally long stanzas stay scrollable rather than clipped or replaced by ellipsis',()=>{
 const f=fixture(700);
 const result=fitCompactLyricContent(f.hud,f.line);
 assert.equal(result.scrollable,true);
 assert.equal(f.line.dataset.compactScrollable,'true');
 assert.equal(f.line.scrollTop,0);
 assert.equal(result.scale,.6);
});
test('hidden/no-track captions do not trigger font fitting or affect the player',()=>{
 const f=fixture(160);f.hud.hidden=true;
 assert.deepEqual(fitCompactLyricContent(f.hud,f.line),{fitted:false,scrollable:false,scale:1});
 assert.equal(f.line.scrollTop,45);
});
test('compact lyric HUD has stable viewport-independent slot and multiline scrolling',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../karaoke-stage.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/class="compact-karaoke-slot" id="compact-karaoke-slot"/);
 assert.match(css,/\.compact-karaoke-slot\{[\s\S]*?flex:0 0 clamp\(112px/);
 assert.match(css,/#floating-line\{[\s\S]*?overflow-x:hidden;overflow-y:auto/);
 assert.match(css,/white-space:normal!important;text-overflow:clip!important/);
 assert.match(css,/max-height:none!important/);
 assert.match(app,/fitCompactLyricContent\(hud,line\)/);
 assert.match(app,/line\.innerHTML=renderLyricArtwork\(/);
 assert.match(app,/fitCompactLyric\(\);/);
});
