import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDisplayStore,PANEL_KEYS,LAYOUTS,renderDisplayPanel} from '../ui/display-panel.js';

const src=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function memory(initial={}){
 const values=new Map(Object.entries(initial));
 return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};
}
test('Legendas is enabled by default and toggles independently of player and karaoke',()=>{
 const store=createDisplayStore(memory());
 assert.ok(PANEL_KEYS.includes('lyrics'));
 assert.equal(store.isVisible('lyrics'),true);
 store.set('lyrics',false);
 assert.equal(store.isVisible('lyrics'),false);
 assert.equal(store.isVisible('player'),true);
 assert.equal(store.isVisible('header'),true);
 store.set('lyrics',true);
 assert.equal(store.isVisible('lyrics'),true);
});
test('subtitles preference persists and migrates older saved display settings',()=>{
 const storage=memory();
 const previous=createDisplayStore(storage);
 previous.set('lyrics',false);
 const next=createDisplayStore(storage);
 assert.equal(next.isVisible('lyrics'),false);
 const older=memory({'gnarly.web.panels.v1':JSON.stringify({visible:{player:false,search:false},size:'compact'})});
 const migrated=createDisplayStore(older);
 assert.equal(migrated.isVisible('lyrics'),true,'do not hide subtitles for existing users');
 assert.equal(migrated.isVisible('player'),false);
});
test('display layouts and Zen correctly manage subtitles',()=>{
 assert.equal(LAYOUTS.all.lyrics,true);
 assert.equal(LAYOUTS.essential.lyrics,true);
 assert.equal(LAYOUTS.listening.lyrics,false);
 const store=createDisplayStore(memory());
 store.apply('listening');
 assert.equal(store.isVisible('lyrics'),false);
 store.apply('essential');
 assert.equal(store.isVisible('lyrics'),true);
 store.setZen(true);
 assert.equal(store.isVisible('lyrics'),false);
 store.setZen(false);
 assert.equal(store.isVisible('lyrics'),true);
 store.setGroup(['lyrics','header'],false);
 assert.equal(store.isVisible('lyrics'),false);
 store.showAll();
 assert.equal(store.isVisible('lyrics'),true);
});
test('Exibição exposes an accessible subtitles switch',()=>{
 const html=renderDisplayPanel(createDisplayStore(memory()));
 assert.match(html,/data-panel-toggle="lyrics"/);
 assert.match(html,/aria-label="Legendas"/);
 assert.match(html,/Legendas/);
 assert.match(html,/data-layout="listening"/);
});
test('hide only compact lyrics and retain karaoke expand button and audio pipeline',()=>{
 const html=src('index.html'),app=src('app.js'),css=src('karaoke-stage.css');
 assert.match(html,/id="floating-line"/);
 assert.match(html,/id="karaoke-expand-button"/);
 assert.match(app,/app\.dataset\.lyricsVisible=String\(lyricsVisible\)/);
 assert.match(app,/compact-karaoke-slot'\)\.hidden=displayStore\.zen/);
 assert.match(app,/if\(lyricsVisible&&previousLyrics==='false'\)fitCompactLyric\(\)/);
 assert.match(css,/\[data-lyrics-visible="false"\] \.compact-karaoke-slot #floating-line\{\s*display:none!important/);
 assert.match(css,/\[data-lyrics-visible="false"\] \.compact-karaoke-slot \.karaoke-compact-expand\{/);
 assert.doesNotMatch(app,/karaokeStage\.close\(\).*lyricsVisible|audio\.pause\(\).*lyricsVisible/);
});
test('eye has an animated, reduced-motion-friendly downward hint without changing its gestures',()=>{
 const html=src('index.html'),css=src('styles.css'),app=src('app.js'),gestures=src('lib/responsive-shell.js');
 assert.match(html,/id="search-toggle"[^>]*>.*class="eye-gesture-arrow" viewBox="0 0 24 24"/);
 assert.match(html,/eye-gesture-arrow"[^>]+aria-hidden="true"/);
 assert.match(html,/class="eye-gesture-arrow"[^>]*><path d="m5 9 7 7 7-7" \/><\/svg>/);
 assert.match(css,/topbar #search-toggle \.eye-gesture-arrow/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(app,/attachEyeGestures\(\$\('#search-toggle'\)/);
 assert.match(gestures,/swipeVertical\?\.\(dy>0\?'down':'up'\)/);
});

test('the three draggable header shortcuts share the eye chevron without changing behavior',()=>{
 const html=src('index.html'),css=src('styles.css'),app=src('app.js');
 const ids=['theme-button','experience-button','lyric-style-button'];
 const eye=html.match(/id="search-toggle"[^>]*>(.*?)<\/button>/)?.[1];
 assert.ok(eye,'existing Exibição button remains');
 const arrow=eye.match(/<svg class="eye-gesture-arrow"[^>]*>.*?<\/svg>/)?.[0];
 assert.ok(arrow,'reuse the exact eye arrow');
 for(const id of ids){
  const contents=html.match(new RegExp('id="'+id+'"[^>]*>(.*?)<\\/button>'))?.[1];
  assert.ok(contents,'header button remains: '+id);
  assert.ok(contents.includes(arrow),'identical decorative chevron on '+id);
  assert.match(contents,/aria-hidden="true" focusable="false"/);
 }
 for(const id of ['background-button','music-toggle-button','share-button']){
  const contents=html.match(new RegExp('id="'+id+'"[^>]*>(.*?)<\\/button>'))?.[1];
  assert.ok(contents&&!contents.includes('eye-gesture-arrow'),'no misleading hint on '+id);
 }
 assert.match(css,/:is\(#theme-button,#experience-button,#lyric-style-button\) \.eye-gesture-arrow/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 for(const id of ids)assert.match(app,new RegExp("bindQuickCreative\\(\\$\\('#"+id+"'\\)"));
 assert.doesNotMatch(css,/\.eye-gesture-arrow\{[^}]*pointer-events:auto/);
});

test('header arrows are conspicuous, self-contained vectors and bypass stale CSS caches',()=>{
 const html=src('index.html'),css=src('styles.css'),sw=src('sw.js');
 assert.match(html,/href="\.\/styles\.css\?v=tdr-panel-20261103-v1"/);
 assert.match(sw,/const SHELL='gnarly-web-shell-[^']+';/);
 assert.doesNotMatch(sw,/gnarly-web-shell-20261103-tdr-dashboard-v25/,
  'installed GNARLY clients must not retain the previous PWA shell');
 const ids=['search-toggle','theme-button','experience-button','lyric-style-button'];
 for(const id of ids){
  const content=html.match(new RegExp('id="'+id+'"[^>]*>(.*?)<\\/button>'))?.[1]||'';
  assert.match(content,/class="eye-gesture-arrow"[^>]*width="16" height="16"/,id+' needs 16px chevron');
  assert.match(content,/<path d="m5 9 7 7 7-7" \/>/,id+' uses inline SVG path');
  assert.doesNotMatch(content,/<use href="#i-chevron"/,id+' must not depend on an SVG sprite');
 }
 const block=css.slice(css.indexOf('/* Clearly visible gesture chevrons'),css.indexOf('/* Menu polish: native controls'));
 assert.match(block,/bottom:-7px/);
 assert.match(block,/stroke-width:3/);
 assert.match(block,/opacity:1/);
 assert.match(block,/overflow:visible/);
 assert.match(block,/pointer-events:none/);
 assert.match(block,/prefers-reduced-motion:reduce/);
});
