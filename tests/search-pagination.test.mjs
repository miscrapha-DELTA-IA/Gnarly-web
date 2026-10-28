import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequestGet as edgeSearch,parseBackendNDJSON} from '../functions/api/omnibox.js';
import {onRequestGet as edgeCatalog} from '../functions/api/catalog.js';

const valid=(i)=>String(i).padStart(11,'A');
test('backend search decoder supports paged results without changing legacy 15-track contract',()=>{
 const raw=Array.from({length:20},(_,i)=>JSON.stringify({id:valid(i),title:'Song '+i,duration:180})).join('\n');
 assert.equal(parseBackendNDJSON(raw).length,15);
 assert.equal(parseBackendNDJSON(raw,20).length,20);
});
test('edge search forwards bounded native offset and page size',async()=>{
 const orig=globalThis.fetch;let upstream='';
 globalThis.fetch=async url=>{
  upstream=String(url);
  return new Response(JSON.stringify({id:valid(1),title:'New Song',duration:170})+'\n',{status:200});
 };
 try{
  const result=await edgeSearch({request:new Request('https://test.invalid/api/omnibox?term=neon&offset=20&limit=20'),env:{GNARLY_BACKEND_URL:'https://backend.example'}});
  assert.equal(result.status,200);
  assert.match(upstream,/offset=20/);
  assert.match(upstream,/limit=20/);
  assert.equal((await result.json()).results.length,1);
 }finally{globalThis.fetch=orig}
});
test('edge official preview catalogue passes page query to iTunes',async()=>{
 const orig=globalThis.fetch;let upstream='';
 globalThis.fetch=async url=>{upstream=String(url);return Response.json({results:[]})};
 try{
  const response=await edgeCatalog({request:new Request('https://test.invalid/api/catalog?term=neon&offset=22&limit=22')});
  assert.equal(response.status,200);
  assert.match(upstream,/limit=22/);
  assert.match(upstream,/offset=22/);
 }finally{globalThis.fetch=orig}
});
test('search UI offers scroll pagination without old history instructions',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/root:\$\('#sheet-content'\)/);
 assert.match(source,/loadMoreSearchResults\(false\)/);
 assert.match(source,/function appendSearchResults\(/);
 assert.match(source,/startIndex=0/);
 assert.match(source,/Resultados da busca/);
 assert.doesNotMatch(source,/Busque qualquer música livremente/);
 assert.doesNotMatch(source,/Busque no catálogo do GNARLY/);
});
