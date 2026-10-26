import {parseLRC} from './lrc.js';
import {isGenericArtist,inferredCredit,normalized} from './metadata-intelligence.js';

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
 const query=lyricsIdentity(track);if(!query.artist||!query.title)return null;
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
 const cached=cachedAutoLyrics(track);if(cached)return Promise.resolve(cached);
 const key=keyOf(query);
 if(prefetching.has(key))return prefetching.get(key);
 if(prefetching.size)return Promise.resolve(null); // bounded, avoid LRCLIB 429
 const pending=autoLyrics(track).finally(()=>prefetching.delete(key));
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
async function json(url,{signal}={}){
 const ctl=new AbortController();
 const abort=()=>ctl.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>ctl.abort(),7200);
 try{
  const r=await fetch(url,{headers,signal:ctl.signal});
  if(r.status===429)return {rateLimited:true,retryAfter:Number(r.headers.get('retry-after'))||60};
  if(!r.ok)return null;
  const body=await r.json();return body;
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort)}
}
function cancelIfAborted(signal){if(signal?.aborted)throw new DOMException('Aborted','AbortError')}
export async function autoLyrics(track,{signal}={}){
 const query=lyricsIdentity(track);
 const key=keyOf(query);
 const cached=cachedAutoLyrics(track);if(cached)return cached;
 if(prefetching.has(key))return prefetching.get(key);
 const empty={lines:[],plainLines:[],synced:false,source:null,instrumental:false,
   status:'Nenhuma letra encontrada. Você pode importar .lrc ou transcrever seu próprio arquivo.'};
 if(!query.title||!query.artist)return {...empty,status:'Aguardando identificação correta do artista para procurar letras.'};
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
  if(!selected){
   const search=new URL('https://lrclib.net/api/search');
   search.searchParams.set('track_name',query.title);search.searchParams.set('artist_name',query.artist);
   const candidates=await json(search,{signal});
   cancelIfAborted(signal);
   if(candidates?.rateLimited){lrclibCooldownUntil=Date.now()+Math.min(candidates.retryAfter||60,3600)*1000;return {...empty,status:'LRCLIB limitou as consultas. Tente novamente mais tarde.'}}
   selected=selectBestMatch(candidates,track);
  }
  if(selected?.instrumental)return {...empty,instrumental:true,status:'Faixa instrumental, sem letra cantada.'};
  const chosen=status(selected);
  if(chosen)return putCache(key,chosen,12*3600*1000);
  // Secondary, plain-only public endpoint; never assign invented timestamps.
  const backup=new URL('https://api.lyrics.ovh/v1/'+encodeURIComponent(query.artist)+'/'+encodeURIComponent(query.title));
  const response=await json(backup,{signal});
  cancelIfAborted(signal);
  const backupLines=plainLines(response?.lyrics);
  return putCache(key,backupLines.length?{...empty,plainLines:backupLines,source:'lyrics.ovh',status:'Letra sem sincronização · lyrics.ovh'}:empty,backupLines.length?12*3600*1000:5*60*1000);
 }catch(e){
  if(signal?.aborted||e?.name==='AbortError')return {...empty,status:'Busca cancelada'};
  return {...empty,status:'Letras temporariamente indisponíveis; tente novamente ou importe .lrc'};
 }
}
