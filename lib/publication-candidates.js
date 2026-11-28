/** Metadata compatibility only: not proof of identical audio or access.
 * Never alias a video ID, fetch audio, or automatically select a candidate.
 */
const key=x=>String(x||'').normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g,' ');
const id=x=>x?.source==='youtube'&&/^[A-Za-z0-9_-]{11}$/.test(x.videoId||'')&&x.id==='youtube:'+x.videoId;
const generic=/^(artista não identificado|unknown artist|youtube music|artista)$/i;
export function publicationCandidates(original,items=[]){
 if(!id(original)||!key(original.title)||!key(original.artist)||generic.test(key(original.artist))||
    !key(original.album)||!(Number(original.duration)>0))return [];
 const seen=new Set([original.videoId]),result=[];
 for(const track of items){
  if(!id(track)||seen.has(track.videoId)||key(track.title)!==key(original.title)||
    key(track.artist)!==key(original.artist)||key(track.album)!==key(original.album)||
    !(Number(track.duration)>0)||Math.abs(Number(track.duration)-Number(original.duration))>2)continue;
  if(original.isrc&&track.isrc&&key(original.isrc)!==key(track.isrc))continue;
  seen.add(track.videoId);result.push(track);
  if(result.length>=5)break;
 }
 return result;
}
export function publicationQuery(track){
 if(!id(track)||!key(track.title)||!key(track.artist)||generic.test(key(track.artist))||!key(track.album)||!(Number(track.duration)>0))return '';
 return [track.artist,track.title,track.album].join(' ').slice(0,140);
}
