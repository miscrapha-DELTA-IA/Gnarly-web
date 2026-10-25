// Port of the Stage 72 OmniboxEngine contracts: direct-link intent, local instant
// history, token coverage, frecency, dedupe, cache with stale fallback.
const videoRE=/^[a-zA-Z0-9_-]{11}$/;
export function classifyIntent(input){
 const text=String(input??'').trim();if(!text)return {kind:'empty'};
 try{const u=new URL(text);const host=u.hostname.toLowerCase();if(host==='youtu.be'||host==='www.youtube.com'||host==='youtube.com'||host==='m.youtube.com'||host==='music.youtube.com'){const id=host==='youtu.be'?u.pathname.slice(1).split('/')[0]:u.searchParams.get('v');if(videoRE.test(id||''))return {kind:'direct',videoId:id}}}catch{}
 if(videoRE.test(text)&&(/[0-9_-]/.test(text)||(/[A-Z]/.test(text)&&/[a-z]/.test(text))))return {kind:'direct',videoId:text};
 return {kind:'text',query:text};
}
export function normalKey(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
export function coverage(term,item){const terms=normalKey(term).split(' ').filter(Boolean),keys=normalKey(item.artist+' '+item.title).split(' ');return terms.length?terms.filter(q=>keys.some(t=>t.startsWith(q))).length/terms.length:0}
export function frecency(entry,now=Date.now()){if(!entry)return 0;const days=Math.max(0,(now-(entry.lastPlayed||now))/86400000);return .6*Math.min(1,Math.log1p(entry.plays||0)/Math.log1p(20))+.4*Math.exp(-days/21)}
export function rank(query,remote=[],history=[],now=Date.now()){
 const wantsLong=/\b(mix|live|hour|set)\b/.test(normalKey(query));const ids=new Set(remote.map(x=>x.id));
 const all=[...remote,...history.filter(x=>!ids.has(x.id)&&coverage(query,x)>.99)];const winner=new Map();
 for(let i=0;i<all.length;i++){const item=all[i];if(!item?.id||!item.title)continue;const hit=Math.max(coverage(query,item), normalKey(item.title).includes(normalKey(query))?.85:0);const prior=1/(1+.35*i);const fav=history.find(x=>x.id===item.id);const d=Number(item.duration);const penalty=!wantsLong&&d>0&&(d<45||d>720)?.25:0;const score=.53*hit+.30*prior+.15*frecency(fav,now)+(item.source==='youtube'?.05:0)-penalty;const key=normalKey(item.artist+' '+item.title)||item.id;const prev=winner.get(key);if(!prev||score>prev.score)winner.set(key,{item,score});}
 return [...winner.values()].sort((a,b)=>b.score-a.score).slice(0,12).map(x=>x.item)
}
export function localMatches(term,history=[]){return history.filter(x=>coverage(term,x)>.99).sort((a,b)=>frecency(b)-frecency(a)).slice(0,4)}
export class OmniboxSession{
 constructor(storage=null){this.storage=storage;this.cache=new Map();this.history=this.read('history',[]);this.query=this.read('query','');this.epoch=0;}
 read(key,fallback){try{return JSON.parse(this.storage?.getItem('gnarly.omnibox.'+key))??fallback}catch{return fallback}}
 save(key,value){try{this.storage?.setItem('gnarly.omnibox.'+key,JSON.stringify(value))}catch{}}
 setQuery(query){this.query=query;this.save('query',query);this.epoch++;return localMatches(query,this.history)}
 record(track){if(!track||track.source==='local')return;const old=this.history.find(x=>x.id===track.id);this.history=[{...track,plays:(old?.plays||0)+1,lastPlayed:Date.now()},...this.history.filter(x=>x.id!==track.id)].slice(0,65);this.save('history',this.history)}
 fromCache(query,now=Date.now()){const x=this.cache.get(normalKey(query));if(!x||now-x.savedAt>86400000)return null;return {results:x.results,stale:now-x.savedAt>300000}}
 cacheResults(query,results){this.cache.set(normalKey(query),{savedAt:Date.now(),results});if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value)}
}
