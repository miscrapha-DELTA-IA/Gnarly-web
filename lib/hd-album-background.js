/** Progressive HD wallpaper for the selected recording.
 * Never infer HD from a CDN filename, synthesize pixels, or mix recordings.
 * Cached decisions contain only public artwork URLs and are scoped to an exact
 * track identity; audio sources, lyrics and playback are not touched.
 */
export const HD_ARTWORK_CACHE_KEY='gnarly.hd-artwork.v2';
const CACHE_LIMIT=90, CACHE_TTL=21*24*60*60*1000;
const OFFICIAL_COMPARISON_TTL=48*60*60*1000, FALLBACK_COMPARISON_TTL=20*60*1000;
const PUBLIC_ART_HOST=/(?:^|\.)(?:mzstatic\.com|dzcdn\.net|googleusercontent\.com|ytimg\.com|youtube\.com|coverartarchive\.org)$/i;
const isPublicURL=value=>{
 try{
  const url=new URL(String(value||''));
  return url.protocol==='https:'&&!url.username&&!url.password&&
    url.href.length<=1200&&PUBLIC_ART_HOST.test(url.hostname);
 }catch{return false}
};
export function artworkMemoryKey(track){
 if(!track?.id||!track?.title)return '';
 const normalized=value=>String(value||'').trim().normalize('NFKC').toLowerCase();
 return [normalized(track.source),normalized(track.id),normalized(track.title),
  normalized(track.artist),normalized(track.album),Math.round(Number(track.duration)||0)].join('|');
}
function readCache(storage){
 try{
  const value=JSON.parse(storage?.getItem(HD_ARTWORK_CACHE_KEY)||'{}');
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 }catch{return {}}
}
export function storedHDArtwork(track,storage=globalThis.localStorage){
 const key=artworkMemoryKey(track);if(!key)return null;
 const item=readCache(storage)[key];
 if(!item||!isPublicURL(item.url)||Number(item.expires)<Date.now()||
   Number(item.width)<1200||Number(item.height)<1200)return null;
 return {url:item.url,width:item.width,height:item.height,provider:item.provider||'saved'};
}
export function rememberHDArtwork(track,asset,storage=globalThis.localStorage){
 const key=artworkMemoryKey(track);
 if(!key||!asset||!isPublicURL(asset.url)||
    Number(asset.width)<1200||Number(asset.height)<1200)return false;
 try{
  const all=readCache(storage);
  const prior=all[key];
  delete all[key];
  all[key]={url:asset.url,width:asset.width,height:asset.height,
    provider:asset.provider||'',expires:Date.now()+CACHE_TTL,
    comparedAt:Number(prior?.comparedAt)||0};
  const keys=Object.keys(all);
  for(const excess of keys.slice(0,Math.max(0,keys.length-CACHE_LIMIT)))delete all[excess];
  storage?.setItem(HD_ARTWORK_CACHE_KEY,JSON.stringify(all));
  return true;
 }catch{return false}
}
function lastComparedAt(track,storage){
 const key=artworkMemoryKey(track);
 return key?Number(readCache(storage)[key]?.comparedAt)||0:0;
}
function rememberComparison(track,storage){
 const key=artworkMemoryKey(track);if(!key)return;
 try{
  const all=readCache(storage);
  const item={...(all[key]||{}),comparedAt:Date.now()};
  delete all[key];all[key]=item;
  const keys=Object.keys(all);
  for(const excess of keys.slice(0,Math.max(0,keys.length-CACHE_LIMIT)))delete all[excess];
  storage?.setItem(HD_ARTWORK_CACHE_KEY,JSON.stringify(all));
 }catch{/* disabled storage must not block the cover */}
}
export function nativeArtworkWidth(asset,viewport={}){
 const density=Math.min(3,Math.max(1,Number(viewport.dpr)||1));
 const realWidth=Number(asset?.width)||0,realHeight=Number(asset?.height)||0;
 if(realWidth<=0||realHeight<=0)return 0;
 const maxByHeight=Math.max(1,(Number(viewport.displayHeight)||844)*realWidth/realHeight);
 return Math.max(1,Math.floor(Math.min(realWidth/density,maxByHeight)));
}
export function effectiveArtworkDensity(asset,viewport={}){
 const width=Math.max(1,Number(viewport.displayWidth)||390);
 const height=Math.max(1,Number(viewport.displayHeight)||844);
 const dpr=Math.min(3,Math.max(1,Number(viewport.dpr)||1));
 return Math.min((Number(asset?.width)||0)/(width*dpr),
  (Number(asset?.height)||0)/(height*dpr));
}
const official=asset=>['apple','deezer','musicbrainz'].includes(asset?.provider)||
 /(?:^|\.)(?:mzstatic\.com|dzcdn\.net|coverartarchive\.org)$/i.test((()=>{
  try{return new URL(asset?.url).hostname}catch{return ''}
 })());
