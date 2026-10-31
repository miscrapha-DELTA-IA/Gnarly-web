import {parseLRC} from './lrc.js';
import {isGenericArtist,inferredCredit,normalized} from './metadata-intelligence.js';
import {isGnarlyPagesHost} from './playback-source.js';

export const LYRICS_CLIENT='GNARLY WEB/1.0 (https://github.com/miscrapha-DELTA-IA/Gnarly-web)';
const MAX_LYRIC_LENGTH=24000;
const lyricCache=new Map(),prefetching=new Map();let lrclibCooldownUntil=0;
const STORAGE_KEY='gnarly.web.synced-lyrics-cache.v1',MAX_STORED=12,MAX_STORED_CHARS=180000;
function keyOf(query){return normalizeIdentity(query.artist)+'|'+normalizeIdentity(query.title)+'|'+Math.round(query.duration)}
function durableRead(key){
 try{
  const entries=JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY)||'[]');
  if(!Array.isArray(entries))return null;
  const match=entries.find(x=>x?.key===key&&x.until>Date.now());
  if(!match||!Array.isArray(match.result?.lines)||match.result.lines.length<1||!match.result.synced)return null;
  return match.result;
 }catch{return null}
}
function durableWrite(key,result,ttl){
 if(!result?.synced||!Array.isArray(result.lines)||!result.lines.length)return;
 try{
  const storage=globalThis.localStorage;if(!storage)return;
  let items=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');if(!Array.isArray(items))items=[];
  items=items.filter(x=>x?.key!==key&&x?.until>Date.now()).slice(-(MAX_STORED-1));
  const entry={key,result,until:Date.now()+ttl};
  if(JSON.stringify(entry).length>28000)return;
  items.push(entry);let payload=JSON.stringify(items);
  while(payload.length>MAX_STORED_CHARS&&items.length>1){items.shift();payload=JSON.stringify(items)}
  storage.setItem(STORAGE_KEY,payload);
 }catch{/* private browsing, quota limits or disabled storage */}
}
function putCache(key,result,ttl){
 lyricCache.set(key,{result,until:Date.now()+ttl});
 if(lyricCache.size>130)lyricCache.delete(lyricCache.keys().next().value);
 durableWrite(key,result,ttl);return result;
}
export function cachedAutoLyrics(track){
 const query=lyricsIdentity(track);if(!query.title||(!query.artist&&!(query.duration>0)))return null;
 const key=keyOf(query);
 const existing=lyricCache.get(key);
 if(existing?.until>Date.now())return existing.result;
 const saved=durableRead(key);
 return saved?putCache(key,saved,12*3600*1000):null;
}
/** Prepares only ONE next queued track, never fetches the media itself. */
export function prefetchAutoLyrics(track){
 const query=lyricsIdentity(track);
 if(!query.artist||!query.title||globalThis.navigator?.connection?.saveData)return Promise.resolve(null);
 const cached=cachedAutoLyrics(track);if(cached?.synced)return Promise.resolve(cached);
 const key=keyOf(query);
 if(prefetching.has(key))return prefetching.get(key);
 if(prefetching.size)return Promise.resolve(null); // bounded, avoid LRCLIB 429
 const pending=autoLyrics(track,{preferSynced:!!cached}).finally(()=>prefetching.delete(key));
 prefetching.set(key,pending);
 return pending;
}
export function cleanTitle(s){
 return String(s||'').replace(/\s*[\[(](official\s+(?:music\s+)?video|official\s+audio|lyric\s+video|lyrics?|visualizer|hd|4k)[\])]\s*/gi,' ').trim();
}
export function normalizeIdentity(s){return normalized(cleanTitle(s))}
export function lyricsIdentity(track){
 const hint=inferredCredit(track?.title,track?.artist);
 return {title:cleanTitle(hint.title),artist:!isGenericArtist(hint.artist)?hint.artist:'',
   album:String(track?.album||''),duration:Number(track?.duration)||0};
}
const acceptable=(item,query)=>{
 if(!item||item.instrumental||!item.trackName||!item.artistName)return false;
 if(normalizeIdentity(item.trackName)!==normalizeIdentity(query.title))return false;
 if(normalizeIdentity(item.artistName)!==normalizeIdentity(query.artist))return false;
 const d=Number(item.duration),want=Number(query.duration);
 if(d>0&&want>0&&Math.abs(d-want)>Math.min(7,Math.max(3,want*.025)))return false;
 return true;
};
export function selectBestMatch(items,track){
 const query=lyricsIdentity(track);
 if(!query.artist||!query.title)return null;
 return (Array.isArray(items)?items:[]).filter(x=>acceptable(x,query))
  .sort((a,b)=>(b.syncedLyrics?1:0)-(a.syncedLyrics?1:0)
   ||(Math.abs((a.duration||query.duration)-query.duration)-Math.abs((b.duration||query.duration)-query.duration)))[0]||null;
}
/** Unknown YouTube channel labels are never artist credits. LRCLIB can
 * supply lyrics for a title-only recording only when BOTH exact title and
 * audio duration agree and all candidates credit the same performer. A
 * common/ambiguous title cannot silently receive some other song's lyrics.
 */
