/** Responsive GNARLY search. Search stays text-relevant; personal preference
 * only reorders matching tracks and may seed instant local suggestions.
 * Nothing leaves the device except the typed query sent to music catalogues.
 */
import {normalKey,coverage,frecency} from './omnibox.js';

const identity=item=>normalKey((item?.artist||'')+' '+(item?.title||''))||String(item?.id||'');
const valid=item=>!!item?.id&&!!item.title;
const textScore=(query,item)=>{
 const term=normalKey(query),title=normalKey(item.title),artist=normalKey(item.artist),album=normalKey(item.album);
 if(!term)return 0;
 if(title===term)return 135;
 if(title.startsWith(term))return 100;
 if(artist===term)return 94;
 if(title.split(' ').some(t=>t.startsWith(term)))return 84;
 if(artist.startsWith(term))return 78;
 if((artist+' '+title+' '+album).includes(term))return 72;
 return Math.round(coverage(term,item)*62);
};
export function searchTasteScore(item,{favorites=[],history=[],queue=[],memory=null}={}){
 const key=identity(item),isSame=x=>x?.id===item.id||identity(x)===key;
 let score=0;
 if(favorites.some(isSame))score+=24;
 const played=history.find(isSame);
 if(played)score+=12+Math.min(6,Math.log1p(played.plays||1)*2)+frecency(played)*3;
 if(queue.some(isSame))score+=3;
 const profile=memory?.profile?.();
 if(profile){
  const artist=normalKey(item.artist),album=normalKey(item.album);
  score+=Math.min(7,Math.max(-4,(profile.artists.get(artist)||0)*.32));
  score+=Math.min(3,Math.max(-2,(profile.albums.get(artist+'|'+album)||0)*.16));
 }
 return score;
}
/** Remote results are still remote results: history cannot invent matches. */
export function personalizedRank(query,remote=[],options={}){
 const unique=new Map();
 for(let i=0;i<remote.length;i++){
  const item=remote[i];
  if(!valid(item))continue;
  const text=textScore(query,item);
  const score=text+Math.min(20,searchTasteScore(item,options))+(options.originLimited?(item.source==='audius'?5:item.source==='youtube'?-4:0):(item.source==='youtube'?1.5:0))-i*.002;
  const key=identity(item)+(item.source==='audius'?'|audius':'|catalog');
  if(!unique.has(key)||unique.get(key).score<score)unique.set(key,{item,score,index:i});
 }
 return [...unique.values()].sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.item);
}
/** Immediate matching suggestions even for a single character. */
export function instantSearch(query,{favorites=[],history=[],queue=[],playlists=[],offline=[],cached=[],memory=null,max=16}={}){
 const term=normalKey(query);
 if(!term)return [];
 const unique=new Map();
 const buckets=[favorites,history,offline,playlists,queue,cached];
 for(let b=0;b<buckets.length;b++){
  for(const item of buckets[b]||[]){
   if(!valid(item)||!textScore(term,item)||coverage(term,item)<=0)continue;
   // Favorites > previously played > saved offline > playlist > queue > cache,
   // while an exact song title is still more relevant than a weak title match.
   const preference=[28,19,14,10,5,0][b];
   const key=identity(item)+(item.source==='audius'?'|audius':'|catalog');
   const score=textScore(term,item)+preference+Math.min(12,searchTasteScore(item,{favorites,history,queue,memory}))*.7;
   if(!unique.has(key)||unique.get(key).score<score)unique.set(key,{item,score});
  }
 }
 return [...unique.values()].sort((a,b)=>b.score-a.score).slice(0,max).map(x=>x.item);
}
