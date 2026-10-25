import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequestGet as catalog} from '../functions/api/catalog.js';
import {onRequestGet as omnibox,parseBackendNDJSON} from '../functions/api/omnibox.js';
import {onRequestPost as ticket} from '../functions/api/stems-ticket.js';
test('catalogue Pages Function rejects short query without remote calls',async()=>{
 const r=await catalog({request:new Request('https://gnarly-web.pages.dev/api/catalog?term=a')});
 assert.equal(r.status,400);assert.ok((await r.json()).error);
});
test('Omnibox Pages Function accepts native NDJSON and validates term',async()=>{
 const bad=await omnibox({request:new Request('https://gnarly-web.pages.dev/api/omnibox?term=a'),env:{}});
 assert.equal(bad.status,400);
 const parsed=parseBackendNDJSON(JSON.stringify({id:'dQw4w9WgXcQ',title:'GNARLY Test',artist:'Artist'})+'\n');
 assert.equal(parsed.length,1);assert.equal(parsed[0].source,'youtube');
});
test('Stems Pages Function rejects invalid GPU request locally',async()=>{
 const r=await ticket({request:new Request('https://gnarly-web.pages.dev/api/stems-ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha256:'invalid',bytes:10,seconds:600})})});
 assert.equal(r.status,400);
});
test('Cloudflare build uses explicit asset allowlist and retains isolated Functions',()=>{
 const code=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
 assert.match(code,/\['assets','lib','ui'\]/);
 assert.doesNotMatch(code,/cpSync\(root,out/);
});
