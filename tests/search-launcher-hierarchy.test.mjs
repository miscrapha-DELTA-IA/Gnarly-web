import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../search-hierarchy.css',import.meta.url),'utf8');

test('one search button sits immediately before support heart on GNARLY brand action row',()=>{
 assert.equal((html.match(/id="omnibox-toggle"/g)||[]).length,1);
 assert.equal((html.match(/id="omnibox-shell"/g)||[]).length,1);
 assert.match(html,/<div class="quick-actions">\s*<div class="omnibox-shell" id="omnibox-shell">[\s\S]*?id="omnibox-toggle"[\s\S]*?<\/div>\s*<a[^>]+id="support-button"/);
 assert.match(html,/<svg class="icon" aria-hidden="true"><use href="#i-search" \/><\/svg>/);
 assert.doesNotMatch(html,/omnibox-caption/);
 assert.match(html,/<section id="module-dock"/);
});

test('loupe opens actual Search tab and never restores last queue/library tab',()=>{
 assert.match(app,/#\('omnibox-toggle'\)\.addEventListener\('click',\(\)=>state\.sheet==='search'\?closeSheet\(\):openSheet\('search'\)\)/);
 assert.match(app,/const OMNIBOX_TABS=\['search','library','queue','karaoke'\]/);
 assert.match(app,/\$\('#brand-line'\)\.hidden=!visible\('header'\)&&!visible\('search'\)/);
});

test('search sheet is viewport modal and existing Music does not scroll document',()=>{
 assert.doesNotMatch(app,/\$\('#module-'\+name\)\?\.scrollIntoView/);
 assert.match(style,/\.app-shell #bottom-sheet\{\s*position:fixed;z-index:19;/);
 assert.match(style,/\.app-shell #panel-backdrop\{position:fixed;inset:0;z-index:18\}/);
 assert.match(style,/\.app-shell \.module-drawer\.is-open \.module-body\{/);
 assert.match(app,/document\.documentElement\.classList\.add\('gnarly-sheet-open'\)/);
 assert.match(app,/document\.documentElement\.classList\.remove\('gnarly-sheet-open'\)/);
 assert.match(html,/href="\.\/search-hierarchy\.css"/);
});
