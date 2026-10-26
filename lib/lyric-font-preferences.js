/**
 * GNARLY manual karaoke typography preferences: no network or audio changes.
 * Explicit precedence: song override > artist override > global default.
 * No genre/artist inference; only user-selected scopes produce overrides.
 */
import {resolveLyricStyle} from './lyric-style.js';
import {normalized,isGenericArtist} from './metadata-intelligence.js';
const KEY='gnarly.web.lyricFontPrefs.v1',MAX_ITEMS=128;
function trackKey(track){
 if(!track)return '';
 const id=String(track.id||track.videoId||'').trim();
 if(id&&id.length<150&&!/^[^:]+:\/\/.+/.test(id))return id;
 if(track.source==='local'&&track.file?.name)return 'local:'+track.file.name.slice(0,110)+'|'+(Number(track.file.size)||0);
 return '';
}
export function artistKey(track){
 const artist=String(track?.artist||'').trim();
 return artist&&!isGenericArtist(artist)?normalized(artist).slice(0,100):'';
}
const valid=id=>resolveLyricStyle(id).id===id;
function cloneRecord(o){
 if(!o||typeof o!=='object'||Array.isArray(o))return {};
 return Object.fromEntries(Object.entries(o).filter(([key,v])=>key.length<180&&key.length>0&&valid(v)).slice(-MAX_ITEMS));
}
export class LyricFontPreferences{
 constructor(storage){
  this.storage=storage;
  let saved={};
  try{saved=JSON.parse(storage?.getItem(KEY)||'{}')||{}}catch{}
  this.global=valid(saved.global)?saved.global:'original';
  this.songs=cloneRecord(saved.songs);this.artists=cloneRecord(saved.artists);
  this.recents=Array.isArray(saved.recents)?saved.recents.filter(valid).slice(0,6):[];
 }
 save(){
  try{this.storage?.setItem(KEY,JSON.stringify({global:this.global,songs:this.songs,artists:this.artists,recents:this.recents}))}catch{/* private mode */}
 }
 selected(track){
  const song=trackKey(track),artist=artistKey(track);
  if(song&&this.songs[song])return {style:this.songs[song],source:'song'};
  if(artist&&this.artists[artist])return {style:this.artists[artist],source:'artist'};
  return {style:this.global,source:'global'};
 }
 set(style,scope,track){
  const id=resolveLyricStyle(style).id;
  if(scope==='song'&&trackKey(track))this.songs[trackKey(track)]=id;
  else if(scope==='artist'&&artistKey(track))this.artists[artistKey(track)]=id;
  else this.global=id;
  this.recents=[id,...this.recents.filter(x=>x!==id)].slice(0,6);
  if(Object.keys(this.songs).length>MAX_ITEMS)delete this.songs[Object.keys(this.songs)[0]];
  if(Object.keys(this.artists).length>MAX_ITEMS)delete this.artists[Object.keys(this.artists)[0]];
  this.save();return id;
 }
 clear(scope,track){
  if(scope==='song'&&trackKey(track))delete this.songs[trackKey(track)];
  else if(scope==='artist'&&artistKey(track))delete this.artists[artistKey(track)];
  else if(scope==='global')this.global='original';
  this.save();return this.selected(track);
 }
}
