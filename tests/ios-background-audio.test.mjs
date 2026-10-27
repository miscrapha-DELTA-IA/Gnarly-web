import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WebAudioEngine,isIOSWebKitAudioDevice,prefersNativeBackgroundAudio} from '../lib/audio-engine.js';
import {renderMusicPanel} from '../ui/music-panel.js';

const iPhone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1',platform:'iPhone',maxTouchPoints:5};
const iPad={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',maxTouchPoints:5};
const desktop={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:0};

test('iOS WebKit and iPadOS are native-audio preferred; desktop stays full-DSP',()=>{
 assert.equal(isIOSWebKitAudioDevice(iPhone),true);
 assert.equal(isIOSWebKitAudioDevice(iPad),true);
 assert.equal(isIOSWebKitAudioDevice(desktop),false);
 assert.equal(prefersNativeBackgroundAudio(iPhone,true),true);
 assert.equal(prefersNativeBackgroundAudio(iPhone,false),false);
 assert.equal(prefersNativeBackgroundAudio(desktop,true),false);
});
test('Safari foreground play never attaches a MediaElementAudioSourceNode in background mode',async()=>{
 const element={muted:false,playbackRate:1,preservesPitch:true};
 const engine=new WebAudioEngine(element,{device:iPhone});
 assert.equal(engine.nativeTransport,true);
 // No window.AudioContext exists in node. If we accidentally create the
 // graph, this rejects: users would get the iOS lock-screen silence again.
 await engine.resume();
 assert.equal(engine.ctx,null);
 assert.equal(element.muted,false);
 engine.setSpeed(1.25,false);
 assert.equal(element.playbackRate,1.25);
 assert.equal(element.preservesPitch,false);
});
test('native source remains directly audible, and stems mute/unmute it safely',async()=>{
 const audio={muted:false};
 const engine=new WebAudioEngine(audio,{device:iPhone});
 engine.setOriginalGain(0);
 assert.equal(audio.muted,true);
 engine.setOriginalGain(1);
 assert.equal(audio.muted,false);
 await engine.resume();
 assert.equal(engine.ctx,null);
});
test('Studio mode opt-in remains possible before first AudioContext has claimed the song',()=>{
 const audio={muted:false};
 const engine=new WebAudioEngine(audio,{device:iPhone});
 assert.equal(engine.setBackgroundPriority(false),true);
 assert.equal(engine.nativeTransport,false);
 assert.equal(engine.setBackgroundPriority(true),true);
 assert.equal(engine.nativeTransport,true);
});
test('iOS background audio is automatic with no switch in the music panel',()=>{
 const native=renderMusicPanel({backgroundAudioSupported:true,backgroundAudioEnabled:true,tab:'speedPitch'});
 assert.doesNotMatch(native,/data-command="toggle-background-transport"/);
 assert.doesNotMatch(native,/Áudio com tela bloqueada<\/strong>/);
 assert.match(native,/REVERB/);
 assert.match(native,/disabled title="Ative Áudio de estúdio para usar este efeito"/);
 const desktop=renderMusicPanel({backgroundAudioSupported:false,backgroundAudioEnabled:false});
 assert.doesNotMatch(desktop,/data-command="toggle-background-transport"/);
});
test('one native player and an optional effects graph preserve full existing controls',()=>{
 const engine=readFileSync(new URL('../lib/audio-engine.js',import.meta.url),'utf8');
 const pads=readFileSync(new URL('../lib/performance-pads.js',import.meta.url),'utf8');
 const stems=readFileSync(new URL('../lib/stem-mixer.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(engine,/if\(this.nativeTransport&&!requireGraph\)return/);
 assert.match(engine,/this.nativeTransport\?null:ctx\.createMediaElementSource\(this\.audio\)/);
 assert.match(stems,/resume\(\{requireGraph:true\}\)/);
 assert.match(pads,/resume\(\{requireGraph:true\}\)/);
 assert.match(app,/engine\.setBackgroundPriority\(true\)/);
 assert.doesNotMatch(app,/case 'toggle-background-transport'/);
 assert.match(app,/const externalMedia=createMediaSessionController/);
 assert.equal((html.match(/<audio id="player-audio"/g)||[]).length,1);
});
