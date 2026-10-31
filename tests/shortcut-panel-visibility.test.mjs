import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDisplayStore} from '../ui/display-panel.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Music header shortcut hides entire drawer, not only its body',()=>{
 const from=app.indexOf('function toggleMusicShortcut(){');
 const to=app.indexOf('function renderActiveSurfaces()',from);
 assert.ok(from>=0&&to>from,'Music shortcut must have a dedicated handler');
 const handler=app.slice(from,to);
 assert.match(handler,/if\(isModuleOpen\('controls'\)\)/);
 assert.match(handler,/shortcutMusicPreviousVisibility=\{presets,controls\}/);
 assert.match(handler,/displayStore\.setGroup\(\['presets','controls'\],false\)/);
 assert.match(handler,/expandedModules\.controls=false/);
 assert.match(handler,/applyPanelVisibility\(\)/);
 assert.match(handler,/toggleModule\('controls',true\)/);
 assert.match(app,/\$\('#music-toggle-button'\)\.addEventListener\('click',toggleMusicShortcut\)/);
 assert.match(html,/id="music-toggle-button"[^>]*aria-pressed="false"/);
});

test('saved Music panel visibility can hide and restore exactly the previous section',()=>{
 const store=createDisplayStore();
 store.set('presets',true);
 store.set('controls',false);
 const saved=store.visible;
 assert.equal(store.isVisible('presets'),true);
 store.setGroup(['presets','controls'],false);
 assert.equal(store.isVisible('presets'),false);
 assert.equal(store.isVisible('controls'),false);
 store.set('presets',saved.presets);
 store.set('controls',saved.controls);
 assert.deepEqual({presets:store.isVisible('presets'),controls:store.isVisible('controls')},
  {presets:true,controls:false});
});

test('Aa downward gesture hides floating lyrics without destroying lyrics or affecting playback',()=>{
 const from=app.indexOf("bindQuickCreative($('#lyric-style-button')");
 const to=app.indexOf("$('#background-button').addEventListener",from);
 assert.ok(from>=0&&to>from);
 const actions=app.slice(from,to);
 assert.match(actions,/swipeDown:\(\)=>\{/);
 assert.match(actions,/displayStore\.set\('lyrics',false\)/);
 assert.match(actions,/displayStore\.set\('lyrics',true\)/);
 assert.match(actions,/swipeUp:\(\)=>\{/);
 assert.match(actions,/expand:\(\)=>openSheet\('lyric-style'\)/);
 assert.doesNotMatch(actions,/audio\.pause|state\.lyrics\s*=|state\.plainLyrics\s*=|lyricTransportSync\.stop/);
 assert.match(app,/lyricsShortcut\?\.setAttribute\('aria-pressed',String\(lyricsVisible\)\)/);
 assert.match(html,/id="lyric-style-button"[^>]*aria-pressed="true"/);
});

test('Music drawer handle still supports fold/unfold independently of header shortcut',()=>{
 assert.match(app,/\$\('#module-dock'\)\.addEventListener\('click',e=>\{const handle=/);
 assert.match(app,/toggleModule\(handle\.dataset\.moduleToggle\)/);
 assert.match(app,/\$\('#share-button'\)\.addEventListener\('click'/);
 assert.match(app,/\$\('#performance-button'\)\.addEventListener\('click'/);
});
