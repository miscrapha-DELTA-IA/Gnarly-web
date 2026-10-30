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
 const cover=html.indexOf('id="cover-button"');
 assert.ok(player>=0&&official>player&&official<cover&&search>cover,'official source must be inside the GNARLY player');
 assert.match(html,/<section id="youtube-player-dialog"[\s\S]*?<\/section>[\s\S]*?<button class="cover-wrap"/);
 assert.match(html,/<section id="youtube-player-dialog" class="youtube-modal official-inline"/);
 assert.match(html,/role="region" aria-label="Reprodução oficial integrada ao GNARLY"/);
 assert.match(html,/iframe id="youtube-player-frame"/);
 assert.doesNotMatch(html,/id="playback-official-fallback"/);
 assert.match(css,/\.youtube-modal\.official-inline \.youtube-frame-wrap\{[\s\S]*?min-height:200px/);
 assert.match(css,/\.youtube-modal\.official-inline\[hidden\]/);
 assert.match(css,/\.youtube-official-footer/);
 assert.match(css,/\[data-audio-provider="youtube-official"\] #player-section > :not\(#youtube-player-dialog\)\{display:none!important\}/);
 for(const id of ['youtube-native-retry','youtube-next','youtube-previous','youtube-track-art'])assert.match(html,new RegExp('id="'+id+'"'));
});
test('HTTP 429 never silently swaps away from GNARLY; official source requires an explicit click',()=>{
 const app=source('app.js'),html=source('index.html'),css=source('styles.css');
 const recovery=app.slice(app.indexOf('async function recoverNativeAudio('),app.indexOf('async function play()'));
 assert.match(recovery,/if\(rateLimit\)\{[\s\S]*?await resumeCachedNative\(track,current\)/);
 assert.doesNotMatch(recovery,/openYouTubePlayer\(track\)/);
 assert.match(recovery,/reportAudioError\(playbackLimitMessage\(rateLimit\)\)/);
 assert.doesNotMatch(app,/cacheOnly:attempt===0&&playbackCooldown\.active\(\)/);
 assert.match(app,/async function cachedNativeAvailable\(track\)/);
 assert.match(app,/method:'HEAD',cache:'no-store',credentials:'omit'/);
 assert.match(app,/\$\('#youtube-optin-button'\)\.addEventListener\('click'/);
 assert.match(html,/id="playback-source-choice" class="playback-source-choice" hidden/);
 assert.match(html,/id="youtube-optin-button"/);
 assert.match(css,/\.playback-source-choice\[hidden\]\{display:none!important\}/);
 assert.match(app,/frame\.src=embed/);
 assert.match(app,/state\.audioState='official'/);
 assert.match(app,/closeYouTubePlayer\(\);audio\.pause\(\);state\.playing=false;state\.current=track/);
 assert.doesNotMatch(app,/window\.open\(['"]https:\/\/.*youtube/);
});
test('live search waits for a meaningful query and discovery limits its backend burst',()=>{
 const app=source('app.js');
 assert.match(app,/if\(live&&query\.length<3\)\{/);
 assert.match(app,/const delay=live\?760:0/);
 assert.match(app,/memory:listeningMemory\}\)\.slice\(0,1\)/);
 assert.match(app,/if\(added\.length>=3\)return/);
 assert.match(app,/readyQueueCandidates\(candidates/);
 assert.doesNotMatch(app,/const primary=searchNativeBackend\(query/);
});

test('official playback retains original YouTube controls and marks sound as separate',()=>{
 const app=source('app.js'),css=source('styles.css');
 assert.match(app,/audio\.pause\(\);stems\.pause\(\);state\.playing=false/);
 assert.match(app,/app\.dataset\.audioProvider='youtube-official'/);
 assert.match(app,/iframe-player|player-oficial|YOUTUBE · PLAYER OFICIAL|YOUTUBE · OFICIAL/);
 assert.match(css,/\[data-audio-provider="youtube-official"\] #seek-slider\{pointer-events:none/);
 assert.match(source('lib/official-playback.js'),/autoplay=0/);
 assert.match(source('index.html'),/GNARLY · FONTE OFICIAL YOUTUBE/);
});
test('returning from official source checks only first-party cached HEAD, and keeps music effects honest',()=>{
 const app=source('app.js'),panel=source('ui/music-panel.js');
 assert.match(app,/method:'HEAD',credentials:'omit',cache:'no-store'/);
 assert.match(app,/X-Gnarly-Playback-Source'\)==='r2-edge'/);
 assert.match(app,/audio.removeAttribute\('src'\);audioDelivery.select\(track\)/);
 assert.match(app,/official=state.audioState==='official'/);
 assert.match(app,/beat:0,energy:envelope/);
 assert.match(panel,/officialPlayback/);
 assert.match(panel,/officialNotice/);
 assert.match(panel,/Stems, velocidade, reverb e baixo exigem áudio nativo/);
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

test('recovery startup watchdog cannot cancel its own bounded source resolution',()=>{
 const app=source('app.js');
 const guard=app.slice(app.indexOf('function stopUnresponsivePlayback('),app.indexOf('function watchPlayback('));
 assert.match(guard,/if\(recoveryOperation\)\{[\s\S]*?return;/);
 assert.ok(guard.indexOf('if(recoveryOperation){')<guard.indexOf('state.userPaused=true'));
 assert.match(app,/settleAudioStart\(started,unlocked,\{timeoutMs:5200\}\)/);
 assert.match(app,/settleAudioStart\(start,unlock,\{timeoutMs:5200\}\)/);
 assert.match(app,/settleAudioStart\(start,unlock,\{timeoutMs:4800\}\)/);
});
