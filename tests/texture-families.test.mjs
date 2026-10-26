import test from 'node:test';
import assert from 'node:assert/strict';
import {textureFragment} from '../lib/texture-shader.js';
import {themedMaterialStops,PALETTES} from '../lib/visual-engine.js';
test('independent physical grammar and bounded FFT inputs',()=>{
 for(const id of ['organicWeb','fracturedCells','plasmaLava','topographicMoire'])assert.ok(textureFragment.includes('vec3 '+id+'('));
 for(const name of ['u_low','u_mid','u_high','u_beat','u_family'])assert.ok(textureFragment.includes(name));
 assert.ok(textureFragment.includes('gl_FragCoord'));
});
test('five-stop authored marble now accepts current theme palette',()=>{
 const rgb=PALETTES.CRIMSON.map(c=>{const x=parseInt(c.slice(1),16);return[(x>>16&255)/255,(x>>8&255)/255,(x&255)/255]});
 const result=themedMaterialStops(['#040406','#ff0088','#00ff9d','#00e5ff','#f8fafc'],rgb);
 assert.equal(result.length,15);
 for(let i=0;i<15;i+=3)assert.ok(result[i+2]<.35,'Crimson must not become cyan or pink');
});
