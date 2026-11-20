/** Render the exact static artwork compositor in Chromium/iPhone Retina sizing.
 * Pure synthetic self-owned graphics, no remote artwork or personal track data.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
try{
 const source=readFileSync(new URL('../lib/album-wallpaper-renderer.js',import.meta.url),'utf8')
  .replace(/^export /gm,'');
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"/>'+
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#080c12}'+
  '#background{position:fixed;inset:0;width:100vw;height:100vh}'+
  '#album-wallpaper-canvas{width:100%;height:100%;display:block}</style>'+
  '<div id="background"><canvas id="album-wallpaper-canvas"></canvas></div>');
 await page.addScriptTag({content:source+'\nwindow.__wallpaperQA={createAlbumWallpaperPainter,albumWallpaperPlan};'});
 const measured=await page.evaluate(async()=>{
  const fixture=document.createElement('canvas');
  fixture.width=fixture.height=640;
  const ctx=fixture.getContext('2d');
  ctx.fillStyle='#0d284d';ctx.fillRect(0,0,640,640);
  ctx.fillStyle='#f3b45c';ctx.fillRect(90,90,460,460);
  ctx.fillStyle='#174252';ctx.fillRect(155,160,330,320);
  const image=new Image();
  image.src=fixture.toDataURL('image/png');await image.decode();
  const canvas=document.querySelector('#album-wallpaper-canvas');
  const painter=__wallpaperQA.createAlbumWallpaperPainter(canvas);
  const painted=painter.paint(image,{mode:'auto',dpr:3,hue:.61});
  const diag=painter.diagnostics();
  const bounds=canvas.getBoundingClientRect();
  const dctx=canvas.getContext('2d',{willReadFrequently:true});
  const center=dctx.getImageData(Math.round(canvas.width/2),Math.round(canvas.height/2),1,1).data;
  const corner=dctx.getImageData(4,4,1,1).data;
  window.__wallpaperPainter=painter;
  return {painted,diag,bounds:{width:bounds.width,height:bounds.height},
   viewport:{width:innerWidth,height:innerHeight},center:[...center],corner:[...corner]};
 });
 assert.equal(measured.painted,true);
 assert.equal(measured.diag.presentation,'editorial');
 assert.ok(measured.diag.focusCssPixels>=300,
  'mobile artwork must not become a tiny Retina stamp '+JSON.stringify(measured));
 assert.ok(measured.diag.rasterPixels<=5800000*1.01);
 assert.ok(Math.abs(measured.bounds.width-measured.viewport.width)<2);
 assert.ok(Math.abs(measured.bounds.height-measured.viewport.height)<2);
 assert.notDeepEqual(measured.center,measured.corner,
  'the editorial artwork should still be visually present against vector ambience');
 await page.screenshot({path:'album-wallpaper-editorial-browser.png',fullPage:false});
 const mode=await page.evaluate(()=>{
  window.__wallpaperPainter.redraw({mode:'fill'});
  return window.__wallpaperPainter.diagnostics();
 });
 assert.equal(mode.presentation,'fill');
 assert.equal(mode.focusCssPixels,null);
 await page.screenshot({path:'album-wallpaper-fullbleed-browser.png',fullPage:false});
 console.log('ALBUM WALLPAPER RETINA',JSON.stringify({measured,mode}));
}finally{await browser.close()}
