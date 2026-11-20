import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upscaleAppleCover,matchAppleCover,matchDeezerCover,serveAlbumArtwork} from '../lib/official-album-art.js';
import {shouldLookupAlbumArtwork,requestVerifiedAlbumArtwork} from '../lib/album-artwork-client.js';

const track={title:'Get Lucky',artist:'Daft Punk',album:'Random Access Memories',duration:248,source:'youtube',artwork:'https://lh3.googleusercontent.com/sample=s120-c'};
const apple=[{wrapperType:'track',trackName:'Get Lucky',artistName:'Daft Punk',
 collectionName:'Random Access Memories',trackTimeMillis:248000,
 artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/example/100x100bb.jpg'}];
const deezer=[{title:'Get Lucky',artist:{name:'Daft Punk'},album:{title:'Random Access Memories',
 cover_xl:'https://cdn-images.dzcdn.net/images/cover/example/1000x1000-000000-80-0-0.jpg'},duration:248}];

test('real album master URLs are derived from official Apple music assets, never a video still',()=>{
 const matched=matchAppleCover(track,apple);
 assert.equal(matched.source,'apple');
 assert.match(matched.artwork,/2400x2400bb\.jpg$/);
 assert.equal(upscaleAppleCover('https://evil.invalid/a/100x100bb.jpg'),'');
 assert.match(upscaleAppleCover('https://is1-ssl.mzstatic.com/image/thumb/test/100x100-75.jpg'),/2400x2400bb-75\.jpg$/);
});
test('recording identity and version safeguards reject wrong songs, covers and remixes',()=>{
 assert.equal(matchAppleCover(track,[{...apple[0],artistName:'Random Singer'}]),null);
 assert.equal(matchAppleCover(track,[{...apple[0],trackName:'Get Lucky (Live)'}]),null);
 assert.equal(matchAppleCover(track,[{...apple[0],trackTimeMillis:320000}]),null);
 assert.equal(matchAppleCover({...track,duration:0,album:''},apple),null);
 assert.equal(matchAppleCover({...track,duration:0},apple)?.source,'apple');
});
test('Deezer is a verified independent album-art fallback',()=>{
 assert.equal(matchDeezerCover(track,deezer)?.source,'deezer');
 assert.equal(matchDeezerCover(track,[{...deezer[0],title:'Get Lucky - Remix'}]),null);
 assert.equal(matchDeezerCover(track,[{...deezer[0],album:{...deezer[0].album,
 cover_xl:'https://evil.invalid/test.jpg'}}]),null);
});
test('album master source only applies to real music tracks, not local placeholders',()=>{
 assert.equal(shouldLookupAlbumArtwork(track),true);
 assert.equal(shouldLookupAlbumArtwork({...track,artist:'Artista não identificado'}),false);
 assert.equal(shouldLookupAlbumArtwork({...track,artwork:'https://is1-ssl.mzstatic.com/image/thumb/Music1/test/2400x2400bb.jpg'}),false);
 assert.equal(shouldLookupAlbumArtwork({...track,source:'preview'}),false);
});
test('artwork API has independent Apple/Deezer fallback; never returns guessed cover',async()=>{
 const previous=globalThis.fetch,seen=[];
 globalThis.fetch=async url=>{
  seen.push(String(url));
  if(String(url).includes('itunes.apple.com'))return Response.json({results:[{...apple[0],trackName:'Wrong Song'}]});
  return Response.json({data:deezer});
 };
 try{
  const q=new URLSearchParams({title:track.title,artist:track.artist,album:track.album,duration:String(track.duration)});
  const res=await serveAlbumArtwork(new Request('https://gnarly.example/api/artwork?'+q));
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.provider,'deezer');
  assert.match(data.artwork,/cdn-images\.dzcdn\.net/);
  assert.equal(seen.length,2);
 }finally{globalThis.fetch=previous}
});
test('album master flows into background, player, karaoke and visible rows without changing playback',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 const netlify=readFileSync(new URL('../netlify/functions/artwork.mjs',import.meta.url),'utf8');
 const metadata=readFileSync(new URL('../lib/metadata-intelligence.js',import.meta.url),'utf8');
 assert.match(worker,/'\/api\/artwork': \{method:'GET', handler:artwork\}/);
 assert.match(netlify,/path:'\/api\/artwork'/);
 assert.match(app,/async function verifiedAlbumAsset\(track,role='background'\)/);
 assert.match(app,/void enrichOfficialAlbumArt\(track\)/);
 assert.match(app,/applyOfficialArtwork\(track,official\)/);
 assert.match(app,/data-art-context/);
 assert.match(metadata,/googleusercontent/);
 assert.match(app,/fullScreen\?900:460/);
 assert.match(app,/backgroundArtwork=official\.asset\.url/);
 assert.doesNotMatch(app,/track\.url=official/);
 assert.doesNotMatch(app,/track\.source=official/);
});

