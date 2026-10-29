/** Local, explicit tap-to-sync editor. No audio upload, guessing or lyrics publication.
 * The user taps once at each real sung line; only complete monotonic times
 * are promoted to synchronized lyrics for this exact track.
 */
const KEY='gnarly.web.manual-lyric-sync.v1',MAX_SAVED=24;
const validId=track=>String(track?.id||'').slice(0,140);
const textLines=items=>(items||[]).filter(x=>typeof x==='string'&&x.trim())
 .map(x=>x.trim().slice(0,380)).slice(0,280);
export function manualLyricKey(track){
 const id=validId(track);
 // The canonical recording ID survives metadata improvements and lets users
 // reuse their timing after an initially unknown artist is identified.
 return id?'id|'+id:'';
}
function validate(lines){
 return Array.isArray(lines)&&lines.length>=2&&lines.length<=280&&
  lines.every((entry,index)=>entry&&typeof entry.text==='string'&&entry.text.trim()&&
    entry.text.length<=380&&Number.isFinite(entry.time)&&entry.time>=0&&entry.time<=14400&&
    (index===0||entry.time>lines[index-1].time));
}
export class LyricSyncWorkshop{
 constructor({storage=null,now=()=>Date.now()}={}){this.storage=storage;this.now=now;this.clear()}
 clear(){this.trackKey='';this.text=[];this.marks=[]}
 start(track,plain){
  const key=manualLyricKey(track),items=textLines(plain);
  if(!key||items.length<2)return false;
  this.trackKey=key;this.text=items;this.marks=[];return true;
 }
 get active(){return !!this.trackKey}
 get next(){return this.text[this.marks.length]||null}
 get progress(){return {marked:this.marks.length,total:this.text.length}}
 mark(seconds){
  if(!this.active||!this.next)return false;
  const at=Number(seconds);
  if(!Number.isFinite(at)||at<0||at>14400||
   this.marks.length&&at<=this.marks[this.marks.length-1])return false;
  this.marks.push(Math.round(at*1000)/1000);
  return true;
 }
 undo(){return this.marks.pop()??null}
 finish(track){
  if(!this.active||this.trackKey!==manualLyricKey(track)||
   this.marks.length!==this.text.length)return null;
  const lines=this.text.map((text,i)=>({time:this.marks[i],text}));
  if(!validate(lines))return null;
  this.save(track,lines);
  this.clear();
  return {lines,plainLines:lines.map(x=>x.text),synced:true,source:'tap-sync',
   status:'Letra sincronizada por você · salva neste dispositivo'};
 }
 save(track,lines){
  const key=manualLyricKey(track);if(!key||!validate(lines))return false;
  try{
   const found=JSON.parse(this.storage?.getItem(KEY)||'[]');
   const items=(Array.isArray(found)?found:[]).filter(x=>x?.key!==key).slice(-(MAX_SAVED-1));
   items.push({key,lines,savedAt:this.now()});
   this.storage?.setItem(KEY,JSON.stringify(items));return true;
  }catch{return false}
 }
 load(track){
  const key=manualLyricKey(track);if(!key)return null;
  try{
   const entries=JSON.parse(this.storage?.getItem(KEY)||'[]');
   const found=Array.isArray(entries)?entries.find(x=>x?.key===key):null;
   if(!validate(found?.lines))return null;
   return {lines:found.lines,plainLines:found.lines.map(x=>x.text),
    synced:true,source:'tap-sync',status:'Letra sincronizada por você · salva neste dispositivo'};
  }catch{return null}
 }
 remove(track){
  const key=manualLyricKey(track);if(!key)return false;
  try{
   const arr=JSON.parse(this.storage?.getItem(KEY)||'[]');
   if(!Array.isArray(arr))return false;
   this.storage?.setItem(KEY,JSON.stringify(arr.filter(x=>x?.key!==key)));
   return true;
  }catch{return false}
 }
}
export function serializeManualLRC(lines){
 if(!validate(lines))return '';
 const stamp=time=>{
  const ms=Math.round(time*100),min=Math.floor(ms/6000),sec=Math.floor((ms%6000)/100);
  return '['+String(min).padStart(2,'0')+':'+String(sec).padStart(2,'0')+'.'+String(ms%100).padStart(2,'0')+']';
 };
 return lines.map(line=>stamp(line.time)+line.text.replace(/[\r\n]+/g,' ')).join('\n')+'\n';
}