export function verifiedTitleDurationMatch(items,track){
 const query=lyricsIdentity(track);
 if(query.artist||!(query.duration>=30)||!query.title||query.title.length<4)return null;
 const matches=(Array.isArray(items)?items:[]).filter(item=>
  item?.trackName&&item?.artistName&&
  normalizeIdentity(item.trackName)===normalizeIdentity(query.title)&&
  Number(item.duration)>0&&Math.abs(Number(item.duration)-query.duration)<=2.5
 );
 const artists=new Set(matches.map(item=>normalizeIdentity(item.artistName)));
 if(artists.size!==1)return null;
 return matches.filter(item=>!item.instrumental)
  .sort((a,b)=>(!!b.syncedLyrics)- (!!a.syncedLyrics))[0]||
  (matches.every(item=>item.instrumental)?matches[0]:null);
}
function plainLines(text){
 return typeof text==='string'?text.slice(0,MAX_LYRIC_LENGTH).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,280):[];
}
function status(result){
 const synced=typeof result?.syncedLyrics==='string'?parseLRC(result.syncedLyrics.slice(0,MAX_LYRIC_LENGTH)).slice(0,500):[];
 const plain=plainLines(result?.plainLyrics);
 if(!synced.length&&!plain.length)return null;
 return {lines:synced,plainLines:plain,synced:!!synced.length,source:'lrclib',
   status:synced.length?'Letra sincronizada · LRCLIB':'Letra disponível sem sincronização · LRCLIB',
   instrumental:false,recordId:result.id||null};
}
const headers={'Accept':'application/json','Lrclib-Client':LYRICS_CLIENT};
/** Same-origin alternative is used ONLY after direct API connectivity fails.
 * Do not evade a provider rate limit: 429 is honored immediately.
 */
export function lyricsProxyURL(url,host=globalThis.location?.hostname){
 if(!isGnarlyPagesHost(host))return null;
 const source=new URL(url);
 const params=new URLSearchParams();
 if(source.hostname==='lrclib.net'&&['/api/get','/api/search'].includes(source.pathname)){
  params.set('source',source.pathname==='/api/get'?'get':'search');
  for(const key of ['track_name','artist_name','album_name','duration','q']){
   const val=source.searchParams.get(key);if(val)params.set(key,val);
  }
 }else if(source.hostname==='api.lyrics.ovh'&&source.pathname.startsWith('/v1/')){
  const pieces=source.pathname.slice(4).split('/');
  if(pieces.length!==2)return null;
  params.set('source','ovh');
  try{
   params.set('artist',decodeURIComponent(pieces[0]));
   params.set('title',decodeURIComponent(pieces[1]));
  }catch{return null}
 }else return null;
 return '/api/lyrics-lookup?'+params.toString();
}
/** A failed lookup must not abort the rest of the lyrics search.
 * Keep each provider bounded and honor every actual 429, including edge
 * responses. The old fallback propagated its own timeout and silently
 * discarded previous plain lyrics and later LRCLIB candidates.
 */
