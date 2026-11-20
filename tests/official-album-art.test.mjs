import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upscaleAppleCover,matchAppleCover,matchDeezerCover,compatibleReleaseTitle,verifiedArchiveCoverURLs,serveAlbumArtwork} from '../lib/official-album-art.js';
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
  assert.equal(seen.length,3,'US and BR Apple storefronts are checked before Deezer');
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
 const queries=[];
 globalThis.fetch=async url=>{
  const query=new URL(String(url),'https://gnarly.example');queries.push(query);
  if(query.searchParams.get('mode')==='archive')return Response.json({artwork:null});
  return Response.json({artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/2400x2400bb.jpg',
   provider:'apple',candidates:[{artwork:'https://is1-ssl.mzstatic.com/image/thumb/demo/2400x2400bb.jpg',provider:'apple'}]});
 };
 try{
  const result=await requestVerifiedAlbumArtwork(trackWithCredit,{forBackground:true});
  assert.equal(queries[0].searchParams.get('title'),'Get Lucky');
  assert.equal(queries[0].searchParams.get('artist'),'Daft Punk');
  assert.equal(queries[0].searchParams.get('mode'),'catalog');
  assert.equal(queries[1].searchParams.get('mode'),'archive');
  assert.equal(result.alternatives.length,1);
 }finally{globalThis.fetch=previous}
});

test('Cover Art Archive returns original and CDN 1200 URL only for verified release IDs',()=>{
 const release='1c219341-7738-4a97-a124-b3ca2704ba17';
 assert.deepEqual(verifiedArchiveCoverURLs(release),[
  'https://coverartarchive.org/release/'+release+'/front',
  'https://coverartarchive.org/release/'+release+'/front-1200'
 ]);
 assert.deepEqual(verifiedArchiveCoverURLs('not-an-mbid'),[]);
 assert.deepEqual(verifiedArchiveCoverURLs('https://evil.example/path'),[]);
});
test('CAA CDN derivative still provides an exact-release cover if archive.org original is unavailable',async()=>{
 const old=globalThis.fetch,seen=[];
 const release='2c219341-7738-4a97-a124-b3ca2704ba17';
 globalThis.fetch=async (url,options)=>{
  const str=String(url);seen.push(str);
  if(str.includes('itunes.apple.com'))return Response.json({results:[]});
  if(str.includes('api.deezer.com'))return Response.json({data:[]});
  if(str.includes('musicbrainz.org/ws/2/recording'))return Response.json({recordings:[{
   id:'e8b09b4d-2ca3-4b20-90da-71f681a01249',title:'Get Lucky',
   length:248000,'artist-credit':[{name:'Daft Punk'}],
   releases:[{id:release,title:'Random Access Memories',status:'Official'}]
  }]});
  if(str.endsWith('/front'))return new Response('unavailable',{status:503});
  if(str.endsWith('/front-1200')){
   assert.equal(options.method,'HEAD');
   return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
  }
  throw Error('Unexpected lookup '+str);
 };
 try{
  const p=new URLSearchParams({title:track.title,artist:track.artist,
   album:track.album,duration:'249',mode:'hd'});
  const response=await serveAlbumArtwork(new Request('https://gnarly.example/api/artwork?'+p));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.provider,'musicbrainz');
  assert.equal(result.artwork,'https://coverartarchive.org/release/'+release+'/front-1200');
  assert.ok(seen.some(x=>x.endsWith('/front')));
  assert.ok(seen.some(x=>x.endsWith('/front-1200')));
 }finally{globalThis.fetch=old}
});
test('Brazil storefront rescues a verified album not present in the US catalog',async()=>{
 const old=globalThis.fetch,seen=[];
 globalThis.fetch=async url=>{
  const str=String(url);seen.push(str);
  if(str.includes('itunes.apple.com'))return Response.json({
   results:str.includes('country=BR')?apple:[]
  });
  if(str.includes('api.deezer.com'))return Response.json({data:[]});
  throw Error('Unexpected source '+str);
 };
 try{
  const p=new URLSearchParams({title:track.title,artist:track.artist,album:track.album,
   duration:'250',mode:'hd'});
  const result=await serveAlbumArtwork(new Request('https://gnarly.example/api/artwork?'+p));
  assert.equal((await result.json()).provider,'apple');
  assert.ok(seen.some(x=>x.includes('country=US')));
  assert.ok(seen.some(x=>x.includes('country=BR')));
 }finally{globalThis.fetch=old}
});

