import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {artworkCandidates,artworkBudget,resolveArtwork,clearArtworkQualityCache} from '../lib/artwork-quality.js';
import {createFullscreenController} from '../lib/fullscreen-controller.js';

const id='abcdefghijk';
test('YouTube HQ selection prefers real 1280 when available; falls back to 640 and 480',()=>{
 const raw='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
 const list=artworkCandidates(raw,{pixels:1600});
 assert.deepEqual(list.slice(0,3),[
 'https://i.ytimg.com/vi/'+id+'/maxresdefault.jpg',
 'https://i.ytimg.com/vi/'+id+'/sddefault.jpg',
 raw
 ]);
 assert.equal(artworkCandidates('https://evil.example/image.jpg',{pixels:2000})[0],'https://evil.example/image.jpg');
 assert.equal(artworkCandidates('blob:https://gnarly-web-pages.pages.dev/local')[0],'blob:https://gnarly-web-pages.pages.dev/local');
 assert.deepEqual(artworkCandidates(''),[]);
});
test('Apple Music cover URLs upgrade to real higher-resolution endpoint without altering credit/metadata',()=>{
 const orig='https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/demo/100x100bb.jpg';
 const imgs=artworkCandidates(orig,{pixels:2000});
 assert.match(imgs[0],/2000x2000bb\.jpg$/);
 assert.equal(imgs[1],orig);
 const google='https://lh3.googleusercontent.com/demo=w120-h120-l90-rj';
 assert.match(artworkCandidates(google,{pixels:1200})[0],/w1200-h1200/);
});
test('Adaptive resolution respects memory, data saver, DPR and role',()=>{
 const big={viewportWidth:1440,viewportHeight:900,dpr:2,deviceMemory:8};
 const bg=artworkBudget({role:'background',...big});
 assert.equal(bg,2400);
 assert.equal(artworkBudget({role:'background',...big,deviceMemory:2}),1120);
 assert.equal(artworkBudget({role:'background',...big,saveData:true}),800);
 assert.ok(artworkBudget({role:'thumb',...big})<=400);
 assert.ok(artworkBudget({role:'cover',...big})<=1200);
 assert.ok(artworkBudget({role:'surface',...big})<=1400);
});
test('Missing maxres never replaces a valid SD image with a tiny placeholder',async()=>{
 clearArtworkQualityCache();
 const oldImage=globalThis.Image;
 let loads=0;
 class FakeImage{
  naturalWidth=0;naturalHeight=0;
  set src(url){
   loads++;
   if(url.includes('maxresdefault')){this.naturalWidth=120;this.naturalHeight=90}
   else if(url.includes('sddefault')){this.naturalWidth=640;this.naturalHeight=480}
   else {this.naturalWidth=480;this.naturalHeight=360}
   queueMicrotask(()=>this.onload?.());
  }
 }
 globalThis.Image=FakeImage;
 try{
  const url='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
  const [first,second]=await Promise.all([
   resolveArtwork(url,{pixels:1800,minDimension:480}),
   resolveArtwork(url,{pixels:1800,minDimension:480})
  ]);
  assert.match(first,/sddefault\.jpg$/);
  assert.equal(first,second);
  assert.equal(loads,2,'in-flight requests are deduplicated');
  assert.equal(await resolveArtwork(url,{pixels:1800,minDimension:480}),first);
  assert.equal(loads,2,'bounded cache prevents duplicate fetches');
 }finally{globalThis.Image=oldImage;clearArtworkQualityCache()}
});
test('Fullscreen switches to browser API, syncs aria state, and exits',async()=>{
 const listeners=new Map(),classSet=new Set();
 const classList={contains:x=>classSet.has(x),add:x=>classSet.add(x),remove:x=>classSet.delete(x),toggle:(x,v)=>{if(v)classSet.add(x);else classSet.delete(x)}};
 const doc={body:{classList},documentElement:{classList,requestFullscreen:async()=>{doc.fullscreenElement=doc.documentElement}},fullscreenElement:null,
  exitFullscreen:async()=>{doc.fullscreenElement=null},
  addEventListener:(name,cb)=>listeners.set(name,cb)};
 const changes=[],controller=createFullscreenController(doc,{onChange:(active,native)=>changes.push({active,native})});
 assert.equal(controller.isActive(),false);
 assert.equal(await controller.toggle(),true);
 assert.equal(controller.isActive(),true);
 assert.deepEqual(changes.at(-1),{active:true,native:true});
 assert.equal(await controller.toggle(),false);
 assert.equal(controller.isActive(),false);
});
test('Safari fallback fills screen without falsely claiming browser chrome is hidden',async()=>{
 const listeners=new Map(),classSet=new Set();
 const cls={contains:x=>classSet.has(x),add:x=>classSet.add(x),remove:x=>classSet.delete(x),toggle:(x,v)=>{if(v)classSet.add(x);else classSet.delete(x)}};
 const doc={body:{classList:cls},documentElement:{classList:cls},addEventListener:(name,cb)=>listeners.set(name,cb)};
 let fallback=0;
 const ctl=createFullscreenController(doc,{onFallback:()=>fallback++});
 assert.equal(await ctl.toggle(),true);assert.equal(fallback,1);
 assert.equal(ctl.isActive(),true);
 listeners.get('keydown')({key:'Escape'});
 assert.equal(ctl.isActive(),false);
});
test('Artwork and immersive UI integrate throughout player, wallpaper, karaoke and thumbs',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../ui/karaoke-stage.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../module-dock.css',import.meta.url),'utf8');
 for(const marker of ["artPixels('cover')","artPixels('background')","artPixels('surface')","artPixels('thumb')",'resolveArtwork(']){
  assert.ok(app.includes(marker),marker);
 }
 assert.match(html,/id="fullscreen-button"/);
 assert.match(stage,/id="karaoke-stage-fullscreen"/);
 assert.match(stage,/resolveArtwork\(art/);
 assert.match(css,/html\.gnarly-fullscreen \.app-shell/);
 assert.match(app,/data-original-art/);
});
