import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPlayerSurfaceMenu} from '../ui/player-surface.js';
import {officialEmbedURL,officialWatchURL,officialVideoId,canUseOfficial,shouldUseOfficialAfterNativeFailure} from '../lib/official-playback.js';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const track={id:'youtube:ABCDEFGHIJK',source:'youtube',videoId:'ABCDEFGHIJK',title:'Example recording'};

test('official YouTube integration is built from a validated canonical recording',()=>{
 assert.equal(officialVideoId(track),'ABCDEFGHIJK');
 assert.equal(officialWatchURL(track),'https://www.youtube.com/watch?v=ABCDEFGHIJK');
 assert.equal(officialEmbedURL(track),'https://www.youtube-nocookie.com/embed/ABCDEFGHIJK?playsinline=1&controls=1&autoplay=0');
 assert.equal(officialEmbedURL({...track,videoId:'http://evil/'}),null);
 assert.equal(canUseOfficial({...track,source:'local'}),false);
 assert.equal(canUseOfficial(track,{offline:true}),false);
 assert.equal(canUseOfficial(track),true);
});
test('after native recovery, every valid remote media failure switches to official playback, except user gesture/abort',()=>{
 for(const error of [null,{name:'NotSupportedError'},{name:'TypeError'},{name:'EncodingError'}])
  assert.equal(shouldUseOfficialAfterNativeFailure(track,{error}),true);
 for(const error of [{name:'NotAllowedError'},{name:'AbortError'}])
  assert.equal(shouldUseOfficialAfterNativeFailure(track,{error}),false);
 assert.equal(shouldUseOfficialAfterNativeFailure(track,{offline:true}),false);
 assert.equal(shouldUseOfficialAfterNativeFailure({...track,source:'local'}),false);
 assert.equal(shouldUseOfficialAfterNativeFailure({...track,videoId:'invalid'}),false);
});
test('YouTube is a visible GNARLY page section, NOT hidden audio or a blocking pop-up',()=>{
 const html=source('index.html'),css=source('styles.css');
 const player=html.indexOf('id="player-section"'),official=html.indexOf('id="youtube-player-dialog"');
 const search=html.indexOf('id="omnibox-shell"');
 assert.ok(player>=0&&official>player&&search>official);
 assert.match(html,/<section id="youtube-player-dialog" class="youtube-modal official-inline"/);
 assert.match(html,/role="region" aria-label="Reprodução oficial do YouTube"/);
 assert.match(html,/iframe id="youtube-player-frame"/);
 assert.doesNotMatch(html,/id="playback-official-fallback"/);
 assert.match(css,/\.youtube-modal\.official-inline \.youtube-frame-wrap\{[\s\S]*?min-height:200px/);
 assert.match(css,/\.youtube-modal\.official-inline\[hidden\]/);
 assert.match(css,/\.youtube-official-footer/);
});
test('auto-switch after confirmed upstream rate limit, native R2 still first choice',()=>{
 const app=source('app.js');
 assert.match(app,/async function recoverNativeAudio[\s\S]*?if\(rateLimit\)\{[\s\S]*?openYouTubePlayer\(track\)/);
 assert.match(app,/const reuseSource=audio\.hasAttribute\('src'\)/);
 assert.match(app,/cacheOnly:attempt===0&&playbackCooldown\.active\(\)/);
 assert.match(app,/const embed=officialEmbedURL\(track\),watch=officialWatchURL\(track\)/);
 assert.match(app,/frame\.src=embed/);
 assert.match(app,/state\.audioState='official'/);
 assert.match(app,/if\(state\.audioState==='official'&&officialTrackId===state\.current\.id\)/);
 assert.match(app,/shouldUseOfficialAfterNativeFailure\(track,\{offline:!!offlineAudio\(track\.id\),error:initialError\}\)/);
 assert.match(app,/audio\.addEventListener\('error',[^\n]+state\.audioState==='official'/);
 assert.match(app,/closeYouTubePlayer\(\);audio\.pause\(\);state\.playing=false;state\.current=track/);
 assert.doesNotMatch(app,/window\.open\(['"]https:\/\/.*youtube/);
});
test('official playback retains original YouTube controls and marks sound as separate',()=>{
 const app=source('app.js'),css=source('styles.css');
 assert.match(app,/audio\.pause\(\);stems\.pause\(\);state\.playing=false/);
 assert.match(app,/app\.dataset\.audioProvider='youtube-official'/);
 assert.match(app,/iframe-player|player-oficial|YOUTUBE · PLAYER OFICIAL|YOUTUBE · OFICIAL/);
 assert.match(css,/\[data-audio-provider="youtube-official"\] #seek-slider\{pointer-events:none/);
 assert.match(source('lib/official-playback.js'),/autoplay=0/);
 assert.match(source('index.html'),/FONTE OFICIAL · YOUTUBE/);
});
test('iPod MENU keeps access to the official provider while preserving customization',()=>{
 const normal=renderPlayerSurfaceMenu('ipod');
 const limited=renderPlayerSurfaceMenu('ipod',{upstreamLimited:true});
 assert.doesNotMatch(normal,/data-player-surface-action="official-player"/);
 assert.match(limited,/data-player-surface-action="official-player"/);
 assert.match(limited,/data-player-surface-action="customize-ipod"/);
 assert.doesNotMatch(renderPlayerSurfaceMenu('sharp',{upstreamLimited:true}),/official-player/);
 assert.match(source('app.js'),/action\.dataset\.playerSurfaceAction==='official-player'/);
});
