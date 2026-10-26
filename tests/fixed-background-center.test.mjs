import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('visual background lives outside the scrollable player and retractable drawers',()=>{
 assert.match(html,/<div id="gnarly-background"/);
 assert.ok(html.indexOf('id="gnarly-background"')<html.indexOf('id="app-shell"'));
 assert.match(css,/#gnarly-background\s*\{[\s\S]*?position:fixed/);
 assert.match(css,/#gnarly-background #fluid-canvas/);
 assert.match(app,/background\.classList\.toggle\('cover-bg',coverPhoto\)/);
 assert.match(app,/photo\.hidden=!ownPhoto&&!coverPhoto/);
 assert.match(app,/visual\.setPaused\(ownPhoto\|\|coverPhoto\)/);
});
test('player center is not coupled to flex auto margins or module height',()=>{
 assert.match(css,/\.app-shell \.player,[\s\S]*?margin:clamp\(/);
 assert.match(css,/\.app-shell \.main\{[\s\S]*?height:auto!important/);
 assert.match(css,/\.app-shell \.player,[\s\S]*?flex:0 0 auto/);
 assert.match(css,/overflow-y:auto!important/);
});
