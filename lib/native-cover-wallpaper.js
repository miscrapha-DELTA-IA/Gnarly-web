/**
 * Native album wallpaper, based on NightcoreLab's cached WebImage.scaledToFill.
 * The DOM owns the full-resolution decoded <img>, never an intermediate canvas,
 * filter texture or CSS background snapshot. New requests load OFFSCREEN;
 * the last usable image stays visible until the replacement is ready.
 */
export function createNativeCoverWallpaper(container,{
 createImage=()=>new Image(),
 schedule=(fn,ms)=>setTimeout(fn,ms),
 transitionMs=160
}={}){
 let active=null,epoch=0,shown=0;
 const pending=new Map();
 const clean=image=>{
  if(!image)return;
  image.onload=null;image.onerror=null;
  image.remove?.();
 };
 function clear(){
  ++epoch;
  for(const [image,finish] of pending){
   clean(image);finish(false);
  }
  pending.clear();clean(active);active=null;
 }
 function show(url,{shouldCommit=()=>true,onCommit=()=>{},priority='auto'}={}){
  const source=String(url||'');
  if(!source)return Promise.resolve(false);
  if(active?.src===source&&active.naturalWidth>0){
   if(!shouldCommit(active))return Promise.resolve(false);
   onCommit(active);return Promise.resolve(true);
  }
  const token=epoch;
  return new Promise(resolve=>{
   const image=createImage();let settled=false;
   const finish=success=>{
    if(settled)return;
    settled=true;pending.delete(image);
    image.onload=null;image.onerror=null;
    if(!success||token!==epoch||!image.naturalWidth||!image.naturalHeight||
       !shouldCommit(image)){
     image.remove?.();resolve(false);return;
    }
    image.className='gnarly-native-album-image';
    image.alt='';
    image.draggable=false;
    // Append only after the browser has loaded actual pixels. The previous
    // album is never hidden while a CDN is resolving a larger candidate.
    const previous=active;
    container.appendChild(image);
    active=image;shown++;
    if(previous&&previous!==image){
     previous.classList?.add('gnarly-native-album-outgoing');
     schedule(()=>{if(previous!==active)clean(previous)},transitionMs);
    }
    try{onCommit(image)}catch{/* Artwork metadata cannot interrupt the player. */}
    resolve(true);
   };
   image.onload=()=>finish(true);
   image.onerror=()=>finish(false);
   image.decoding='async';image.loading='eager';image.fetchPriority=priority;
   pending.set(image,resolve);
   image.src=source;
   // Cache hits can already be complete. Wait for the microtask to avoid
   // breaking the caller's current synchronous player-selection path.
   if(image.complete&&image.naturalWidth>0)queueMicrotask(()=>finish(true));
  });
 }
 return {show,clear,
  diagnostics:()=>({renderPath:active?'native-img-scaled-to-fill':'native-img-pending',
   activePixels:active?(active.naturalWidth+'x'+active.naturalHeight):null,
   pendingImages:pending.size,commits:shown})};
}
