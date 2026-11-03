import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PLAYBACK_RETRY_TEXT,renderPlaybackFeedback} from '../lib/player-feedback.js';

test('progress and internal recovery are silent on player and iPod',()=>{
 const playerStatus={textContent:'Guardian preparando no PC',hidden:false};
 const ipodStatus={textContent:'HTTP 429 / cache'};
 renderPlaybackFeedback({playerStatus,ipodStatus});
 assert.equal(playerStatus.textContent,'');
 assert.equal(playerStatus.hidden,true);
 assert.equal(ipodStatus.textContent,'');
});

test('terminal errors have exactly one generic message, then clear on retry',()=>{
 const playerStatus={textContent:'MediaError 4',hidden:true};
 const ipodStatus={textContent:'PC failure'};
 renderPlaybackFeedback({playerStatus,ipodStatus},{error:true});
 assert.equal(PLAYBACK_RETRY_TEXT,'Tente novamente');
 assert.equal(playerStatus.textContent,PLAYBACK_RETRY_TEXT);
 assert.equal(ipodStatus.textContent,PLAYBACK_RETRY_TEXT);
 assert.equal(playerStatus.hidden,false);
 renderPlaybackFeedback({playerStatus,ipodStatus});
 assert.equal(playerStatus.textContent,'');
 assert.equal(playerStatus.hidden,true);
 assert.equal(ipodStatus.textContent,'');
});

test('real failure telemetry remains, but public playback status is sanitized',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const b=app.indexOf('function reportAudioError('),e=app.indexOf('function setIPodSkin(',b);
 assert.ok(b>0&&e>b);
 const f=app.slice(b,e);
 assert.match(f,/signalPlaybackMetric\('final_error'/);
 assert.match(f,/state\.audioState='error';state\.playbackError=PLAYBACK_RETRY_TEXT/);
 assert.match(f,/renderPlaybackFeedback\(/);
 assert.match(f,/if\(state\.audioState==='error'\)return/);
 assert.doesNotMatch(f,/toast\(|showOptionalOfficialSource\(|textContent=_detail/);
 assert.match(app,/waitForPCNodeReady\(track\.videoId,/);
});

test('official return flow keeps cache checks silent and only generic failure text',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const b=app.indexOf('async function tryNativeFromOfficial()'),e=app.indexOf('function toggleFavorite(',b);
 assert.match(html,/id="youtube-native-status"[^>]*hidden/);
 assert.match(app.slice(b,e),/status\.textContent=PLAYBACK_RETRY_TEXT/);
 assert.doesNotMatch(app.slice(b,e),/status\.textContent='[^']*(?:R2|cache|Guardian|PC)/i);
});
