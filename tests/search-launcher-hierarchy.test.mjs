import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../search-hierarchy.css',import.meta.url),'utf8');

test('there is exactly one Search launcher, a magnifier before the heart in header',()=>{
 assert.equal((html.match(/id="omnibox-toggle"/g)||[]).length,1);
 assert.equal((html.match(/id="omnibox-shell"/g)||[]).length,1);
 const index=html.indexOf('class="quick-actions"');
 const button=html.indexOf('id="omnibox-toggle"');
 const heart=html.indexOf('id="support-button"');
 const player=html.indexOf('id="player-section"');
 assert.ok(index>=0&&index<button&&button<heart&&heart<player,
  'launcher should live to left of heart, above player');
 assert.match(html,/<svg class="icon" aria-hidden="true"><use href="#i-search" \/><\/svg>/);
 assert.doesNotMatch(html,/omnibox-caption|omnibox-accent|omnibox-chevron/);
 assert.match(html,/href="\.\/search-hierarchy\.css"/);
});
test('magnifier opens Search, not the last queue or karaoke tab',()=>{
 assert.match(app,/\$\('#omnibox-toggle'\)\.addEventListener\('click',\(\)=>state\.sheet==='search'\?closeSheet\(\):openSheet\('search'\)\)/);
 assert.match(app,/const OMNIBOX_TABS=\['search','library','queue','karaoke'\]/);
 assert.match(app,/\$\('#brand-line'\)\.hidden=!visible\('header'\)&&!visible\('search'\)/);
 assert.match(app,/classList\.toggle\('search-only',!visible\('header'\)&&visible\('search'\)\)/);
 assert.match(css,/#omnibox-shell\[hidden\]/);
});
test('Music drawer cannot displace or intercept Search; background scroll is locked',()=>{
 assert.doesNotMatch(app,/\$\('#module-'\+name\)\?\.scrollIntoView/);
 assert.match(css,/\.app-shell #bottom-sheet\{\s*position:fixed;z-index:41;/);
 assert.match(css,/\.app-shell #panel-backdrop\{\s*position:fixed;inset:0;z-index:40;/);
 assert.match(css,/\.app-shell \.module-drawer\.is-open \.module-body\{/);
 assert.match(app,/document\.documentElement\.classList\.add\('gnarly-sheet-open'\)/);
 assert.match(app,/document\.documentElement\.classList\.remove\('gnarly-sheet-open'\)/);
 assert.match(app,/\$\('#module-dock'\)\.inert=true/);
 assert.match(app,/\$\('#module-dock'\)\.inert=false/);
});
