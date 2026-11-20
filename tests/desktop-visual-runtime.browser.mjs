/** Desktop GPU acceptance on the exact built Pages bundle.
 * Headless Chromium/SwiftShader does not represent the user's real hardware:
 * assert wiring and bounded work, never claim measured physical 60 FPS.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--enable-webgl','--use-gl=angle',
 '--use-angle=swiftshader','--enable-unsafe-swiftshader'
]});
const root='http://127.0.0.1:8765/';
const png=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WfT8fYAAAAASUVORK5CYII=','base64');
async function inspect({name,theme,experience,width,height,dpr,workload,maxPixels}){
 const context=await browser.newContext({serviceWorkers:'block',
  viewport:{width,height},deviceScaleFactor:dpr});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(String(error.message).slice(0,220)));
 try{
  await page.addInitScript(({theme,experience})=>{
   localStorage.setItem('gnarly.web.theme',theme);
   localStorage.setItem('gnarly.web.experience',experience);
   localStorage.setItem('gnarly.web.backgroundMode','visual');
  },{theme,experience});
  await page.goto(root,{waitUntil:'domcontentloaded',timeout:20000});
  await page.locator('#omnibox-toggle').waitFor();
  await page.waitForFunction(()=>['webgl2','canvas2d'].includes(
   window.gnarlyVisualDiagnostics?.()?.renderer),null,{timeout:14000});
  const result=await page.evaluate(()=>{
   const d=window.gnarlyVisualDiagnostics();
   const rect=document.querySelector('#gnarly-background').getBoundingClientRect();
   return {...d,viewport:{width:rect.width,height:rect.height},
    cssBackground:getComputedStyle(document.querySelector('#gnarly-background')).position};
  });
  assert.equal(result.workload,workload,name+' '+JSON.stringify(result));
  if(result.renderer==='webgl2'){
   assert.ok(result.pixelBudget<=maxPixels,name+' peak shader allocation must be bounded');
   assert.ok(result.canvasPixels<=Math.ceil(maxPixels*1.03),
    name+' actual render target must remain within budget '+JSON.stringify(result));
  }
  assert.ok(result.viewport.width>=width-3&&result.viewport.height>=height-3,
   name+' shader surface still covers the full desktop viewport');
  assert.equal(errors.length,0,name+' uncaught page errors '+JSON.stringify(errors));
  if(name==='classic'){
   // Custom photo should stop the shader loop completely, not merely skip GL
   // commands while still running 144Hz rAF callbacks.
   await page.locator('#background-import').setInputFiles({
    name:'performance-fixture.png',mimeType:'image/png',buffer:png
   });
   await page.waitForFunction(()=>window.gnarlyVisualDiagnostics?.()?.paused===true);
   const before=await page.evaluate(()=>window.gnarlyVisualDiagnostics().renderedFrames);
   await page.waitForTimeout(350);
   const after=await page.evaluate(()=>window.gnarlyVisualDiagnostics());
   assert.equal(after.renderedFrames,before,'static photo must halt GPU frame submissions');
   assert.equal(after.paused,true);
  }
  console.log('DESKTOP VISUAL',name,JSON.stringify(result));
 }finally{
  await context.close();
 }
}
try{
 await inspect({name:'classic',theme:'ACID',experience:'original',
  width:1600,height:900,dpr:2,workload:'classic',maxPixels:2600000});
 await inspect({name:'GNARLY 2 layered',theme:'GNARLY 2',experience:'original',
  width:1100,height:740,dpr:1,workload:'layered',maxPixels:1250000});
}finally{await browser.close()}
