/** Ephemeral GNARLY karaoke mic relay; no media transport, raw audio or DB.
 * Each unpredictable room ID maps to exactly one host and one microphone.
 * Credentials are attached only to WebSockets and survive DO hibernation.
 */
export const ROOM_PATTERN=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const SECRET_PATTERN=/^[a-f0-9]{32}$/i;
export const RELAY_MAX_AGE=60*60*1000;
export function safeMicFrame(value){
 if(!value||typeof value!=='object')return null;
 const {rms,hz,confidence,voiced,seq}=value;
 if(!Number.isInteger(seq)||seq<0||seq>2147483647||
    !Number.isFinite(rms)||rms<0||rms>2||
    !Number.isFinite(confidence)||confidence<0||confidence>1||
    (hz!==null&&(!Number.isFinite(hz)||hz<65||hz>1100))||
    typeof voiced!=='boolean')return null;
 return {type:'frame',seq,rms:Math.round(rms*10000)/10000,
  hz:hz===null?null:Math.round(hz*10)/10,
  confidence:Math.round(confidence*1000)/1000,voiced};
}
export function safePlaybackSync(value){
 if(!value||!Number.isFinite(value.position)||value.position<0||
  value.position>14400||typeof value.playing!=='boolean')return null;
 return {type:'sync',position:Math.round(value.position*10)/10,
  playing:value.playing,title:String(value.title||'').slice(0,100)};
}
const getPeer=(ctx,role)=>ctx.getWebSockets().find(ws=>ws.deserializeAttachment?.()?.role===role);
const send=(ws,data)=>{if(!ws)return;try{ws.send(JSON.stringify(data))}catch{}};
export class KaraokeRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Upgrade required',{status:426});
  if(this.ctx.getWebSockets().length>=3)return new Response('Room full',{status:429});
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];
  this.ctx.acceptWebSocket(server);
  server.serializeAttachment({role:'pending',created:Date.now()});
  return new Response(null,{status:101,webSocket:client});
 }
 webSocketMessage(ws,raw){
  if(typeof raw!=='string'||raw.length>512){ws.close(1008,'Invalid message');return}
  let value;try{value=JSON.parse(raw)}catch{ws.close(1008,'Invalid JSON');return}
  const state=ws.deserializeAttachment()||{role:'pending',created:Date.now()};
  if(Date.now()-state.created>RELAY_MAX_AGE){ws.close(1000,'Session expired');return}
  if(state.role==='pending'){
   const role=value?.role,key=value?.key,invite=value?.invite;
   if(value?.type!=='hello'||!SECRET_PATTERN.test(key||'')){ws.close(1008,'Invalid authorization');return}
   const host=getPeer(this.ctx,'host'),mic=getPeer(this.ctx,'mic');
   if(role==='host'){
    if(!SECRET_PATTERN.test(invite||'')||host||
       (mic&&mic.deserializeAttachment()?.invite!==invite)){ws.close(1008,'Host already connected');return}
    ws.serializeAttachment({role:'host',key,invite,created:Date.now()});
    send(ws,{type:'ready',role:'host'});
    if(mic)send(ws,{type:'paired'});
    return;
   }
   if(role==='mic'&&host&&host.deserializeAttachment()?.invite===key&&!mic){
    ws.serializeAttachment({role:'mic',invite:key,created:Date.now(),lastSeq:-1,lastAt:0});
    send(ws,{type:'ready',role:'mic'});
    send(host,{type:'paired'});
    return;
   }
   ws.close(1008,'Pairing unavailable');return;
  }
  if(state.role==='host'){
   if(value?.type==='sync'){const sync=safePlaybackSync(value);if(sync)send(getPeer(this.ctx,'mic'),sync)}
   if(value?.type==='bye')ws.close(1000,'Host ended session');
   return;
  }
  if(state.role==='mic'){
   const host=getPeer(this.ctx,'host');
   if(value?.type==='mic-on'||value?.type==='mic-off'){
    send(host,{type:value.type});return;
   }
   if(value?.type==='frame'){
    const frame=safeMicFrame(value);
    const now=Date.now();
    if(!frame||frame.seq<=state.lastSeq||now-state.lastAt<70)return;
    ws.serializeAttachment({...state,lastSeq:frame.seq,lastAt:now});
    send(host,frame);
   }
  }
 }
 webSocketClose(ws){
  const role=ws.deserializeAttachment?.()?.role;
  const opposite=role==='host'?'mic':'host';
  send(getPeer(this.ctx,opposite),{type:'disconnected',role});
  if(role==='host')getPeer(this.ctx,'mic')?.close(1000,'Desktop disconnected');
 }
 webSocketError(ws){try{ws.close(1011,'Connection error')}catch{}}
}
