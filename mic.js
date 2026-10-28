import {KaraokeMicrophone} from './lib/karaoke-microphone.js';
import {ROOM_PATTERN,SECRET_PATTERN} from './lib/karaoke-relay-protocol.js';
const status=document.querySelector('#status'),song=document.querySelector('#song');
const button=document.querySelector('#mic-toggle'),orb=document.querySelector('#orb');
const meter=document.querySelector('#meter-bar');
const fromLink=location.hash.slice(1);
let code=fromLink;
try{code=fromLink||sessionStorage.getItem('gnarly.karaoke.mic-pairing')||''}catch{}
const separator=code.indexOf('.');
const room=code.slice(0,separator),invite=code.slice(separator+1);
const valid=separator>0&&ROOM_PATTERN.test(room)&&SECRET_PATTERN.test(invite);
const microphone=new KaraokeMicrophone();
let socket=null,connected=false,seq=0,lastSentAt=0,ready=false;
const label=text=>{status.textContent=text};
function refresh(){
 button.disabled=!connected;
 button.textContent=microphone.active?'Desligar microfone':'Ativar microfone';
 orb.classList.toggle('active',microphone.active);
 if(!microphone.active){meter.style.width='0%';orb.style.setProperty('--pulse','1')}
}
const transmit=value=>{if(socket?.readyState===1)socket.send(JSON.stringify(value))};
microphone.onChange=()=>{
 if(!microphone.active){refresh();return}
 const voice=microphone.frameNow();
 meter.style.width=Math.min(100,Math.round(voice.rms*800))+'%';
 orb.style.setProperty('--pulse',String(1+Math.min(.09,voice.rms*.32)));
 const now=performance.now();
 // 5-7 packets/sec, no PCM and no personal identifiers.
 if(now-lastSentAt<145)return;
 lastSentAt=now;
 transmit({type:'frame',seq:++seq,rms:voice.rms,hz:voice.hz,
  voiced:voice.voiced,confidence:voice.confidence});
};
async function stop(){
 if(microphone.active)microphone.stop();
 transmit({type:'mic-off'});refresh();
}
button.addEventListener('click',async()=>{
 if(microphone.active){await stop();label('Microfone desligado.');return}
 if(!connected)return;
 button.disabled=true;
 try{
  const started=await microphone.start();
  if(!started||!connected){microphone.stop();return}
  seq=0;lastSentAt=0;transmit({type:'mic-on'});
  label('Microfone ativo · cante olhando para o desktop');
 }catch(error){
  label(error?.name==='NotAllowedError'?'Autorize o microfone nas configurações do navegador.':
   'Não foi possível iniciar o microfone. Verifique HTTPS e permissões.');
 }finally{refresh()}
});
if(!valid)label('Link inválido. Abra o link enviado pelo GNARLY no desktop.');
else{
 // Avoid keeping pairing credentials in the visible address bar/history.
 try{sessionStorage.setItem('gnarly.karaoke.mic-pairing',code)}catch{}
 history.replaceState(null,'',location.pathname);
 socket=new WebSocket('wss://gnarly-web.miscrapha.workers.dev/karaoke-relay/'+room);
 socket.onopen=()=>transmit({type:'hello',role:'mic',key:invite});
 socket.onmessage=event=>{
  let value;try{value=JSON.parse(event.data)}catch{return}
  if(value.type==='ready'){connected=true;ready=true;label('Conectado ao computador. Ative o microfone.');refresh()}
  else if(value.type==='sync'){
   song.textContent=value.title||'Karaokê GNARLY';
   if(!microphone.active)label(value.playing?'Música tocando no computador.':'Música pausada no computador.');
  }else if(value.type==='disconnected'){
   connected=false;void stop();label('Computador desconectado. Gere outro link no desktop.');
  }
 };
 socket.onerror=()=>label('Não foi possível conectar. O servidor de pareamento pode estar indisponível.');
 socket.onclose=()=>{connected=false;void stop();label(ready?'Sessão encerrada. Gere um novo link no computador.':'Pareamento indisponível. Confira o link e tente novamente.')};
}
window.addEventListener('pagehide',()=>{microphone.stop();try{socket?.close(1000,'Página encerrada')}catch{}});
refresh();
