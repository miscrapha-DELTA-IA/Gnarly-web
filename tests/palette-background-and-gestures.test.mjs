import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FluidVisual,PALETTES} from '../lib/visual-engine.js';
import {resolveVisual} from '../lib/visual-selection.js';

const visual=(theme,{accent='CRIMSON',enabled=false,time=95,duration=150}={})=>{
 const v=Object.create(FluidVisual.prototype);
 Object.assign(v,{theme,accentTheme:accent,gnarlyAccentEnabled:enabled,
  artworkHue:.6,songTime:time,songDuration:duration,gnarly2ColorLock:false});
 return v;
};
const rounded=colors=>colors.map(c=>c.map(v=>Math.round(v*1000)/1000));
test('classic palettes are used by the GPU with both classic and creative experiences',()=>{
 const v=visual('ACID');
 const classic=resolveVisual('ACID','original');
 const creative=resolveVisual('ACID','gnarly-exp-vector-drift-2000');
 const acid=rounded(v.paletteForScene(classic,v.colors()));
 assert.deepEqual(rounded(v.paletteForScene(creative,v.colors())),acid);
 v.setTheme('CRIMSON');
 const crimson=rounded(v.paletteForScene(creative,v.colors()));
 assert.notDeepEqual(crimson,acid,'experience must not freeze an old palette');
 assert.deepEqual(crimson,rounded(v.colors()));
});
test('separate material and experience retain geometry but respond to selected palette',()=>{
 const v=visual('ACID'),mat=resolveVisual('PRISM CARMINE','original');
 const acid=rounded(v.paletteForScene(mat,v.colors(),{force:true}));
 v.setTheme('CYBER NIGHT');
 const cyber=rounded(v.paletteForScene(mat,v.colors(),{force:true}));
 assert.notDeepEqual(cyber,acid);
 assert.equal(mat.look,2,'selected independent material geometry is preserved');
});
test('GNARLY album-first color identity remains procedural but manual references recolor actual shader',()=>{
 const v=visual('GNARLY',{time:11,duration:160});
 v.setGnarlyAccentEnabled(false);
 const original=rounded(v.colors());
 v.setGnarlyAccentEnabled(true);
 const crimson=rounded(v.colors());
 assert.notDeepEqual(crimson,original);
 v.setAccentTheme('SAPPHIRE');
 assert.notDeepEqual(rounded(v.colors()),crimson);
});
test('GNARLY STRATA/COMPILER/ORGANISM keep authored geometry yet respond to manually chosen colors',()=>{
 for(const theme of ['GNARLY STRATA','GNARLY COMPILER','GNARLY ORGANISM']){
  const v=visual(theme,{enabled:true,time:100,duration:150});
  const scene=resolveVisual(theme,'original');
  const red=rounded(v.paletteForScene(scene,v.colors()));
  v.setAccentTheme('SAPPHIRE');
  const blue=rounded(v.paletteForScene(scene,v.colors()));
  assert.notDeepEqual(blue,red,theme+' should recolor the background, not only buttons');
  assert.ok(scene.look>=13,'preserve original GNARLY look for '+theme);
 }
});
test('GNARLY 2 references influence later phases but keep free color evolution and lock semantics',()=>{
 const v=visual('GNARLY 2',{enabled:true,time:122,duration:150});
 const recipe={paletteTheme:'AIRBRUSH MIRAGE COLORS'};
 const red=rounded(v.gnarly2SceneColors(recipe,3,.3));
 v.setAccentTheme('SAPPHIRE');
 const blue=rounded(v.gnarly2SceneColors(recipe,3,.3));
 assert.notDeepEqual(red,blue);
 v.gnarly2ColorLock=true;
 const locked=rounded(v.gnarly2SceneColors(recipe,3,.3));
 v.setAccentTheme('CRIMSON');
 assert.deepEqual(rounded(v.gnarly2SceneColors(recipe,3,.3)),locked);
});
test('theme selection resumes visual after album-cover background, never discards user photo',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const begin=app.indexOf('function selectVisualTheme(next)'),end=app.indexOf('function configureGnarly2Lock(',begin);
 assert.ok(begin>=0&&end>begin);
 const selector=app.slice(begin,end);
 assert.match(selector,/if\(state\.backgroundMode==='cover'\)/);
 assert.match(selector,/state\.backgroundMode='visual'/);
 assert.match(selector,/applyBackground\(\)/);
 assert.doesNotMatch(selector,/state\.backgroundURL=null|backgroundMode==='custom'\).*visual/);
 assert.match(selector,/state\.gnarlyAccentEnabled=true/);
});
