export function parseLRC(text){
 if(typeof text!=='string')return [];
 const lines=[];
 for(const line of text.split(/\r?\n/)){
  const tags=[...line.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
  const content=line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g,'').trim();
  if(!content)continue;
  for(const m of tags){const sec=Number(m[1])*60+Number(m[2])+Number((m[3]||'0').padEnd(3,'0'))/1000;if(Number.isFinite(sec))lines.push({time:sec,text:content})}
 }
 return lines.sort((a,b)=>a.time-b.time);
}
export function lyricIndex(lines,time){if(!lines.length)return -1;let lo=0,hi=lines.length-1,best=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(lines[mid].time<=time){best=mid;lo=mid+1}else{hi=mid-1}}return best;}
