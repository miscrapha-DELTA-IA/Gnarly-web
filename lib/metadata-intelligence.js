/**
 * GNARLY Metadata Intelligence.
 * Metadata ONLY: never change a song's source, videoId, URL, playable mode,
 * audio duration, queue identity or encoded media.
 */
const GENERIC=/^(?:(?:the\s+)?youtube(?:\s+music)?|yt\s*music|various\s+artists?|unknown(?:\s+artist)?|artista(?:\s+nao\s+identificado)?|arquivo\s+local|official(?:\s+audio)?|topic|music|audio|artist|no\s+artist|auto[\s-]?generated)$/i;
const VERSION=/\b(remix|remaster(?:ed)?|live|acoustic|instrumental|karaoke|nightcore|slowed|sped[\s-]?up|cover|demo|edit|radio\s+edit|extended|reprise|version|mix)\b/gi;
const DECORATION=/\s*(?:[\[(]\s*(?:official\s+(?:(?:music\s+)?video|audio|lyric\s+video|visuali[sz]er)|lyrics?|audio\s+only|4k|hd)\s*[\])]|[|]\s*(?:official\s+video|lyrics?|audio))\s*$/i;
const safe=(x,n=180)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
export function normalized(text){
 return safe(text,250).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en-US')
   .replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function isGenericArtist(text){
 const key=normalized(text);return !key||GENERIC.test(key)||/^youtube(?:\s.*)?$/.test(key)
   ||/^.+\s+topic$/.test(key)||key==='artista nao identificado';
}
/**
 * Display a real credited performer or an explicit unknown. Provider/channel
 * names are never performers. This also handles legacy persisted records.
 */
export function displayArtist(track){
 const artist=String(track?.artist??'').trim();
 return isGenericArtist(artist)?'Artista não identificado':artist;
}
function canonicalVideoId(track){
 if(track?.source!=='youtube')return null;
 const id=String(track.videoId||String(track.id||'').replace(/^youtube:/,''));
 return /^[a-zA-Z0-9_-]{11}$/.test(id)?id:null;
}
/**
 * Backfill credits in old history, favorites, current track and queue using
 * ONLY the *same* native YouTube Music video ID. Do not borrow a different
 * recording just because its title is similar; transport never changes.
 */
export function reconcileCatalogCredits(songs,collections=[]){
 const verified=new Map();
 for(const item of songs||[]){
  const id=canonicalVideoId(item);
  if(id&&!isGenericArtist(item.artist))verified.set(id,String(item.artist).trim());
 }
 let changed=0;
 for(const collection of collections){
  if(!Array.isArray(collection))continue;
  for(const track of collection){
   const id=canonicalVideoId(track),artist=id&&verified.get(id);
   if(!artist||!isGenericArtist(track.artist)||track.artist===artist)continue;
   track.artist=artist;
   changed++;
  }
 }
 return changed;
}
export function cleanTitle(raw){
 let title=safe(raw);for(let n=0;n<3;n++){const next=title.replace(DECORATION,'').trim();if(next===title)break;title=next}
 return title||safe(raw);
}
export function inferredCredit(rawTitle,artist){
 const title=cleanTitle(rawTitle),incoming=safe(artist);
 if(!isGenericArtist(incoming))return {title,artist:incoming,inferred:false};
 const parts=title.match(/^(.{2,75}?)\s+[-–—]\s+(.{2,150})$/);
 if(parts&&parts[1].split(/\s+/).length<=7&&!isGenericArtist(parts[1])&&!/^(official|full|album|lyrics?|hd|mix|music|track|song|video)\b/i.test(parts[1])){
  return {title:cleanTitle(parts[2]),artist:safe(parts[1]),inferred:true};
 }
 return {title,artist:'',inferred:false};
}
const versions=s=>[...new Set((normalized(s).match(VERSION)||[]).map(x=>x.replace(/\s+/g,' ')))].sort();
function sameVersion(a,b){
 const av=versions(a),bv=versions(b);
 return av.length===bv.length&&av.every((x,i)=>x===bv[i]);
}
function titlesMatch(a,b){
 const x=normalized(cleanTitle(a)),y=normalized(cleanTitle(b));
 if(!x||!y)return false;
 if(x===y)return sameVersion(a,b);
 // Keep release/version distinctions strict; only allow decoration/mismatched punctuation.
 return false;
}
function durationsAgree(a,b){
 const x=Number(a),y=Number(b);
 if(!(x>0)||!(y>0))return null;
 return Math.abs(x-y)<=Math.min(8,Math.max(3,Math.round(x*.024)));
}
const goodArtwork=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1'].includes(u.hostname)&&u.hostname.length<150?u.href:''}catch{return ''}};
function candidateScore(query,entry){
 const desired=inferredCredit(query.title,query.artist);
 if(!titlesMatch(desired.title,entry.title))return -1;
 const knownArtist=!isGenericArtist(desired.artist);
 if(knownArtist&&normalized(desired.artist)!==normalized(entry.artist))return -1;
 const durationOk=durationsAgree(query.duration,entry.duration);
 if(durationOk===false)return -1;
 if(!knownArtist&&durationOk!==true)return -1; // No blind title-only artist guessing.
 let score=70+(knownArtist?16:0)+(durationOk===true?18:0);
 if(!knownArtist&&normalized(desired.title).split(' ').length<2)score-=8;
 return score;
}
function choose(query,entries){
 const ranked=entries.map(x=>({entry:x,score:candidateScore(query,x)})).filter(x=>x.score>=84)
  .sort((a,b)=>b.score-a.score);
 if(!ranked.length)return null;
 const best=ranked[0];
 const competitor=ranked.slice(1).find(x=>normalized(x.entry.artist)!==normalized(best.entry.artist)
     || normalized(x.entry.title)!==normalized(best.entry.title));
 if(competitor&&best.score-competitor.score<14)return null;
 return {entry:best.entry,score:best.score};
}
export function matchApple(query,items=[]){
 const entries=items.filter(x=>x&&x.wrapperType==='track'&&x.trackName&&x.artistName).map(x=>({
  title:safe(x.trackName),artist:safe(x.artistName),album:safe(x.collectionName),
  duration:Number(x.trackTimeMillis)/1000||0,artwork:goodArtwork(String(x.artworkUrl100||'').replace(/100x100bb/gi,'1200x1200bb')),
  releaseDate:safe(x.releaseDate,24).slice(0,10),
  id:Number.isSafeInteger(x.trackId)?String(x.trackId):''
 }));
 const winner=choose(query,entries);
 return winner?{title:winner.entry.title,artist:winner.entry.artist,album:winner.entry.album,
  artwork:winner.entry.artwork,releaseDate:winner.entry.releaseDate,source:'itunes',duration:winner.entry.duration,
  confidence:winner.score,identifiers:winner.entry.id?{itunesTrackId:winner.entry.id}:{}}:null;
}
function artistCredit(recording){
 const credits=recording['artist-credit']||[];
 return safe(credits.map(p=>typeof p==='string'?p:p?.name||p?.artist?.name||'').join(''));
}
export function matchMusicBrainz(query,recordings=[]){
 const entries=recordings.filter(x=>x&&x.id&&x.title).map(recording=>{
  const releases=Array.isArray(recording.releases)?recording.releases:[];
  const official=releases.find(x=>x.status==='Official')||releases[0];
  return {title:safe(recording.title),artist:artistCredit(recording),duration:Number(recording.length)/1000||0,
   album:safe(official?.title),releaseDate:safe(official?.date,24),artwork:'',
   mbid:safe(recording.id,40),releaseId:safe(official?.id,40)};
 });
 const winner=choose(query,entries);
 if(!winner)return null;
 const x=winner.entry;return {title:x.title,artist:x.artist,album:x.album,
  artwork:'',releaseDate:x.releaseDate,source:'musicbrainz',duration:x.duration,confidence:winner.score,
  identifiers:{recordingMBID:x.mbid,releaseMBID:x.releaseId}};
}
export function applyMetadata(track,metadata){
 if(!track||!metadata||metadata.confidence<84||isGenericArtist(metadata.artist))return false;
 const wanted=inferredCredit(track.title,track.artist);
 // Trust only strict matches and never rewrite identifiable credited artists.
 if(!titlesMatch(wanted.title,metadata.title))return false;
 if(!isGenericArtist(wanted.artist)&&normalized(wanted.artist)!==normalized(metadata.artist))return false;
 if(durationsAgree(track.duration,metadata.duration)===false)return false;
 const mutable=['title','artist','album','artwork'];
 let touched=false;
 const title=cleanTitle(metadata.title);
 if(isGenericArtist(track.artist)||wanted.inferred){
  if(track.artist!==metadata.artist){track.artist=safe(metadata.artist);touched=true}
 }
 if((isGenericArtist(track.artist)||wanted.inferred)&&title&&track.title!==title){track.title=title;touched=true}
 // Album/artwork may be blank on YouTube, but don't destroy higher quality existing data.
 if(metadata.album&&(!track.album||track.album==='GNARLY WEB'||track.album==='Biblioteca local')){
  track.album=safe(metadata.album);touched=true;
 }
 if(metadata.artwork&&goodArtwork(metadata.artwork)&&(!track.artwork||track.artwork.includes('i.ytimg.com')||track.artwork.includes('/assets/gnarly-icon'))){
  track.artwork=goodArtwork(metadata.artwork);touched=true;
 }
 const identifiers=metadata.identifiers||{};
 if(Object.keys(identifiers).length){
  track.metadataIds={...(track.metadataIds||{}),...identifiers};touched=true;
 }
 if(touched){track.metadataSource=metadata.source;track.metadataConfidence=metadata.confidence}
 return touched;
}

/** Batch search-time enrichment uses an existing Apple metadata response only:
 * never performs N additional requests for N Omnibox search results. */
export function enrichSearchCredits(songs,previews){
 const candidates=previews.filter(x=>x.source==='preview').map(x=>({
  wrapperType:'track',trackName:x.title,artistName:x.artist,collectionName:x.album,
  trackTimeMillis:Math.round(Number(x.duration||0)*1000),artworkUrl100:x.artwork,
  trackId:Number(String(x.id||'').replace('itunes:',''))
 }));
 for(const song of songs){
  if(song?.source!=='youtube')continue;
  const metadata=matchApple(song,candidates);
  if(metadata)applyMetadata(song,metadata);
 }
 return songs;
}
