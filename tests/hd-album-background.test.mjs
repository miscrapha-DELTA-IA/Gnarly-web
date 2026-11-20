import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 HD_ARTWORK_CACHE_KEY,artworkMemoryKey,rememberHDArtwork,storedHDArtwork,
 effectiveArtworkDensity,preferHDArtwork,isVerifiedArchivalOriginal,coverDisplayMode,usableCoverForPortraitWallpaper,requestedWallpaperPixels,
 resolveHDAlbumBackground
} from '../lib/hd-album-background.js';
import {artworkCandidates,resolveArtworkAsset,clearArtworkQualityCache} from '../lib/artwork-quality.js';
import {shouldLookupAlbumArtwork} from '../lib/album-artwork-client.js';

const original={
 id:'youtube:abcdefghijk',source:'youtube',title:'Get Lucky',artist:'Daft Punk',
 album:'Random Access Memories',duration:248,
 artwork:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'
};
const viewport={displayWidth:390,displayHeight:844,dpr:3};
const store=()=>{
 const values=new Map();
 return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),
  get data(){return JSON.parse(values.get(HD_ARTWORK_CACHE_KEY)||'{}')}};
};
test('persist only actual large public artwork for exact recording; never share by title alone',()=>{
 const storage=store();
 assert.equal(rememberHDArtwork(original,{url:original.artwork,width:1280,height:720},storage),false);
 assert.equal(rememberHDArtwork(original,{url:'https://example.org/private.jpg',width:2400,height:2400},storage),false);
 const master={url:'https://is1-ssl.mzstatic.com/image/thumb/demo/3000x3000bb.jpg',width:3000,height:3000,provider:'apple'};
 assert.equal(rememberHDArtwork(original,master,storage),true);
 assert.equal(storedHDArtwork(original,storage).url,master.url);
 assert.equal(storedHDArtwork({...original,id:'youtube:another-id'},storage),null);
 assert.equal(storedHDArtwork({...original,title:'Get Lucky - Live'},storage),null);
 assert.ok(artworkMemoryKey(original).includes('daft punk'));
});
test('portrait DPR considers real height; official album art beats low-res video thumbnail',()=>{
 const video={url:original.artwork,width:1280,height:720,provider:''};
 const official={url:'https://is1-ssl.mzstatic.com/image/thumb/a/2400x2400bb.jpg',width:2400,height:2400,provider:'apple'};
 assert.ok(effectiveArtworkDensity(video,viewport)<.3);
 assert.ok(effectiveArtworkDensity(official,viewport)>.9);
 assert.equal(preferHDArtwork(official,video,viewport),true);
 assert.equal(preferHDArtwork(video,official,viewport),false);
 assert.equal(preferHDArtwork({...video,width:120,height:90},video,viewport),false);
});
test('portrait official 1200px album cover may replace a 1080p landscape video still on desktop',()=>{
 const desktop={displayWidth:1920,displayHeight:1080,dpr:1};
 const video={url:original.artwork,width:1920,height:1080,provider:'youtube'};
 const official={url:'https://is1-ssl.mzstatic.com/image/thumb/a/1200x1200bb.jpg',
  width:1200,height:1200,provider:'apple'};
 assert.equal(preferHDArtwork(official,video,desktop),true,
  'verified square album artwork should beat a landscape video if the adaptive painter avoids huge enlargement');
 assert.equal(preferHDArtwork(video,official,desktop),false,
  'do not reinstate a video placeholder over the verified album cover');
});
test('pixel demand supports 3K Retina while honoring Save Data and 2GB memory devices',()=>{
 assert.ok(requestedWallpaperPixels({viewport})>=2900);
 assert.equal(requestedWallpaperPixels({viewport,saveData:true}),1400);
 assert.equal(requestedWallpaperPixels({viewport,deviceMemory:2}),1800);
});
test('progressive resolver delivers fallback, then official HD, persists and reuses across sessions',async()=>{
 const storage=store(),shown=[],calls=[],requested=[];
 const lookup=async track=>{
  assert.equal(track.id,original.id);
  requested.push(track.id);
  return {url:'https://is1-ssl.mzstatic.com/image/thumb/demo/2400x2400bb.jpg',provider:'apple'};
 };
 const resolve=async (url,options)=>{
  calls.push({url,pixels:options.pixels});
  if(url.includes('mzstatic'))return {url,width:3000,height:3000,quality:'high'};
  return {url,width:1280,height:720,quality:'low'};
 };
 const result=await resolveHDAlbumBackground(original,{
  resolve,lookup,onCandidate:asset=>shown.push(asset),viewport,storage
 });
 assert.equal(requested.length,1);
 assert.equal(shown.length,2);
 assert.match(shown[0].url,/ytimg/);
 assert.match(result.url,/mzstatic/);
 assert.equal(storedHDArtwork(original,storage)?.url,result.url);
 assert.ok(calls.every(x=>x.pixels>=2900));
 // A new session sees the verified master and does not need to query again.
 const second=await resolveHDAlbumBackground(original,{
  resolve,lookup:async()=>{throw Error('should not query verified HD again')},
  viewport,storage
 });
 assert.equal(second.url,result.url);
});
test('a slow low-res callback cannot replace a more detailed candidate',async()=>{
 const storage=store(),callbacks=[];
 const upgraded={...original,backgroundArtwork:'https://i.ytimg.com/vi/abcdefghijk/sddefault.jpg'};
 const result=await resolveHDAlbumBackground(upgraded,{
  storage,viewport,
  resolve:async url=>{
   if(url.includes('sddefault')){
    await new Promise(done=>setTimeout(done,8));
    return {url,width:640,height:480,quality:'low'};
   }
   return {url,width:1800,height:1800,quality:'high'};
  },
  lookup:async()=>null,
  onCandidate:asset=>callbacks.push(asset.url)
 });
 assert.match(result.url,/hqdefault/);
 assert.equal(callbacks.length,1,'late SD thumbnail must not beat sharper cover');
});
test('genuinely offline never performs album API requests',async()=>{
 const resolved=await resolveHDAlbumBackground(original,{
  online:false,resolve:()=>{throw Error('offline should not resolve')},
  lookup:()=>{throw Error('offline should not look up')}
 });
 assert.equal(resolved,null);
});
test('Apple 3200px request falls back to genuine 2400px image if CDN rejects ultra size',async()=>{
 const url='https://is1-ssl.mzstatic.com/image/thumb/demo/100x100bb.jpg';
 const candidates=artworkCandidates(url,{pixels:3200});
 assert.match(candidates[0],/3200x3200bb/);
 assert.match(candidates[1],/2400x2400bb/);
 clearArtworkQualityCache();
 const previous=globalThis.Image;
 class MockImage{
  naturalWidth=0;naturalHeight=0;
  set src(value){
   this.naturalWidth=value.includes('3200x3200')?0:value.includes('2400x2400')?2400:100;
   this.naturalHeight=this.naturalWidth;
   queueMicrotask(()=>this.naturalWidth?this.onload?.():this.onerror?.());
  }
 }
 globalThis.Image=MockImage;
 try{
  const asset=await resolveArtworkAsset(url,{pixels:3200,minDimension:1400,...viewport});
  assert.match(asset.url,/2400x2400bb/);
  assert.equal(asset.width,2400);
  assert.equal(asset.height,2400);
 }finally{globalThis.Image=previous;clearArtworkQualityCache()}
});
test('official verification can be forced for a low-res existing official cover',()=>{
 const apple={...original,artworkProvider:'apple',artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/300x300bb.jpg'};
 assert.equal(shouldLookupAlbumArtwork(apple),false);
 assert.equal(shouldLookupAlbumArtwork(apple,{forBackground:true}),true);
 assert.equal(shouldLookupAlbumArtwork({...apple,source:'preview'},{forBackground:true}),false);
});
test('GNARLY background wires HD resolver while leaving original-color CSS and playback unchanged',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(app,/resolveHDAlbumBackground\(track,/);
 assert.match(app,/lookup:requestVerifiedAlbumArtwork/);
 assert.match(app,/backgroundArtVersion/);
 assert.match(app,/preferHDArtwork\(real,displayedAsset,viewport\)/);
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background \{[\s\S]*?filter:none;/);
 assert.doesNotMatch(app,/track\.url\s*=\s*asset\.url/);
});

test('Retina quality labels do not miniaturize the full-bleed wallpaper',()=>{
 const weak={url:original.artwork,width:1280,height:720,provider:'youtube'};
 const square={url:'https://is1-ssl.mzstatic.com/image/thumb/a/2400x2400bb.jpg',
  width:2400,height:2400,provider:'apple'};
 assert.equal(coverDisplayMode(weak,viewport),'contain','a weak source is still identified as pixel-limited');
 assert.equal(coverDisplayMode(square,viewport),'cover');
 assert.equal(coverDisplayMode(null,viewport),'contain');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background\[data-art-layout="cover"\]\{[\s\S]*?background-size:cover!important;/);
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background \{[\s\S]*?filter:none;/);
 assert.doesNotMatch(css,/--gnarly-native-art-width/);
});
test('HD search compares Apple and Deezer masters rather than trusting the first catalog',async()=>{
 const storage=store();
 const apple='https://is1-ssl.mzstatic.com/image/thumb/demo/100x100bb.jpg';
 const deezer='https://cdn-images.dzcdn.net/images/cover/demo/1200x1200-000000-80-0-0.jpg';
 const result=await resolveHDAlbumBackground(original,{
  storage,viewport,
  resolve:async url=>url===apple?{url,width:1000,height:1000}:
   url===deezer?{url,width:2500,height:2500}:
   {url,width:1280,height:720},
  lookup:async()=>({url:apple,provider:'apple',alternatives:[
   {url:apple,provider:'apple'},{url:deezer,provider:'deezer'}]})
 });
 assert.equal(result.url,deezer);
 assert.equal(storedHDArtwork(original,storage)?.url,deezer);
});
test('the background UI keeps full-bleed framing even for a pixel-limited original',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const small={url:original.artwork,width:640,height:360};
 assert.equal(coverDisplayMode(small,viewport),'contain');
 assert.match(app,/photo\.dataset\.artLayout='cover'/);
 assert.match(app,/photo\.dataset\.artSourceLimited=String\(sourceQuality==='contain'\)/);
 assert.match(app,/Resolução carregada:/);
 assert.match(app,/A fonte disponível tem menos pixels do que a tela exige/);
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background \{[\s\S]*?background-size:cover!important;/);
 assert.doesNotMatch(css,/--gnarly-native-art-width|background-size:min\(100%,var\(/);
 assert.doesNotMatch(app,/nativeArtworkWidth|--gnarly-native-art-width/);
});

test('a large URL is not treated as proof that all official sources were compared',async()=>{
 const storage=store(),calls=[];
 const track={...original,artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/3000x3000bb.jpg',
  artworkProvider:'apple'};
 const resolve=async url=>({url,width:url.includes('mzstatic')?3000:1200,
  height:url.includes('mzstatic')?3000:1200});
 const lookup=async()=>{calls.push('lookup');return {url:'https://cdn-images.dzcdn.net/images/cover/demo/1200x1200.jpg',provider:'deezer'}};
 await resolveHDAlbumBackground(track,{storage,viewport,resolve,lookup});
 assert.deepEqual(calls,['lookup'],'all providers should be compared even when a CDN claims 3000px');
 await resolveHDAlbumBackground(track,{storage,viewport,resolve,lookup});
 assert.equal(calls.length,1,'the result of a recent comparison is reused');
});
test('nonessential image fetches do not compete with native first playing on selection',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function scheduleVisualArtwork\(track,run\)/);
 assert.match(app,/pendingArtworkTasks\.push\(\{track,selection:playbackSelection,run\}\)/);
 assert.match(app,/pendingArtworkTimer=setTimeout\(flushPendingArtwork,6500\)/);
 assert.match(app,/tdr\.playing\(playbackSelection,[\s\S]*?setTimeout\(flushPendingArtwork,250\)/);
 assert.match(app,/discardPendingArtwork\(\);\s*playbackSelection\+\+/);
 assert.match(app,/scheduleVisualArtwork\(track,\(\)=>void resolveHDAlbumBackground\(track,/);
 assert.match(app,/scheduleVisualArtwork\(track,\(\)=>\{void loadArtworkHue\(track\);void enrichOfficialAlbumArt\(track\)\}/);
 assert.match(app,/storedHDArtwork\(item,localStorage\)/);
});

test('main thumbnail uses verified album master immediately and still probes for higher image quality',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function preferredVisibleCover\(track,raw,\{upgrade=true\}=\{\}\)/);
 assert.match(app,/const stored=storedHDArtwork\(track,localStorage\)/);
 assert.match(app,/const chosen=preferredVisibleCover\(track,cover\)/);
 assert.match(app,/image\.src=chosen/);
 assert.match(app,/if\(cover!==icon&&navigator\.onLine\)void resolveArtworkAsset\(chosen,/);
 assert.doesNotMatch(app,/if\(cover!==icon&&navigator\.onLine\)scheduleVisualArtwork\(track,\(\)=>void resolveArtworkAsset\(cover,/);
 assert.match(app,/scheduleVisualArtwork\(track,\(\)=>void resolveHDAlbumBackground\(track,/,
  'defer only heavy wallpaper work to preserve TDR');
});

test('official HD lookup starts without waiting for slow 720p source probes',async()=>{
 const storage=store(),events=[];
 let releaseSource;
 const slow=new Promise(resolve=>releaseSource=resolve);
 const verified='https://is1-ssl.mzstatic.com/image/thumb/release/3200x3200bb.jpg';
 const operation=resolveHDAlbumBackground(original,{
  storage,viewport,
  resolve:async url=>{
   if(url.includes('ytimg')){events.push('thumbnail_started');await slow;return{url,width:1280,height:720}}
   return {url,width:3200,height:3200};
  },
  lookup:async()=>{events.push('catalog_started');return{url:verified,provider:'apple'}},
  onCandidate:asset=>events.push(asset.url)
 });
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(events.includes('catalog_started'),
  'verified full-resolution search must not wait for a thumbnail CDN timeout');
 assert.ok(events.includes(verified));
 releaseSource();
 assert.equal((await operation).url,verified);
});

test('portrait wallpaper reuses a real square player cover, not a pixelated 720p video still',()=>{
 assert.equal(usableCoverForPortraitWallpaper({url:original.artwork,width:1280,height:720}),false);
 assert.equal(usableCoverForPortraitWallpaper({url:original.artwork,width:640,height:360}),false);
 assert.equal(usableCoverForPortraitWallpaper({url:'https://lh3.googleusercontent.com/a=s1200-c',width:1200,height:1200}),true);
 assert.equal(usableCoverForPortraitWallpaper({url:'https://is1-ssl.mzstatic.com/a.jpg',width:2400,height:2400}),true);
 assert.equal(usableCoverForPortraitWallpaper({url:'https://is1-ssl.mzstatic.com/a.jpg',width:1000,height:1000}),false);
 assert.equal(usableCoverForPortraitWallpaper({url:'',width:3200,height:3200}),false);
});
test('simultaneous lower-resolution probes cannot overwrite the real cached album master',()=>{
 const storage=store(),master={url:'https://is1-ssl.mzstatic.com/image/thumb/demo/3200x3200bb.jpg',
  width:3200,height:3200,provider:'apple'};
 const weaker={url:'https://cdn-images.dzcdn.net/images/cover/demo/1200x1200.jpg',
  width:1200,height:1200,provider:'deezer'};
 assert.equal(rememberHDArtwork(original,master,storage),true);
 assert.equal(rememberHDArtwork(original,weaker,storage),false);
 assert.deepEqual(storedHDArtwork(original,storage)?.url,master.url);
});
test('verified high-resolution cache is offered before new slow network image probes',async()=>{
 const storage=store(),seen=[];
 const master={url:'https://is1-ssl.mzstatic.com/image/thumb/demo/2400x2400bb.jpg',
  width:2400,height:2400,provider:'apple'};
 rememberHDArtwork(original,master,storage);
 let finish;
 const barrier=new Promise(resolve=>finish=resolve);
 const operation=resolveHDAlbumBackground(original,{
  storage,viewport,
  lookup:undefined,
  resolve:async url=>{await barrier;return {...master,url}},
  onCandidate:asset=>seen.push({url:asset.url,alreadyLoaded:asset.alreadyLoaded})
 });
 assert.equal(seen[0]?.url,master.url,'warm cached cover should be offered synchronously');
 assert.equal(seen[0]?.alreadyLoaded,undefined,
  'persisted artwork must still pass browser image availability check');
 finish();
 await operation;
});
test('browser handoff uses the already-loaded player image and preserves the best art across metadata updates',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function offerLoadedPlayerCoverToWallpaper\(track,image\)/);
 assert.match(app,/if\(!usableCoverForPortraitWallpaper\(asset\)\)\{/);
 assert.match(app,/void accept\.offer\(\{\.\.\.asset,provider,alreadyLoaded:true,image\}\)/);
 assert.match(app,/void accept\.offer\(\{\.\.\.asset,provider,alreadyLoaded:true,image,provisional:true\}\)/);
 assert.match(app,/image\.onload=\(\)=>\{/);
 assert.match(app,/let displayedAsset=backgroundDisplayedAsset/);
 assert.match(app,/if\(!displayedAsset&&source&&photo\.style\.backgroundImage/);
 assert.match(app,/nativeCoverWallpaper.show\(asset.url/);
 assert.doesNotMatch(app,/if\(img\.decode\)await img\.decode\(\)/);
 assert.match(app,/rememberHDArtwork\(track,real,localStorage\)/);
 assert.match(app,/backgroundArtAccept=\{track,offer:showCandidate\}/);
 assert.match(app,/scheduleVisualArtwork\(track,\(\)=>void resolveHDAlbumBackground\(track,/,
  'only heavy network search should wait for native audio playing');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background \{[\s\S]*?background-size:cover!important;/);
});

test('fast verified catalog cover is displayed before MusicBrainz archival validation settles',async()=>{
 const storage=store(),seen=[];
 let finishArchive;
 const archiveWait=new Promise(resolve=>finishArchive=resolve);
 const appleURL='https://is1-ssl.mzstatic.com/image/thumb/early/2400x2400bb.jpg';
 const caaURL='https://coverartarchive.org/release/11111111-2222-3333-4444-555555555555/front';
 const operation=resolveHDAlbumBackground(original,{
  storage,viewport,
  resolve:async(url,options)=>{
   const asset=url.includes('mzstatic')?{url,width:2400,height:2400}:
    url.includes('coverartarchive')?{url,width:3200,height:3200}:
    {url,width:1280,height:720};
   options.onCandidate?.(asset);
   return asset;
  },
  lookup:async(_track,options)=>{
   options.onCandidate?.({url:appleURL,provider:'apple'});
   await archiveWait;
   return {url:caaURL,provider:'musicbrainz'};
  },
  onCandidate:asset=>seen.push(asset.url)
 });
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(seen.includes(appleURL),
  'Apple 2400px cover must be promoted while MusicBrainz still works');
 assert.ok(!seen.includes(caaURL));
 finishArchive();
 assert.equal((await operation).url,caaURL);
 assert.ok(seen.includes(caaURL));
});
test('a transient failed catalog lookup can be retried rather than cached as a successful comparison',async()=>{
 const storage=store();let calls=0;
 const opts={
  storage,viewport,
  resolve:async url=>({url,width:1280,height:720}),
  lookup:async()=>{calls++;return null}
 };
 await resolveHDAlbumBackground(original,opts);
 await resolveHDAlbumBackground(original,opts);
 assert.equal(calls,2,
  'no valid HD source means the expensive 20h comparison-success TTL is not written');
 assert.equal(Object.keys(storage.data).length,0);
});
test('local artwork diagnostics disclose actual physical upscale, not fictitious resolution',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/window\.gnarlyArtworkDiagnostics=\(\)=>\{/);
 assert.match(app,/nativePixelCoverage:Number\(density\.toFixed\(2\)\)/);
 assert.match(app,/physicalUpscale:density>0/);
 assert.match(app,/firstVerifiedMs:wallpaperTiming\.firstVerifiedAt/);
 assert.match(app,/requestedLongEdge:requestedWallpaperPixels/);
 assert.doesNotMatch(app,/window\.gnarlyArtworkDiagnostics=.*sourceURL/);
});

test('verified recording release original wins over an inflated catalog 3000px master when sufficiently large',()=>{
 const viewport={displayWidth:1440,displayHeight:900,dpr:1};
 const apple={url:'https://is1-ssl.mzstatic.com/image/thumb/demo/3200x3200bb.jpg',
  width:3200,height:3200,provider:'apple'};
 const archive={url:'https://coverartarchive.org/release/99ab0b8f-3467-42bc-87d5-276e7b5b0d0b/front',
  width:2200,height:2200,provider:'musicbrainz'};
 assert.equal(isVerifiedArchivalOriginal(archive),true);
 assert.equal(preferHDArtwork(archive,apple,viewport),true,
  'verified original is sharper than advertised dimensions of a re-encoded catalog image');
 assert.equal(preferHDArtwork(apple,archive,viewport),false,
  'a 3200px CDN resize must not undo the original without a material pixel advantage');
 const thumbnail={...archive,url:archive.url+'-1200',width:1200,height:1200};
 assert.equal(isVerifiedArchivalOriginal(thumbnail),false);
 assert.equal(preferHDArtwork(thumbnail,apple,viewport),false);
 const tiny={...archive,width:700,height:700};
 assert.equal(preferHDArtwork(tiny,apple,viewport),false);
});
test('background lookup checks verified archival cover even when two storefronts supplied large artworks',async()=>{
 const {requestVerifiedAlbumArtwork}=await import('../lib/album-artwork-client.js');
 const old=globalThis.fetch;
 const seen=[];
 const input={source:'youtube',id:'youtube:raretest1234',
  title:'Fidelity Test Unique 2026',artist:'Original Demo Artist 2026',album:'Fidelity Test Album 2026',duration:208,
  artwork:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'};
 const catalog=[
  {artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/3200x3200bb.jpg',provider:'apple'},
  {artwork:'https://cdn-images.dzcdn.net/images/cover/demo/1200x1200-000000-80-0-0.jpg',provider:'deezer'}
 ];
 const archive='https://coverartarchive.org/release/99ab0b8f-3467-42bc-87d5-276e7b5b0d0b/front';
 globalThis.fetch=async url=>{
  const mode=new URL(String(url),'https://gnarly.test').searchParams.get('mode');
  seen.push(mode);
  if(mode==='archive')return Response.json({artwork:archive,provider:'musicbrainz',candidates:[{artwork:archive,provider:'musicbrainz'}]});
  return Response.json({artwork:catalog[0].artwork,provider:'apple',candidates:catalog});
 };
 try{
  const emitted=[];
  const result=await requestVerifiedAlbumArtwork(input,{forBackground:true,onCandidate:entry=>emitted.push(entry)});
  assert.deepEqual(seen.sort(),['archive','catalog']);
  assert.equal(result.alternatives.some(item=>item.url===archive),true);
  assert.equal(emitted.some(item=>item?.provider==='musicbrainz'),true);
 }finally{globalThis.fetch=old}
});
