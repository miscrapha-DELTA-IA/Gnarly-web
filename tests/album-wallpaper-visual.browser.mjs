/** Verify the real Nightcore-style native album image at Retina size.
 * Synthetic self-owned SVG cover, no remote credentials, APIs or user tracks.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
try{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const source=readFileSync(new URL('../lib/native-cover-wallpaper.js',import.meta.url),'utf8')
  .replace(/^export /gm,'');
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"/>'+
  '<div id="gnarly-background" class="cover-bg cover-art-ready">'+
  '<div id="photo-background" class="photo-background"></div>'+
  '<canvas id="album-wallpaper-canvas" aria-hidden="true" hidden></canvas>'+
  '<div class="visual-dim"></div></div><div class="app-shell"></div>');
 await page.addStyleTag({content:css});
 await page.addScriptTag({content:source+'\nwindow.__createNativeCoverWallpaper=createNativeCoverWallpaper;'});
 const data=await page.evaluate(async()=>{
  const make=(edge,accent)=>'data:image/svg+xml;charset=utf-8,'+
   encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+edge+
    '" height="'+edge+'" viewBox="0 0 100 100"><rect width="100" height="100" fill="#102532"/>'+
    '<path d="M0 49H100M50 0V100" stroke="'+accent+'" stroke-width=".20"/>'+
    '<circle cx="50" cy="50" r="34" fill="none" stroke="'+accent+'" stroke-width=".25"/>'+
    '<path d="M10 10L90 90M90 10L10 90" stroke="'+accent+'" stroke-width=".16"/></svg>');
  const photo=document.getElementById('photo-background');
  const surface=__createNativeCoverWallpaper(photo);
  const first=await surface.show(make(3000,'#ffb774'));
  const one=photo.querySelector('.gnarly-native-album-image');
  const style=getComputedStyle(one),bounds=one.getBoundingClientRect();
  const measured={first,render:surface.diagnostics(),sourcePixels:[one.naturalWidth,one.naturalHeight],
   sourceSrc:one.src.slice(0,15),fit:style.objectFit,filter:style.filter,
   transform:style.transform,rendering:style.imageRendering,
   width:bounds.width,height:bounds.height,canvasHidden:document.getElementById('album-wallpaper-canvas').hidden};
  const next=await surface.show(make(3200,'#77d0ff'));
  measured.next=next;measured.nextPixels=surface.diagnostics().activePixels;
  measured.nextVisible=photo.querySelectorAll('.gnarly-native-album-image').length>0;
  return measured;
 });
 assert.equal(data.first,true);
 assert.equal(data.render.renderPath,'native-img-scaled-to-fill');
 assert.deepEqual(data.sourcePixels,[3000,3000]);
 assert.equal(data.fit,'cover');
 assert.equal(data.filter,'none');
 assert.equal(data.transform,'none');
 assert.equal(data.rendering,'auto');
 assert.ok(Math.abs(data.width-390)<1&&Math.abs(data.height-844)<1);
 assert.equal(data.canvasHidden,true);
 assert.equal(data.next,true);
 assert.equal(data.nextPixels,'3200x3200');
 assert.equal(data.nextVisible,true);
 await page.screenshot({path:'album-wallpaper-fullbleed-browser.png',fullPage:false});
 await page.setViewportSize({width:1920,height:1080});
 const resized=await page.evaluate(()=>{
  const img=document.querySelector('#photo-background>.gnarly-native-album-image:not(.gnarly-native-album-outgoing)');
  const r=img.getBoundingClientRect(),s=getComputedStyle(img);
  return {width:r.width,height:r.height,fit:s.objectFit,filter:s.filter,transform:s.transform};
 });
 assert.deepEqual(resized,{width:1920,height:1080,fit:'cover',filter:'none',transform:'none'});
 console.log('GNARLY native full-bleed album cover · Retina and desktop',JSON.stringify({data,resized}));
}finally{await browser.close()}
