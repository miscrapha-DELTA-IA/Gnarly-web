import {KaraokeMicrophone} from './lib/karaoke-microphone.js';
import {ROOM_PATTERN,SECRET_PATTERN,safeRTCSignal} from './lib/karaoke-relay-protocol.js';
const status=document.querySelector('#status'),song=document.querySelector('#song');
const button=document.querySelector('#mic-toggle'),orb=document.querySelector('#orb');
const meter=document.querySelector('#meter-bar');
const audioStatus=document.querySelector('#audio-status');
const fromLink=location.hash.slice(1);
let code=fromLink;
try{code=fromLink||sessionStorage.getItem('gnarly.karaoke.mic-pairing')||''}catch{}
const separator=code.indexOf('.');
const room=code.slice(0,separator),invite=code.slice(separator+1);
const valid=separator>0&&ROOM_PATTERN.test(room)&&SECRET_PATTERN.test(invite);
const microphone=new KaraokeMicrophone();
const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
let socket=null,connected=false,seq=0,lastSentAt=0,ready=false;
let voicePeer=null,pendingIce=[],wakeLock=null;
const label=text=>{status.textContent=text};
const audioLabel=text=>{if(audioStatus)audioStatus.textContent=text};
function refresh(){
 button.disabled=!connected;
 button.textContent=microphone.active?'Desligar microfone':'Ativar microfone';
 orb.classList.toggle('active',microphone.active);
 if(!microphone.active){meter.style.width='0%';orb.style.setProperty('--pulse','1')}
}
const transmit=value=>{if(socket?.readyState===1)socket.send(JSON.stringify(value))};
function closeVoicePeer(){
 const old=voicePeer;voicePeer=null;pendingIce=[];
 if(old){old.onicecandidate=null;old.onconnectionstatechange=null;try{old.close()}catch{}}
}
async function acceptOffer(value){
 const signal=safeRTCSignal(value,'host');
 if(!signal||signal.type!=='rtc-offer'||!connected||!microphone.active)return;
 if(!globalThis.RTCPeerConnection){
  audioLabel('Este navegador permite pontuação, mas não oferece áudio WebRTC.');return;
 }
 const waiting=pendingIce.splice(0);
 closeVoicePeer();pendingIce=waiting;
 try{
  const peer=new RTCPeerConnection(ICE);voicePeer=peer;
  const track=microphone.stream?.getAudioTracks()?.[0];
  if(!track||track.readyState==='ended')throw Error('Microfone desativado');
  peer.addTrack(track,microphone.stream);
  peer.onicecandidate=e=>{
   if(peer===voicePeer&&e.candidate?.candidate)
    transmit({type:'rtc-candidate',candidate:e.candidate.toJSON?.()||e.candidate});
  };
  peer.onconnectionstatechange=()=>{
   if(peer!==voicePeer)return;
   if(peer.connectionState==='connected')
    audioLabel('Áudio protegido conectado ao PC · cante agora.');
   else if(['failed','disconnected'].includes(peer.connectionState))
    audioLabel('Áudio ao vivo interrompido. A pontuação pode continuar.');
  };
  await peer.setRemoteDescription({type:'offer',sdp:signal.sdp});
  if(peer!==voicePeer||!microphone.active||!connected)return;
  for(const candidate of pendingIce.splice(0))
   await peer.addIceCandidate(candidate).catch(()=>{});
  await peer.setLocalDescription(await peer.createAnswer());
  if(peer===voicePeer&&microphone.active&&connected){
   transmit({type:'rtc-answer',sdp:peer.localDescription.sdp});
   audioLabel('Estabelecendo áudio em tempo real…');
  }
 }catch{
  closeVoicePeer();
  audioLabel('Não foi possível enviar áudio ao PC. Pontuação ainda disponível.');
 }
}
function acceptCandidate(value){
 const signal=safeRTCSignal(value,'host');
 if(!signal||signal.type!=='rtc-candidate'||!connected||!microphone.active)return;
 if(voicePeer?.remoteDescription){
  void voicePeer.addIceCandidate(signal.candidate).catch(()=>{});
 }else if(pendingIce.length<64)pendingIce.push(signal.candidate);
}
microphone.onChange=()=>{
 if(!microphone.active){refresh();return}
 const voice=microphone.frameNow();
 meter.style.width=Math.min(100,Math.round(voice.rms*800))+'%';
 orb.style.setProperty('--pulse',String(1+Math.min(.09,voice.rms*.32)));
 const now=performance.now();
 // Keep lightweight scoring telemetry; raw audio travels solely over WebRTC.
 if(now-lastSentAt<145)return;
 lastSentAt=now;
 transmit({type:'frame',seq:++seq,rms:voice.rms,hz:voice.hz,
  voiced:voice.voiced,confidence:voice.confidence});
};
async function stop(){
 closeVoicePeer();
 if(microphone.active)microphone.stop();
 transmit({type:'mic-off'});
 try{await wakeLock?.release()}catch{}
 wakeLock=null;
 audioLabel('Áudio desligado.');refresh();
}
button.addEventListener('click',async()=>{
 if(microphone.active){await stop();label('Microfone desligado.');return}
 if(!connected)return;
 button.disabled=true;
 try{
  const started=await microphone.start();
  if(!started||!connected){microphone.stop();return}
  seq=0;lastSentAt=0;transmit({type:'mic-on'});
  audioLabel('Aguardando canal seguro com o computador…');
  label('Microfone ativo · cante olhando para o desktop');
  try{wakeLock=await navigator.wakeLock?.request('screen')}catch{}
 }catch(error){
  label(error?.name==='NotAllowedError'?'Autorize o microfone nas configurações do navegador.':
   'Não foi possível iniciar o microfone. Verifique HTTPS e permissões.');
 }finally{refresh()}
});
if(!valid)label('Link inválido. Abra o link enviado pelo GNARLY no desktop.');
else{
 // Pairing secret is never placed in an HTTP request or left in the URL bar.
 try{sessionStorage.setItem('gnarly.karaoke.mic-pairing',code)}catch{}
 history.replaceState(null,'',location.pathname);
 socket=new WebSocket('wss://gnarly-web.miscrapha.workers.dev/karaoke-relay/'+room);
 socket.onopen=()=>transmit({type:'hello',role:'mic',key:invite});
 socket.onmessage=event=>{
  let value;try{value=JSON.parse(event.data)}catch{return}
  if(value.type==='ready'){
   connected=true;ready=true;label('Conectado ao computador. Ative o microfone.');refresh();
  }
  else if(value.type==='sync'){
   song.textContent=value.title||'Karaokê GNARLY';
   if(!microphone.active)label(value.playing?'Música tocando no computador.':'Música pausada no computador.');
  }else if(value.type==='rtc-offer')void acceptOffer(value);
  else if(value.type==='rtc-candidate')acceptCandidate(value);
  else if(value.type==='disconnected'){
   connected=false;void stop();label('Computador desconectado. Gere outro link no desktop.');
  }
 };
 socket.onerror=()=>label('Não foi possível conectar. O servidor de pareamento pode estar indisponível.');
 socket.onclose=()=>{connected=false;void stop();label(ready?'Sessão encerrada. Gere um novo link no computador.':'Pareamento indisponível. Confira o link e tente novamente.')};
}
window.addEventListener('pagehide',()=>{
 closeVoicePeer();microphone.stop();try{socket?.close(1000,'Página encerrada')}catch{}
});
refresh();
