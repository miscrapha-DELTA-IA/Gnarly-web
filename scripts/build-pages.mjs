// Produce a safe Cloudflare Pages output without exposing server source or tests.
import {cpSync,copyFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const file of ['index.html','styles.css','performance.css','module-dock.css','app.js','manifest.webmanifest','logo.svg','_headers']){
 const p=join(root,file);if(!existsSync(p))throw Error('Missing static file: '+file);
 copyFileSync(p,join(out,file));
}
for(const dir of ['assets','lib','ui']){
 const p=join(root,dir);if(!existsSync(p))throw Error('Missing public directory: '+dir);
 cpSync(p,join(out,dir),{recursive:true});
}

const basicPitchPkg=join(root,'node_modules','@spotify','basic-pitch','model');
const bundleBin=join(root,'node_modules','.bin','esbuild');
if(!existsSync(join(basicPitchPkg,'model.json'))||!existsSync(join(basicPitchPkg,'group1-shard1of1.bin'))||!existsSync(bundleBin)){
 throw Error('Audio MIDI build prerequisites missing. Run npm install before build.');
}
mkdirSync(join(out,'models','basic-pitch'),{recursive:true});
for(const file of ['model.json','group1-shard1of1.bin'])copyFileSync(join(basicPitchPkg,file),join(out,'models','basic-pitch',file));
execFileSync(bundleBin,[join(root,'lib','basic-pitch-worker.js'),'--bundle','--platform=browser','--format=esm','--target=es2022','--minify','--outfile='+join(out,'basic-pitch-worker.js')],{stdio:'inherit'});
console.log('Cloudflare Pages static assets staged in dist/; Basic Pitch bundled lazily, models first-party; API in functions/.');
