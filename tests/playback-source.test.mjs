import {test} from 'node:test';
import assert from 'node:assert/strict';
import {youtubeID, trackAudioURL, selectMusicResults, playbackFailureMessage} from '../lib/playback-source.js';
const youtube = {source:'youtube',videoId:'dQw4w9WgXcQ',title:'Sample'};
test('native backend receives only canonical YouTube watch URL',()=>{
  const url = new URL(trackAudioURL(youtube));
  assert.equal(url.origin, 'https://nightcorelab.onrender.com');
  assert.equal(url.pathname, '/download');
  assert.equal(url.searchParams.get('delivery'), 'browser');
  assert.equal(url.searchParams.get('url'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});
test('invalid IDs and other sources cannot activate native download',()=>{
  assert.equal(trackAudioURL({...youtube,videoId:'https://fake.test/'}),null);
  assert.equal(youtubeID({...youtube,source:'preview'}),null);
  assert.equal(trackAudioURL({source:'local',url:'file:///music.mp3'}),null);
});
test('song catalog takes priority over 30-second previews',()=>{
  const preview={source:'preview',title:'30s'};
  assert.deepEqual(selectMusicResults([youtube],[preview]),[youtube]);
  assert.deepEqual(selectMusicResults([],[preview]),[preview]);
});

test('browser distinguishes media and autoplay errors from unobservable HTTP status',()=>{
  assert.match(playbackFailureMessage({name:'NotAllowedError'},null), /Safari/);
  assert.match(playbackFailureMessage({name:'NotSupportedError'},{code:4}), /código de mídia 4/);
  assert.match(playbackFailureMessage(null,{code:2}), /Erro de rede/);
  assert.doesNotMatch(playbackFailureMessage(null,{code:2}), /HTTP 403/);
});

test('bounded retry forces a fresh browser request without changing canonical source',()=>{
 const original=new URL(trackAudioURL(youtube));
 const retry=new URL(trackAudioURL(youtube,{attempt:1}));
 assert.equal(retry.searchParams.get('retry'),'1');
 assert.equal(retry.searchParams.get('url'),original.searchParams.get('url'));
 assert.equal(retry.searchParams.get('delivery'),'browser');
 assert.equal(new URL(trackAudioURL(youtube,{attempt:9})).searchParams.has('retry'),false);
 assert.equal(trackAudioURL({...youtube,source:'preview'},{attempt:1}),null);
});

test('prepared route hint is scoped to GNARLY Pages and never changes the canonical recording',()=>{
 const previous=globalThis.location;
 globalThis.location={hostname:'gnarly-web-pages.pages.dev'};
 try{
  assert.equal(trackAudioURL(youtube,{prepared:true}),'/fast-audio/dQw4w9WgXcQ?prepared=1');
  assert.equal(trackAudioURL(youtube,{prepared:false}),'/fast-audio/dQw4w9WgXcQ');
  assert.equal(trackAudioURL(youtube,{prepared:true,cacheOnly:true}),'/fast-audio/dQw4w9WgXcQ?cached-only=1');
  const retry=new URL(trackAudioURL(youtube,{attempt:1,prepared:true}));
  assert.equal(retry.pathname,'/download');
  assert.equal(retry.searchParams.has('prepared'),false);
  assert.equal(retry.searchParams.get('url'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous}
});

test('only first-party first-attempt playback can request the bounded PC-first cache route',()=>{
 const saved=globalThis.location;
 globalThis.location={hostname:'gnarly-web-pages.pages.dev'};
 try{
  assert.equal(trackAudioURL(youtube,{pcFirst:true}),'/fast-audio/dQw4w9WgXcQ?pc-first=1');
  assert.equal(trackAudioURL(youtube,{prepared:true,pcFirst:true}),'/fast-audio/dQw4w9WgXcQ?prepared=1');
  assert.equal(trackAudioURL(youtube,{pcFirst:true,cacheOnly:true}),'/fast-audio/dQw4w9WgXcQ?cached-only=1');
  assert.equal(new URL(trackAudioURL(youtube,{pcFirst:true,attempt:1})).searchParams.has('pc-first'),false);
  globalThis.location={hostname:'localhost'};
  assert.equal(new URL(trackAudioURL(youtube,{pcFirst:true})).searchParams.has('pc-first'),false);
 }finally{if(saved===undefined)delete globalThis.location;else globalThis.location=saved}
});
