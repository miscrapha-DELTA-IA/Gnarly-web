/**
 * GNARLY Web media-session relay. Equivalent role to the iOS
 * MPNowPlayingInfoCenter + MPRemoteCommandCenter / RemotePlaybackRelay.
 * Owns no player, queue, AudioContext or timers: a single HTMLAudioElement
 * stays authoritative for system/headset playback state.
 */
/**
 * WebKit's Audio Session API (when exposed) gives Web Audio the playback
 * category, just like the native AVAudioSession playback / playAndRecord.
 * Browser support is limited: this is a feature-detected hint, not a bypass
 * for OS background suspension or autoplay policy.
 */
export function configureBrowserAudioSession({navigatorObject,recording=false}={}){
 const session=navigatorObject?.audioSession;
 if(!session)return false;
 const type=recording?'play-and-record':'playback';
 try{session.type=type;return session.type===type}catch{return false}
}
export function mediaPosition(audio,track){
 const rawDuration=Number(audio?.duration);
 const duration=Number.isFinite(rawDuration)&&rawDuration>0?rawDuration:Number(track?.duration);
 if(!Number.isFinite(duration)||duration<=0)return null;
 const rawPosition=Number(audio?.currentTime);
 const position=Number.isFinite(rawPosition)?Math.max(0,Math.min(duration,rawPosition)):0;
 const rawRate=Number(audio?.playbackRate);
 return {duration,position,playbackRate:Number.isFinite(rawRate)&&rawRate>0?rawRate:1};
}
export function createMediaSessionController({
 audio,session=null,MediaMetadataCtor=null,actions={},baseUrl='https://gnarly.example/'
}={}){
 // In tests, browser interfaces are injected; on iOS they come from navigator.
 if(!session||!audio)return {available:false,sync(){},position(){},destroy(){}};
 let identity='',lastPositionSignature='',lastPositionAt=-Infinity,lastQueue=null,destroyed=false;
 const handlers=new Map();
 const invoke=name=>(details)=>{
  if(destroyed)return;
  try{void actions[name]?.(details||{})}catch{/* External hardware commands must never crash the player. */}
 };
 function setHandler(name,handler){
  if(typeof session.setActionHandler!=='function')return;
  try{session.setActionHandler(name,handler);handlers.set(name,handler)}catch{handlers.delete(name)}
 }
 // Installed once and routed through the SAME playback transitions as on-screen.
 for(const command of ['play','pause','previoustrack','seekto','seekforward','seekbackward','stop'])
  setHandler(command,invoke(command));
 function queueAvailability(canNext){
  if(lastQueue===canNext)return;
  lastQueue=canNext;
  setHandler('nexttrack',canNext?invoke('nexttrack'):null);
 }
 function metadata(track,artworkUrl){
  if(!MediaMetadataCtor)return;
  const title=String(track?.title||'').trim(),artist=String(track?.artist||'').trim();
  const album=String(track?.album||'').trim();
  let src='';
  try{
   const u=new URL(artworkUrl||track?.artwork||'',baseUrl);
   if(['http:','https:','blob:'].includes(u.protocol))src=u.href;
  }catch{}
  const key=[String(track?.id||''),title,artist,album,src].join('\u001f');
  if(key===identity)return;
  identity=key;
  const artwork=src?[{src}]:[];
  try{session.metadata=track?new MediaMetadataCtor({title,artist,album,artwork}):null}catch{}
 }
 function position({track,force=false,now=Date.now()}={}){
  if(!track||typeof session.setPositionState!=='function')return;
  const value=mediaPosition(audio,track);
  if(!value)return;
  const signature=[String(track.id||''),value.duration,value.playbackRate].join('|');
  // Safari can emit timeupdate every ~250ms. Publishing every event is
  // unnecessary; lock-screen position advances at its own playbackRate.
  if(!force&&signature===lastPositionSignature&&now-lastPositionAt<1000)return;
  try{session.setPositionState(value);lastPositionSignature=signature;lastPositionAt=now}catch{}
 }
 function sync({track=null,artist,canNext=false,playing=false,artworkUrl,forcePosition=false}={}){
  if(destroyed)return;
  queueAvailability(Boolean(track&&canNext));
  if(!track){
   identity='';lastPositionSignature='';lastPositionAt=-Infinity;
   try{session.metadata=null}catch{}
   try{session.playbackState='none'}catch{}
   return;
  }
  metadata(artist?{...track,artist}:track,artworkUrl);
  try{session.playbackState=playing?'playing':'paused'}catch{}
  position({track,force:forcePosition});
 }
 function destroy(){
  if(destroyed)return;destroyed=true;
  for(const command of handlers.keys())setHandler(command,null);
  handlers.clear();
  try{session.metadata=null;session.playbackState='none'}catch{}
 }
 return {available:true,sync,position,destroy};
}
