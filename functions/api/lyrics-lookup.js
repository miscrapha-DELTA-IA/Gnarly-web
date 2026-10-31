/** GNARLY first-party, read-only lyric lookup fallback.
 * Upstreams are FIXED, no arbitrary URL proxy, and payloads are bounded.
 * Provider 429 is returned unmodified so the client respects rate limits.
 */
const CLIENT='GNARLY WEB/1.0 (https://github.com/miscrapha-DELTA-IA/Gnarly-web)';
const LRCLIB='https://lrclib.net',OVH='https://api.lyrics.ovh';
const MAX_BODY=550000;
const json=(object,status=200,headers={})=>new Response(JSON.stringify(object),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}
});
function value(params,name,max){const raw=params.get(name);return raw&&raw.length<=max&&raw.trim()?raw.trim():null;}
export function lyricUpstreamURL(requestURL){
 const params=new URL(requestURL).searchParams,provider=params.get('source');
 if(!['get','search','ovh'].includes(provider))return null;
 if(provider==='ovh'){
  const artist=value(params,'artist',130),title=value(params,'title',190);
  return artist&&title?OVH+'/v1/'+encodeURIComponent(artist)+'/'+encodeURIComponent(title):null;
 }
 const title=value(params,'track_name',190),artist=value(params,'artist_name',130);
 const query=value(params,'q',250);
 if(provider==='get'&&(!title||!artist))return null;
 if(provider==='search'&&!title&&!query)return null;
 const url=new URL(provider==='get'?'/api/get':'/api/search',LRCLIB);
 if(query&&provider==='search')url.searchParams.set('q',query);
 else{
  if(title)url.searchParams.set('track_name',title);
  if(artist)url.searchParams.set('artist_name',artist);
 }
 if(provider==='get'){
  const album=value(params,'album_name',150),rawDuration=params.get('duration');
  if(album)url.searchParams.set('album_name',album);
  if(rawDuration){
   const duration=Number(rawDuration);
   if(!Number.isInteger(duration)||duration<1||duration>3600)return null;
   url.searchParams.set('duration',String(duration));
  }
 }
 return url.href;
}
export async function onRequestGet({request}){
 const endpoint=lyricUpstreamURL(request.url);
 if(!endpoint)return json({error:'invalid lyrics query'},400);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8500);
 const isLrc=endpoint.startsWith(LRCLIB);
 try{
  const upstream=await fetch(endpoint,{method:'GET',redirect:'error',signal:ctl.signal,
   headers:{Accept:'application/json',...(isLrc?{'Lrclib-Client':CLIENT}:{})}});
  const retry=upstream.headers.get('Retry-After')||'60';
  if(upstream.status===429)
   return json({rateLimited:true},429,{'Retry-After':/^\d{1,4}$/.test(retry)?retry:'60'});
  if(upstream.status===404)return json({notFound:true},404);
  if(!upstream.ok)return json({error:'lyrics provider unavailable'},502);
  const length=Number(upstream.headers.get('Content-Length')||0);
  if(length>MAX_BODY)return json({error:'lyrics response too large'},502);
  const payload=await upstream.text();
  if(payload.length>MAX_BODY)return json({error:'lyrics response too large'},502);
  const data=JSON.parse(payload);
  if(!data||typeof data!=='object')return json({error:'lyrics response malformed'},502);
  return json(data,200,{'Cache-Control':'public, max-age=120'});
 }catch{return json({error:'lyrics request timed out'},504)}
 finally{clearTimeout(timer)}
}
