/** Persistent, per-browser-personal-library storage for GNARLY PWA.
 * The user picks local files or explicitly downloads tracks served by the
 * first-party audio backend. Never cache partial HTTP Range responses as songs.
 * No audio bytes or listening history are sent to an account/sync service.
 */
import {trackAudioURL,youtubeID} from './playback-source.js';

export const OFFLINE_MAX_BYTES=72*1024*1024; // 72 MiB / track
export const OFFLINE_DB_NAME='gnarly-web-offline-v1';
export const OFFLINE_PROFILE_KEY='gnarly.web.offline.profile.v1';
const PROFILE_RE=/^[a-f0-9-]{12,70}$/i;
const allowedMime=/^audio\/(mp4|mpeg|aac|x-m4a|wav|ogg|webm|flac|x-flac|aiff|x-aiff)(?:;|$)/i;

export function offlineProfile(storage=globalThis.localStorage,random=globalThis.crypto){
 let previous=null;
 try{previous=storage?.getItem(OFFLINE_PROFILE_KEY)}catch{}
 if(PROFILE_RE.test(previous||''))return previous;
 const id=(typeof random?.randomUUID==='function'?random.randomUUID():
   Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join(''));
 try{storage?.setItem(OFFLINE_PROFILE_KEY,id)}catch{}
 return id;
}
export function validAudioFile(file,{maxBytes=OFFLINE_MAX_BYTES}={}){
 if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>maxBytes)return false;
 return allowedMime.test(file.type||'')||/\.(m4a|mp3|aac|wav|ogg|oga|flac|webm|aiff?)$/i.test(file.name||'');
}
export function cleanOfflineTrack(track){
 if(!track||typeof track.id!=='string'||track.id.length>150||!['local','youtube'].includes(track.source))throw Error('Faixa offline inválida');
 if(track.source==='youtube'&&!youtubeID(track))throw Error('ID musical não verificável');
 const str=(s,max)=>String(s||'').slice(0,max);
 return {
  id:track.id,source:track.source,
  videoId:track.source==='youtube'?track.videoId:undefined,
  title:str(track.title,220),artist:str(track.artist,150),
  album:str(track.album,150),artwork:str(track.artwork,800),
  duration:Number.isFinite(Number(track.duration))?Math.max(0,Number(track.duration)):0
 };
}
export function openOfflineDB(idb=globalThis.indexedDB){
 if(!idb)return Promise.reject(Error('IndexedDB indisponível neste navegador'));
 return new Promise((resolve,reject)=>{
  let request;
  try{request=idb.open(OFFLINE_DB_NAME,1)}catch(error){reject(error);return}
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains('audio'))db.createObjectStore('audio',{keyPath:'key'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Falha ao abrir biblioteca offline'));
  request.onblocked=()=>reject(Error('Banco offline bloqueado por outra aba'));
 });
}
const complete=request=>new Promise((resolve,reject)=>{
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error||Error('Falha ao acessar música offline'));
});
export function createOfflineLibrary({indexedDB:factory=globalThis.indexedDB,profile=offlineProfile()}={}){
 const key=id=>profile+':'+id;
 const withStore=async(mode,perform)=>{
  const db=await openOfflineDB(factory);
  try{
   const tx=db.transaction('audio',mode);
   const result=perform(tx.objectStore('audio'));
   const value=await complete(result);
   // Wait for durability before announcing an offline download as complete.
   await new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Armazenamento interrompido'));
    tx.onerror=()=>reject(tx.error||Error('Falha no armazenamento'));
   });
   return value;
  }finally{db.close()}
 };
 return Object.freeze({
  profile,
  async save(track,blob){
   if(!(blob instanceof Blob)||!validAudioFile({size:blob.size,type:blob.type,name:track?.title+'.m4a'}))throw Error('Arquivo de áudio inválido ou maior que 72 MB');
   const clean=cleanOfflineTrack(track);
   const record={key:key(clean.id),profile,track:clean,blob,savedAt:Date.now(),bytes:blob.size};
   await withStore('readwrite',store=>store.put(record));
   return record;
  },
  get(id){return withStore('readonly',store=>store.get(key(id)))},
  async list(){
   const records=await withStore('readonly',store=>store.getAll());
   return records.filter(x=>x.profile===profile&&x.blob instanceof Blob&&x.bytes>0)
    .sort((a,b)=>b.savedAt-a.savedAt);
  },
  remove(id){return withStore('readwrite',store=>store.delete(key(id)))}
 });
}
export async function fetchFullAudio(track,{
 fetcher=globalThis.fetch,signal,onProgress=()=>{},maxBytes=OFFLINE_MAX_BYTES
}={}){
 const url=trackAudioURL(track);
 if(!url)throw Error('Apenas faixas identificadas pelo catálogo podem ser baixadas');
 if(typeof fetcher!=='function')throw Error('Download indisponível');
 const response=await fetcher(url,{method:'GET',mode:'cors',credentials:'omit',signal,cache:'no-store'});
 if(!response.ok||response.status!==200)throw Error('O servidor não forneceu um arquivo completo ('+response.status+')');
 const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!allowedMime.test(type))throw Error('O servidor respondeu sem áudio utilizável');
 const declared=Number(response.headers.get('content-length'))||0;
 if(declared>maxBytes)throw Error('Arquivo acima do limite de 72 MB');
 let chunks=[],size=0;
 if(response.body?.getReader){
  const reader=response.body.getReader();
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();throw Error('Arquivo acima do limite de 72 MB')}
    chunks.push(value);
    onProgress({received:size,total:declared||null});
   }
  }finally{reader.releaseLock()}
 }else{
  const body=await response.blob();
  size=body.size;
  if(size>maxBytes)throw Error('Arquivo acima do limite de 72 MB');
  chunks=[body];
  onProgress({received:size,total:declared||size});
 }
 if(size<1024)throw Error('Resposta de áudio incompleta');
 const blob=new Blob(chunks,{type:type||'audio/mp4'});
 if(!validAudioFile({size:blob.size,type:blob.type,name:track.title+'.m4a'},{maxBytes}))throw Error('Áudio não reconhecido');
 return blob;
}
