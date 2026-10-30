/** Read-only production probe. Runs in CI's public network, not a user's device.
 * Never extracts YouTube audio, logs credentials, saves music or uploads data.
 * Stops Audius after the first media chunk (max a few KB).
 */
const origin=process.env.GNARLY_PROBE_URL||'https://gnarly-web-pages.pages.dev';
const backend='https://nightcorelab.onrender.com';
const results=[{check:'probe-target',host:new URL(origin).hostname}];
async function get(url,{timeout=12000,range=false}={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
 try{
  const response=await fetch(url,{method:'GET',signal:ctl.signal,
   headers:range?{Range:'bytes=0-1023'}:{},redirect:'follow'});
  let body=null;
  if(range){
   if(response.body){
    const reader=response.body.getReader();
    try{const chunk=await reader.read();body=chunk.value?.length||0;}
    finally{try{await reader.cancel()}catch{}}
   }
  }else{
   const text=await response.text();
   try{body=JSON.parse(text)}catch{body=text.slice(0,100)}
  }
  return {status:response.status,type:response.headers.get('content-type'),
    source:response.headers.get('x-gnarly-playback-source'),reason:response.headers.get('x-gnarly-audius-failure'),body};
 }catch(error){return {error:error?.name||'network',detail:String(error?.message||'').slice(0,110)}}
 finally{clearTimeout(timer);ctl.abort()}
}
const health=await get(backend+'/health',{timeout:9000});
const status=await get(backend+'/playback-status',{timeout:9000});
results.push({check:'render-health',status:health.status,error:health.error,
 r2_enabled:health.body?.r2_enabled});
results.push({check:'render-playback',status:status.status,error:status.error,
 origin_state:status.body?.status,retry_after:status.body?.retry_after});
for(const endpoint of [
 'https://api.audius.co/v1/tracks/search?query=electronic&limit=2&app_name=Gnarly',
 'https://discoveryprovider.audius.co/v1/tracks/search?query=electronic&limit=2&app_name=Gnarly'
]){
 const redirectProbe=await fetch(endpoint,{redirect:'manual',signal:AbortSignal.timeout(8500)}).catch(()=>null);
 if(redirectProbe){
  const loc=redirectProbe.headers.get('Location');
  let redirectHost=null;
  try{if(loc)redirectHost=new URL(loc,endpoint).hostname}catch{}
  results.push({check:'provider-redirect',host:new URL(endpoint).hostname,
   status:redirectProbe.status,redirect_host:redirectHost});
  try{await redirectProbe.body?.cancel?.()}catch{}
 }
 const direct=await get(endpoint,{timeout:8500});
 results.push({check:'provider-direct',host:new URL(endpoint).hostname,
  status:direct.status,error:direct.error,type:direct.type,
  fields:direct.body&&typeof direct.body==='object'?Object.keys(direct.body).slice(0,8):[],
  entries:Array.isArray(direct.body?.data)?direct.body.data.length:null,
  error_text:String(direct.body?.error||direct.body?.message||'').slice(0,180)});
}
let playable=false;
for(const term of ['electronic','house']){
 const listing=await get(origin+'/api/audius-search?term='+encodeURIComponent(term)+'&limit=15');
 const tracks=Array.isArray(listing.body?.results)?listing.body.results:[];
 results.push({check:'audius-search',term,status:listing.status,
  error:listing.error,reason:listing.reason,full_tracks:tracks.length});
 if(!tracks.length)continue;
 for(const candidate of tracks.slice(0,3)){
  if(!/^audius:[A-Za-z0-9]{3,64}$/.test(candidate?.id||''))continue;
  const id=candidate.id.slice(7);
  const response=await get(origin+'/audius-audio/'+id,{range:true,timeout:15000});
  const valid=([200,206].includes(response.status))&&
   /^(audio\/|application\/octet-stream)/i.test(response.type||'')&&response.body>0;
  results.push({check:'audius-audio',track_id:id,status:response.status,
   type:response.type,source:response.source,first_chunk_bytes:response.body,
   error:response.error,valid});
  if(valid){playable=true;break}
 }
 if(playable)break;
}
// Read ONLY already stored GNARLY R2 objects, never origin extraction.
const ready=await get(origin+'/api/r2-available?limit=8',{timeout:9000});
const readyTracks=Array.isArray(ready.body?.results)?ready.body.results:[];
results.push({check:'r2-catalog',status:ready.status,ready_tracks:readyTracks.length,error:ready.error});
let r2Working=false;
for(const track of readyTracks.slice(0,3)){
 if(!/^youtube:[A-Za-z0-9_-]{11}$/.test(track?.id||'')||
   track.playbackAvailability!=='r2')continue;
 const id=track.videoId;
 const media=await get(origin+'/fast-audio/'+id,{range:true,timeout:9000});
 const valid=media.status===206&&media.source==='r2-edge'&&
  /audio\/mp4/i.test(media.type||'')&&media.body>0;
 results.push({check:'r2-media',id,status:media.status,source:media.source,
  bytes:media.body,type:media.type,error:media.error,valid});
 if(valid){r2Working=true;break;}
}
if(!r2Working){console.error('FAIL: R2 catalogue had no verified playable cache hit.');process.exitCode=1;}
for(const r of results)console.log(JSON.stringify(r));
const report=process.env.GITHUB_STEP_SUMMARY;
if(report){
 const fs=await import('node:fs');
 fs.appendFileSync(report,'## GNARLY live audio diagnostics\n\n```json\n'+
  JSON.stringify(results,null,2)+'\n```\n');
}
if(!playable){
 console.error('FAIL: No verified full-track Audius audio could be streamed through deployed GNARLY.');
 process.exitCode=1;
}
