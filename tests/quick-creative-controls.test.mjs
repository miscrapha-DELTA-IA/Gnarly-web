import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cycleValue,bindQuickCreative} from '../lib/quick-creative-controls.js';
test('quick actions cycle deterministically without replacing unrelated state',()=>{
 assert.equal(cycleValue(['ACID','CRIMSON','ACID'],'ACID'),'CRIMSON');
 assert.equal(cycleValue(['ACID','CRIMSON'],'CRIMSON'),'ACID');
 assert.equal(cycleValue(['ACID','CRIMSON'],'unknown'),'ACID');
 const state={theme:'ACID',experience:'original',lyrics:'original'};
 state.theme=cycleValue(['ACID','CRIMSON'],state.theme);
 assert.deepEqual(state,{theme:'CRIMSON',experience:'original',lyrics:'original'});
});
function button(){
 const listeners=new Map();
 return {disabled:false,addEventListener(name,cb){const arr=listeners.get(name)||[];arr.push(cb);listeners.set(name,arr)},
   fire(name,properties={}){let stopped=false;const e={button:0,pointerType:'touch',preventDefault(){stopped=true},stopPropagation(){stopped=true},...properties};
    for(const cb of listeners.get(name)||[])cb(e);return stopped}};
}
test('tap changes immediately; long hold opens manual menu and suppresses accidental cycle',async()=>{
 const el=button();let cycles=0,panels=0;
 bindQuickCreative(el,{cycle:()=>cycles++,expand:()=>panels++,holdMs:16});
 el.fire('pointerdown');el.fire('pointerup');el.fire('click');
 assert.equal(cycles,1);assert.equal(panels,0);
 el.fire('pointerdown');await new Promise(resolve=>setTimeout(resolve,28));
 el.fire('pointerup');el.fire('click');
 assert.equal(panels,1);assert.equal(cycles,1);
});
test('right click and keyboard affordance open the full picker without cycling',()=>{
 const el=button();let cycles=0,panels=0;
 bindQuickCreative(el,{cycle:()=>cycles++,expand:()=>panels++});
 assert.equal(el.fire('contextmenu'),true);
 assert.equal(panels,1);
 const b=button();bindQuickCreative(b,{cycle:()=>cycles++,expand:()=>panels++});
 assert.equal(b.fire('keydown',{key:'ArrowDown'}),true);
 assert.equal(panels,2);
 b.fire('click');assert.equal(cycles,1);
});
