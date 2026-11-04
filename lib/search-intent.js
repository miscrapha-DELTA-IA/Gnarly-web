/** Typo-tolerant music-catalogue retrieval, NOT playback identity.
 * Bounded token edits help match misspelled songs and artists without
 * treating unrelated videos as equivalent audio or bypassing provider limits.
 */
import {normalKey} from './omnibox.js';

function editDistanceWithin(a,b,limit){
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const next=[i];let rowMin=next[0];
  for(let j=1;j<=b.length;j++){
   next[j]=Math.min(next[j-1]+1,previous[j]+1,
    previous[j-1]+(a[i-1]===b[j-1]?0:1));
   rowMin=Math.min(rowMin,next[j]);
  }
  if(rowMin>limit)return limit+1;
  previous=next;
 }
 return previous[b.length];
}
function matchedToken(word,candidate){
 if(word===candidate)return 1;
 if(word.length>=3&&candidate.startsWith(word))return .96;
 // Short abbreviations are dangerous: "fn" must not match "fun".
 if(word.length<5||candidate.length<4)return 0;
 const allowance=word.length>=8?2:1;
 if(Math.abs(word.length-candidate.length)>allowance)return 0;
 return editDistanceWithin(word,candidate,allowance)<=allowance?.86:0;
}
export function fuzzySongMatchScore(track,query){
 const words=normalKey(query).split(' ').filter(Boolean).slice(0,12);
 if(!words.length||words.length>8)return 0;
 const title=normalKey(track?.title),artist=normalKey(track?.artist);
 if(!title&&!artist)return 0;
 const tokens=(title+' '+artist).split(' ').filter(Boolean).slice(0,28);
 const titleTokens=title.split(' ').filter(Boolean);
 let strength=0,matched=0,typos=0,titleHits=0;
 for(const word of words){
  let best=0,bestTitle=false;
  for(const token of tokens){
   const score=matchedToken(word,token);
   if(score>best){best=score;bestTitle=titleTokens.includes(token)}
   if(best===1)break;
  }
  if(best){strength+=best;matched++;if(best<.9)typos++;if(bestTitle)titleHits++}
 }
 if(matched!==words.length||strength/words.length<.83)return 0;
 // Pure typo matches cannot outrank authoritative exact title matches.
 return Math.min(92,Math.round(79+10*strength/words.length+
  (titleHits===words.length?2:0)-Math.min(5,typos*2)));
}