async function lyricRequest(url,{signal,timeout=7200,firstParty=false}={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const controller=new AbortController();
 const abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{
   headers:firstParty?{Accept:'application/json'}:headers,
   signal:controller.signal,...(firstParty?{cache:'no-store'}:{})
  });
  if(response.status===429)return {
   rateLimited:true,retryAfter:Number(response.headers.get('retry-after'))||60
  };
  if(!response.ok)return null;
  return await response.json();
 }catch(error){
  if(signal?.aborted)throw error;
  return null;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
async function json(url,{signal}={}){
 // Use the direct browser CORS route first. Only fall back to GNARLY's
 // fixed-provider edge route if it is unavailable; no proxy rotation.
 const direct=await lyricRequest(url,{signal});
 if(direct?.rateLimited)return direct;
 if(direct!==null)return direct;
 const fallback=lyricsProxyURL(url);
 return fallback?lyricRequest(fallback,{signal,timeout:6500,firstParty:true}):null;
}
function cancelIfAborted(signal){if(signal?.aborted)throw new DOMException('Aborted','AbortError')}
export async function autoLyrics(track,{signal,preferSynced=false}={}){
 const query=lyricsIdentity(track);
 const key=keyOf(query);
 const cached=cachedAutoLyrics(track);
 if(cached&&(!preferSynced||cached.synced))return cached;
 // Do not let a completed plain-lyrics prefetch block a subsequent attempt
 // to find synchronized LRC for the currently playing song.
 if(prefetching.has(key)&&!preferSynced)return prefetching.get(key);
 const empty={lines:[],plainLines:[],synced:false,source:null,instrumental:false,
   status:'Nenhuma letra encontrada. Você pode importar .lrc ou transcrever seu próprio arquivo.'};
 if(!query.title)return {...empty,status:'Aguardando título correto para procurar letras.'};
 if(!query.artist){
  if(!(query.duration>=30))return {...empty,status:'Aguardando identificação do artista ou duração para localizar a letra.'};
  try{
   cancelIfAborted(signal);
   if(Date.now()<lrclibCooldownUntil)return {...empty,status:'LRCLIB limitou consultas recentemente.'};
   const broad=new URL('https://lrclib.net/api/search');
   broad.searchParams.set('q',query.title);
   const candidates=await json(broad,{signal});
   cancelIfAborted(signal);
   if(candidates?.rateLimited){
    lrclibCooldownUntil=Date.now()+Math.min(candidates.retryAfter||60,3600)*1000;
    return {...empty,status:'LRCLIB limitou as consultas. Tente novamente mais tarde.'};
   }
   const selected=verifiedTitleDurationMatch(candidates,track);
   if(selected?.instrumental)return {...empty,instrumental:true,status:'Gravação instrumental identificada.'};
   const found=status(selected);
   return found?putCache(key,found,found.synced?12*3600*1000:5*60*1000):
    {...empty,status:'Aguardando crédito confiável do artista para evitar letra incorreta.'};
  }catch(error){
   if(signal?.aborted||error?.name==='AbortError')return {...empty,status:'Busca cancelada'};
   return {...empty,status:'Serviço de letras temporariamente indisponível.'};
  }
 }
 try{
  cancelIfAborted(signal);
  if(Date.now()<lrclibCooldownUntil)return {...empty,status:'LRCLIB limitou consultas recentemente. Aguarde para tentar novamente.'};
  const exact=new URL('https://lrclib.net/api/get');
  exact.searchParams.set('track_name',query.title);
  exact.searchParams.set('artist_name',query.artist);
  if(query.album&&query.album!=='Biblioteca local'&&query.album!=='GNARLY WEB')exact.searchParams.set('album_name',query.album);
  if(query.duration>=1&&query.duration<=3600)exact.searchParams.set('duration',String(Math.round(query.duration)));
  const result=await json(exact,{signal});
  cancelIfAborted(signal);
  if(result?.rateLimited){lrclibCooldownUntil=Date.now()+Math.min(result.retryAfter||60,3600)*1000;return {...empty,status:'LRCLIB limitou as consultas. Tente novamente mais tarde.'}}
  // A recognized instrumental recording has no lyrics; never hallucinate them.
  if(result?.instrumental&&normalizeIdentity(result.trackName)===normalizeIdentity(query.title)&&normalizeIdentity(result.artistName)===normalizeIdentity(query.artist))return {...empty,instrumental:true,status:'Faixa instrumental, sem letra cantada.'};
  // Even /api/get results must match artist/title/version to avoid mistaken LRC.
  let selected=selectBestMatch(result?[result]:[],track);
  if(!selected||!selected.instrumental&&!status(selected)?.synced){
   const search=new URL('https://lrclib.net/api/search');
   search.searchParams.set('track_name',query.title);search.searchParams.set('artist_name',query.artist);
   // A second provider lookup may fail independently; never discard a
   // valid plain lyric from /get just because /search is offline.
   const candidates=await json(search,{signal}).catch(error=>{
    if(signal?.aborted||error?.name==='AbortError')throw error;
    return null;
   });
   cancelIfAborted(signal);
   if(candidates?.rateLimited){lrclibCooldownUntil=Date.now()+Math.min(candidates.retryAfter||60,3600)*1000;if(!selected)return {...empty,status:'LRCLIB limitou as consultas. Tente novamente mais tarde.'}}
   const alternative=selectBestMatch(candidates,track);
   if(!selected||status(alternative)?.synced)selected=alternative||selected;
   // Broader LRCLIB search is only used on a total metadata miss. Strict
   // artist/title/version/duration verification still prevents false matches.
   if(!status(selected)?.synced&&!candidates?.rateLimited){
    const broad=new URL('https://lrclib.net/api/search');
    broad.searchParams.set('q',query.artist+' '+query.title);
    const expanded=await json(broad,{signal}).catch(error=>{
     if(signal?.aborted||error?.name==='AbortError')throw error;
     return null;
    });
    cancelIfAborted(signal);
    if(expanded?.rateLimited){
     lrclibCooldownUntil=Date.now()+Math.min(expanded.retryAfter||60,3600)*1000;
     return {...empty,status:'LRCLIB limitou as consultas. Tente novamente mais tarde.'};
    }
    const broadMatch=selectBestMatch(expanded,track);
    if(!selected||status(broadMatch)?.synced)selected=broadMatch||selected;
   }
  }
  if(selected?.instrumental)return {...empty,instrumental:true,status:'Faixa instrumental, sem letra cantada.'};
  const chosen=status(selected);
  if(chosen?.synced)return putCache(key,chosen,12*3600*1000);
  // Preserve earlier plain lyrics if the synchronized lookup came up empty.
  // Do not mask a subsequent synchronized upgrade for five minutes.
  const existingPlain=chosen||cached;
  // Complete the LRCLIB synchronization search before settling on plain,
  // but don't hold a verified plain result on a second unrelated provider.
  if(existingPlain?.plainLines?.length)return putCache(key,existingPlain,30*1000);
  // Secondary, plain-only public endpoint; never assign invented timestamps.
  const backup=new URL('https://api.lyrics.ovh/v1/'+encodeURIComponent(query.artist)+'/'+encodeURIComponent(query.title));
  const response=await json(backup,{signal});
  cancelIfAborted(signal);
  const backupLines=plainLines(response?.lyrics);
  if(existingPlain?.plainLines?.length)return putCache(key,existingPlain,30*1000);
  return putCache(key,backupLines.length?{...empty,plainLines:backupLines,source:'lyrics.ovh',status:'Letra sem sincronização · lyrics.ovh'}:empty,backupLines.length?30*1000:45*1000);
 }catch(e){
  if(signal?.aborted||e?.name==='AbortError')return {...empty,status:'Busca cancelada'};
  return cached?.plainLines?.length?cached:{...empty,status:'Letras temporariamente indisponíveis; tente novamente ou importe .lrc'};
 }
}
