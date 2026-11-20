import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeMicFrame,safePlaybackSync,safeRTCSignal,ROOM_PATTERN,SECRET_PATTERN} from '../lib/karaoke-relay-protocol.js';
import {KaraokeRoomCore as KaraokeRoom} from '../lib/karaoke-room-core.js';
import {microphonePairingLink,KaraokeRemoteHost} from '../lib/karaoke-remote.js';

const room='a532b370-aa91-48ca-a555-123456789abc';
const invite='a'.repeat(32),owner='b'.repeat(32);
const micHtml=readFileSync(new URL('../mic.html',import.meta.url),'utf8');
const micJS=readFileSync(new URL('../mic.js',import.meta.url),'utf8');
const stage=readFileSync(new URL('../ui/karaoke-stage.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');

test('pairing URL contains unguessable room and token in hash, not HTTP query',()=>{
 assert.equal(ROOM_PATTERN.test(room),true);
 assert.equal(SECRET_PATTERN.test(invite),true);
 const url=new URL(microphonePairingLink('https://gnarly-web-pages.pages.dev',room,invite));
 assert.equal(url.search,'');
 assert.equal(url.pathname,'/mic.html');
 assert.equal(url.hash,'#'+room+'.'+invite);
 assert.throws(()=>microphonePairingLink('https://test.invalid','no',invite));
});
test('bounded voice frames exclude raw microphone bytes and invalid numbers',()=>{
 const frame=safeMicFrame({type:'frame',seq:1,rms:.18,hz:220.2,confidence:.89,voiced:true,pcm:[1,2,3]});
 assert.deepEqual(frame,{type:'frame',seq:1,rms:.18,hz:220.2,confidence:.89,voiced:true});
 assert.equal(safeMicFrame({seq:0,rms:NaN,hz:null,confidence:0,voiced:false}),null);
 assert.equal(safeMicFrame({seq:0,rms:.2,hz:0,confidence:0,voiced:false}),null);
 assert.equal(safePlaybackSync({position:12,playing:true,title:'X',secret:'ignored'}).secret,undefined);
});
function channel(){
 const socket=[];
 const ctx={getWebSockets:()=>socket};
 const target=new KaraokeRoom(ctx,{});
 const peer=(role='pending')=>{const o={messages:[],attachment:{role,created:Date.now()},
  serializeAttachment(v){this.attachment=v},deserializeAttachment(){return this.attachment},
  send(m){this.messages.push(JSON.parse(m))},close(code){this.closed=code}};
  socket.push(o);return o;
 };
 return {target,peer};
}
test('room requires authenticated host, accepts one mic and never forwards PCM',()=>{
 const {target,peer}=channel(),host=peer(),phone=peer();
 target.webSocketMessage(host,JSON.stringify({type:'hello',role:'host',key:owner,invite}));
 assert.equal(host.messages[0].type,'ready');
 target.webSocketMessage(phone,JSON.stringify({type:'hello',role:'mic',key:invite}));
 assert.equal(host.messages.at(-1).type,'paired');
 target.webSocketMessage(phone,JSON.stringify({type:'mic-on'}));
 target.webSocketMessage(phone,JSON.stringify({type:'frame',seq:1,rms:.2,hz:220,confidence:.8,voiced:true,pcm:'raw'}));
 const message=host.messages.at(-1);
 assert.equal(message.type,'frame');assert.equal(message.pcm,undefined);
 const count=host.messages.length;
 target.webSocketMessage(phone,JSON.stringify({type:'frame',seq:1,rms:.2,hz:220,confidence:.8,voiced:true}));
 assert.equal(host.messages.length,count,'replayed frames cannot score twice');
});
test('room denies second phone and forged invitations',()=>{
 const {target,peer}=channel(),host=peer(),fake=peer(),real=peer(),duplicate=peer();
 target.webSocketMessage(host,JSON.stringify({type:'hello',role:'host',key:owner,invite}));
 target.webSocketMessage(fake,JSON.stringify({type:'hello',role:'mic',key:'c'.repeat(32)}));
 assert.equal(fake.closed,1008);
 target.webSocketMessage(real,JSON.stringify({type:'hello',role:'mic',key:invite}));
 target.webSocketMessage(duplicate,JSON.stringify({type:'hello',role:'mic',key:invite}));
 assert.equal(duplicate.closed,1008);
});
test('UI never adds a second audio player, mic is explicit and desktop scores at audio clock',()=>{
 assert.match(stage,/id="karaoke-remote-toggle"/);
 assert.match(stage,/id="karaoke-remote-link"/);
 assert.match(stage,/receiveRemoteVoice\(frame\)/);
 assert.match(stage,/this\.scorer\.tick\(this\.audio\.currentTime\|\|0/);
 assert.match(stage,/!this\.audio\.paused&&!this\.audio\.ended&&!this\.audio\.seeking,frame/);
 assert.doesNotMatch(micHtml,/<audio\b|autoplay/);
 assert.match(micJS,/button\.addEventListener\('click',async\(\)=>/);
 assert.match(micJS,/await microphone\.start\(\)/);
 assert.match(micJS,/history\.replaceState\(null,'',location\.pathname\)/);
 assert.match(worker,/env\.KARAOKE_ROOMS/);
 assert.match(readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8'),/'mic\.html','mic\.js'/);
});
test('remote host never trusts stale, out-of-order microphone frames',()=>{
 class FakeWS{constructor(url){this.url=url;this.readyState=1;this.sent=[]}send(x){this.sent.push(JSON.parse(x))}close(){}}
 const cryptoObject={randomUUID:()=>room,getRandomValues:a=>{a.fill(1);return a}};
 let received=0;
 const host=new KaraokeRemoteHost({WebSocketClass:FakeWS,cryptoObject,
  origin:'https://gnarly-web-pages.pages.dev',onFrame:()=>received++});
 host.start();
 host.socket.onopen();
 host.socket.onmessage({data:JSON.stringify({type:'paired'})});
 host.socket.onmessage({data:JSON.stringify({type:'mic-on'})});
 const f=JSON.stringify({type:'frame',seq:1,rms:.15,hz:250,confidence:.83,voiced:true});
 host.socket.onmessage({data:f});
 host.socket.onmessage({data:f});
 assert.equal(received,1);
 host.stop();
});

test('SDP/ICE signaling is bounded and role-scoped; no microphone PCM enters relay',()=>{
 const sdp='v=0\\r\\nm=audio 9 UDP/TLS/RTP/SAVPF 111\\r\\na=sendonly\\r\\n';
 const offer=safeRTCSignal({type:'rtc-offer',sdp,pcm:'private'},'host');
 assert.deepEqual(offer,{type:'rtc-offer',sdp});
 assert.equal(safeRTCSignal({type:'rtc-offer',sdp},'mic'),null);
 assert.equal(safeRTCSignal({type:'rtc-answer',sdp},'host'),null);
 assert.equal(safeRTCSignal({type:'rtc-offer',sdp:'v=0\\r\\nm=video'},'host'),null);
 assert.equal(safeRTCSignal({type:'rtc-offer',sdp:'v=0'+('x'.repeat(15000))+'m=audio'},'host'),null);
 const c={candidate:'candidate:1 1 udp 2122260223 10.0.0.2 58821 typ host',sdpMid:'0',sdpMLineIndex:0,private:'ignore'};
 assert.deepEqual(safeRTCSignal({type:'rtc-candidate',candidate:c},'mic'),
  {type:'rtc-candidate',candidate:{candidate:c.candidate,sdpMid:'0',sdpMLineIndex:0}});
 const {target,peer}=channel(),host=peer(),phone=peer();
 target.webSocketMessage(host,JSON.stringify({type:'hello',role:'host',key:owner,invite}));
 target.webSocketMessage(phone,JSON.stringify({type:'hello',role:'mic',key:invite}));
 target.webSocketMessage(host,JSON.stringify({type:'rtc-offer',sdp,pcm:'raw-samples'}));
 assert.deepEqual(phone.messages.at(-1),{type:'rtc-offer',sdp});
 const count=phone.messages.length;
 target.webSocketMessage(host,JSON.stringify({type:'rtc-answer',sdp}));
 assert.equal(phone.messages.length,count,'host cannot forge a mic answer');
 target.webSocketMessage(phone,JSON.stringify({type:'rtc-answer',sdp,pcm:'raw-samples'}));
 assert.deepEqual(host.messages.at(-1),{type:'rtc-answer',sdp});
 target.webSocketMessage(phone,JSON.stringify({type:'rtc-candidate',candidate:c}));
 assert.deepEqual(host.messages.at(-1),
  {type:'rtc-candidate',candidate:{candidate:c.candidate,sdpMid:'0',sdpMLineIndex:0}});
});
test('desktop negotiates received audio while keeping speaker monitoring opt-in',async()=>{
 const rooms=[];
 class FakePeer{
  constructor(){this.signalingState='stable';this.connectionState='new';rooms.push(this)}
  addTransceiver(kind,opts){assert.equal(kind,'audio');assert.equal(opts.direction,'recvonly')}
  async createOffer(){return {type:'offer',sdp:'v=0\\r\\nm=audio 9 UDP/TLS/RTP/SAVPF 111\\r\\n'}}
  async setLocalDescription(desc){this.localDescription=desc;this.signalingState='have-local-offer'}
  async setRemoteDescription(desc){this.remoteDescription=desc;this.signalingState='stable'}
  async addIceCandidate(){this.candidates=(this.candidates||0)+1}
  close(){this.closed=true}
 }
 class FakeContext{
  constructor(){this.state='suspended';this.destination={}}
  createGain(){return {gain:{value:0},connect(){},disconnect(){}}}
  createMediaStreamSource(){return {connect(){},disconnect(){}}}
  async resume(){this.state='running'}
  async close(){this.state='closed'}
 }
 class FakeWS{
  constructor(){this.readyState=1;this.sent=[]}
  send(value){this.sent.push(JSON.parse(value))}
  close(){this.closed=true}
 }
 const host=new KaraokeRemoteHost({WebSocketClass:FakeWS,PeerConnectionClass:FakePeer,
  AudioContextClass:FakeContext,cryptoObject:{randomUUID:()=>room,getRandomValues:a=>{a.fill(1);return a}},
  origin:'https://gnarly-web-pages.pages.dev'});
 host.start();host.socket.onopen();
 host.socket.onmessage({data:JSON.stringify({type:'paired'})});
 host.socket.onmessage({data:JSON.stringify({type:'mic-on'})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(host.socket.sent.some(x=>x.type==='rtc-offer'),true);
 assert.equal(host.monitorEnabled,false);
 assert.equal(host.audioContext,null,'no autoplay or automatic vocal feedback');
 host.socket.onmessage({data:JSON.stringify({type:'rtc-answer',sdp:'v=0\\r\\nm=audio 9 UDP/TLS/RTP/SAVPF 111\\r\\n'})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(rooms[0].remoteDescription?.type,'answer');
 assert.equal(host.setMonitor(true,.35),true);
 assert.equal(host.gain.gain.value,.35);
 host.socket.onmessage({data:JSON.stringify({type:'mic-off'})});
 assert.equal(rooms[0].closed,true);
 host.stop();
 assert.equal(host.audioContext,null);
});
