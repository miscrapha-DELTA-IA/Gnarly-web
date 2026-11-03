// Fail CI if the live Cloudflare Pages bundle is missing a stylesheet referenced
// by index.html. Previously unit and browser tests served the REPOSITORY root,
// while production Pages deployed dist/ WITHOUT search-hierarchy.css.
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const html=readFileSync(join(dist,'index.html'),'utf8');
const links=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map(m=>m[1].split('?')[0].split('#')[0]);
assert.deepEqual(links,['gnarly-ui.css'],
 'Production must render from one stylesheet while preserving authored cascade');
for(const asset of links){
 const path=join(dist,asset);
 assert.ok(existsSync(path),'Pages output is missing linked stylesheet '+asset);
 assert.ok(readFileSync(path,'utf8').trim().length>100,'Empty Pages stylesheet '+asset);
}
const styles=[
 'styles.css','performance.css','module-dock.css','ipod-mode.css',
 'cover-charge.css','karaoke-art.css','karaoke-art-refined.css',
 'karaoke-stage.css','search-hierarchy.css'
];
const css=readFileSync(join(dist,'gnarly-ui.css'),'utf8');
const expected=styles.map(file=>'/* GNARLY stylesheet: '+file+' */\n'+
 readFileSync(join(root,file),'utf8')+'\n').join('\n');
assert.equal(css,expected,'Production CSS must preserve source order and bytes');
assert.match(css,/\.app-shell \.quick-actions #omnibox-shell\{/);
assert.match(css,/grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
assert.match(css,/position:fixed;z-index:41/);
// The startup bundle is generated independently of the unbundled dev source.
const app=readFileSync(join(dist,'app.js'),'utf8');
const sourceApp=readFileSync(join(root,'app.js'),'utf8');
assert.notEqual(app,sourceApp,'Production should not serve the raw ESM waterfall');
assert.ok(app.length>10000&&app.length<sourceApp.length*6,'Invalid app startup bundle');
const chunksDir=join(dist,'chunks');
const chunks=existsSync(chunksDir)?readdirSync(chunksDir).filter(x=>x.endsWith('.js')):[];
assert.ok(chunks.length>=2,'Export and iPod studio should stay lazy on startup');
assert.match(app,/chunks\//,'Dynamic studio chunks must remain loadable');
const assets=JSON.parse(readFileSync(join(dist,'offline-assets.json'),'utf8'));
assert.ok(assets.includes('/gnarly-ui.css'),'PWA must precache the combined stylesheet');
for(const chunk of chunks)assert.ok(assets.includes('/chunks/'+chunk),
 'PWA must precache lazy JS chunk '+chunk);
const sw=readFileSync(join(dist,'sw.js'),'utf8');
assert.match(sw,/gnarly-web-shell-20261103-offline-next-v28/);
assert.match(sw,/'\/gnarly-ui\.css'/);
assert.match(sw,/'\/chunks\/'/);
assert.ok(existsSync(join(dist,'ui/tdr-panel.js')),'Pages output is missing TDR dashboard module');
console.log('Cloudflare Pages startup verified: 1 stylesheet, bundled core ESM, '+chunks.length+' lazy studios and offline cache.');
