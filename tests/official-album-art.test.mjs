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
 assert.match(css,/blur\(15px\)/);
 assert.match(css,/inset:-22px/);
 assert.match(app,/state\.current\?\.backgroundArtwork\|\|state\.current\?\.artwork/);
 assert.match(app,/Math\.max\(2400,artPixels\('background'\)\)/);
 assert.doesNotMatch(css,/background-size:min\(91vw/);
});