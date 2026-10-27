import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PALETTES} from '../lib/visual-engine.js';
import {deviceLayout,themeAccent,attachEyeGestures,OFFICIAL_SUPPORT_URL} from '../lib/responsive-shell.js';

test('phone, iPad and desktop get appropriate layouts independent of user agent string',()=>{
 assert.equal(deviceLayout({width:390,coarse:true}),'phone');
 assert.equal(deviceLayout({width:844,coarse:true}),'phone','landscape iPhone');
 assert.equal(deviceLayout({width:1024,coarse:true}),'tablet','iPad');
 assert.equal(deviceLayout({width:1440,coarse:false}),'desktop');
 assert.equal(deviceLayout({width:400,coarse:false}),'phone','desktop narrow window');
});
test('all visual palettes drive UI accent instead of defaulting to green',()=>{
 for(const theme of Object.keys(PALETTES)){
  const selected=themeAccent(theme,PALETTES);
  assert.ok((theme.startsWith('GNARLY')?PALETTES.ACID:PALETTES[theme]).includes(selected)||selected==='#45ff8a',theme);
  if(theme!=='ACID'&&theme!=='GNARLY')assert.notEqual(selected,'#45ff8a',theme);
 }
 assert.notEqual(themeAccent('XEROX SERPENTINE',PALETTES),'#46ff12');
 assert.notEqual(themeAccent('PRISM CARMINE',PALETTES),'#46ff12');
 assert.notEqual(themeAccent('ULTRAVIOLET',PALETTES),'#46ff12');
 assert.equal(themeAccent('GNARLY',PALETTES,'CRIMSON'),themeAccent('CRIMSON',PALETTES));
});
function mockButton(){
 const handlers=new Map();
 return {addEventListener(n,fn){handlers.set(n,fn)},
 removeEventListener(n){handlers.delete(n)},
 trigger(n,data={}){return handlers.get(n)?.({button:0,clientX:20,clientY:20,
  preventDefault(){},stopPropagation(){},...data})},handlers};
}
test('eye tap toggles independently of horizontal swipe and its ghost click',()=>{
 const button=mockButton();let taps=0;const horizontal=[];
 const dispose=attachEyeGestures(button,{
  tap:()=>taps++,swipeHorizontal:dir=>horizontal.push(dir)
 });
 button.trigger('pointerdown');button.trigger('pointerup');button.trigger('click');
 assert.equal(taps,1);
 button.trigger('pointerdown',{clientX:75,clientY:25});
 button.trigger('pointermove',{clientX:20,clientY:25,cancelable:true});
 button.trigger('pointerup',{clientX:20,clientY:25});
 button.trigger('click');
 assert.deepEqual(horizontal,['left']);assert.equal(taps,1);
 button.trigger('pointerdown',{clientX:15,clientY:25});
 button.trigger('pointerup',{clientX:70,clientY:25});
 button.trigger('click');
 assert.deepEqual(horizontal,['left','right']);assert.equal(taps,1);
 button.trigger('pointerdown');button.trigger('pointerup');button.trigger('click');
 assert.equal(taps,2,'next real tap must not be swallowed');
 dispose();assert.equal(button.handlers.size,0);
});
test('vertical swipes open/dismiss display; long hold and iOS callout never open menu',()=>{
 const button=mockButton();let contexts=0;const vertical=[];
 attachEyeGestures(button,{swipeVertical:d=>vertical.push(d),context:()=>contexts++});
 button.trigger('pointerdown',{pointerType:'touch',clientX:20,clientY:15});
 button.trigger('pointerup',{pointerType:'touch',clientX:20,clientY:65});
 button.trigger('click');assert.deepEqual(vertical,['down']);
 button.trigger('pointerdown',{pointerType:'touch',clientX:20,clientY:72});
 button.trigger('pointerup',{pointerType:'touch',clientX:20,clientY:12});
 button.trigger('click');assert.deepEqual(vertical,['down','up']);
 button.trigger('contextmenu',{pointerType:'touch',button:0});
 assert.equal(contexts,0,'Safari long press must not launch display');
 button.trigger('contextmenu',{pointerType:'mouse',button:2});
 assert.equal(contexts,1,'desktop right-click still opens display');
});
test('diagonal swipe does not trigger accidental action; keyboard arrows stay accessible',()=>{
 const button=mockButton();const horizontal=[],vertical=[];let taps=0,blocked=false;
 attachEyeGestures(button,{tap:()=>taps++,swipeHorizontal:d=>horizontal.push(d),
  swipeVertical:d=>vertical.push(d)});
 button.trigger('pointerdown',{clientX:10,clientY:10});
 button.trigger('pointerup',{clientX:70,clientY:62});button.trigger('click');
 assert.equal(taps,0);assert.equal(vertical.length,0);assert.equal(horizontal.length,0);
 button.trigger('keydown',{key:'ArrowDown',preventDefault(){blocked=true},stopPropagation(){}});
 assert.deepEqual(vertical,['down']);assert.equal(blocked,true);
 button.trigger('keydown',{key:'ArrowLeft'});
 assert.deepEqual(horizontal,['left']);
});
test('mobile layout preserves full theme name without overlapping shortcuts',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="support-button".*href="https:\/\/apoia\.se\/gnarlyapp"/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(css,/\.build-badge\{[\s\S]*?white-space:normal/);
 assert.match(css,/data-device-layout="phone"/);
 assert.match(css,/data-icons-collapsed="true"/);
 assert.match(app,/applyResponsiveLayout\(\)/);
 assert.match(app,/themeAccent\(state\.theme,PALETTES,state\.previousTheme\)/);
 assert.match(app,/attachEyeGestures\(\$\('#search-toggle'\)/);
 assert.match(app,/swipeHorizontal:direction/);
 assert.match(app,/swipeVertical:direction/);
 assert.match(app,/data-device-layout|dataset\.deviceLayout/);
 assert.ok(app.includes("app.dataset.deviceLayout==='phone'"));
 const moduleCSS=readFileSync(new URL('../module-dock.css',import.meta.url),'utf8');
 assert.match(moduleCSS,/touch-action:none!important/);
 assert.match(moduleCSS,/-webkit-user-select:none!important/);
 assert.match(moduleCSS,/\.brand-line\{[\s\S]*?margin-top:clamp\(18px/);
 assert.match(moduleCSS,/linear-gradient\(155deg,rgba\(28,39,57/);
 assert.equal(OFFICIAL_SUPPORT_URL,'https://apoia.se/gnarlyapp');
});
