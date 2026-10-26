import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CLASSIC_THEMES,MATERIAL_THEMES,GNARLY_MODES,NATIVE_COLOR_THEMES,NATIVE_COLOR_STOPS,
 CREATIVE_COLOR_THEMES,CREATIVE_PALETTES,EXPERIENCES,resolveVisual,restoredThemeAfterGnarly} from '../lib/visual-selection.js';
import {gnarly2Director,compositionStrength,GNARLY2_PHASES} from '../lib/gnarly2-director.js';
import {PALETTES} from '../lib/visual-engine.js';
test('all 17 original palettes, seven exact Swift five-stops and six CreativeUniverse palettes remain available',()=>{
 assert.equal(CLASSIC_THEMES.length,17);assert.equal(MATERIAL_THEMES.length,6);
 assert.equal(GNARLY_MODES.length,5);assert.ok(GNARLY_MODES.includes('GNARLY 2'));
 assert.equal(NATIVE_COLOR_THEMES.length,7);assert.equal(CREATIVE_COLOR_THEMES.length,6);
 assert.equal(Object.keys(PALETTES).length,41);
 for(const name of [...CLASSIC_THEMES,...MATERIAL_THEMES,...GNARLY_MODES,...NATIVE_COLOR_THEMES,...CREATIVE_COLOR_THEMES])
  assert.equal(PALETTES[name]?.length,3,name);
 for(const [id,colors] of Object.entries(NATIVE_COLOR_STOPS)){
  assert.equal(colors.length,5,id);assert.ok(colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
  assert.equal(restoredThemeAfterGnarly(id),id);
 }
 assert.deepEqual(PALETTES['SUBCULTURAL ARCHIVE COLORS'],CREATIVE_PALETTES[7]);
 assert.equal(PALETTES.ACID[1],'#1ad91a');
 assert.deepEqual(PALETTES.CRIMSON,['#080000','#bf0814','#ff730d']);
});
test('24 bolt experiences are all unique and can be independently chosen regardless of palette',()=>{
 assert.equal(EXPERIENCES.length,24);
 const ids=EXPERIENCES.map(x=>x.id);
 assert.equal(new Set(ids).size,24);
 for(const theme of [...CLASSIC_THEMES,...MATERIAL_THEMES,...NATIVE_COLOR_THEMES,...CREATIVE_COLOR_THEMES,'GNARLY']){
  for(const id of ids){
   const value=resolveVisual(theme,id,'REATIVO');
   assert.equal(value.theme,theme);
   assert.equal(value.experience,id);
   assert.equal(value.reaction,'REATIVO');
  }
 }
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/const QUICK_EXPERIENCES=EXPERIENCES\.map\(x=>x\.id\)/);
 assert.match(app,/const QUICK_THEMES=\[\.\.\.CLASSIC_THEMES,\.\.\.NATIVE_COLOR_THEMES,\.\.\.CREATIVE_COLOR_THEMES,\.\.\.MATERIAL_THEMES,\.\.\.GNARLY_MODES\]/);
});
test('authored material remains primary and selected experience now participates as a second layer',()=>{
 const original=resolveVisual('PRISM CARMINE','original','FLUIDO');
 assert.equal(original.look,2);assert.equal(original.secondary,null);
 const mixed=resolveVisual('PRISM CARMINE','liquid-dream','FLUIDO');
 assert.equal(mixed.look,2);
 assert.equal(mixed.secondary.experience,'liquid-dream');
 assert.equal(mixed.secondary.look,null);
 assert.ok(compositionStrength(mixed)>0);
 const textured=resolveVisual('GNARLY ORGANISM','gnarly-texture-plasma-lava');
 assert.equal(textured.look,15);
 assert.equal(textured.secondary.texture,3);
 assert.equal(compositionStrength(textured,{renderScale:.6}),0,'safeguard constrained GPU');
 assert.equal(compositionStrength(textured,{reducedMotion:true}),0);
 const unaltered=resolveVisual('GNARLY','original');
 assert.equal(unaltered.secondary,null,'traditional GNARLY remains unchanged with original experience');
 assert.equal(resolveVisual('GNARLY','gnarly-texture-plasma-lava').secondary.texture,3);
 const combination=resolveVisual('PRISM CARMINE','gnarly-exp-vector-drift-2000');
 assert.equal(combination.look,2,'Prism Carmine retains primary visual identity');
 assert.equal(combination.secondary.look,10,'Vector Drift participates without replacing Prism Carmine');
});
test('GNARLY 2 song choreography is deterministic, bounded and interpolates only near scene changes',()=>{
 const frame={duration:200,artworkHue:.42,anchorTheme:'CRIMSON',experience:'liquid-dream'};
 const first=gnarly2Director({...frame,time:9});
 assert.equal(first.index,0);assert.equal(first.phase,'IDENTIDADE');
 assert.equal(first.current.paletteTheme,'CRIMSON');assert.equal(first.current.experience,'liquid-dream');
 assert.equal(first.transition,0);
 assert.equal(gnarly2Director({...frame,time:35}).transition>0,true);
 const e=gnarly2Director({...frame,time:43});
 assert.equal(e.index,1);assert.equal(e.phase,GNARLY2_PHASES[1]);
 assert.notEqual(e.current.theme,first.current.theme);
 const end=gnarly2Director({...frame,time:200});
 assert.equal(end.index,4);assert.equal(end.transition,0);
 assert.deepEqual(gnarly2Director({...frame,time:111}),gnarly2Director({...frame,time:111}));
 const fallback=gnarly2Director({...frame,time:0,duration:0});
 assert.equal(fallback.index,0);
});
test('GNARLY 2 can lock chromatic family, material and experience independently',()=>{
 const input={duration:185,time:93,anchorTheme:'VOID GLOSS COLORS',experience:'gnarly-exp-vector-drift-2000',
  anchorMaterial:'XEROX SERPENTINE',lockColors:true,lockMaterial:true,lockExperience:true};
 const frame=gnarly2Director(input);
 assert.equal(frame.current.paletteTheme,'VOID GLOSS COLORS');
 assert.equal(frame.current.theme,'XEROX SERPENTINE');
 assert.equal(frame.current.experience,'gnarly-exp-vector-drift-2000');
 assert.equal(frame.next.theme,'XEROX SERPENTINE');
 assert.equal(frame.next.experience,'gnarly-exp-vector-drift-2000');
 assert.equal(frame.next.paletteTheme,'VOID GLOSS COLORS');
});
test('rendering uses existing three GPU programs, no new program or texture allocation for GNARLY2',()=>{
 const code=readFileSync(new URL('../lib/visual-engine.js',import.meta.url),'utf8');
 const programs=code.match(/programFor\(finishedShader\(/g)||[];
 assert.equal(programs.length,3,'do not JIT compile new pipelines per frame');
 assert.match(code,/g\.blendFunc\(g\.CONSTANT_ALPHA,g\.ONE_MINUS_CONSTANT_ALPHA\)/);
 assert.match(code,/if\(this\.theme==='GNARLY 2'\)/);
 assert.match(code,/this\.renderScale>=\.67/);
 assert.match(code,/this\.gnarlyAccentEnabled\?\.16:0/);
 assert.doesNotMatch(code,/createFramebuffer\(/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/data-gnarly2-lock/);
 assert.match(app,/data-gnarly2-material/);
 assert.match(app,/setGnarly2Locks/);
});