test('catalog-only mode responds before MusicBrainz when a storefront has a verified cover',async()=>{
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{
  const source=String(url);calls.push(source);
  if(source.includes('itunes.apple.com'))return Response.json({results:apple});
  if(source.includes('api.deezer.com'))return Response.json({data:[]});
  throw Error('Unexpected slow source '+source);
 };
 try{
  const p=new URLSearchParams({title:track.title,artist:track.artist,
   album:track.album,duration:'254',mode:'catalog'});
  const response=await serveAlbumArtwork(new Request('https://gnarly.example/api/artwork?'+p));
  const body=await response.json();
  assert.equal(body.provider,'apple');
  assert.deepEqual(body.candidates.map(item=>item.provider),['apple']);
  assert.ok(!calls.some(url=>url.includes('musicbrainz.org')));
 }finally{globalThis.fetch=previous}
});
test('browser streams the official catalog image before the archival lookup settles',async()=>{
 const previous=globalThis.fetch,seen=[],queries=[];
 let finishArchive;
 const archiveWait=new Promise(resolve=>finishArchive=resolve);
 const newTrack={...track,title:'Digital Lights 2047',duration:212,album:'Demo EP'};
 const fast='https://is1-ssl.mzstatic.com/image/thumb/fast/2400x2400bb.jpg';
 const original='https://coverartarchive.org/release/11111111-2222-3333-4444-555555555555/front';
 globalThis.fetch=async url=>{
  const query=new URL(String(url),'https://gnarly.example');
  const mode=query.searchParams.get('mode');queries.push(mode);
  if(mode==='catalog')return Response.json({
   artwork:fast,provider:'apple',candidates:[{artwork:fast,provider:'apple'}]
  });
  if(mode==='archive'){
   await archiveWait;
   return Response.json({artwork:original,provider:'musicbrainz'});
  }
  throw Error('Unexpected mode '+mode);
 };
 try{
  let completed=false;
  const operation=requestVerifiedAlbumArtwork(newTrack,{
   forBackground:true,onCandidate:value=>seen.push(value.url)
  }).then(value=>{completed=true;return value});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(seen,[fast]);
  assert.equal(completed,false,'archival verification remains pending');
  finishArchive();
  const result=await operation;
  assert.deepEqual(seen,[fast,original]);
  assert.equal(result.provider,'apple');
  assert.ok(result.alternatives.some(item=>item.url===original));
  assert.deepEqual(queries,['catalog','archive']);
 }finally{globalThis.fetch=previous}
});

test('album aliases match only the verified bonus-disc title, never generic or unrelated editions',()=>{
 assert.equal(compatibleReleaseTitle('xperiment - cartunez','cartunez'),true);
 assert.equal(compatibleReleaseTitle('xperiment – cartunez','cartunez'),true);
 assert.equal(compatibleReleaseTitle('xperiment - cartunez','xperiment - cartunez'),true);
 assert.equal(compatibleReleaseTitle('xperiment - cartunez','More Chaos'),false);
 assert.equal(compatibleReleaseTitle('xperiment - live','live'),false);
 assert.equal(compatibleReleaseTitle('xperiment - remix','remix'),false);
 assert.equal(compatibleReleaseTitle('Only-One-Album','Album'),false);
 assert.equal(compatibleReleaseTitle('random - unrelated','random'),false);
});
test('Rare Creature deluxe track resolves official MusicBrainz cartunez original',async()=>{
 const previous=globalThis.fetch;
 const release='8664a084-f948-4cc1-be89-641babe2743c';
 const calls=[];
 globalThis.fetch=async (url,options={})=>{
  const value=String(url);calls.push(value);
  if(value.includes('musicbrainz.org/ws/2/recording'))
   return Response.json({recordings:[{
    id:'d243b614-8f21-42d9-8301-a8ba898d808e',title:'rare creature',
    length:143000,'artist-credit':[{name:'Ken Carson'}],
    releases:[{id:release,title:'cartunez',status:'Official'}]
   }]});
  if(value.includes('coverartarchive.org/release/'+release+'/front'))
   return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
  throw new Error('Unexpected network fetch: '+value);
 };
 try{
  const params=new URLSearchParams({title:'rare creature',artist:'Ken Carson',
   duration:'143',album:'xperiment - cartunez',mode:'archive'});
  const result=await serveAlbumArtwork(new Request('https://gnarly.test/api/artwork?'+params));
  const data=await result.json();
  assert.equal(data.provider,'musicbrainz');
  assert.equal(data.artwork,'https://coverartarchive.org/release/'+release+'/front');
  assert.ok(calls.some(x=>x.includes('musicbrainz.org')));
 }finally{globalThis.fetch=previous}
});
test('matching the deluxe suffix still refuses a different version of Rare Creature',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('musicbrainz.org'))
   return Response.json({recordings:[{
    id:'d243b614-8f21-42d9-8301-a8ba898d808e',title:'rare creature',
    length:199000,'artist-credit':[{name:'Ken Carson'}],
    releases:[{id:'8664a084-f948-4cc1-be89-641babe2743c',
     title:'cartunez',status:'Official'}]
   }]});
  throw new Error('Mismatched recording must never probe image');
 };
 try{
  const params=new URLSearchParams({title:'rare creature',artist:'Ken Carson',
   duration:'143',album:'xperiment - cartunez',mode:'archive'});
  const result=await serveAlbumArtwork(new Request('https://gnarly.test/api/artwork?'+params));
  const body=await result.json();
  assert.equal(body.artwork,null);
 }finally{globalThis.fetch=previous}
});
