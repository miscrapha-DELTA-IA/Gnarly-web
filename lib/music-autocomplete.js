/** Search suggestions are *queries*, never playable tracks.
 * Public catalogue suggestions are optional and cacheable, while favorites
 * and prior searches stay on the listener's device.
 */
import {normalKey} from './omnibox.js';

const localCache=new Map();
let suggestBlockedUntil=0;
const words=s=>normalKey(s).split(' ').filter(Boolean).slice(0,9);
function editDistance(a,b){
 if(a===b)return 0;
 if(a.length>32||b.length>32)return 10;
 let prev=Array.from({length:b.length+1},(_,i)=>i),prevPrev=null;
 for(let i=1;i<=a.length;i++){
  const row=[i];
  for(let j=1;j<=b.length;j++){
   let cost=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]!==b[j-1]));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])
    cost=Math.min(cost,prevPrev[j-2]+1);
   row[j]=cost;
  }
  prevPrev=prev;prev=row;
 }
 return prev[b.length];
}
export function credibleCorrection(query,suggestions=[]){
 const typed=words(query);
 if(!typed.length||typed.length>7)return null;
 let corrected=[];
 for(const phrase of suggestions.slice(0,12)){
  if(typeof phrase!=='string')continue;
  const suggestion=words(phrase);
  // Text completion is offered as a button but never silently changes intent.
  if(suggestion.length!==typed.length)continue;
  let changed=0,total=0,valid=true;
  for(let i=0;i<typed.length;i++){
   const a=typed[i],b=suggestion[i];
   if(a===b)continue;
   if(a.length<4||b.length<4){valid=false;break}
   const edit=editDistance(a,b),max=Math.min(a.length,b.length)>=8?2:1;
   if(edit>max){valid=false;break}
   total+=edit;changed++;
  }
  if(valid&&changed>0&&changed<=2&&total<=2)
   corrected.push({phrase,score:total*4+changed});
 }
 corrected.sort((a,b)=>a.score-b.score||a.phrase.length-b.phrase.length);
 if(!corrected.length)return null;
 if(corrected.length>1&&corrected[1].score===corrected[0].score&&
    normalKey(corrected[1].phrase)!==normalKey(corrected[0].phrase))return null;
 return corrected[0].phrase;
}
const sane=x=>typeof x==='string'&&x.length>1&&x.length<=90&&
 !/[<>\u0000-\u001f]/.test(x);
export function mergeSearchSuggestions(query,{recent=[],local=[],remote=[],max=8}={}){
 const key=normalKey(query),out=[],seen=new Set();
 const groups=key?[recent.slice(0,3),local.slice(0,3),remote]:[recent.slice(0,8)];
 for(const group of groups)for(const raw of group){
  const label=String(raw||'').trim(),normalized=normalKey(label);
  if(!sane(label)||!normalized||normalized===key||seen.has(normalized))continue;
  if(key){
   const begins=normalized.startsWith(key),contains=(' '+normalized).includes(' '+key);
   const similar=credibleCorrection(key,[label])!==null;
   if(!begins&&!contains&&!similar)continue;
  }
  seen.add(normalized);
  out.push(label);
  if(out.length>=max)return out;
 }
 return out;
}
export function localMusicSuggestions(query,{favorites=[],history=[],playlists=[],recent=[],max=6}={}){
 const candidates=recent.slice(0,8);
 for(const item of [...favorites,...history,...playlists].slice(0,160)){
  if(!item?.title)continue;
  const artist=String(item.artist||'').trim(),title=String(item.title||'').trim();
  if(title)candidates.push(title);
  if(artist&&!/^(artista nao identificado|unknown artist|youtube music|apple music)$/i.test(normalKey(artist))){
   candidates.push(artist);
   if(normalKey(query).split(' ').filter(Boolean).length>=2)
    candidates.push(artist+' '+title);
  }
 }
 return mergeSearchSuggestions(query,{local:candidates,recent,max});
}
export async function fetchMusicSuggestions(query,{fetcher=globalThis.fetch,signal,now=Date.now}={}){
 const q=String(query||'').trim().slice(0,80),key=normalKey(q),at=now();
 if(key.length<3||signal?.aborted||typeof fetcher!=='function')return [];
 const hit=localCache.get(key);
 if(hit&&hit.until>at)return hit.values.slice();
 if(at<suggestBlockedUntil)return [];
 const ctrl=new AbortController();
 const cancel=()=>ctrl.abort();
 signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted)cancel();
 const timer=setTimeout(cancel,4100);
 try{
  const response=await fetcher('/api/suggest?q='+encodeURIComponent(q),{
   method:'GET',credentials:'omit',signal:ctrl.signal,headers:{accept:'application/json'}
  });
  if(!response.ok){
   if(response.status===429||response.status>=500)
    suggestBlockedUntil=Math.max(suggestBlockedUntil,now()+12000);
   return [];
  }
  const payload=await response.json();
  const values=Array.isArray(payload?.suggestions)?
   payload.suggestions.filter(sane).slice(0,8):[];
  if(localCache.size>=80)localCache.delete(localCache.keys().next().value);
  localCache.set(key,{values,until:now()+300000});
  return values.slice();
 }catch(error){
  if(signal?.aborted)return [];
  return [];
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',cancel);
 }
}
