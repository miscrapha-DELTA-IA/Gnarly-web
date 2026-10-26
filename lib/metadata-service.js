/* GNARLY Metadata: metadata-only Apple, then MusicBrainz, with bounded caching. */
import {inferredCredit,matchApple,matchMusicBrainz,normalized} from './metadata-intelligence.js';
const cacheLocal=new Map(),inFlight=new Map();
const jsonHeaders={'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const SUCCESS_TTL=24*3600,MISS_TTL=600;let lastMusicBrainz=0;
const result=(data,ttl)=>Response.json(data,{headers:{...jsonHeaders,'cache-control':'public, max-age='+ttl+', s-maxage='+ttl}});
function parse(request){
 const p=new URL(request.url).searchParams,title=String(p.get('title')||'').trim().slice(0,180);
 const artist=String(p.get('artist')||'').trim().slice(0,110),duration=Number(p.get('duration')||0);
 return title.length>=2&&Number.isFinite(duration)&&duration>=0&&duration<=900?{title,artist,duration}:null;
}
function cacheKey(q){
 const u=new URL('https://gnarly-metadata.internal/v1');
 u.searchParams.set('title',normalized(q.title).slice(0,180));
 u.searchParams.set('artist',normalized(q.artist).slice(0,110));
 u.searchParams.set('duration',String(Math.round(q.duration)));
 return new Request(u.toString());
}
async function getCache(key){
 const local=cacheLocal.get(key.url);if(local&&local.until>Date.now())return local.data;
 try{if(typeof caches!=='undefined'&&caches.default){const r=await caches.default.match(key);if(r?.ok)return await r.json()}}catch{}
 return null;
}
async function putCache(key,data,ttl){
 cacheLocal.set(key.url,{data,until:Date.now()+Math.min(ttl*1000,5*60*1000)});
 if(cacheLocal.size>240)cacheLocal.delete(cacheLocal.keys().next().value);
 try{if(typeof caches!=='undefined'&&caches.default)await caches.default.put(key,result(data,ttl))}catch{}
}
function lucene(q){return q.replace(/[\\"]/g,' ').replace(/[^\p{L}\p{N}\s\-_.()]/gu,' ').trim().slice(0,90)}
async function appleLookup(q){
 const c=inferredCredit(q.title,q.artist),term=[c.artist,c.title].filter(Boolean).join(' ');if(term.length<2)return null;
 const u=new URL('https://itunes.apple.com/search');
 u.searchParams.set('term',term.slice(0,150));u.searchParams.set('entity','song');u.searchParams.set('media','music');u.searchParams.set('limit','18');
 try{const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
 if(!r.ok)return null;const body=await r.json();return matchApple(q,Array.isArray(body.results)?body.results:[])}catch{return null}
}
async function brainzLookup(q){
 const c=inferredCredit(q.title,q.artist);if(c.title.length<3||(!c.artist&&!(q.duration>0)))return null;
 // Best-effort per-isolate throttle. On concurrent traffic, skip rather than overload the public API.
 if(Date.now()-lastMusicBrainz<1250)return null;lastMusicBrainz=Date.now();
 const title=lucene(c.title),artist=lucene(c.artist);if(!title)return null;
 const u=new URL('https://musicbrainz.org/ws/2/recording');
 u.searchParams.set('query','recording:"'+title+'"'+(artist?' AND artist:"'+artist+'"':''));
 u.searchParams.set('fmt','json');u.searchParams.set('limit','8');
 try{const r=await fetch(u,{headers:{accept:'application/json','user-agent':'GnarlyMetadata/1.0 (https://github.com/miscrapha-DELTA-IA/Gnarly-web)'},signal:AbortSignal.timeout(6500)});
 if(!r.ok)return null;const body=await r.json();
 const match=matchMusicBrainz(q,Array.isArray(body.recordings)?body.recordings:[]);if(!match)return null;
 const release=match.identifiers?.releaseMBID;
 if(release&&/^[0-9a-f-]{36}$/i.test(release)){
  const artworkUrl='https://coverartarchive.org/release/'+release+'/front';
  try{const head=await fetch(artworkUrl,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(2200)});
  if(head.ok&&String(head.headers.get('content-type')||'').startsWith('image/'))match.artwork=artworkUrl}catch{}
 }
 return match;
 }catch{return null}
}
async function resolve(q){
 const apple=await appleLookup(q);if(apple)return {metadata:apple,status:'resolved'};
 const mb=await brainzLookup(q);return mb?{metadata:mb,status:'resolved'}:{metadata:null,status:'unresolved'};
}
export async function serveMetadata(request){
 const q=parse(request);if(!q)return Response.json({error:'Metadados de entrada inválidos.'},{status:400,headers:jsonHeaders});
 const key=cacheKey(q),cached=await getCache(key);
 if(cached)return result(cached,cached.metadata?SUCCESS_TTL:MISS_TTL);
 let promise=inFlight.get(key.url);if(!promise){promise=resolve(q);inFlight.set(key.url,promise)}
 try{const data=await promise;await putCache(key,data,data.metadata?SUCCESS_TTL:MISS_TTL);
 return result(data,data.metadata?SUCCESS_TTL:MISS_TTL)}
 finally{if(inFlight.get(key.url)===promise)inFlight.delete(key.url)}
}
