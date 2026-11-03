import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TdrMonitor} from '../lib/tdr-metrics.js';
import {renderTdrPanel,formatTdrDuration} from '../ui/tdr-panel.js';
import {onRequestGet as jamendoHandler} from '../functions/api/jamendo-search.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('TDR panel displays P50/P95, manual copy and rolling elapsed progress',()=>{
 let at=0;const monitor=new TdrMonitor({now:()=>at});
 monitor.select(1,{source:'youtube',autoplay:true});at=100;monitor.playCall(1);
 at=1200;monitor.playing(1,{route:'fast_edge',position:0});
 monitor.select(2,{source:'youtube',autoplay:true});at=1430;
 const html=renderTdrPanel(monitor.snapshot());
 assert.match(html,/id="tdr-dashboard"/);
 assert.match(html,/TDR MEDIANO/);
 assert.match(html,/TDR P95/);
 assert.match(html,/1,20 s/);
 assert.match(html,/id="tdr-live-elapsed"/);
 assert.match(html,/data-command="tdr-refresh"/);
 assert.match(html,/data-command="tdr-copy"/);
 assert.match(html,/Seleção → Play/);
 assert.match(html,/Cloudflare · \/fast-audio/);
 assert.doesNotMatch(html,/youtube:[A-Za-z0-9_-]+|https:\/\/|<script|audio\.play/);
 assert.equal(formatTdrDuration(null),'—');
 assert.equal(formatTdrDuration(325),'325 ms');
 assert.equal(formatTdrDuration(2125),'2,13 s');
});
test('failed exclusive song is prominently visible beside successful-only TDR',()=>{
 let now=0;const tdr=new TdrMonitor({now:()=>now});
 tdr.select(1,{autoplay:true,source:'youtube'});now=772;tdr.playCall(1);tdr.playing(1);
 tdr.select(2,{autoplay:true,source:'youtube'});
 now=1000;tdr.playCall(2);
 now=21000;tdr.mark(2,'media_error');tdr.mark(2,'recovery_started');
 now=22000;tdr.mark(2,'pc_wait_started');
 now=70000;tdr.mark(2,'pc_wait_finished');tdr.mark(2,'pc_ready');
 now=90000;tdr.mark(2,'r2_sync_started');
 now=122019;tdr.finish(2,'terminal_error');
 const html=renderTdrPanel(tdr.snapshot());
 assert.match(html,/TDR MEDIANO/);
 assert.match(html,/772 ms/);
 assert.match(html,/FALHAS · TEMPO ATÉ ERRO/);
 assert.match(html,/121,2 s/);
 assert.match(html,/ÚLTIMA FALHA · LINHA DO TEMPO/);
 assert.match(html,/PC Node pronto/);
 assert.match(html,/Espera cache R2/);
 assert.match(html,/tempo parcial até o erro/);
 assert.match(html,/não identifica automaticamente a causa/);
});
test('TDR dashboard identifies an audio start after a premature terminal warning',()=>{
 let now=0;
 const tdr=new TdrMonitor({now:()=>now});
 tdr.select(1,{source:'youtube',autoplay:true});
 now=100;tdr.playCall(1);
 now=121019;tdr.finish(1,'terminal_error');
 let html=renderTdrPanel(tdr.snapshot());
 assert.match(html,/FALHAS · TEMPO ATÉ ERRO/);
 now=123000;tdr.playing(1,{route:'fast_edge'});
 html=renderTdrPanel(tdr.snapshot());
 assert.match(html,/REPRODUÇÃO APÓS ERRO/);
 assert.match(html,/iniciou após aviso de erro/);
 assert.match(html,/Alertas corrigidos por reprodução tardia: 1/);
 assert.doesNotMatch(html,/ÚLTIMA FALHA · LINHA DO TEMPO/);
});
test('TDR is reachable through More and Exibição, refresh timer is cancelled on close',()=>{
 const app=source('app.js'),display=source('ui/display-panel.js'),css=source('styles.css');
 assert.match(app,/case 'tdr':content\.innerHTML=renderTdrPanel\(tdr\.snapshot\(\)\);break/);
 assert.match(app,/case 'go-tdr':openSheet\('tdr'\);break/);
 assert.match(app,/case 'tdr-copy'/);
 assert.match(app,/window\.gnarlyTDRDiagnostics=\(\)=>tdr\.snapshot\(\)/);
 assert.match(app,/function closeSheet\(\)\{\s*stopTdrPanelTimer\(\)/);
 assert.match(app,/if\(which==='tdr'\)startTdrPanelTimer\(\)/);
 assert.match(app,/if\(state\.sheet==='tdr'\)renderSheet\(\)/);
 assert.match(display,/data-command="go-tdr"/);
 assert.match(css,/\.tdr-stats\{/);
});
test('Jamendo without configured key provides an explicit successful disabled capability',async()=>{
 const request=new Request('https://gnarly-web-pages.pages.dev/api/jamendo-search?term=TV%20Girl');
 const res=await jamendoHandler({request,env:{}},()=>{throw Error('no external request should run')});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('X-Gnarly-Provider'),'disabled');
 assert.deepEqual(await res.json(),{status:'not_configured',results:[]});
});
test('Jamendo client stops issuing requests once feature is known disabled',async()=>{
 const {searchJamendo}=await import('../lib/jamendo-catalog.js?test_disabled_20261103');
 let requests=0;
 const fetcher=async()=>{requests++;return Response.json({status:'not_configured',results:[]})};
 assert.deepEqual(await searchJamendo('TV Girl',{fetcher}),[]);
 assert.deepEqual(await searchJamendo('Beach House',{fetcher}),[]);
 assert.equal(requests,1);
});
test('Jamendo transient 503 pauses repeated optional requests without harming playback',async()=>{
 const {searchJamendo}=await import('../lib/jamendo-catalog.js?test_transient_20261103');
 let calls=0,now=100000;
 const fetcher=async()=>{calls++;return new Response('',{status:503})};
 assert.deepEqual(await searchJamendo('TV Girl',{fetcher,now:()=>now}),[]);
 assert.deepEqual(await searchJamendo('Beach House',{fetcher,now:()=>now}),[]);
 assert.equal(calls,1);
 now+=30001;
 assert.deepEqual(await searchJamendo('Other',{fetcher,now:()=>now}),[]);
 assert.equal(calls,2);
});
test('Apple proxy 502 triggers existing genuine direct preview fallback, then brief circuit break',async()=>{
 const {searchCatalog}=await import('../lib/catalog.js?test_proxy_502_20261103');
 const priorFetch=globalThis.fetch;
 let proxy=0,direct=0;
 globalThis.fetch=async url=>{
  const value=String(url);
  if(value.startsWith('/api/catalog?')){
   proxy++;
   return {ok:false,status:502,headers:{get:()=>null}};
  }
  if(value.startsWith('https://itunes.apple.com/search?')){
   direct++;
   return {ok:true,json:async()=>({results:[{
    wrapperType:'track',trackId:135,trackName:'Real Apple Preview',
    artistName:'Actual artist',collectionName:'Actual album',
    artworkUrl100:'https://example.test/100x100bb.jpg',
    previewUrl:'https://example.test/preview.m4a',trackTimeMillis:30000
   }]})};
  }
  throw Error('Unexpected catalogue endpoint '+value);
 };
 try{
  const first=await searchCatalog('TV Girl');
  assert.equal(first.length,1);
  assert.equal(first[0].title,'Real Apple Preview');
  assert.equal(first[0].source,'preview');
  assert.equal(proxy,1);
  const second=await searchCatalog('Beach House');
  assert.equal(second.length,1);
  assert.equal(proxy,1,'transient Pages 502 must not cause another failing proxy request');
  assert.equal(direct,2);
 }finally{globalThis.fetch=priorFetch;}
});
