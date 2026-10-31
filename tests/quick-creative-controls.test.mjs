import {readFileSync} from 'node:fs';
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
 return {disabled:false,
  addEventListener(name,fn){const arr=listeners.get(name)||[];arr.push(fn);listeners.set(name,arr)},
  removeEventListener(name,fn){const arr=listeners.get(name)||[];listeners.set(name,arr.filter(x=>x!==fn))},
  fire(name,properties={}){let prevented=false;const e={button:0,pointerType:'touch',
   clientX:12,clientY:12,pointerId:7,cancelable:true,
   preventDefault(){prevented=true},stopPropagation(){prevented=true},...properties};
   for(const cb of listeners.get(name)||[])cb(e);
   return prevented;
  },listeners};
}
test('tap cycles; downward swipe opens a palette without ghost cycling',()=>{
 const el=button();let cycles=0,panels=0;
 bindQuickCreative(el,{cycle:()=>cycles++,expand:()=>panels++});
 el.fire('pointerdown');el.fire('pointerup');el.fire('click');
 assert.equal(cycles,1);assert.equal(panels,0);
 el.fire('pointerdown');
 assert.equal(el.fire('pointermove',{clientY:58}),true,'swiping cancels selection/scroll');
 el.fire('pointerup',{clientY:58});el.fire('click');
 assert.equal(panels,1);assert.equal(cycles,1);
 el.fire('pointerdown');el.fire('pointerup');el.fire('click');
 assert.equal(cycles,2,'next tap after the swipe still works');
});
test('holding touch no longer starts a timer, callout, context menu or text selection',async()=>{
 const el=button();let cycles=0,panels=0;
 bindQuickCreative(el,{cycle:()=>cycles++,expand:()=>panels++});
 el.fire('pointerdown');
 await new Promise(resolve=>setTimeout(resolve,24));
 assert.equal(panels,0,'holding without swiping must not open a menu');
 assert.equal(el.fire('selectstart'),true);
 assert.equal(el.fire('dragstart'),true);
 assert.equal(el.fire('touchmove'),true);
 assert.equal(el.fire('contextmenu',{button:2,pointerType:'mouse'}),true);
 assert.equal(panels,0,'iOS synthesized secondary click must not open menu');
 el.fire('pointerup');el.fire('click');
 assert.equal(cycles,1);
});
test('upward and sideways drags never change the currently selected theme',()=>{
 const el=button();let cycles=0,panels=0;
 bindQuickCreative(el,{cycle:()=>cycles++,expand:()=>panels++});
 el.fire('pointerdown');
 el.fire('pointerup',{clientX:80,clientY:17});el.fire('click');
 el.fire('pointerdown');
 el.fire('pointerup',{clientY:-51});el.fire('click');
 assert.equal(cycles,0);assert.equal(panels,0);
});
test('real desktop right-click, ArrowDown and Shift+Enter keep manual selector accessible',()=>{
 const el=button();let cycles=0,panels=0;
 bindQuickCreative(el,{cycle:()=>cycles++,expand:()=>panels++});
 assert.equal(el.fire('contextmenu',{pointerType:'mouse',button:2}),true);
 assert.equal(panels,1);
 el.fire('pointerdown',{pointerType:'mouse'});
 el.fire('pointerup',{pointerType:'mouse'});
 assert.equal(el.fire('contextmenu',{pointerType:'mouse',button:2}),true);
 assert.equal(panels,2);
 assert.equal(el.fire('keydown',{key:'ArrowDown'}),true);
 assert.equal(el.fire('keydown',{key:'Enter',shiftKey:true}),true);
 assert.equal(panels,4);
});
test('binding disposal removes every event listener',()=>{
 const el=button();
 const dispose=bindQuickCreative(el,{cycle:()=>{},expand:()=>{}});
 dispose();
 assert.ok([...el.listeners.values()].every(x=>x.length===0));
});

test('quick theme, experience and Aa changes are silent without silencing important warnings',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const section=(from,to)=>{
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,'Missing selection handler: '+from);
  return app.slice(start,end);
 };
 // Tapping any of the three header shortcuts must never display a snackbar.
 for(const [start,end] of [
  ["bindQuickCreative($('#theme-button')","bindQuickCreative($('#experience-button')"],
  ["bindQuickCreative($('#experience-button')","bindQuickCreative($('#lyric-style-button')"],
  ["bindQuickCreative($('#lyric-style-button')","$('#background-button').addEventListener"]
 ])assert.doesNotMatch(section(start,end),/\btoast\s*\(/);
 // Manual palette and GNARLY 2 visual refinements are silent too.
 assert.doesNotMatch(section('function selectVisualTheme(next)','function configureGnarly2Lock'),/\btoast\s*\(/);
 assert.doesNotMatch(section('function configureGnarly2Lock(id)','const QUICK_LYRIC_STYLES'),/\btoast\s*\(/);
 assert.doesNotMatch(section('if(target.dataset.materialLayer)','if(target.dataset.stemPreset)'),/\btoast\s*\(/);
 // Audio and server errors are intentionally still shown.
 assert.match(app,/function reportAudioError\(text\)[\s\S]*?toast\(text\)/);
 assert.match(app,/toast\('Não foi possível aplicar baixo\/reverb:/);
});


test('Aa may hide lyrics with a downward swipe and recover them with an upward swipe',()=>{
 const el=button();
 let cycles=0,opens=0,hidden=0,restored=0;
 bindQuickCreative(el,{
  cycle:()=>cycles++,expand:()=>opens++,
  swipeDown:()=>hidden++,swipeUp:()=>restored++
 });
 el.fire('pointerdown');
 el.fire('pointerup',{clientY:60});
 el.fire('click');
 assert.equal(hidden,1);
 assert.equal(cycles,0,'swiping never cycles the font');
 assert.equal(opens,0,'downward Aa does not open the catalog');
 el.fire('pointerdown');
 el.fire('pointerup',{clientY:-35});
 el.fire('click');
 assert.equal(restored,1);
 assert.equal(cycles,0,'upward gesture does not cycle the font');
 el.fire('pointerdown',{pointerType:'mouse'});
 el.fire('pointerup',{pointerType:'mouse'});
 el.fire('contextmenu',{button:2,pointerType:'mouse'});
 assert.equal(opens,1,'font catalog remains accessible on desktop');
 el.fire('pointerdown');
 el.fire('pointerup');
 el.fire('click');
 assert.equal(cycles,1,'normal tap is preserved');
});
