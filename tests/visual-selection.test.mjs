import test from 'node:test';import assert from 'node:assert/strict';
import {CLASSIC_THEMES,MATERIAL_THEMES,GNARLY_MODES,EXPERIENCES,resolveVisual,restoredThemeAfterGnarly} from '../lib/visual-selection.js';
test('Stage72 keeps themes, seven classic experiences, six GNARLY experiences, separate reaction',()=>{
 assert.equal(CLASSIC_THEMES.length,17);assert.equal(MATERIAL_THEMES.length,6);assert.equal(GNARLY_MODES.length,4);
 assert.equal(EXPERIENCES.filter(x=>x.category==='classic'&&x.id!=='original').length,7);
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

import {readFileSync} from 'node:fs';
test('rendered materials have independent physical geometry rather than the same Cyber Night warp',()=>{
 const shader=readFileSync(new URL('../lib/visual-engine.js',import.meta.url),'utf8');
 for(const fingerprint of ['float valueNoise','float fbm4','Angular prisms','Chrome: oblique','Glass: large lens','Neon Pulse: independent','Organic: soft cellular','Independent isometric'])assert.ok(shader.includes(fingerprint),fingerprint);
 assert.match(shader,/if\(k<1\.5\)/);
 assert.match(shader,/else if\(k<9\.5\)/);
});
