/**
 * Static, high-quality album wallpaper renderer.
 *
 * A CDN's 3200px URL often represents a resampled 640px master. Blowing that
 * image across a Retina viewport exposes JPEG blocks and ugly stair-steps.
 * This art direction covers the ENTIRE viewport with vector ambience and
 * a large high-smoothing focal cover when the decoded source is inadequate.
 * Unlike the procedural visuals, it paints only when the cover or size changes.
 *
 * Drawing cross-origin <img> elements to canvas is permitted for display; the
 * result is deliberately never read back or exported, so no image proxy/CORS
 * bypass is required. No audio URLs, artwork identity or network calls here.
 */
export const WALLPAPER_MAX_PIXELS=5800000;
export const WALLPAPER_MODES=Object.freeze(['auto','editorial','fill']);

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function albumWallpaperPlan({
 sourceWidth=0,sourceHeight=0,width=390,height=844,dpr=1,mode='auto',provider=''
}={}){
 const sw=Math.max(0,Number(sourceWidth)||0),sh=Math.max(0,Number(sourceHeight)||0);
 const w=Math.max(1,Number(width)||390),h=Math.max(1,Number(height)||844);
 const density=Math.min(3,Math.max(1,Number(dpr)||1));
 const coverage=sw&&sh?Math.min(sw/(w*density),sh/(h*density)):0;
 // The source shape matters: a 1280x720 video still cannot become a
 // high-quality portrait album cover simply by calling it "maxresdefault".
 const portraitVideo=sw>sh*1.34&&h>w*1.28;
 const preference=WALLPAPER_MODES.includes(mode)?mode:'auto';
 // A catalog URL labelled 3200px may have been re-encoded from a 600px
 // upstream image. The original recording is verified by the catalogue;
 // its *native raster detail* is not. Be conservative on Retina screens.
 const catalogResampleRisk=['apple','deezer'].includes(provider);
 // The decoded dimensions establish the available pixels, not native detail.
 // Do not automatically discard a 3000px catalog cover based only on which
 // provider served it. Use the original image at native browser resolution
 // whenever its pixels cover the target display at device DPR.
 const threshold=1.0;
 const editorial=preference==='editorial'||
  (preference==='auto'&&(coverage<threshold||portraitVideo));
 const maxFocus=Math.min(w*.96,h*.9);
 const naturalEdge=Math.min(sw||1,sh||1)/density;
 // Keep the artwork visually LARGE, not a tiny 213 CSS px Retina square.
 // At 640x640 on a 390px iPhone the focal cover is ~0.9× viewport width.
 // On a 1920x1080 desktop the cover nearly reaches full viewport height.
 const minFocus=Math.min(w,h)*.78;
 const desired=Math.max(minFocus,naturalEdge*1.62);
 const focus=clamp(desired,minFocus,Math.max(minFocus,maxFocus));
 const x=(w-focus)/2,y=(h-focus)/2;
 return {
  mode:editorial?'editorial':'fill',preference,
  catalogResampleRisk,
  density:Number(coverage.toFixed(3)),
  physicalUpscale:coverage>0?Number(Math.max(1,1/coverage).toFixed(2)):null,
  width:w,height:h,focus:{x,y,size:focus},
  sourceWidth:sw,sourceHeight:sh
 };
}

function coverCrop(sw,sh){
 const square=Math.min(sw,sh);
 return {x:(sw-square)/2,y:(sh-square)/2,size:square};
}
function fillCover(ctx,image,width,height){
 const sw=image.naturalWidth,sh=image.naturalHeight;
 const scale=Math.max(width/sw,height/sh);
 const dw=sw*scale,dh=sh*scale;
 ctx.drawImage(image,(width-dw)/2,(height-dh)/2,dw,dh);
}
function paintAmbience(ctx,img,w,h,hue){
 ctx.fillStyle='#080c12';ctx.fillRect(0,0,w,h);
 const base=(Math.round((Number(hue)||0)*360)%360+360)%360;
 const a=ctx.createRadialGradient(w*.13,h*.18,0,w*.13,h*.18,Math.max(w,h)*.9);
 a.addColorStop(0,`hsla(${base},62%,36%,.84)`);
 a.addColorStop(1,'rgba(8,12,18,0)');
 ctx.fillStyle=a;ctx.fillRect(0,0,w,h);
 const b=ctx.createRadialGradient(w*.9,h*.84,0,w*.9,h*.84,Math.max(w,h)*.9);
 b.addColorStop(0,`hsla(${(base+92)%360},66%,30%,.63)`);
 b.addColorStop(1,'rgba(8,12,18,0)');
 ctx.fillStyle=b;ctx.fillRect(0,0,w,h);
 // Preserve the artwork's recognizable imagery across the entire display,
 // but at low contrast so JPEG compression is no longer the dominant texture.
 ctx.save();
 ctx.globalAlpha=.14;
 fillCover(ctx,img,w,h);
 ctx.restore();
 const shade=ctx.createLinearGradient(0,0,0,h);
 shade.addColorStop(0,'rgba(5,9,15,.34)');
 shade.addColorStop(.46,'rgba(5,9,15,.10)');
 shade.addColorStop(1,'rgba(5,9,15,.55)');
 ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
}
function paintFocus(ctx,image,plan){
 const {x,y,size}=plan.focus,sw=image.naturalWidth,sh=image.naturalHeight;
 const crop=coverCrop(sw,sh);
 ctx.save();
 ctx.shadowColor='rgba(0,0,0,.52)';
 ctx.shadowBlur=Math.min(35,size*.045);
 ctx.shadowOffsetY=Math.min(16,size*.018);
 ctx.fillStyle='rgba(8,12,18,.48)';
 ctx.fillRect(x,y,size,size);
 ctx.restore();
 ctx.save();
 ctx.beginPath();
 const radius=Math.min(19,size*.025);
 if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,size,size,radius);
 else ctx.rect(x,y,size,size);
 ctx.clip();
 ctx.drawImage(image,crop.x,crop.y,crop.size,crop.size,x,y,size,size);
 ctx.restore();
 ctx.strokeStyle='rgba(255,255,255,.20)';
 ctx.lineWidth=.9;
 ctx.strokeRect(x+.5,y+.5,size-1,size-1);
}

