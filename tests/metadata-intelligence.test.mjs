import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isGenericArtist,inferredCredit,matchApple,matchMusicBrainz,applyMetadata,enrichSearchCredits} from '../lib/metadata-intelligence.js';
import {onRequestGet} from '../functions/api/metadata.js';
import {OmniboxSession} from '../lib/omnibox.js';

const record=(title,artist,duration=200,album='Test Album',id=1)=>({
 wrapperType:'track',trackId:id,trackName:title,artistName:artist,trackTimeMillis:duration*1000,
 collectionName:album,artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg'
});
const song=(title,artist='YouTube Music',duration=200)=>({
 id:'youtube:abcdefghijk',videoId:'abcdefghijk',source:'youtube',title,artist,
 duration,artwork:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'
});
test('generic provider credits are not credited as performing artists',()=>{
 for(const artist of ['YouTube','youtube music','YT Music','Artista não identificado','Unknown Artist','Taylor Swift - Topic','']){
  assert.equal(isGenericArtist(artist),true,artist);
 }
 assert.equal(isGenericArtist('Taylor Swift'),false);
 assert.deepEqual(inferredCredit('Artist A - Neon Sky (Official Audio)','YouTube Music'),
  {title:'Neon Sky',artist:'Artist A',inferred:true});
});
test('Apple metadata replaces generic credits ONLY on exact title, version and duration',()=>{
 const q=song('Neon Sky');
 const candidate=matchApple(q,[record('Neon Sky','Artist A')]);
 assert.equal(candidate.artist,'Artist A');
 assert.equal(candidate.source,'itunes');
 assert.equal(candidate.confidence>=84,true);
 assert.equal(applyMetadata(q,candidate),true);
 assert.equal(q.artist,'Artist A');
 assert.equal(q.album,'Test Album');
 assert.match(q.artwork,/1200x1200bb/);
 assert.equal(q.videoId,'abcdefghijk');
 assert.equal(q.source,'youtube');
 assert.equal(q.duration,200);
});
test('versions, artists and ambiguous titles cannot be silently replaced',()=>{
 assert.equal(matchApple(song('Neon Sky (Live)'),[record('Neon Sky','Artist A')]),null);
 assert.equal(matchApple(song('Neon Sky', 'Artist B'),[record('Neon Sky','Artist A')]),null);
 assert.equal(matchApple(song('Neon Sky','YouTube Music',0),[record('Neon Sky','Artist A')]),null);
 assert.equal(matchApple(song('Neon Sky'),[record('Neon Sky','Artist A',201,'A',1),record('Neon Sky','Artist B',201,'B',2)]),null);
 assert.equal(matchApple(song('Neon Sky'),[record('Neon Sky','Artist A',250)]),null);
 assert.equal(matchApple(song('Neon Sky (Remix)'),[record('Neon Sky (Live)','Artist A')]),null);
});
test('YouTube title with embedded artist is credited only after independent confirmation',()=>{
 const q=song('Artist A - Neon Sky (Official Audio)','YouTube',200);
 assert.equal(matchApple(q,[record('Neon Sky','Artist A')])?.artist,'Artist A');
 const metadata=matchApple(q,[record('Neon Sky','Artist A')]);
 applyMetadata(q,metadata);
 assert.equal(q.title,'Neon Sky');
 assert.equal(q.artist,'Artist A');
 assert.equal(q.id,'youtube:abcdefghijk');
});
test('existing iTunes search results enrich all matching songs without additional fetches',()=>{
 const songs=[song('Neon Sky'),song('Something Else')];
 const previews=[{source:'preview',id:'itunes:1',title:'Neon Sky',artist:'Artist A',
  album:'Test Album',duration:200,artwork:'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg'}];
 assert.equal(enrichSearchCredits(songs,previews),songs);
 assert.equal(songs[0].artist,'Artist A');
 assert.equal(songs[1].artist,'YouTube Music');
 assert.equal(songs[0].videoId,'abcdefghijk');
});
test('MusicBrainz credit, official album and recording MBID are independently validated',()=>{
 const result=matchMusicBrainz(song('Neon Sky'),[{
  id:'12345678-1234-1234-1234-123456789abc',title:'Neon Sky',length:200000,
  'artist-credit':[{name:'Artist A',artist:{name:'Artist A'}}],
  releases:[{title:'Test Album',status:'Official',id:'98765432-1234-1234-1234-123456789abc'}]
 }]);
 assert.equal(result.artist,'Artist A');
 assert.equal(result.album,'Test Album');
 assert.equal(result.source,'musicbrainz');
 assert.equal(result.identifiers.recordingMBID,'12345678-1234-1234-1234-123456789abc');
});
test('metadata resolver has bounded request validation and Apple-first cache',async()=>{
 const bad=await onRequestGet({request:new Request('https://gnarly-web-pages.pages.dev/api/metadata?title=x&duration=99999')});
 assert.equal(bad.status,400);
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async input=>{const url=String(input);assert.match(url,/itunes\.apple\.com/);calls++;
   return Response.json({results:[record('Fresh Anthem','Artist C',201)]});};
  const url='https://gnarly-web-pages.pages.dev/api/metadata?title=Fresh%20Anthem&artist=YouTube%20Music&duration=201';
  const first=await onRequestGet({request:new Request(url)});
  assert.equal(first.status,200);
  assert.equal((await first.json()).metadata.artist,'Artist C');
  assert.equal((await (await onRequestGet({request:new Request(url)})).json()).metadata.artist,'Artist C');
  assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test('history metadata revision does not increment the playback counter',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 const history=new OmniboxSession(storage);
 history.record(song('Neon Sky'));const count=history.history[0].plays;
 const improved={...song('Neon Sky'),'artist':'Artist A',album:'Test Album'};
 history.updateMetadata(improved);
 assert.equal(history.history[0].artist,'Artist A');
 assert.equal(history.history[0].plays,count);
 assert.equal(new OmniboxSession(storage).history[0].artist,'Artist A');
});
test('metadata integration never overwrites audio graph or identity',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/enrichSearchCredits\(songs,previews\)/);
 assert.match(app,/resolveTrackMetadata/);
 assert.match(app,/metadataAbort\?\.abort\(\)/);
 assert.match(app,/void loadAutoLyrics\(track\)/);
 assert.doesNotMatch(app,/enrichLocalTrack\(/);
});
