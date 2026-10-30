/** Listener intent always beats arbitrary availability. Metadata search and
 * transport feasibility are two separate dimensions, not interchangeable.
 */
export function songSearchKey(value){
 return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
export function songMatchScore(track,query){
 const q=songSearchKey(query);
 if(!q)return 0;
 const title=songSearchKey(track?.title),artist=songSearchKey(track?.artist);
 const combined=(artist+' '+title).trim(),other=(title+' '+artist).trim();
 if(!title&&!artist)return -100;
 if(title===q||combined===q||other===q)return 120;
 if(title.startsWith(q+' ')||title===q)return 110;
 if(combined.includes(q)||other.includes(q))return 100;
 const tokens=q.split(' ').filter(Boolean);
 const hay=' '+combined+' ';
 let hits=0;
 for(const word of tokens){
  if(hay.includes(' '+word+' ')|| (word.length>=4&&hay.includes(word)))hits++;
 }
 if(hits===tokens.length)return 80+Math.min(10,tokens.length);
 if(hits===0)return 0;
 return Math.floor(60*hits/tokens.length);
}
export function matchingIndependentTracks(tracks,query){
 const words=songSearchKey(query).split(' ').filter(Boolean);
 // A single vague search term should never promote unrelated content.
 const minimum=words.length>=2?80:80;
 return (tracks||[]).filter(track=>track?.source==='audius'&&songMatchScore(track,query)>=minimum);
}
export function rankRequestedSongFirst(tracks,query,{offline=()=>false}={}){
 if(!songSearchKey(query))return [...(tracks||[])];
 const priority=track=>track?.id&&offline(track.id)?0:
  track?.playbackAvailability==='r2'?1:track?.source==='audius'?2:
  track?.source==='youtube'?3:4;
 return (tracks||[]).map((track,index)=>({track,index,score:songMatchScore(track,query)}))
  .sort((a,b)=>b.score-a.score||(
    // Availability breaks ties only for the EXACT same identified recording;
    // never put a different song first just because it can stream.
    songSearchKey(a.track?.title)===songSearchKey(b.track?.title)&&
    songSearchKey(a.track?.artist)===songSearchKey(b.track?.artist)&&
    (Number(a.track?.duration)<=0||Number(b.track?.duration)<=0||
     Math.abs(Number(a.track.duration)-Number(b.track.duration))<=2)
     ?priority(a.track)-priority(b.track):0
   )||a.index-b.index)
  .map(x=>x.track);
}