const video=asset=>/(?:^|\.)(?:ytimg\.com|youtube\.com)$/i.test((()=>{
 try{return new URL(asset?.url).hostname}catch{return ''}
})());
export function preferHDArtwork(next,previous,viewport={}){
 if(!(Number(next?.width)>0&&Number(next?.height)>0&&next?.url))return false;
 if(!(Number(previous?.width)>0&&Number(previous?.height)>0))return true;
 if(next.url===previous.url)return false;
 const a=effectiveArtworkDensity(next,viewport);
 const b=effectiveArtworkDensity(previous,viewport);
 if(official(next)&&video(previous)&&a>=b*.72)return true;
 if(video(next)&&official(previous)&&a<=b*1.35)return false;
 if(a>b*1.05)return true;
 if(a<b*.95)return false;
 return official(next)&&!official(previous)||
  (official(next)===official(previous)&&
   (next.width*next.height)>(previous.width*previous.height)*1.15);
}
/** Avoid blowing up a 720p video still across a tall Retina display.
 * When there is no real HD cover, show the entire original crisply and let
 * neutral letterboxing fill the rest of the viewport (no blur or color filter).
 */
export function coverDisplayMode(asset,viewport={}){
 if(!(Number(asset?.width)>0&&Number(asset?.height)>0))return 'contain';
 return effectiveArtworkDensity(asset,viewport)<.8?'contain':'cover';
}
export function requestedWallpaperPixels({viewport={},saveData=false,deviceMemory=8}={}){
 const demand=Math.ceil(Math.max(Number(viewport.displayWidth)||390,
  Number(viewport.displayHeight)||844)*Math.min(3,Math.max(1,Number(viewport.dpr)||1))*1.15);
 const ceiling=saveData?1400:Number(deviceMemory)<=2?1800:3200;
 return Math.min(ceiling,Math.max(2400,demand));
}
/** Renders a useful existing image first, upgrades only after genuine decoded
 * dimensions are known, and attempts an identity-verified Apple/Deezer master.
 * onCandidate may be async; callers must guard stale track/selection epochs.
 */
export async function resolveHDAlbumBackground(track,{
 resolve,lookup,onCandidate,viewport={},storage=globalThis.localStorage,
 online=true,saveData=false,deviceMemory=8
}={}){
 if(!track||typeof resolve!=='function'||!online)return null;
 const pixels=requestedWallpaperPixels({viewport,saveData,deviceMemory});
 const options={...viewport,pixels,minDimension:1200};
 const remembered=storedHDArtwork(track,storage);
 const sources=[track.backgroundArtwork,remembered?.url,track.artwork]
  .filter((url,index,list)=>typeof url==='string'&&url&&list.indexOf(url)===index);
 let best=null;
 const tryAsset=async(source,provider='')=>{
  try{
   const asset=await resolve(source,options);
   if(!(asset?.width>0&&asset?.height>0))return;
   const candidate={...asset,provider:provider||
    (source===remembered?.url?remembered.provider:source===track.artwork?track.artworkProvider:'')||''};
   if(!preferHDArtwork(candidate,best,viewport))return;
   best=candidate;
   rememberHDArtwork(track,best,storage);
   if(typeof onCandidate==='function'){
    try{Promise.resolve(onCandidate(best)).catch(()=>{})}catch{}
   }
  }catch{/* CDN unavailable; keep existing player and previous cover */}
 };
 // Memory and current cover are verified in parallel; a lower-quality
 // response arriving later cannot overwrite a sharper, already-decoded cover.
 await Promise.all(sources.slice(0,3).map(url=>tryAsset(url)));
 // Pixel dimensions alone do not prove fidelity: a 3000px CDN response
 // can be a resize of a soft master. Compare other matched catalog providers
 // at least once per recording even when the current official URL says HD.
 // Persist this bounded decision to avoid unnecessary network work on replay.
 const age=Date.now()-lastComparedAt(track,storage);
 const comparisonTTL=official(best)?OFFICIAL_COMPARISON_TTL:FALLBACK_COMPARISON_TTL;
 const needsVerifiedOfficial=typeof lookup==='function'&&
  (!Number.isFinite(age)||age>=comparisonTTL||age<0);
 if(needsVerifiedOfficial){
  try{
   const candidate=await lookup(track,{forBackground:true});
   const offered=[candidate,...(Array.isArray(candidate?.alternatives)?candidate.alternatives:[])]
    .filter(item=>item?.url);
   const unique=[...new Map(offered.map(item=>[item.url,item])).values()].slice(0,3);
   await Promise.all(unique.map(item=>tryAsset(item.url,item.provider||'')));
   rememberComparison(track,storage);
  }catch{/* best available original remains visible */}
 }
 return best;
}
