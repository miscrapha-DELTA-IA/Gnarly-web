import {isGenericArtist,normalized} from './metadata-intelligence.js';

export const SMART_MODES=['off','artist','album','mix','playlist'];
export const SMART_LABELS={off:'Manual',artist:'Artista',album:'Álbum',mix:'Mix',playlist:'Playlist'};
const key=t=>typeof t?.id==='string'&&t.id?t.id:'';
const safeText=(v,n=150)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const readable=t=>!!key(t)&&!!safeText(t.title);
export function appendUnique(queue,candidates,currentId='',limit=80){
 const next=Array.isArray(queue)?queue.slice(0,limit):[],seen=new Set(next.map(key));
 if(currentId)seen.add(currentId);
 for(const item of candidates||[]){
  if(!readable(item)||seen.has(key(item))||next.length>=limit)continue;
  seen.add(item.id);next.push(item);
 }
 return next;
}
export function commitPlaying(queue,id){
 if(!Array.isArray(queue)||!id)return Array.isArray(queue)?[...queue]:[];
 const i=queue.findIndex(t=>key(t)===id);
 if(i<0)return [...queue];
 const result=queue.slice();result.splice(i,1);return result;
}
export function moveTrack(queue,id,step){
 const next=Array.isArray(queue)?queue.slice():[],i=next.findIndex(x=>key(x)===id),j=i+step;
 if(i<0||j<0||j>=next.length||Math.abs(step)!==1)return next;
 [next[i],next[j]]=[next[j],next[i]];return next;
}
export function removeTrack(queue,id){return (queue||[]).filter(x=>key(x)!==id)}
export function effectiveMode(value){return SMART_MODES.includes(value)?value:'off'}
export function radioQuery(mode,anchor){
 const artist=!isGenericArtist(anchor?.artist)?safeText(anchor.artist,100):'';
 if(!artist)return '';
 if(mode==='artist'||mode==='mix')return artist;
 if(mode==='album'&&safeText(anchor.album)&&!/^gnarly|biblioteca local$/i.test(anchor.album))
  return artist+' '+safeText(anchor.album,100);
 return '';
}
// Only source='youtube' is eligible for automatically discovered complete songs.
// Local and preview tracks may be queued *manually* or from a saved playlist.
export function chooseSmartTracks({mode,anchor,candidates=[],existing=[],recent=[],max=7}={}){
 mode=effectiveMode(mode);if(!anchor||mode==='off'||mode==='playlist')return [];
 const artist=normalized(anchor.artist),album=normalized(anchor.album);
 if(!artist||isGenericArtist(anchor.artist))return [];
 const seen=new Set([key(anchor),...existing.map(key),...recent.slice(0,3).map(key)]);
 const chosen=[],unique=new Set();
 for(const t of candidates){
  if(!readable(t)||t.source!=='youtube'||!t.videoId||seen.has(t.id)||unique.has(t.id))continue;
  if(isGenericArtist(t.artist))continue;
  const artistMatch=normalized(t.artist)===artist,albumMatch=album&&normalized(t.album)===album;
  if(mode==='artist'&&!artistMatch)continue;
  if(mode==='album'&&!(artistMatch&&albumMatch))continue;
  if(mode==='mix'&&!artistMatch&&!albumMatch)continue;
  unique.add(t.id);
  const recency=recent.some(r=>r.id===t.id)?-4:0;
  const score=(artistMatch?8:0)+(albumMatch?5:0)+(mode==='mix'&&t.id!==anchor.id?1:0)+recency;
  chosen.push({t,score});
 }
 chosen.sort((a,b)=>b.score-a.score);
 // Mix rotates between albums rather than always choosing consecutive songs
 // from the same recording or album. Stable ordering avoids UI jitter.
 if(mode==='mix'){
  const mixed=[],remaining=chosen.map(x=>x.t),lastAlbum=normalized(anchor.album);
  let previous=lastAlbum;
  while(remaining.length&&mixed.length<max){
   const ix=remaining.findIndex(t=>normalized(t.album)!==previous);
   const [next]=remaining.splice(ix<0?0:ix,1);mixed.push(next);previous=normalized(next.album);
  }
  return mixed;
 }
 return chosen.slice(0,max).map(x=>x.t);
}
const snapshot=t=>{
 if(!readable(t)||!['youtube','preview'].includes(t.source))return null;
 if(t.source==='youtube'&&!/^[A-Za-z0-9_-]{11}$/.test(t.videoId||''))return null;
 if(t.source==='preview'&&!/^https:\/\//.test(t.url||''))return null;
 return {id:safeText(t.id,110),videoId:safeText(t.videoId,11),source:t.source,
 title:safeText(t.title),artist:safeText(t.artist,110),
 album:safeText(t.album,130),artwork:safeText(t.artwork,550),
 duration:Number.isFinite(Number(t.duration))?Number(t.duration):0,
 ...(t.source==='preview'?{url:safeText(t.url,550)}:{})};
};
export class PlaylistLibrary{
 constructor(storage){this.storage=storage;let saved={};try{saved=JSON.parse(storage?.getItem('gnarly.web.playlists.v1')||'{}')||{}}catch{}
 this.items={};for(const [name,tracks] of Object.entries(saved).slice(0,12)){
  const validName=safeText(name,45);if(validName&&!['__proto__','constructor','prototype'].includes(validName)&&Array.isArray(tracks))
   this.items[validName]=appendUnique([],tracks.map(snapshot).filter(Boolean),'',80);
 }
 if(!this.items['Meu Mix'])this.items['Meu Mix']=[];
 }
 names(){return Object.keys(this.items)}
 tracks(name){return (this.items[name]||[]).map(t=>({...t}))}
 persist(){try{this.storage?.setItem('gnarly.web.playlists.v1',JSON.stringify(this.items))}catch{}}
 create(raw){
  const name=safeText(raw,45);if(!name||['__proto__','constructor','prototype'].includes(name)||this.items[name]||this.names().length>=12)return false;
  this.items[name]=[];this.persist();return true;
 }
 add(name,track){if(!this.items[name])return false;const item=snapshot(track);if(!item)return false;const before=this.items[name].length;this.items[name]=appendUnique(this.items[name],[item]);if(this.items[name].length===before)return false;this.persist();return true}
 remove(name,id){if(!this.items[name])return false;const count=this.items[name].length;this.items[name]=removeTrack(this.items[name],id);if(count===this.items[name].length)return false;this.persist();return true}
 delete(name){if(name==='Meu Mix'||!Object.hasOwn(this.items,name))return false;delete this.items[name];this.persist();return true}
}
/** Cold start hedge: a small health check, once, from a real user intent.
 * Does NOT touch /download, cache media bytes, create extraction or block Play.
 */
export class AudioConnectionWarmup{
 constructor(fetcher){this.fetcher=fetcher;this.started=false}
 start(){
  if(this.started)return;
  this.started=true;
  try{
   const request=this.fetcher('https://nightcorelab.onrender.com/health',{method:'GET',mode:'no-cors',cache:'no-store'});
   Promise.resolve(request).catch(()=>{});
  }catch{}
 }
}
