// Produce a safe Cloudflare Pages output without exposing server source or tests.
import {cpSync,copyFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const file of ['index.html','styles.css','performance.css','app.js','manifest.webmanifest','logo.svg','_headers']){
 const p=join(root,file);if(!existsSync(p))throw Error('Missing static file: '+file);
 copyFileSync(p,join(out,file));
}
for(const dir of ['assets','lib','ui']){
 const p=join(root,dir);if(!existsSync(p))throw Error('Missing public directory: '+dir);
 cpSync(p,join(out,dir),{recursive:true});
}
console.log('Cloudflare Pages static assets staged in dist/; dynamic API in functions/.');