export function createAlbumWallpaperPainter(canvas,{maxPixels=WALLPAPER_MAX_PIXELS}={}){
 let lastImage=null,lastOptions=null,lastPlan=null,lastPaintMs=0;
 function clear(){
  lastImage=null;lastOptions=null;lastPlan=null;
  canvas.hidden=true;
  // Give the graphics memory back when showing a procedural visual/photo.
  if(canvas.width>1||canvas.height>1){canvas.width=1;canvas.height=1}
 }
 function paint(image,options={}){
  const sourceWidth=Number(image?.naturalWidth)||0,sourceHeight=Number(image?.naturalHeight)||0;
  if(sourceWidth<=0||sourceHeight<=0)return false;
  const container=canvas.parentElement;
  const bounds=container?.getBoundingClientRect?.()||
   {width:options.width||390,height:options.height||844};
  const w=Math.max(1,Math.round(bounds.width||options.width||390));
  const h=Math.max(1,Math.round(bounds.height||options.height||844));
  const deviceDpr=Math.max(1,Number(options.dpr)||globalThis.devicePixelRatio||1);
  const plan=albumWallpaperPlan({
   sourceWidth,sourceHeight,width:w,height:h,
   dpr:deviceDpr,mode:options.mode,provider:options.provider
  });
  // CRITICAL: The true-to-source full-bleed image already lives in the
  // photo-background CSS layer underneath this canvas. Repainting it to
  // a 5.8MP canvas then stretching that canvas to a 4K/Retina screen
  // destroys effective detail. Hide the redundant canvas for fill mode.
  // This is a real display-path fix, not AI sharpening/upscaling.
  if(plan.mode==='fill'){
   canvas.hidden=true;
   if(canvas.width!==1)canvas.width=1;
   if(canvas.height!==1)canvas.height=1;
   lastImage=image;lastOptions={...options};lastPlan=plan;lastPaintMs=0;
   return true;
  }
  // Editorial mode composites custom vector ambience and a focal cover.
  // It needs a canvas, but unlike fill does not pretend to show source-native
  // detail across all display pixels. Keep this graphics budget bounded.
  const dpr=Math.min(deviceDpr,2.5,Math.sqrt(maxPixels/(w*h)));
  const pixelW=Math.max(1,Math.round(w*dpr));
  const pixelH=Math.max(1,Math.round(h*dpr));
  const context=canvas.getContext('2d',{alpha:false,desynchronized:true});
  if(!context)return false;
  try{
   const start=performance.now();
   if(canvas.width!==pixelW)canvas.width=pixelW;
   if(canvas.height!==pixelH)canvas.height=pixelH;
   context.setTransform(pixelW/w,0,0,pixelH/h,0,0);
   context.imageSmoothingEnabled=true;
   context.imageSmoothingQuality='high';
   paintAmbience(context,image,w,h,options.hue);
   paintFocus(context,image,plan);
   lastPaintMs=Math.round((performance.now()-start)*10)/10;
  }catch{return false}
  lastImage=image;lastOptions={...options};lastPlan=plan;
  canvas.hidden=false;
  return true;
 }
 function redraw(options={}){
  return lastImage?paint(lastImage,{...lastOptions,...options}):false;
 }
 function diagnostics(){
  return {
   presentation:lastPlan?.mode||'pending',
   preference:lastPlan?.preference||lastOptions?.mode||'auto',
   catalogResampleRisk:lastPlan?.catalogResampleRisk||false,
   focusCssPixels:lastPlan?.mode==='editorial'?Math.round(lastPlan.focus.size):null,
   rasterPixels:canvas.hidden?0:canvas.width*canvas.height,
   // The reported 3000x3000 is the source file, not the canvas backing
   // resolution. Explicitly distinguish the native DOM/CSS route.
   renderPath:lastPlan?.mode==='fill'?'native-css-image':
    lastPlan?.mode==='editorial'?'editorial-canvas':'pending',
   effectiveRasterDpr:canvas.hidden?null:Number(
    Math.min(canvas.width/lastPlan.width,canvas.height/lastPlan.height).toFixed(2)),
   paintedInMs:lastPaintMs
  };
 }
 return {paint,redraw,clear,diagnostics};
}
