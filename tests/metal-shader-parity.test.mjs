import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeFragment,classicFragment} from '../lib/metal-shader-port.js';
test('shader source preserves original three separate Metal material evaluators',()=>{
 for(const fn of ['evaluateLiquidMarble','evaluateProceduralMaterial','evaluateTexturedMarble'])
   assert.match(classicFragment,new RegExp('vec4 '+fn+'\\('));
 assert.match(classicFragment,/u_stops\[5\]/);
 assert.match(creativeFragment,/vec3 universeEval\(/);
 assert.match(creativeFragment,/universePlateMetric/);
 assert.match(creativeFragment,/if \(look == 15\)/);
 assert.ok(creativeFragment.length>18000,'CreativeUniverse evaluator is not a tiny generic material stub');
});