// Produce a safe Cloudflare Pages output without exposing server source or tests.
import {cpSync,copyFileSync,mkdirSync,rmSync,existsSync,writeFileSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildSync} from 'esbuild';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const file of ['index.html','styles.css','performance.css','module-dock.css','ipod-mode.css','cover-charge.css', 'karaoke-art.css','karaoke-art-refined.css','karaoke-stage.css','search-hierarchy.css','app.js','mic.html','mic.js','manifest.webmanifest','logo.svg','sw.js','_headers']){
 const p=join(root,file);if(!existsSync(p))throw Error('Missing static file: '+file);
 copyFileSync(p,join(out,file));
}
for(const dir of ['assets','lib','ui']){
 const p=join(root,dir);if(!existsSync(p))throw Error('Missing public directory: '+dir);
 cpSync(p,join(out,dir),{recursive:true});
}
// Nine independent, render-blocking CSS requests used to compete with the
// JavaScript module graph on mobile. One file preserves EXACT cascade order
// without changing the development sources or user-selected visual styles.
const styles=[
 'styles.css','performance.css','module-dock.css','ipod-mode.css',
 'cover-charge.css','karaoke-art.css','karaoke-art-refined.css',
 'karaoke-stage.css','search-hierarchy.css'
];
const originalHTML=readFileSync(join(root,'index.html'),'utf8');
const styleLink=/<link rel="stylesheet" href="\.\/([^"?]+)(?:\?[^"]*)?"\s*\/>/g;
const linked=[...originalHTML.matchAll(styleLink)].map(match=>match[1]);
assert.deepEqual(linked,styles,'Do not concatenate styles if page order changed');
const combined=styles.map(file=>'/* GNARLY stylesheet: '+file+' */\n'+
 readFileSync(join(root,file),'utf8')+'\n').join('\n');
writeFileSync(join(out,'gnarly-ui.css'),combined);
let replaced=0;
const html=originalHTML.replace(styleLink,()=>++replaced===1?
 '<link rel="stylesheet" href="./gnarly-ui.css" />':'');
assert.equal(replaced,styles.length);
writeFileSync(join(out,'index.html'),html);
// Collapse static ESM imports into a single production startup module. Heavy
// optional interfaces stay dynamic, emitted as hashed on-demand chunks.
// Keep source app.js and lib/ intact for development/tests and offline tools.
const appBuild=buildSync({
 entryPoints:[join(root,'app.js')],bundle:true,splitting:true,format:'esm',
 platform:'browser',target:'es2022',minify:true,outdir:out,
 entryNames:'app',chunkNames:'chunks/[name]-[hash]',metafile:true,
 logLevel:'info'
});
const emitted=Object.keys(appBuild.metafile.outputs);
assert.ok(emitted.some(file=>file.endsWith('/app.js')),
 'GNARLY production startup bundle is missing');
const bundleBytes=statSync(join(out,'app.js')).size;
console.log('GNARLY startup: 9 render-blocking CSS files → 1; static modules → 1 JS entry ('+
 Math.round(bundleBytes/1024)+' KiB minified); '+(emitted.length-1)+' optional chunk(s).');

const basicPitchPkg=join(root,'node_modules','@spotify','basic-pitch','model');

if(!existsSync(join(basicPitchPkg,'model.json'))||!existsSync(join(basicPitchPkg,'group1-shard1of1.bin'))){
 throw Error('Audio MIDI build prerequisites missing. Run npm install before build.');
}
mkdirSync(join(out,'models','basic-pitch'),{recursive:true});
for(const file of ['model.json','group1-shard1of1.bin'])copyFileSync(join(basicPitchPkg,file),join(out,'models','basic-pitch',file));
const license=join(root,'node_modules','@spotify','basic-pitch','LICENSE');
if(existsSync(license))copyFileSync(license,join(out,'models','basic-pitch','LICENSE'));
buildSync({entryPoints:[join(root,'lib','basic-pitch-worker.js')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,outfile:join(out,'basic-pitch-worker.js'),logLevel:'info'});
// Precache the entire import graph for a genuine first-visit offline PWA,
// without storing model weights, backend audio or third-party requests.
const shell=['/','/index.html','/app.js','/gnarly-ui.css','/sw.js','/manifest.webmanifest',
 '/mic.html','/mic.js','/logo.svg'];
// Chunks are part of the offline application, but loaded only on demand.
for(const dir of ['assets','lib','ui','chunks']){
 const walk=folder=>{
  for(const name of readdirSync(folder)){
   const full=join(folder,name);
   if(statSync(full).isDirectory())walk(full);
   else if(/\.(?:js|mjs|css|png|jpe?g|webp|svg)$/.test(name))
    shell.push('/'+full.slice(out.length+1).replaceAll('\\','/'));
  }
 };
 walk(join(out,dir));
}
writeFileSync(join(out,'offline-assets.json'),JSON.stringify([...new Set(shell)].sort()));
// Every deployed bundle requires a fresh offline shell revision. Previously
// the service worker kept its November 3 cache key for multiple releases,
// potentially keeping an outdated download error message in offline/PWA tabs.
// Content-address this cache without touching audio, IndexedDB or profiles.
const shellRevision=createHash('sha256')
 .update(readFileSync(join(out,'app.js')))
 .update(readFileSync(join(out,'gnarly-ui.css')))
 .update(readFileSync(join(out,'index.html')))
 .digest('hex').slice(0,12);
const swPath=join(out,'sw.js'),swSource=readFileSync(swPath,'utf8');
const swVersion=swSource.replace(
 /const SHELL='gnarly-web-shell-[^']+';/,
 "const SHELL='gnarly-web-shell-"+shellRevision+"';");
assert.notEqual(swVersion,swSource,'Missing service worker cache revision');
writeFileSync(swPath,swVersion);
// Verify the exact files Cloudflare Pages will serve, not only repository sources.
await import('./verify-pages-build.mjs');
console.log('Cloudflare Pages staged; offline shell includes '+shell.length+' static resources; media and user data stay in IndexedDB.');
