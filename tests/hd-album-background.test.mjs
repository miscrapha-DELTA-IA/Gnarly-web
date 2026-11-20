import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 HD_ARTWORK_CACHE_KEY,artworkMemoryKey,rememberHDArtwork,storedHDArtwork,
 effectiveArtworkDensity,preferHDArtwork,requestedWallpaperPixels,
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
 assert.match(app,/preferHDArtwork\(asset,displayedAsset,viewport\)/);
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background \{[\s\S]*?filter:none;/);
 assert.doesNotMatch(app,/track\.url\s*=\s*asset\.url/);
});
