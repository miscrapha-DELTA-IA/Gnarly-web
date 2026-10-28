/** Desktop-side GNARLY karaoke microphone pairing.
 * No audio samples or audio player are transmitted. Only bounded voice
 * analysis frames traverse Cloudflare's short-lived room.
 */
import {ROOM_PATTERN,SECRET_PATTERN,safeMicFrame} from './karaoke-relay-protocol.js';
const RELAY='wss://gnarly-web.miscrapha.workers.dev/karaoke-relay/';
function randomSecret(cryptoObject=globalThis.crypto){
 if(!cryptoObject?.getRandomValues)throw Error('Conexão segura (HTTPS) necessária');
 return [...cryptoObject.getRandomValues(new Uint8Array(16))]
  .map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function microphonePairingLink(origin,room,invite){
 if(!ROOM_PATTERN.test(room)||!SECRET_PATTERN.test(invite))throw Error('Pareamento inválido');
 const url=new URL('mic.html',origin.endsWith('/')?origin:origin+'/');
 url.hash=room+'.'+invite;
 return url.href;
}
export function relayURL(room){
 if(!ROOM_PATTERN.test(room))throw Error('Código de sessão inválido');
 return RELAY+encodeURIComponent(room);
}
export class KaraokeRemoteHost {
 constructor({WebSocketClass=globalThis.WebSocket,cryptoObject=globalThis.crypto,
  origin=globalThis.location?.origin,onFrame=()=>{},onStatus=()=>{}}={}){
  this.WebSocketClass=WebSocketClass;this.cryptoObject=cryptoObject;this.origin=origin;
  this.onFrame=onFrame;this.onStatus=onStatus;
  this.socket=null;this.connected=false;this.micOn=false;this.lastFrame=null;
  this.lastArrival=0;this.sequence=-1;this.link='';this.room='';
 }
 get active(){return this.connected&&this.micOn&&performance.now()-this.lastArrival<900}
 start(){
  this.stop();
  if(!this.WebSocketClass)throw Error('Este navegador não suporta conexão em tempo real');
  this.room=this.cryptoObject.randomUUID();
  const owner=randomSecret(this.cryptoObject),invite=randomSecret(this.cryptoObject);
  this.link=microphonePairingLink(this.origin,this.room,invite);
  const socket=new this.WebSocketClass(relayURL(this.room));
  this.socket=socket;this.onStatus('connecting');
  socket.onopen=()=>{if(this.socket===socket)socket.send(JSON.stringify({
   type:'hello',role:'host',key:owner,invite
  }))};
  socket.onmessage=event=>{
   if(this.socket!==socket)return;
   let value;try{value=JSON.parse(event.data)}catch{return}
   if(value.type==='ready')this.onStatus('ready');
   else if(value.type==='paired'){this.connected=true;this.onStatus('paired')}
   else if(value.type==='mic-on'){this.micOn=true;this.lastArrival=0;this.sequence=-1;this.onStatus('listening')}
   else if(value.type==='mic-off'){this.micOn=false;this.lastFrame=null;this.onStatus('paired')}
   else if(value.type==='frame'&&this.connected&&this.micOn){
    const frame=safeMicFrame(value);
    if(!frame||frame.seq<=this.sequence)return;
    this.sequence=frame.seq;this.lastArrival=performance.now();this.lastFrame=frame;
    this.onFrame(frame);
   }else if(value.type==='disconnected'){
    this.connected=false;this.micOn=false;this.lastFrame=null;this.onStatus('ready');
   }
  };
  socket.onerror=()=>{if(this.socket===socket)this.onStatus('error')};
  socket.onclose=()=>{if(this.socket===socket){
   this.socket=null;this.connected=false;this.micOn=false;this.lastFrame=null;
   this.onStatus('disconnected');
  }};
  return this.link;
 }
 sendPlayback({position=0,playing=false,title=''}={}){
  if(!this.connected||this.socket?.readyState!==1)return;
  this.socket.send(JSON.stringify({type:'sync',position,playing,title:String(title).slice(0,100)}));
 }
 stop(){
  const old=this.socket;this.socket=null;this.connected=false;this.micOn=false;
  this.lastFrame=null;this.lastArrival=0;this.sequence=-1;this.link='';this.room='';
  if(old){try{old.send(JSON.stringify({type:'bye'}));old.close(1000,'Desktop stopped')}catch{}}
  this.onStatus('off');
 }
}
