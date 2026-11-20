/** Shared, portable pairing protocol. No worker-only imports. */
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

/**
 * Bounded WebRTC signaling. Only SDP/ICE metadata crosses the Worker;
 * RTP microphone audio remains DTLS-SRTP encrypted between the browsers.
 */
export function safeRTCSignal(value,role){
 if(!value||typeof value!=='object')return null;
 if((value.type==='rtc-offer'&&role==='host')||(value.type==='rtc-answer'&&role==='mic')){
  const sdp=value.sdp;
  if(typeof sdp!=='string'||sdp.length<30||sdp.length>12000||
    !sdp.startsWith('v=0')||!sdp.includes('m=audio'))return null;
  return {type:value.type,sdp};
 }
 if(value.type==='rtc-candidate'){
  const c=value.candidate;
  if(!c||typeof c!=='object'||typeof c.candidate!=='string'||
    c.candidate.length<3||c.candidate.length>1100||
    !c.candidate.startsWith('candidate:')||
    (c.sdpMid!==null&&c.sdpMid!==undefined&&
      (typeof c.sdpMid!=='string'||c.sdpMid.length>48))||
    (c.sdpMLineIndex!==null&&c.sdpMLineIndex!==undefined&&
      (!Number.isInteger(c.sdpMLineIndex)||c.sdpMLineIndex<0||c.sdpMLineIndex>12)))
   return null;
  return {type:'rtc-candidate',candidate:{
   candidate:c.candidate,
   sdpMid:c.sdpMid??null,
   sdpMLineIndex:c.sdpMLineIndex??null
  }};
 }
 return null;
}
