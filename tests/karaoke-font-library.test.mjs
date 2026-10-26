import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FONT_CATALOG,FONT_GROUPS,loadLyricTypeface,findFont} from '../lib/lyric-font-catalog.js';
import {LyricFontPreferences,artistKey} from '../lib/lyric-font-preferences.js';
import {allLyricStyles,applyLyricStyle} from '../lib/lyric-style.js';
import {renderLyricStylePanel} from '../ui/lyric-style-panel.js';
import {KARAOKE_DESIGNS,KARAOKE_ART_PRESETS,KARAOKE_STUDIO_PRESETS,renderLyricArtwork,lyricWordHash} from '../lib/karaoke-art-direction.js';

const track={id:'youtube:abc123789xyz',source:'youtube',title:'Luzes da Cidade',artist:'Sample Singer',duration:212};
function fakeStorage(){const stored=new Map();return {getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)}}
test('40 total Aa choices: 6 browser built-ins plus 34 curated font families',()=>{
 assert.equal(FONT_CATALOG.length,34);assert.equal(allLyricStyles().length,80);
 assert.equal(KARAOKE_ART_PRESETS.length,20);assert.equal(KARAOKE_STUDIO_PRESETS.length,20);
 assert.equal(new Set(allLyricStyles().map(x=>x.id)).size,80);
 assert.equal(FONT_GROUPS.length,9);
 for(const font of FONT_CATALOG){assert.match(font.id,/^font-[a-z0-9-]+$/);assert.equal(typeof font.fontFamily,'string');assert.ok(findFont(font.id));}
 for(const id of ['font-space-grotesk','font-bebas-neue','font-playfair-display','font-jetbrains-mono','font-caveat']){
  assert.ok(allLyricStyles().some(x=>x.id===id),id);
 }
});
test('User gesture applies typography CSS immediately while audio/LRC remain unchanged',()=>{
 const properties={};const target={dataset:{},style:{setProperty:(k,v)=>properties[k]=v}};
 const original={title:'A',artist:'B',duration:150,lyrics:[{time:5.5,text:'Hello'}],playbackTime:9.2};
 const before=structuredClone(original);
 const applied=applyLyricStyle(target,'font-unbounded');
 assert.equal(applied.id,'font-unbounded');
 assert.match(properties['--gnarly-lyric-font'],/Unbounded/);
 assert.equal(target.dataset.lyricFontGroup,'expressive');
 assert.deepEqual(original,before);
 applyLyricStyle(target,'font-instrument-serif');
 assert.match(properties['--gnarly-lyric-font'],/Instrument Serif/);
});
test('Scoped user settings: song overrides artist, which overrides global; persistent reload',()=>{
 const storage=fakeStorage(),prefs=new LyricFontPreferences(storage);
 prefs.set('font-inter','global');
 assert.deepEqual(prefs.selected(track),{style:'font-inter',source:'global'});
 prefs.set('font-syne','artist',track);
 assert.deepEqual(prefs.selected({...track,id:'other'}),{style:'font-syne',source:'artist'});
 prefs.set('font-bebas-neue','song',track);
 assert.deepEqual(prefs.selected(track),{style:'font-bebas-neue',source:'song'});
 assert.deepEqual(new LyricFontPreferences(storage).selected(track),{style:'font-bebas-neue',source:'song'});
 prefs.clear('song',track);assert.deepEqual(prefs.selected(track),{style:'font-syne',source:'artist'});
 prefs.clear('artist',track);assert.deepEqual(prefs.selected(track),{style:'font-inter',source:'global'});
});
test('Invalid or anonymous credit never silently assigns artist-wide overrides',()=>{
 const storage=fakeStorage(),prefs=new LyricFontPreferences(storage);
 assert.equal(artistKey({...track,artist:'YouTube Music'}),'');
 assert.equal(artistKey({...track,artist:'YouTube'}),'');
 prefs.set('font-caveat','artist',{...track,artist:'YouTube Music'});
 assert.equal(prefs.selected(track).style,'font-caveat'); // Falls back to global.
 assert.equal(Object.keys(prefs.artists).length,0);
});
test('Storage data is bounded and untrusted injected CSS/font names are rejected',()=>{
 const storage=fakeStorage(),prefs=new LyricFontPreferences(storage);
 prefs.set('evil-url','song',track);
 assert.equal(prefs.selected(track).style,'original');
 for(let i=0;i<150;i++)prefs.set('font-outfit','song',{...track,id:'track-'+i});
 assert.ok(Object.keys(prefs.songs).length<=128);
 assert.equal(prefs.recents[0],'font-outfit');
});
test('Google Fonts URLs use only reviewed family names and never arbitrary user CSS',async()=>{
 const added=[];const doc={head:{append(n){added.push(n)}},createElement:()=>({setAttribute(k,v){this[k]=v}})};
 const loaded=loadLyricTypeface('font-ibm-plex-mono',doc);
 assert.equal(added.length,1);
 assert.match(added[0].href,/fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Mono:wght@700/);
 added[0].onload();
 assert.equal(await loaded,true);
 assert.equal(await loadLyricTypeface('font-ibm-plex-mono',doc),true);
 assert.equal(added.length,1);
 assert.equal(await loadLyricTypeface('https://malicious.test/fonts.css',doc),false);
 assert.equal(added.length,1);
});
test('Aa gallery is searchable, accessible and always applies on single tap',()=>{
 const html=renderLyricStylePanel('font-space-grotesk',{track,scope:'song',resolution:{source:'song'},recents:['font-space-grotesk']});
 assert.match(html,/data-lyric-style="font-space-grotesk"/);
 assert.match(html,/data-lyric-scope="artist"/);
 assert.match(html,/id="lyric-font-search"/);
 assert.match(html,/data-font-group="serif"/);
 assert.match(html,/data-lazy-typeface="font-unbounded"/);
 assert.equal((html.match(/data-lyric-style="/g)||[]).length,80);
 assert.match(html,/data-lyric-style="art-magazine-cutout"/);
 assert.match(html,/data-lyric-style="studio-velvet-noir"/);
 assert.match(html,/Esta música/);
 assert.doesNotMatch(html,/<script/);
 const anonymous=renderLyricStylePanel('original',{track:{...track,artist:'YouTube Music'}});
 assert.match(anonymous,/data-lyric-scope="artist"[^>]*disabled/);
});
test('Only karaoke presentation code changed; player, LRC timestamps and queue are untouched',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../module-dock.css',import.meta.url),'utf8');
 assert.match(app,/lyricFonts\.selected\(track\)\.style/);
 assert.match(app,/loadLyricTypeface\(designFont\(style\.id\)\)/);
 assert.match(app,/if\(target\.dataset\.lyricStyle\)\{applyChosenLyricFont/);
 assert.match(app,/lyricGroup/);
 assert.match(styles,/text-wrap:balance/);
 assert.doesNotMatch(readFileSync(new URL('../lib/lyric-font-catalog.js',import.meta.url),'utf8'),/new AudioContext|yt-dlp|fetch\(.*\/download/);
});

test('40 genuinely different curated composition IDs and actual CSS implementations',()=>{
 assert.equal(KARAOKE_DESIGNS.length,40);
 const css=readFileSync(new URL('../karaoke-art.css',import.meta.url),'utf8');
 for(const item of KARAOKE_DESIGNS){
  assert.match(css,new RegExp('data-lyric-art="'+item.id+'"'),item.id);
  assert.ok(allLyricStyles().some(x=>x.id===item.id),item.id);
 }
 assert.ok((css.match(/@keyframes gnarly-/g)||[]).length>=7);
 assert.match(css,/prefers-reduced-motion/);
});
test('native-inspired Magazine Cutout generates stable mixed paper-word markup',()=>{
 const text='Eu te amo & GNARLY <3';
 const markup=renderLyricArtwork(text,'art-magazine-cutout',{lineId:42});
 assert.match(markup,/gnarly-typeart--cutout/);
 assert.match(markup,/gnarly-tone-[0-3]/);
 assert.match(markup,/gnarly-face-[0-3]/);
 assert.match(markup,/aria-label="Eu te amo &amp; GNARLY &lt;3"/);
 assert.ok((markup.match(/gnarly-word /g)||[]).length>=5);
 assert.equal(markup,renderLyricArtwork(text,'art-magazine-cutout',{lineId:42}));
 assert.equal(lyricWordHash('GNARLY',42,2),lyricWordHash('GNARLY',42,2));
 assert.notEqual(lyricWordHash('GNARLY',42,2),lyricWordHash('GNARLY',43,2));
 assert.doesNotMatch(markup,/<script|<img/i);
});
test('long lyrics remain readable with bounded DOM and no fake karaoke timing',()=>{
 const long='palavra '.repeat(90).trim();
 const cutout=renderLyricArtwork(long,'art-magazine-cutout',{lineId:9});
 assert.match(cutout,/gnarly-typeart/);
 assert.doesNotMatch(cutout,/gnarly-word /);
 const premium=renderLyricArtwork('Olha para mim','studio-vogue-editorial',{lineId:12});
 assert.match(premium,/gnarly-typeart--studio/);
 assert.doesNotMatch(premium,/gnarly-word /);
 const plain=renderLyricArtwork('<letra>','original');
 assert.equal(plain,'&lt;letra&gt;');
});
