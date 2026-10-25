import {test} from 'node:test';
import assert from 'node:assert/strict';
import {youtubeID, trackAudioURL, selectMusicResults} from '../lib/playback-source.js';
const youtube = {source:'youtube',videoId:'dQw4w9WgXcQ',title:'Sample'};
test('native backend receives only canonical YouTube watch URL',()=>{
  const url = new URL(trackAudioURL(youtube));
  assert.equal(url.origin, 'https://nightcorelab.onrender.com');
  assert.equal(url.pathname, '/download');
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
