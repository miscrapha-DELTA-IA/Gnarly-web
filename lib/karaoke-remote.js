/** GNARLY Karaoke Connect desktop: authenticated room, voice metrics and
 * encrypted peer-to-peer WebRTC audio. The Cloudflare Worker sees SDP/ICE,
 * but never microphone samples or RTP audio.
 */
import {ROOM_PATTERN,SECRET_PATTERN,safeMicFrame,safeRTCSignal} from './karaoke-relay-protocol.js';
const RELAY='wss://gnarly-web.miscrapha.workers.dev/karaoke-relay/';
const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
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
  PeerConnectionClass=globalThis.RTCPeerConnection,
  AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext,
  origin=globalThis.location?.origin,onFrame=()=>{},onStatus=()=>{},onAudioStatus=()=>{}}={}){
  Object.assign(this,{WebSocketClass,cryptoObject,PeerConnectionClass,AudioContextClass,
   origin,onFrame,onStatus,onAudioStatus});
  this.socket=null;this.connected=false;this.micOn=false;this.lastFrame=null;
  this.lastArrival=0;this.sequence=-1;this.link='';this.room='';
  this.peer=null;this.pendingCandidates=[];this.remoteStream=null;
  this.audioContext=null;this.audioSource=null;this.gain=null;
  this.monitorEnabled=false;this.monitorVolume=.55;this.audioState='off';
 }
 get active(){return this.connected&&this.micOn&&performance.now()-this.lastArrival<900}
 audioStatus(status){this.audioState=status;this.onAudioStatus(status)}
 transmit(value){
  if(this.socket?.readyState===1)this.socket.send(JSON.stringify(value));
 }
 closePeer(){
  const old=this.peer;this.peer=null;this.pendingCandidates=[];
  if(old){old.ontrack=null;old.onicecandidate=null;old.onconnectionstatechange=null;try{old.close()}catch{}}
  try{this.audioSource?.disconnect()}catch{}
  this.audioSource=null;this.remoteStream=null;
 }
 releaseMonitor(){
  this.closePeer();
  try{this.gain?.disconnect()}catch{}
  this.gain=null;
  const context=this.audioContext;this.audioContext=null;
  if(context&&context.state!=='closed')void context.close().catch(()=>{});
  this.monitorEnabled=false;this.audioStatus('off');
 }
 attachVoice(){
  if(!this.remoteStream||!this.audioContext||!this.gain)return;
  try{this.audioSource?.disconnect()}catch{}
  this.audioSource=this.audioContext.createMediaStreamSource(this.remoteStream);
  this.audioSource.connect(this.gain);
 }
 /** Call from a desktop user gesture. Muted until explicitly enabled to
  * prevent acoustic feedback on loudspeakers. Never touches the music player. */
 setMonitor(enabled,volume=this.monitorVolume){
  this.monitorVolume=Math.max(0,Math.min(1,Number(volume)||0));
  this.monitorEnabled=!!enabled;
  if(!enabled){
   if(this.gain)this.gain.gain.value=0;
   return true;
  }
  if(!this.AudioContextClass){this.monitorEnabled=false;this.audioStatus('unavailable');return false}
  try{
   if(!this.audioContext){
    this.audioContext=new this.AudioContextClass();
    this.gain=this.audioContext.createGain();
    this.gain.connect(this.audioContext.destination);
   }
   this.gain.gain.value=this.monitorVolume;
   if(this.remoteStream&&!this.audioSource)this.attachVoice();
   void this.audioContext.resume().catch(()=>this.audioStatus('audio-blocked'));
   return true;
  }catch{
   this.monitorEnabled=false;
   if(this.gain)this.gain.gain.value=0;
   this.audioStatus('audio-blocked');return false;
  }
 }
 async startVoice(){
  this.closePeer();
  if(!this.PeerConnectionClass){this.audioStatus('unavailable');return}
  if(!this.connected||!this.micOn)return;
  try{
   const peer=new this.PeerConnectionClass(ICE);this.peer=peer;
   this.audioStatus('connecting');
   peer.addTransceiver('audio',{direction:'recvonly'});
   peer.onicecandidate=e=>{
    if(peer===this.peer&&e.candidate?.candidate)
     this.transmit({type:'rtc-candidate',candidate:e.candidate.toJSON?.()||e.candidate});
   };
   peer.ontrack=e=>{
    if(peer!==this.peer||e.track?.kind!=='audio')return;
    this.remoteStream=e.streams?.[0]||(typeof MediaStream!=='undefined'?new MediaStream([e.track]):null);
    if(this.remoteStream&&this.audioContext)this.attachVoice();
   };
   peer.onconnectionstatechange=()=>{
    if(peer!==this.peer)return;
    if(peer.connectionState==='connected')this.audioStatus('connected');
    else if(['failed','disconnected'].includes(peer.connectionState))
     this.audioStatus('network-error');
   };
   await peer.setLocalDescription(await peer.createOffer());
   if(peer!==this.peer||!this.connected||!this.micOn)return;
   this.transmit({type:'rtc-offer',sdp:peer.localDescription.sdp});
  }catch{if(this.peer)this.closePeer();this.audioStatus('network-error')}
 }
 async receiveSignal(value){
  if(!this.micOn||!this.connected)return;
  const safe=safeRTCSignal(value,'mic');
  if(!safe)return;
  const peer=this.peer;
  if(safe.type==='rtc-candidate'){
   if(!peer||!peer.remoteDescription){
    if(this.pendingCandidates.length<64)this.pendingCandidates.push(safe.candidate);
   }else await peer.addIceCandidate(safe.candidate).catch(()=>{});
   return;
  }
  if(safe.type==='rtc-answer'&&peer&&peer.signalingState==='have-local-offer'){
   try{
    await peer.setRemoteDescription({type:'answer',sdp:safe.sdp});
    if(peer!==this.peer)return;
    const pending=this.pendingCandidates.splice(0);
    for(const c of pending)await peer.addIceCandidate(c).catch(()=>{});
   }catch{this.audioStatus('network-error')}
  }
 }
 start(){
  this.stop();
  if(!this.WebSocketClass)throw Error('Este navegador não suporta conexão em tempo real');
  this.room=this.cryptoObject.randomUUID();
  const owner=randomSecret(this.cryptoObject),invite=randomSecret(this.cryptoObject);
  this.link=microphonePairingLink(this.origin,this.room,invite);
  const socket=new this.WebSocketClass(relayURL(this.room));
  this.socket=socket;this.onStatus('connecting');
  socket.onopen=()=>{if(this.socket===socket)this.transmit({
   type:'hello',role:'host',key:owner,invite
  })};
  socket.onmessage=event=>{
   if(this.socket!==socket)return;
   let value;try{value=JSON.parse(event.data)}catch{return}
   if(value.type==='ready')this.onStatus('ready');
   else if(value.type==='paired'){this.connected=true;this.onStatus('paired')}
   else if(value.type==='mic-on'){
    this.micOn=true;this.lastArrival=0;this.sequence=-1;
    this.onStatus('listening');void this.startVoice();
   }
   else if(value.type==='mic-off'){
    this.micOn=false;this.lastFrame=null;this.closePeer();
    this.audioStatus('off');this.onStatus('paired');
   }
   else if(value.type==='frame'&&this.connected&&this.micOn){
    const frame=safeMicFrame(value);
    if(!frame||frame.seq<=this.sequence)return;
    this.sequence=frame.seq;this.lastArrival=performance.now();this.lastFrame=frame;
    this.onFrame(frame);
   }else if(value.type==='rtc-answer'||value.type==='rtc-candidate'){
    void this.receiveSignal(value);
   }else if(value.type==='disconnected'){
    this.connected=false;this.micOn=false;this.lastFrame=null;
    this.closePeer();this.audioStatus('off');this.onStatus('ready');
   }
  };
  socket.onerror=()=>{if(this.socket===socket)this.onStatus('error')};
  socket.onclose=()=>{if(this.socket===socket){
   this.socket=null;this.connected=false;this.micOn=false;this.lastFrame=null;
   this.releaseMonitor();this.onStatus('disconnected');
  }};
  return this.link;
 }
 sendPlayback({position=0,playing=false,title=''}={}){
  if(!this.connected)return;
  this.transmit({type:'sync',position,playing,title:String(title).slice(0,100)});
 }
 stop(){
  const old=this.socket;this.socket=null;this.connected=false;this.micOn=false;
  this.lastFrame=null;this.lastArrival=0;this.sequence=-1;this.link='';this.room='';
  this.releaseMonitor();
  if(old){try{old.send(JSON.stringify({type:'bye'}));old.close(1000,'Desktop stopped')}catch{}}
  this.onStatus('off');
 }
}
