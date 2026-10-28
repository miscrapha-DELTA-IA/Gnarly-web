import test from 'node:test';import assert from 'node:assert/strict';
import {classifyIntent,coverage,rank,localMatches,OmniboxSession} from '../lib/omnibox.js';
import {parseBackendNDJSON} from '../netlify/functions/omnibox.mjs';
test('matches Stage72 direct link and literal video id intent',()=>{assert.deepEqual(classifyIntent('https://youtu.be/dQw4w9WgXcQ'),{kind:'direct',videoId:'dQw4w9WgXcQ'});assert.deepEqual(classifyIntent('https://music.youtube.com/watch?v=dQw4w9WgXcQ'),{kind:'direct',videoId:'dQw4w9WgXcQ'});assert.equal(classifyIntent('GNARLY').kind,'text')});
test('instant history, accents and ranking avoid duplicate tracks',()=>{const history=[{id:'a',title:'Canção Boa',artist:'Ana',plays:3,lastPlayed:Date.now()}];assert.equal(coverage('ana canc',history[0]),1);assert.equal(localMatches('ana canc',history).length,1);const r=rank('ana canc',[history[0],{...history[0],id:'b'}],history);assert.equal(r.length,1)});
test('local session retains search, tracks repeat plays',()=>{const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};const x=new OmniboxSession(storage);x.setQuery('metal');x.record({id:'one',artist:'Test',title:'Metal',source:'preview'});x.record({id:'one',artist:'Test',title:'Metal',source:'preview'});const y=new OmniboxSession(storage);assert.equal(y.query,'metal');assert.equal(y.history[0].plays,2)});
test('Swift compatible backend NDJSON validates IDs and never returns MP3 URLs',()=>{const d=parseBackendNDJSON('not-json\n'+JSON.stringify({id:'dQw4w9WgXcQ',title:'A song',duration:200})+'\n'+JSON.stringify({id:'invalid',title:'Bad'})+'\n');assert.equal(d.length,1);assert.equal(d[0].source,'youtube');assert.equal(d[0].url,undefined)});

test('active searches rank query relevance over recently played unrelated music',()=>{
 const now=Date.now();
 const history=[{id:'played',title:'Outro Assunto',artist:'Favorito',plays:50,lastPlayed:now}];
 const songs=[{id:'weak',title:'Uma História Longe',artist:'Band',source:'youtube'},
              {id:'exact',title:'Luzes',artist:'Grupo',source:'youtube'},
              {id:'lyrics',title:'Luzes do Norte',artist:'Grupo',source:'youtube'}];
 const results=rank('Luzes',songs,history,now);
 assert.equal(results[0].id,'exact');
 assert.equal(results.length,3);
 assert.ok(!results.some(x=>x.id==='played'),'History must never be injected into active remote searches');
});
test('catalogue ranking retains more than twelve distinct searchable tracks',()=>{
 const songs=Array.from({length:20},(_,i)=>({id:'track-'+i,title:'Neon '+i,artist:'Artist '+i,source:'youtube',duration:190}));
 const ranked=rank('neon',songs,[]);
 assert.equal(ranked.length,20);
 assert.equal(new Set(ranked.map(x=>x.id)).size,20);
});
