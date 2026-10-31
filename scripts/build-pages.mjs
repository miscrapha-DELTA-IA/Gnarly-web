// Produce a safe Cloudflare Pages output without exposing server source or tests.
import {cpSync,copyFileSync,mkdirSync,rmSync,existsSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildSync} from 'esbuild';
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
const shell=['/','/index.html','/app.js','/sw.js','/manifest.webmanifest',
 '/mic.html','/mic.js','/styles.css','/performance.css','/module-dock.css','/ipod-mode.css','/cover-charge.css','/karaoke-art.css',
 '/karaoke-art-refined.css','/karaoke-stage.css','/search-hierarchy.css','/logo.svg'];
for(const dir of ['assets','lib','ui']){
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
// Verify the exact files Cloudflare Pages will serve, not only repository sources.
await import('./verify-pages-build.mjs');
console.log('Cloudflare Pages staged; offline shell includes '+shell.length+' static resources; media and user data stay in IndexedDB.');
