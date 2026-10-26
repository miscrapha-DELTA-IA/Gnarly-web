import test from 'node:test';import assert from 'node:assert/strict';
import {CLASSIC_THEMES,MATERIAL_THEMES,GNARLY_MODES,EXPERIENCES,CREATIVE_LOOKS,CREATIVE_PALETTES,EXPERIENCE_MATERIALS,resolveVisual,restoredThemeAfterGnarly} from '../lib/visual-selection.js';
test('Stage72 keeps themes, seven classic experiences, six GNARLY experiences, separate reaction',()=>{
 assert.equal(CLASSIC_THEMES.length,17);assert.equal(MATERIAL_THEMES.length,6);assert.equal(GNARLY_MODES.length,4);
 assert.equal(EXPERIENCES.filter(x=>x.category==='classic'&&x.id!=='original').length,13);
 assert.equal(EXPERIENCES.filter(x=>x.category==='gnarly').length,6);
});
test('GNARLY override retains chosen experience',()=>{
 const a=resolveVisual('GNARLY','cyber-night','REATIVO');assert.equal(a.experience,'cyber-night');assert.equal(a.override,true);
 assert.equal(resolveVisual('ACID',a.experience,'FLUIDO').kind,5);
 assert.equal(restoredThemeAfterGnarly('GNARLY'),'ACID');assert.equal(restoredThemeAfterGnarly('CYBER NIGHT'),'CYBER NIGHT');
});
test('material themes determine texture but not saved experience',()=>{
 const p=resolveVisual('XEROX SERPENTINE','gnarly-exp-vector-drift-2000','DESLIGADO');
 assert.equal(p.kind,2);assert.equal(p.experience,'gnarly-exp-vector-drift-2000');assert.equal(p.reaction,'DESLIGADO');
});

test('distinct authored Metal materials and all 15 CreativeUniverse looks',()=>{
 const categories=new Set(['original','cyber-night','liquid-dream','neon-pulse','chrome-night','organic-pulse','atmospheric-smoke']
  .map(x=>EXPERIENCE_MATERIALS[x].type+':'+(EXPERIENCE_MATERIALS[x].shaderKind||0)+':'+(EXPERIENCE_MATERIALS[x].textureA?.[0]||0)));
 assert.ok(categories.size>=6);
 for(let id=1;id<=15;id++)assert.equal(CREATIVE_PALETTES[id].length,3);
 assert.equal(resolveVisual('ACID','gnarly-exp-vector-drift-2000').look,10);
 assert.equal(resolveVisual('GNARLY ORGANISM','cyber-night').look,15);
 assert.equal(resolveVisual('PRISM CARMINE','original').look,2);
 assert.equal(resolveVisual('ACID','liquid-dream').look,null);
 assert.equal(EXPERIENCE_MATERIALS['airbrush-mirage'].textureB[1],.84);
});
import {readFileSync} from 'node:fs';
test('all visual families have native geometry rather than a shared Cyber Night warp',()=>{
 const metal=readFileSync(new URL('../lib/metal-shader-port.js',import.meta.url),'utf8');
 for(const signature of ['evaluateLiquidMarble','evaluateProceduralMaterial','evaluateTexturedMarble','universePlateMetric','universeFbm','universePrintDots','universeStrataHeight'])
  assert.ok(metal.includes(signature),signature);
 assert.match(metal,/if \\(look == 15\\)/);
});
