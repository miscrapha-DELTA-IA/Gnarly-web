import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeMicFrame,safePlaybackSync,ROOM_PATTERN,SECRET_PATTERN} from '../lib/karaoke-relay-protocol.js';
import {KaraokeRoom} from '../src/karaoke-relay.js';
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
