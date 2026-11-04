/** Device-local query repair from real, previously observed metadata.
 * This is a search spelling hint, NOT a song identity or audio substitute.
 * Never send private listening-history events: only the corrected public
 * artist/title words are used for a single conditional catalogue lookup.
 */
import {normalKey} from './omnibox.js';

const tokenize=value=>normalKey(value).split(' ').filter(Boolean).slice(0,14);

function distanceWithin(a,b,limit){
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const row=[i];let lowest=i;
  for(let j=1;j<=b.length;j++){
   row[j]=Math.min(row[j-1]+1,previous[j]+1,
    previous[j-1]+(a[i-1]===b[j-1]?0:1));
   lowest=Math.min(lowest,row[j]);
  }
  if(lowest>limit)return limit+1;
  previous=row;
 }
 return previous[b.length];
}
function wordMatch(typed,actual){
 if(typed===actual)return {strength:1,typo:false};
 // A legitimate unfinished prefix is not a misspelling.
 if(typed.length>=3&&actual.startsWith(typed))
  return {strength:.93,typo:false};
 if(typed.length<5||actual.length<4)return null;
 const allowance=typed.length>=8?2:1;
 const distance=distanceWithin(typed,actual,allowance);
 if(distance>allowance)return null;
 return {strength:distance===1?.86:.74,typo:true};
}
function phraseMatch(typed,phrase){
 const words=tokenize(phrase);
 if(!words.length||words.length>14)return null;
 const used=new Set();
 let score=0,changes=0;
 for(const word of typed){
  let best=null;
  for(let i=0;i<words.length;i++){
   if(used.has(i))continue;
   const match=wordMatch(word,words[i]);
   if(match&&(!best||match.strength>best.strength))
    best={...match,index:i};
  }
  if(!best)return null;
  used.add(best.index);score+=best.strength;
  if(best.typo)changes++;
 }
 if(!changes)return null;
 const average=score/typed.length;
 if(average<.78)return null;
 // Avoid turning a short one-word query into an unrelated long title.
 const surplus=words.length-typed.length;
 if(typed.length===1&&(typed[0].length<6||surplus>1))return null;
 if(surplus>Math.max(4,typed.length))return null;
 return average-.018*surplus;
}
export function suggestedKnownQuery(query,tracks=[]){
 const input=tokenize(query);
 if(!input.length||input.length>8||normalKey(query).length>100)return null;
 const candidates=new Map();
 for(const track of tracks.slice(0,200)){
  if(!track?.title||!track?.artist)continue;
  const artist=String(track.artist).trim().slice(0,90);
  const title=String(track.title).trim().slice(0,120);
  if(!artist||!title||/^(artista nao identificado|unknown artist|youtube music|apple music)$/i.test(normalKey(artist)))continue;
  for(const phrase of [artist,title,artist+' '+title,title+' '+artist]){
   const key=normalKey(phrase);
   if(!key||key===normalKey(query)||candidates.has(key))continue;
   const strength=phraseMatch(input,phrase);
   if(strength!==null)candidates.set(key,{query:phrase,strength,key});
  }
 }
 const sorted=[...candidates.values()].sort((a,b)=>b.strength-a.strength||a.query.length-b.query.length);
 if(!sorted.length)return null;
 // Ambiguous correction should not initiate another remote catalogue query.
 if(sorted.length>1&&sorted[0].key!==sorted[1].key&&
   sorted[0].strength-sorted[1].strength<.012)return null;
 return sorted[0].query;
}
