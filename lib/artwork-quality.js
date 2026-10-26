/** GNARLY adaptive artwork quality, no proxy, canvas upscaling or speculative content.
 * Artwork is upgraded only if the provider serves a REAL, decodable, larger image.
 * A small, bounded in-memory decision cache prevents repeated downloads.
 */
const MAX_CACHE=40;
const MAX_ATTEMPTS=3;
const cache=new Map();
const pending=new Map();
// The same track can appear as wallpaper, player cover, karaoke art and a row.
// Share image probes across those surfaces instead of downloading variants 4x.
const probes=new Map();
const MAX_PROBES=90;
export function artworkBudget({role='cover',viewportWidth=390,viewportHeight=844,dpr=1,saveData=false,deviceMemory=8}={}){
 const scale=Math.min(3,Math.max(1,Number(dpr)||1));
 const width=Math.max(1,Number(viewportWidth)||390);
 const height=Math.max(1,Number(viewportHeight)||844);
 const memory=Number(deviceMemory)||8;
 const cap=saveData?800:memory<=2?1120:memory<=4?1600:2400;
 const wanted=role==='thumb'?Math.min(720,Math.max(300,Math.ceil(112*scale))):
   role==='cover'?Math.min(1600,Math.max(640,Math.ceil(420*scale))):
   role==='surface'?Math.min(2000,Math.max(900,Math.ceil(700*scale))):
   role==='stage'?Math.min(2000,Math.max(900,Math.ceil(720*scale))):
   Math.min(2400,Math.max(960,Math.ceil(Math.max(width,height)*scale)));
 return Math.min(cap,wanted);
}
export function artworkCandidates(raw,{pixels=1200}={}){
 const source=String(raw||'');
 try{
  const url=new URL(source);
  if(!['http:','https:'].includes(url.protocol))return source?[source]:[];
  const host=url.hostname.toLowerCase(),n=Math.max(200,Math.min(2400,Math.ceil(pixels/100)*100));
  if(host==='i.ytimg.com'||host==='img.youtube.com'){
   const m=url.pathname.match(/^\/(vi|vi_webp)\/([A-Za-z0-9_-]{11})\/(maxresdefault|sddefault|hqdefault|mqdefault|default)(?:\.(jpg|jpeg|webp))?$/i);
   if(m){
    const path='/'+m[1]+'/'+m[2]+'/',ext='.'+(m[4]|| (m[1]==='vi_webp'?'webp':'jpg'));
    const names=n>=900?['maxresdefault','sddefault','hqdefault']:n>=520?['sddefault','hqdefault']:['hqdefault','mqdefault'];
    return [...new Set([...names.map(x=>url.origin+path+x+ext),source])].slice(0,4);
   }
  }
  if(/(?:^|\.)mzstatic\.com$/.test(host)){
   // Never replace a larger Apple URL with a smaller request, particularly
   // for thumbnails coming from the official iTunes preview catalog.
   const existing=Number(url.pathname.match(/\/(\d{2,4})x\d{2,4}bb(?:-\d+)?(?=\.(?:jpe?g|png|webp)$)/i)?.[1]||0);
   const size=Math.max(existing,400,Math.min(2400,n));
   const hi=new URL(url);
   const replaced=hi.pathname.replace(/\/\d{2,4}x\d{2,4}bb(?=(?:-\d+)?\.(?:jpe?g|png|webp)$)/i,'/'+size+'x'+size+'bb');
   if(replaced!==hi.pathname){hi.pathname=replaced;return [hi.href,source].filter((v,i,a)=>a.indexOf(v)===i)}
  }
  if(/^lh[3456]\.googleusercontent\.com$/.test(host)){
   const hi=new URL(url);
   // YouTube Music uses both =w120-h120-l90-rj and =s120-c endpoints.
   // Keep the original as a verified fallback if the large variant 404s.
   hi.pathname=hi.pathname.replace(/=(?:w\d+(?:-h\d+)?|s\d+)(?:-[^/]*)?$/i,'=w'+n+'-h'+n+'-l90-rj');
   if(hi.href!==source)return [hi.href,source];
  }
  if(host==='cdn-images.dzcdn.net'){
   const hi=new URL(url);
   hi.pathname=hi.pathname.replace(/\/\d{2,4}x\d{2,4}-\d+-\d+-\d+-\d+\.(jpg|jpeg|webp)$/i,'/'+Math.min(1200,n)+'x'+Math.min(1200,n)+'-000000-80-0-0.$1');
   if(hi.href!==source)return [hi.href,source];
  }
  return [source];
 }catch{return source?[source]:[]}
}
/** A URL labelled 'maxres' is not HD until its decoded pixel dimensions
 * prove it. This object propagates real quality metadata to all UI surfaces.
 */
