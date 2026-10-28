import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMediaSessionController,mediaPosition,configureBrowserAudioSession} from '../lib/media-session-controller.js';

function setup(){
 const registered=new Map(),positionCalls=[],metadataCalls=[];
 const session={
  playbackState:'none',setActionHandler(name,handler){registered.set(name,handler)},
  setPositionState(state){positionCalls.push(state)},
  set metadata(value){metadataCalls.push(value);this._metadata=value},
  get metadata(){return this._metadata}
 };
 const audio={duration:200,currentTime:40,playbackRate:1.25,paused:false,ended:false};
 class Metadata{constructor(value){Object.assign(this,value)}}
 const events=[];
 const actions={
  play:()=>events.push('play'),pause:()=>events.push('pause'),
  nexttrack:()=>events.push('next'),previoustrack:()=>events.push('previous'),
  seekto:detail=>events.push(['seekto',detail.seekTime,detail.fastSeek]),
  seekforward:detail=>events.push(['forward',detail.seekOffset]),
  seekbackward:detail=>events.push(['back',detail.seekOffset]),
  stop:()=>events.push('stop')
 };
 const controller=createMediaSessionController({audio,session,MediaMetadataCtor:Metadata,actions,
  baseUrl:'https://gnarly-web-pages.pages.dev'});
 return {registered,positionCalls,metadataCalls,session,audio,events,controller};
}
const song={id:'youtube:abcdefghijk',title:'Track',artist:'Performer',album:'Album',
 artwork:'https://is1-ssl.mzstatic.com/image/thumb/Music1/x/2400x2400bb.jpg',duration:200};
test('iOS equivalent publishes lockscreen title, album art, playback rate and exact timeline',()=>{
 const {controller,session,positionCalls}=setup();
 controller.sync({track:song,playing:true,canNext:true,forcePosition:true});
 assert.equal(session.playbackState,'playing');
 assert.equal(session.metadata.title,'Track');
 assert.equal(session.metadata.artist,'Performer');
 assert.equal(session.metadata.album,'Album');
 assert.equal(session.metadata.artwork[0].src,song.artwork);
 assert.deepEqual(positionCalls.at(-1),{duration:200,position:40,playbackRate:1.25});
});
test('headset and external actions route to the same playback functions and respect queue',()=>{
 const {controller,registered,events}=setup();
 controller.sync({track:song,canNext:false,playing:true});
 assert.equal(registered.get('nexttrack'),null,'never offer unavailable next track');
 controller.sync({track:song,canNext:true,playing:true});
 registered.get('play')();
 registered.get('pause')();
 registered.get('previoustrack')();
 registered.get('nexttrack')();
 registered.get('seekto')({seekTime:60,fastSeek:true});
 registered.get('seekforward')({seekOffset:10});
 registered.get('seekbackward')({seekOffset:9});
 registered.get('stop')();
 assert.deepEqual(events,['play','pause','previous','next',['seekto',60,true],['forward',10],['back',9],'stop']);
 controller.sync({track:song,canNext:false});
 assert.equal(registered.get('nexttrack'),null);
});
test('end user pause and hardware route interruption remain paused without auto-resume',()=>{
 const {controller,session,audio,events}=setup();
 controller.sync({track:song,playing:true,canNext:false});
 audio.paused=true;
 controller.sync({track:song,playing:false,forcePosition:true});
 assert.equal(session.playbackState,'paused');
 assert.deepEqual(events,[]);
});
test('seek clamps and ignores absent/invalid durations in system timeline',()=>{
 assert.equal(mediaPosition({duration:NaN,currentTime:34,playbackRate:1},{}),null);
 assert.deepEqual(mediaPosition({duration:42,currentTime:68,playbackRate:1},song),{
  duration:42,position:42,playbackRate:1
 });
});
test('repeated progress events are throttled but seek and rate changes are immediate',()=>{
 const {controller,positionCalls,audio}=setup();
 controller.sync({track:song,playing:true,forcePosition:true});
 const initial=positionCalls.length;
 controller.position({track:song,now:Date.now()});
 assert.equal(positionCalls.length,initial);
 audio.playbackRate=1.5;
 controller.position({track:song});
 assert.equal(positionCalls.at(-1).playbackRate,1.5);
 controller.position({track:song,force:true});
 assert.equal(positionCalls.length,initial+2);
});
test('changing tracks does not retain previous cover, and dispose unbinds all handlers',()=>{
 const {controller,session,registered}=setup();
 controller.sync({track:song,playing:true,canNext:true});
 const other={...song,id:'youtube:zzzzzzzzzzz',title:'New',artwork:'https://example.com/new.jpg'};
 controller.sync({track:other,playing:true});
 assert.equal(session.metadata.title,'New');
 controller.sync({track:null});
 assert.equal(session.metadata,null);
 assert.equal(session.playbackState,'none');
 controller.destroy();
 assert.equal(registered.get('play'),null);
 assert.equal(registered.get('pause'),null);
});
test('lack of Media Session does not crash older Safari and audio remains functional',()=>{
 const c=createMediaSessionController({audio:{paused:false},session:null});
 assert.equal(c.available,false);
 assert.doesNotThrow(()=>c.sync({track:song,playing:true}));
});
test('GNARLY web uses single HTML audio, not parallel playback, for all remote actions',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('../lib/audio-engine.js',import.meta.url),'utf8');
 assert.match(app,/const externalMedia=createMediaSessionController/);
 assert.match(app,/function externalSeek/);
 assert.match(app,/syncSystemPlayback\(true\)/);
 assert.match(app,/MediaPlayPause/);
 assert.match(app,/document\.addEventListener\('visibilitychange'/);
 assert.doesNotMatch(app,/for\(const \[action,fn\] of \[\['play'/);
 assert.match(html,/<audio id="player-audio"/);
 assert.match(source,/createMediaElementSource\(this\.audio\)/);
});

test('WebKit playback audio category is feature-detected and duplex for mic capture',()=>{
 const navigatorObject={audioSession:{type:'auto'}};
 assert.equal(configureBrowserAudioSession({navigatorObject}),true);
 assert.equal(navigatorObject.audioSession.type,'playback');
 assert.equal(configureBrowserAudioSession({navigatorObject,recording:true}),true);
 assert.equal(navigatorObject.audioSession.type,'play-and-record');
 assert.equal(configureBrowserAudioSession({navigatorObject:{}}),false);
});
test('the karaoke microphone restores playback policy instead of leaving music in recording mode',()=>{
 const microphone=readFileSync(new URL('../lib/karaoke-microphone.js',import.meta.url),'utf8');
 assert.match(microphone,/recording:true/);
 assert.match(microphone,/configureBrowserAudioSession\(\{navigatorObject:this\.navigatorObject\}\)/);
});
test('headphone transport does not change the existing native playback source when backgrounded',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/configureBrowserAudioSession\(\{navigatorObject:navigator/);
 assert.match(app,/recording:!!\(karaokeStage\.mic\.active\|\|state\.micStream\)/);
 assert.match(app,/nexttrack:\(\)=>\{void next\(\)\}/);
 assert.match(app,/previoustrack:\(\)=>\{if\(state\.current\)previous\(\)\}/);
 assert.doesNotMatch(app,/visibilitychange[^\n]*pause\(\)/);
});
