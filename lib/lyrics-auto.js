import {parseLRC} from './lrc.js';
export function cleanTitle(s){return String(s||'').replace(/\s*\((?:official video|official audio|visualizer|lyric video|lyrics|remastered)\)/gi,'').trim()}
export function normalizeIdentity(s){return cleanTitle(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function selectBestMatch(items,track){const n=normalizeIdentity(track.title),a=normalizeIdentity(track.artist);return (items||[]).find(x=>x.syncedLyrics&&!x.instrumental&&normalizeIdentity(x.trackName)===n&&normalizeIdentity(x.artistName)===a)||null}
export async function autoLyrics(track,{signal}={}){
 if(!track?.title||!track?.artist||track.artist==='Arquivo local')return {lines:[],status:'Use arquivo no formato Artista - Música.mp3 ou importe .lrc'};
 const req=new URL('https://lrclib.net/api/get');
 req.searchParams.set('track_name',cleanTitle(track.title));req.searchParams.set('artist_name',track.artist);
 if(track.album&&track.album!=='Biblioteca local')req.searchParams.set('album_name',track.album);
 if(track.duration>60&&track.duration<=3600)req.searchParams.set('duration',String(Math.round(track.duration)));
 const read=async url=>{const r=await fetch(url,{signal,headers:{Accept:'application/json'}});return r.ok?r.json():null};
 try{let result=await read(req);if(!result?.syncedLyrics){const search=new URL('https://lrclib.net/api/search');search.searchParams.set('track_name',cleanTitle(track.title));search.searchParams.set('artist_name',track.artist);result=selectBestMatch(await read(search),track)}
  const lines=result?.syncedLyrics?parseLRC(result.syncedLyrics):[];return {lines,status:lines.length?'Letra sincronizada automaticamente · LRCLIB':'Letra sincronizada não encontrada'};}
 catch(e){return {lines:[],status:signal?.aborted?'Busca cancelada':'Letras indisponíveis agora · importe .lrc'};}
}
