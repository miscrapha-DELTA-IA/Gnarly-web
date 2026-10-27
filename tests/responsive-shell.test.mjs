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
test('eye tap collapses icons, hold opens display once without also tapping',()=>{
 const button=mockButton();
 let tap=0,hold=0,nextTimer=null,removed=false;
 const dispose=attachEyeGestures(button,{
  tap:()=>tap++,hold:()=>hold++,delay:510,
  setTimer:fn=>{nextTimer=fn;return 1},
  clearTimer:()=>{removed=true;nextTimer=null}
 });
 button.trigger('pointerdown');button.trigger('pointerup');button.trigger('click');
 assert.equal(tap,1);assert.equal(hold,0);
 button.trigger('pointerdown');nextTimer();button.trigger('pointerup');button.trigger('click');
 assert.equal(tap,1);assert.equal(hold,1);
 button.trigger('contextmenu');
 assert.equal(hold,2,'manual right-click opens display independently');
 dispose();
 assert.equal(button.handlers.size,0);
});
test('moving finger cancels long press without invoking display menu',()=>{
 const button=mockButton();let hold=0,timer=null;
 attachEyeGestures(button,{hold:()=>hold++,setTimer:fn=>(timer=fn,1),clearTimer:()=>{timer=null}});
 button.trigger('pointerdown',{clientX:10,clientY:10});
 button.trigger('pointermove',{clientX:30,clientY:30});
 assert.equal(timer,null);assert.equal(hold,0);
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
 assert.match(app,/data-device-layout|dataset\.deviceLayout/);
 assert.ok(app.includes("app.dataset.deviceLayout==='phone'"));
 assert.equal(OFFICIAL_SUPPORT_URL,'https://apoia.se/gnarlyapp');
});
