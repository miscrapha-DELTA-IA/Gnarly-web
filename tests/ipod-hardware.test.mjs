import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {transformSync} from 'esbuild';
import {MATERIALS,PATTERNS,DEVICE_PRESETS,normalizeAppearance,createAppearanceStore,APPEARANCE_KEY,USER_PRESETS_KEY,exportAppearance,importAppearance,MAX_USER_PRESETS} from '../lib/ipod-appearance.js';
import {patternSVG,appearanceVariables,contrastRatio,materialCacheSize} from '../lib/ipod-materials.js';
const memory=()=>{const items=new Map();return {getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value),items}};

test('the collection has distinct materials, graphic prints and complete curated devices',()=>{
 assert.equal(MATERIALS.length,14);assert.ok(PATTERNS.filter(x=>x.id!=='none').length>=25);assert.ok(DEVICE_PRESETS.length>=20);
 for(const list of [MATERIALS,PATTERNS,DEVICE_PRESETS])assert.equal(new Set(list.map(x=>x.id)).size,list.length);
 for(const preset of DEVICE_PRESETS){
  assert.deepEqual(normalizeAppearance(preset.config),preset.config);
  assert.match(preset.config.colors.wheel,/^#[a-f0-9]{6}$/);
  const variables=appearanceVariables(preset.config);
  assert.ok(contrastRatio(variables['--ipod-labels'],preset.config.colors.wheel)>=4.5);
  assert.ok(contrastRatio(variables['--ipod-center-label'],preset.config.colors.center)>=4.5);
 }
});
test('invalid or untrusted style data cannot become CSS, URLs or unbounded geometry',()=>{
 const config=normalizeAppearance({material:'evil',pattern:'url(https://evil.test)',scale:Infinity,density:200,seed:-12,colors:{body:'red; display:none',frame:'#ff0000'},x:NaN});
 assert.equal(config.material,'brushed');assert.equal(config.pattern,'none');assert.equal(config.density,1);assert.equal(config.seed,0);
 const css=JSON.stringify(appearanceVariables(config));assert.doesNotMatch(css,/evil|display|NaN|Infinity/);
 assert.throws(()=>importAppearance('{"kind":"gnarly-ipod-appearance","version":99,"appearance":{}}'));
 assert.throws(()=>importAppearance('x'.repeat(32769)));
});
test('every print is deterministic and structurally different; camouflage is layered geometry',()=>{
 const results=new Set();
 for(const print of PATTERNS){
  const c=normalizeAppearance({pattern:print.id}),a=patternSVG(c),b=patternSVG(c);
  assert.equal(a,b);assert.match(a,/^<svg xmlns=/);assert.match(a,/<\/svg>$/);
  assert.doesNotMatch(a,/NaN|Infinity|undefined|<script|<image|https:/);
  assert.ok(a.length<40000);results.add(a);
 }
 assert.equal(results.size,PATTERNS.length);
 const camo=patternSVG({pattern:'woodland'});assert.ok((camo.match(/<path/g)||[]).length>=20);assert.match(camo,/Q/);assert.doesNotMatch(camo,/feTurbulence/);
 assert.notEqual(patternSVG({pattern:'woodland',seed:1}),patternSVG({pattern:'woodland',seed:2}));
 assert.notEqual(patternSVG({pattern:'woodland',density:.2}),patternSVG({pattern:'woodland',density:1}));
 assert.ok(materialCacheSize()<=32);
});
test('print scale and rotation reuse the vector while composition stays independent of material',()=>{
 const a=normalizeAppearance({material:'brushed',pattern:'woodland'}),b=normalizeAppearance({...a,material:'ceramic',scale:2,rotation:47,x:33});
 assert.equal(patternSVG(a),patternSVG(b));
 const v=appearanceVariables(b);assert.equal(v['--ipod-rotation'],'47deg');assert.equal(v['--ipod-pattern-size'],'72%');
 assert.notEqual(appearanceVariables(a)['--ipod-pattern-position'],v['--ipod-pattern-position']);
});
test('autosave, reload, reset and JSON round trip preserve only bounded appearance data',()=>{
 const storage=memory(),store=createAppearanceStore(storage);store.update({pattern:'tiger',colors:{body:'#aaff00'}});store.flush();
 const loaded=createAppearanceStore(storage);assert.equal(loaded.snapshot().config.pattern,'tiger');assert.equal(loaded.snapshot().config.colors.body,'#aaff00');
 assert.deepEqual(importAppearance(exportAppearance(loaded.snapshot().config)),loaded.snapshot().config);
 loaded.savePreset('My device');loaded.reset();assert.equal(loaded.snapshot().config.material,'brushed');assert.equal(loaded.snapshot().users.length,1);
 loaded.useLegacy();assert.equal(createAppearanceStore(storage).snapshot().enabled,false);
 assert.equal(storage.items.size,2);assert.ok(storage.items.get(APPEARANCE_KEY).length<4000);
});
test('saved user designs can be renamed/deleted and cannot exceed the storage budget',()=>{
 const storage=memory(),store=createAppearanceStore(storage),id=store.savePreset('First');
 assert.equal(store.renamePreset(id,'Revised'),true);assert.equal(store.snapshot().users[0].name,'Revised');assert.equal(store.deletePreset(id),true);
 for(let i=0;i<MAX_USER_PRESETS;i++)store.savePreset('Design '+i);
 assert.throws(()=>store.savePreset('Extra'),/16/);assert.ok(storage.items.get(USER_PRESETS_KEY).length<65536);
 const reloaded=createAppearanceStore(storage);assert.equal(reloaded.snapshot().users.length,MAX_USER_PRESETS);
});
test('corrupt, future-version and unavailable storage never break the visual player or erase existing data',()=>{
 const storage=memory();storage.setItem(APPEARANCE_KEY,'{"version":99,"appearance":{"material":"holo"}}');
 const original=storage.getItem(APPEARANCE_KEY),store=createAppearanceStore(storage);store.flush();assert.equal(storage.getItem(APPEARANCE_KEY),original);
 const unavailable=createAppearanceStore({getItem(){throw Error('denied')},setItem(){throw Error('quota')}});
 assert.doesNotThrow(()=>unavailable.apply({material:'pearl'}));assert.equal(unavailable.snapshot().config.material,'pearl');assert.equal(unavailable.snapshot().persistenceError,true);
});
test('CSS parses for supported Safari, and the editor owns no audio or global visual state',()=>{
 const css=readFileSync(new URL('../ipod-mode.css',import.meta.url),'utf8');
 const compiled=transformSync(css,{loader:'css',target:'safari16'});assert.ok(compiled.code.length);
 const editor=readFileSync(new URL('../ui/ipod-hardware-studio.js',import.meta.url),'utf8');
 assert.doesNotMatch(editor,/new Audio|AudioContext|audio\.src|\.load\(|backgroundMode|setTheme|<audio|setInterval/);
 assert.match(editor,/append\(device\)/);assert.match(editor,/placeholder\.replaceWith\(device\)/);
 const menu=readFileSync(new URL('../ui/player-surface.js',import.meta.url),'utf8');
 assert.match(menu,/Personalizar iPod/);assert.doesNotMatch(menu,/import-ipod-skin|Importar arte do Canva/);
});
test('bounded vector computation has a recorded, repeatable development benchmark',t=>{
 const values=[];
 for(const preset of DEVICE_PRESETS){const start=performance.now();appearanceVariables(preset.config);values.push(performance.now()-start)}
 values.sort((a,b)=>a-b);t.diagnostic('22 presets: p50 '+values[10].toFixed(2)+' ms / p95 '+values[20].toFixed(2)+' ms (model + SVG generation only)');
});