function checkImage(url,{timeout=3500}={}){
 if(probes.has(url))return probes.get(url);
 const promise=new Promise(resolve=>{
  if(typeof Image==='undefined'){resolve(null);return}
  const img=new Image();img.decoding='async';
  let finished=false;const done=pass=>{
   if(finished)return;finished=true;clearTimeout(timer);
   img.onload=null;img.onerror=null;
   resolve(pass?{url,width:img.naturalWidth,height:img.naturalHeight}:null);
  };
  const timer=setTimeout(()=>done(false),timeout);
  img.onload=()=>done(img.naturalWidth>0&&img.naturalHeight>0);
  img.onerror=()=>done(false);
  img.src=url;
 });
 probes.set(url,promise);
 if(probes.size>MAX_PROBES)probes.delete(probes.keys().next().value);
 // A transient CDN failure must not poison the resolution cache for the session.
 void promise.then(asset=>{if(!asset&&probes.get(url)===promise)probes.delete(url)});
 return promise;
}

const blank=source=>({url:source,width:0,height:0,quality:'unknown',ratio:0,scale:1});
function keep(key,value){
 cache.delete(key);cache.set(key,value);
 if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
}
function measure(asset,{pixels,displayWidth,displayHeight,dpr}){
 const width=Math.max(1,Number(displayWidth)||Math.min(pixels,800));
 const height=Math.max(1,Number(displayHeight)||width);
 const density=Math.min(3,Math.max(1,Number(dpr)||1));
 // background-size:cover uses the limiting dimension, even for video
 // thumbnails cropped to square or portrait surfaces. Width alone is WRONG.
 const ratio=Math.min(asset.width/(width*density),asset.height/(height*density));
 const quality=ratio>=.95?'high':ratio>=.67?'medium':'low';
 return {...asset,quality,ratio:Math.round(ratio*100)/100,
  // Physical image width in CSS px: never enlarge a tiny JPEG to a 4K layer.
  scale:Math.max(.2,Math.min(1,asset.width/(width*density)))};
}
/** Returns the actual dimensions, not a speculative filename or fake "4K".
 * For unrecognized providers we still inspect the original source.
 * No canvas rewrite, no sharpening hallucinations and no cross-origin proxy.
 */
export async function resolveArtworkAsset(raw,options={}){
 const source=String(raw||'');if(!source)return blank('');
 const pixels=Number(options.pixels)||1200;
 const sizeW=Number(options.displayWidth)||pixels;
 const sizeH=Number(options.displayHeight)||sizeW;
 const density=Number(options.dpr)||1;
 const key=[source,pixels,options.minDimension||0,sizeW,sizeH,density].join('|');
 if(cache.has(key)){const val=cache.get(key);keep(key,val);return val}
 if(pending.has(key))return pending.get(key);
 const promise=(async()=>{
  const candidates=artworkCandidates(source,{pixels});
  const min=options.minDimension??Math.max(160,Math.min(740,Math.round(pixels*.48)));
  // Download at most four real CDN variants concurrently. The former
  // first-match logic accepted 640x480 as soon as it passed minDimension,
  // even when a 1200+ image existed later in the candidate list.
  const urls=[...new Set(candidates)].slice(0,MAX_ATTEMPTS+1);
  const checked=await Promise.all(urls.map(url=>checkImage(url)));
  const measured=checked.filter(Boolean).map(asset=>measure(asset,{
   pixels,displayWidth:sizeW,displayHeight:sizeH,dpr:density
  }));
  const viable=measured.filter(asset=>asset.width>=min&&asset.height>=Math.min(200,min));
  const available=viable.length?viable:measured;
  // Prefer the sharpest effective pixels after background-size:cover cropping.
  // For equivalent sharpness prefer more genuine pixel area, never the URL name.
  available.sort((a,b)=>b.ratio-a.ratio||(b.width*b.height-a.width*a.height));
  const chosen=available[0]||blank(source);
  keep(key,chosen);return chosen;
 })();
 pending.set(key,promise);
 try{return await promise}finally{pending.delete(key)}
}
/** API compatibility: the rest of GNARLY can still ask for a plain URL. */
export async function resolveArtwork(raw,options={}){
 const asset=await resolveArtworkAsset(raw,options);
 return asset.url||String(raw||'');
}
export function preferredArtworkSource(track){
 return typeof track?.artwork==='string'&&track.artwork?track.artwork:'';
}
export function clearArtworkQualityCache(){cache.clear();pending.clear();probes.clear()}