test('collaborative credits from Swift catalog do not block high-resolution artwork',()=>{
 const track={title:'Luv monëy',artist:'Yeat, Lancey Foux',duration:214,album:''};
 const a=[{wrapperType:'track',trackName:'Luv money (feat. Lancey Foux)',artistName:'Yeat & Lancey Foux',
  collectionName:'Official Release',trackTimeMillis:214000,
  artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music1/collab/100x100bb.jpg'}];
 const match=matchAppleCover(track,a);
 assert.ok(match);
 assert.equal(match.source,'apple');
 assert.match(match.artwork,/2400x2400bb/);
 assert.equal(matchAppleCover(track,[{...a[0],artistName:'Other Artist'}]),null);
 assert.equal(matchAppleCover(track,[{...a[0],trackTimeMillis:280000}]),null);
});
test('Swift-style cover remains edge-to-edge even when an individual catalog has no HD source',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(css,/#gnarly-background\.cover-bg \.photo-background/);
 assert.match(css,/background-size:cover!important/);
 const cover=css.match(/#gnarly-background\.cover-bg \.photo-background \{([\s\S]*?)\}/)?.[1]||'';
 assert.match(cover,/filter:none;/);
 assert.doesNotMatch(cover,/blur\(|saturate\(|contrast\(/);
 assert.match(cover,/inset:0;/);
 assert.match(css,/#gnarly-background\.cover-bg \.visual-dim \{\s*background:transparent;/);
 assert.match(app,/state\.current\?\.backgroundArtwork\|\|state\.current\?\.artwork/);
 assert.match(app,/Math\.max\(2400,artPixels\('background'\)\)/);
 assert.doesNotMatch(css,/background-size:min\(91vw/);
});

test('HD artwork endpoint returns multiple matched album masters for resolution comparison',async()=>{
 const previous=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{
  urls.push(String(url));
  if(String(url).includes('itunes.apple.com'))return Response.json({results:apple});
  if(String(url).includes('api.deezer.com'))return Response.json({data:deezer});
  throw Error('unrecognized provider');
 };
 try{
  const params=new URLSearchParams({title:track.title,artist:track.artist,
   album:track.album,duration:String(track.duration),mode:'hd'});
  const response=await serveAlbumArtwork(new Request('https://gnarly.example/api/artwork?'+params));
  const body=await response.json();
  assert.equal(body.provider,'apple');
  assert.deepEqual(body.candidates.map(x=>x.provider),['apple','deezer']);
  assert.equal(urls.length,2);
 }finally{globalThis.fetch=previous}
});
test('MusicBrainz artwork fallback demands a verified recording and release, not a guessed album',async()=>{
 const previous=globalThis.fetch,urls=[];
 const release='1c219341-7738-4a97-a124-b3ca2704ba17';
 globalThis.fetch=async (url,options)=>{
  const str=String(url);urls.push(str);
  if(str.includes('itunes.apple.com'))return Response.json({results:[]});
  if(str.includes('api.deezer.com'))return Response.json({data:[]});
  if(str.includes('musicbrainz.org'))return Response.json({recordings:[{
   id:'e8b09b4d-2ca3-4b20-90da-71f681a01249',title:'Get Lucky',
   length:248000,'artist-credit':[{name:'Daft Punk'}],
   releases:[{id:release,title:'Random Access Memories',status:'Official'}]
  }]});
  if(str.includes('coverartarchive.org')){
   assert.equal(options.method,'HEAD');
   return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
  }
  throw Error('unexpected URL '+str);
 };
 try{
  const params=new URLSearchParams({title:track.title,artist:track.artist,
   album:track.album,duration:'251',mode:'hd'});
  const result=await serveAlbumArtwork(new Request('https://gnarly.example/api/artwork?'+params));
  const data=await result.json();
  assert.equal(data.provider,'musicbrainz');
  assert.equal(data.artwork,'https://coverartarchive.org/release/'+release+'/front');
  assert.ok(urls.some(x=>x.includes('musicbrainz.org')));
 }finally{globalThis.fetch=previous}
});
test('generic artist can be recovered only when artist/title credits are explicitly present',async()=>{
 const trackWithCredit={...track,title:'Daft Punk - Get Lucky',artist:'Artista não identificado',album:'',source:'youtube'};
 assert.equal(shouldLookupAlbumArtwork(trackWithCredit,{forBackground:true}),true);
 const previous=globalThis.fetch;
 let query;
 globalThis.fetch=async url=>{
  query=new URL(String(url));
  return Response.json({artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/2400x2400bb.jpg',
   provider:'apple',candidates:[{artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/2400x2400bb.jpg',provider:'apple'}]});
 };
 try{
  const result=await requestVerifiedAlbumArtwork(trackWithCredit,{forBackground:true});
  assert.equal(query.searchParams.get('title'),'Get Lucky');
  assert.equal(query.searchParams.get('artist'),'Daft Punk');
  assert.equal(query.searchParams.get('mode'),'hd');
  assert.equal(result.alternatives.length,1);
 }finally{globalThis.fetch=previous}
});
