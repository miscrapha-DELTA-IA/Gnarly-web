import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IPOD_SKIN_MAX_BYTES,validIPodSkin,createIPodSkinStore,ipodSourceLabel}
 from '../ui/ipod-mode.js';
import {PLAYER_SURFACE_MODES,renderPlayerSurfaceMenu,normalizePlayerSurfaceMode}
 from '../ui/player-surface.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../ipod-mode.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function memoryFactory(){
 const items=new Map();
 const db={
  objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
  transaction(){
   const tx={oncomplete:null,onerror:null,onabort:null,error:null,
    objectStore(){
     const req=value=>{
      const r={result:value,onsuccess:null,onerror:null,error:null};
      queueMicrotask(()=>{r.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.())});
      return r;
     };
     return {
      get(key){return req(items.get(key))},
      put(value,key){items.set(key,value);return req(key)},
      delete(key){items.delete(key);return req(undefined)}
     };
    }
   };
   return tx;
  }
 };
 return {open(){const req={result:db,onsuccess:null,onerror:null,error:null};
  queueMicrotask(()=>req.onsuccess?.());return req;}};
}

test('iPod is opt-in, never replaces turbulent or visual modes',()=>{
 assert.ok(PLAYER_SURFACE_MODES.includes('ipod'));
 assert.equal(normalizePlayerSurfaceMode('ipod'),'ipod');
 assert.equal(normalizePlayerSurfaceMode('invalid'),'turbulent');
 assert.equal((renderPlayerSurfaceMenu('ipod').match(/role="menuitemradio"/g)||[]).length,5);
 assert.doesNotMatch(renderPlayerSurfaceMenu('ipod'),/Importar arte do Canva|import-ipod-skin/);
 assert.doesNotMatch(renderPlayerSurfaceMenu('frosted'),/Importar arte do Canva|import-ipod-skin/);
 assert.match(renderPlayerSurfaceMenu('ipod',{skinInstalled:true}),/reset-ipod-skin/);
 assert.doesNotMatch(app,/ipod-skin-import|import-ipod-skin/);
 assert.match(app,/app\.dataset\.playerSurfaceMode=mode/);
 assert.match(app,/setSetting\('playerSurfaceMode',mode\)/);
 assert.match(app,/state\.backgroundMode/);
});
test('skin import stores the actual user image bytes, not remote URLs',async()=>{
 const store=createIPodSkinStore(memoryFactory());
 const art=new Blob([new Uint8Array(12*1024)],{type:'image/png'});
 assert.equal(validIPodSkin(art),true);
 await store.save(art);
 const loaded=await store.get();
 assert.ok(loaded instanceof Blob);
 assert.equal(loaded.size,art.size);
 await store.remove();
 assert.equal(await store.get(),undefined);
});
test('reject huge, empty and non-image uploads',()=>{
 assert.equal(validIPodSkin(new Blob([new Uint8Array(20)],{type:'image/png'})),false);
 assert.equal(validIPodSkin(new Blob([new Uint8Array(4500)],{type:'text/html'})),false);
 assert.equal(validIPodSkin(new Blob([new Uint8Array(IPOD_SKIN_MAX_BYTES+1)],{type:'image/png'})),false);
 assert.equal(validIPodSkin(new Blob([new Uint8Array(5000)],{type:'image/webp'})),true);
 assert.equal(validIPodSkin(new Blob([new Uint8Array(5000)],{type:'image/jpeg'})),true);
});
test('screen and functional wheel belong to one existing audio player',()=>{
 for(const id of ['ipod-device','ipod-cover-image','ipod-screen-title','ipod-screen-artist',
  'ipod-screen-progress','ipod-menu-button','ipod-previous-button','ipod-next-button',
  'ipod-play-button','ipod-center-button']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.match(app,/\['ipod-play-button','ipod-center-button'\]/);
 assert.match(app,/addEventListener\('click',\(\)=>previous\(\)\)/);
 assert.match(app,/addEventListener\('click',\(\)=>void next\(\)\)/);
 assert.match(app,/state\.playing\?pause\(\):void play\(\)/);
 assert.match(app,/updateIPodScreen\(\)/);
 assert.match(app,/updateProgress\(\)/);
 assert.doesNotMatch(html,/id="ipod-skin-import"/);
 assert.doesNotMatch(app,/new Audio\(.*ipod/i);
});
test('album artwork is full-bleed inside iPod screen even on high-DPR phones',()=>{
 const match=css.match(/\.gnarly-ipod \.ipod-screen>img\s*\{([^}]+)\}/);
 assert.ok(match,'the physical iPod screen has an explicit artwork rule');
 const rule=match[1];
 assert.match(rule,/inset\s*:\s*0/);
 assert.match(rule,/width\s*:\s*100%/);
 assert.match(rule,/height\s*:\s*100%/);
 assert.match(rule,/object-fit\s*:\s*cover/);
 assert.match(rule,/object-position\s*:\s*center/);
 assert.doesNotMatch(rule,/object-fit\s*:\s*contain|var\(--ipod-art-(?:width|height)/);
 assert.doesNotMatch(app,/fitIPodArtwork|--ipod-art-width|--ipod-art-height/);
 assert.match(app,/resolveArtworkAsset\(cover,\{/,'use the real CDN artwork quality pipeline');
 assert.match(css,/\.gnarly-ipod \.ipod-screen-scrim\{/,'retain readable labels');
});
test('live cover fills only screen, and shell responds to selected GNARLY palette',()=>{
 assert.match(css,/\.gnarly-ipod \.ipod-screen>img\{/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/\.gnarly-ipod \.ipod-shell-image\{/);
 assert.match(css,/color-mix\(in srgb,var\(--acid\)/);
 assert.match(css,/\.app-shell\[data-player-surface-mode="ipod"\]/);
 assert.match(css,/touch-action:manipulation/);
 assert.match(css,/prefers-reduced-motion/);
 const build=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(build,/ipod-mode\.css/);
 assert.match(sw,/ipod-mode\.css/);
 assert.equal(ipodSourceLabel(true),'TOCANDO • GNARLY');
});
