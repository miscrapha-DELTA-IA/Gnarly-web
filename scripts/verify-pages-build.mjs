// Fail CI if the live Cloudflare Pages bundle is missing a stylesheet referenced
// by index.html. Previously unit and browser tests served the REPOSITORY root,
// while production Pages deployed dist/ WITHOUT search-hierarchy.css.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const html=readFileSync(join(dist,'index.html'),'utf8');
const links=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map(m=>m[1]);
assert.ok(links.includes('search-hierarchy.css'),'Search launcher stylesheet must be linked');
for(const asset of links){
 const path=join(dist,asset);
 assert.ok(existsSync(path),'Pages output is missing linked stylesheet '+asset);
 assert.ok(readFileSync(path,'utf8').trim().length>100,'Empty Pages stylesheet '+asset);
}
const css=readFileSync(join(dist,'search-hierarchy.css'),'utf8');
const source=readFileSync(join(root,'search-hierarchy.css'),'utf8');
assert.equal(css,source,'Pages stylesheet does not match the latest fixed UI source');
assert.match(css,/\.app-shell \.quick-actions #omnibox-shell\{/);
assert.match(css,/grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
assert.match(css,/position:fixed;z-index:41/);
const assets=JSON.parse(readFileSync(join(dist,'offline-assets.json'),'utf8'));
assert.ok(assets.includes('/search-hierarchy.css'),'PWA offline asset manifest is missing layout stylesheet');
const sw=readFileSync(join(dist,'sw.js'),'utf8');
assert.match(sw,/gnarly-web-shell-20261031-published-search-css-v15/);
assert.match(sw,/'\/search-hierarchy\.css'/);
console.log('Cloudflare Pages dist verified: '+links.length+' stylesheets, Search layout source parity and PWA precache.');
