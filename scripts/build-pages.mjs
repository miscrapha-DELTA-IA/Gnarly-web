// Produce a safe Cloudflare Pages output without exposing server source or tests.
import {cpSync,copyFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildSync} from 'esbuild';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const file of ['index.html','styles.css','performance.css','module-dock.css', 'karaoke-art.css','karaoke-stage.css','app.js','manifest.webmanifest','logo.svg','_headers']){
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
console.log('Cloudflare Pages static assets staged in dist/; Basic Pitch bundled lazily, models first-party; API in functions/.');
