import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 albumWallpaperPlan,createAlbumWallpaperPainter,WALLPAPER_MAX_PIXELS,
 WALLPAPER_MODES
} from '../lib/album-wallpaper-renderer.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('small video still gets an edge-to-edge editorial canvas instead of a jagged full-bleed enlargement',()=>{
 const p=albumWallpaperPlan({
  sourceWidth:640,sourceHeight:360,width:390,height:844,dpr:3,mode:'auto'
 });
 assert.equal(p.mode,'editorial');
 assert.ok(p.focus.size>=390*.78,'artwork remains large, not a Retina postage stamp');
 assert.ok(p.focus.size<=390*.96,'artwork remains within the available screen');
 assert.ok(p.density<.2,'native 360px height cannot fill a Retina 844px display');
 const desktop=albumWallpaperPlan({
  sourceWidth:1280,sourceHeight:720,width:1920,height:1080,dpr:1
 });
 assert.equal(desktop.mode,'editorial');
 assert.ok(desktop.focus.size>=810,'album composition stays large on PC');
});
test('sufficient genuine pixels keep the original full-screen album artwork',()=>{
 const p=albumWallpaperPlan({
  sourceWidth:3200,sourceHeight:3200,width:390,height:844,dpr:3,mode:'auto'
 });
 assert.equal(p.mode,'fill');
 assert.ok(p.density>=1);
 const fallback=albumWallpaperPlan({
  sourceWidth:640,sourceHeight:360,width:1920,height:1080,dpr:2,mode:'fill'
 });
 assert.equal(fallback.mode,'fill','explicit full-bleed preference is always honored');
 const editorial=albumWallpaperPlan({
  sourceWidth:3200,sourceHeight:3200,width:390,height:844,dpr:3,mode:'editorial'
 });
 assert.equal(editorial.mode,'editorial','user can intentionally prefer an editorial composition');
 assert.deepEqual(WALLPAPER_MODES,['auto','editorial','fill']);
});
function createFakeCanvas(width=1920,height=1080){
 const calls=[];
 const gradient={addColorStop:(...args)=>calls.push(['stop',...args])};
 const ctx={
  setTransform:(...args)=>calls.push(['transform',...args]),
  fillRect:(...args)=>calls.push(['fill',...args]),
  drawImage:(...args)=>calls.push(['image',...args]),
  createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,
  save:()=>calls.push(['save']),restore:()=>calls.push(['restore']),
  beginPath:()=>{},rect:()=>{},roundRect:()=>{},clip:()=>{},
  strokeRect:()=>{},
  imageSmoothingEnabled:false,imageSmoothingQuality:'low'
 };
 const canvas={
  width:1,height:1,hidden:true,
  parentElement:{getBoundingClientRect:()=>({width,height})},
  getContext:(name,options)=>{
   assert.equal(name,'2d');assert.equal(options.alpha,false);return ctx;
  }
 };
 return {canvas,ctx,calls};
}
test('single-shot artwork compositor uses high-quality interpolation and bounded static GPU memory',()=>{
 const {canvas,ctx,calls}=createFakeCanvas(2560,1440);
 const painter=createAlbumWallpaperPainter(canvas);
 const image={naturalWidth:800,naturalHeight:800};
 assert.equal(painter.paint(image,{mode:'auto',dpr:2,hue:.6}),true);
 assert.equal(canvas.hidden,false);
 assert.ok(canvas.width*canvas.height<=WALLPAPER_MAX_PIXELS*1.01);
 assert.equal(ctx.imageSmoothingQuality,'high');
 assert.equal(painter.diagnostics().presentation,'editorial');
 assert.ok(painter.diagnostics().focusCssPixels>850);
 assert.equal(calls.filter(([kind])=>kind==='image').length,2,
  'subtle full-bleed art plus one large uncropped focal cover, no CSS blur');
 assert.equal(painter.redraw({mode:'fill'}),true);
 assert.equal(painter.diagnostics().presentation,'fill');
 assert.equal(painter.diagnostics().focusCssPixels,null);
 painter.clear();
 assert.equal(canvas.hidden,true);
 assert.equal(canvas.width,1);assert.equal(canvas.height,1);
 assert.equal(painter.diagnostics().rasterPixels,0);
 assert.equal(painter.redraw(),false);
});
test('one-shot wallpaper layer is independent from playback and WebGL and fills the full viewport',()=>{
 const app=source('app.js'),html=source('index.html'),css=source('styles.css');
 assert.match(html,/id="album-wallpaper-canvas"/);
 assert.match(css,/#gnarly-background #album-wallpaper-canvas\{/);
 assert.match(css,/#gnarly-background #album-wallpaper-canvas\[hidden\]/);
 assert.match(css,/width:100%;height:100%;z-index:2/);
 assert.match(app,/const wallpaperPainter=createAlbumWallpaperPainter/);
 assert.match(app,/wallpaperPainter.paint\(decoded,\{/);
 assert.match(app,/wallpaperPainter.clear\(\)/);
 assert.match(app,/window.gnarlyArtworkDiagnostics=\(\)=>\{/);
 assert.match(app,/\.\.\.wallpaperPainter.diagnostics\(\)/);
 assert.match(app,/case 'cover-presentation-auto':case 'cover-presentation-editorial':case 'cover-presentation-fill'/);
 assert.match(app,/setSetting\('coverPresentation',chosen\)/);
 assert.match(css,/#gnarly-background.cover-bg .photo-background \{[\s\S]*?background-size:cover!important;/);
 assert.doesNotMatch(app,/track\.url\s*=\s*asset\.url/);
});
