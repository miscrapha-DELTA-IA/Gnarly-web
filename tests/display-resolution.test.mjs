import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const source=readFileSync(new URL('../lib/visual-engine.js',import.meta.url),'utf8');
test('desktop background has viewport-wide native GPU drawing surface',()=>{
 assert.match(css,/\(min-width:900px\) and \(pointer:fine\)/);
 assert.match(css,/max-width:none;height:100dvh;min-height:100dvh/);
 assert.match(css,/\.app-shell #fluid-canvas/);
 assert.match(source,/desktop\?8300000:5000000/);
 assert.match(source,/window\.devicePixelRatio/);
 assert.doesNotMatch(source,/Math\.sqrt\(2100000/);
});
test('adaptive quality changes only after sustained missed frames',()=>{
 assert.match(source,/slowWindows>=2/);
 assert.match(source,/stableWindows>=5/);
 assert.match(source,/this\.slowWindows>=2\?2800:10000/);
 assert.match(source,/this\.nextFrameAt/);
 assert.match(source,/this\.fallbackFrame=c\.createImageData/);
});