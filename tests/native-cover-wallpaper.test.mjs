import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeCoverWallpaper} from '../lib/native-cover-wallpaper.js';

function harness(){
 const scheduled=[],created=[],children=[],pending=new Map();
 const container={appendChild(img){
  children.push(img);img.parent=container;
 }};
 const makeImage=()=>{
  const img={naturalWidth:0,naturalHeight:0,complete:false,onload:null,onerror:null,
   classList:{values:new Set(),add(value){this.values.add(value)}},
   remove(){const index=children.indexOf(this);if(index>=0)children.splice(index,1);this.removed=true},
   set src(value){this._src=value;pending.set(value,this)},
   get src(){return this._src}};
  created.push(img);return img;
 };
 const surface=createNativeCoverWallpaper(container,{
  createImage:makeImage,schedule:(fn,ms)=>scheduled.push({fn,ms})
 });
 const resolve=(url,width=2400,height=2400)=>{
  const img=pending.get(url);assert.ok(img,'image request for '+url);
  img.naturalWidth=width;img.naturalHeight=height;img.complete=true;
  img.onload?.();
  return img;
 };
 return {surface,created,children,pending,resolve,scheduled};
}
test('album wallpaper keeps native pixels; a slower HD request never blanks the previous image',async()=>{
 const h=harness(),seen=[];
 const first=h.surface.show('https://covers.example/first.jpg',{
  onCommit:img=>seen.push(img.src)});
 assert.equal(h.children.length,0,'the image has not loaded');
 const old=h.resolve('https://covers.example/first.jpg',1200,1200);
 assert.equal(await first,true);
 assert.equal(h.children.length,1);
 const upgrade=h.surface.show('https://covers.example/ultra.jpg',{
  shouldCommit:img=>img.naturalWidth>=2000,onCommit:img=>seen.push(img.src)});
 assert.equal(h.children[0],old,'first bitmap remains visible during HD download');
 assert.equal(h.surface.diagnostics().pendingImages,1);
 h.resolve('https://covers.example/ultra.jpg',3200,3200);
 assert.equal(await upgrade,true);
 assert.equal(h.surface.diagnostics().renderPath,'native-img-scaled-to-fill');
 assert.equal(h.surface.diagnostics().activePixels,'3200x3200');
 assert.deepEqual(seen,['https://covers.example/first.jpg','https://covers.example/ultra.jpg']);
 assert.equal(h.scheduled.length,1);
 h.scheduled[0].fn();assert.equal(h.children.length,1);
 assert.equal(h.children[0].src,'https://covers.example/ultra.jpg');
 assert.equal(h.created.some(img=>typeof img.decode==='function'),false,
  'no secondary decode() gate or canvas is required');
});
test('lower quality or failed image cannot displace a native displayed master',async()=>{
 const h=harness();
 const init=h.surface.show('https://covers.example/master.jpg');
 h.resolve('https://covers.example/master.jpg',3000,3000);await init;
 const rejected=h.surface.show('https://covers.example/tiny.jpg',{
  shouldCommit:img=>img.naturalWidth>=3000});
 h.resolve('https://covers.example/tiny.jpg',480,480);
 assert.equal(await rejected,false);
 assert.equal(h.children.length,1);
 assert.equal(h.children[0].src,'https://covers.example/master.jpg');
 const failed=h.surface.show('https://covers.example/missing.jpg');
 h.pending.get('https://covers.example/missing.jpg').onerror?.();
 assert.equal(await failed,false);
 assert.equal(h.children[0].src,'https://covers.example/master.jpg');
});
test('same URL from shared player cache does not create another image',async()=>{
 const h=harness();
 const first=h.surface.show('https://covers.example/current.jpg');
 h.resolve('https://covers.example/current.jpg');await first;
 let repeats=0;
 assert.equal(await h.surface.show('https://covers.example/current.jpg',{onCommit:()=>repeats++}),true);
 assert.equal(repeats,1);
 assert.equal(h.created.length,1);
});
test('leaving album mode cancels pending requests and releases native layers',async()=>{
 const h=harness();
 const first=h.surface.show('https://covers.example/current.jpg');
 h.resolve('https://covers.example/current.jpg');await first;
 const pending=h.surface.show('https://covers.example/slow.jpg');
 h.surface.clear();
 assert.equal(await pending,false);
 assert.equal(h.children.length,0);
 assert.equal(h.surface.diagnostics().renderPath,'native-img-pending');
});
test('main player uses immediate native cover rather than editorial canvas and keeps visual theme independent',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(app,/createNativeCoverWallpaper\(\$\('#photo-background'\)\)/);
 assert.match(app,/nativeCoverWallpaper\.show\(asset\.url/);
 assert.match(app,/nativeCoverWallpaper\.clear\(\)/);
 assert.match(app,/const fastSource=safeSurfaceArtwork\(track\.artwork\|\|source\)/);
 assert.doesNotMatch(app,/wallpaperPainter\.paint\(/);
 assert.doesNotMatch(app,/>Editorial<\/button>/);
 assert.match(css,/\.photo-background>\.gnarly-native-album-image/);
 assert.match(css,/object-fit:cover/);
});
