/**
 * GNARLY lyric typography registry (presentation only).
 * Does not edit lyric data, timing, source, audio or karaoke scoring.
 *
 * Future font datasets register manifests of the shape:
 * {id, name, description, family, weight, size, tracking, transform, treatment}
 * A font package is NOT downloaded automatically. Map licensed/hosted assets
 * separately after the user supplies rights and repository/dataset provenance.
 */
import {FONT_CATALOG,findFont} from './lyric-font-catalog.js';
import {KARAOKE_DESIGNS} from './karaoke-art-direction.js';
export const LYRIC_FONT_FAMILIES=Object.freeze({
 system:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
 editorial:'Georgia, "Times New Roman", serif',
 rounded:'ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
 mono:'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
 display:'Impact, "Arial Narrow", "Helvetica Neue", sans-serif',
 ...Object.fromEntries(FONT_CATALOG.map(f=>[f.family,f.fontFamily+','+f.fallback]))
});
const BUILTINS=Object.freeze([
 {id:'original',name:'Original',description:'Limpo e fluido',family:'system',weight:700,size:1,tracking:0,transform:'none',treatment:'original'},
 {id:'neon',name:'Neon',description:'Luz e presença',family:'rounded',weight:800,size:1.08,tracking:.025,transform:'none',treatment:'neon'},
 {id:'editorial',name:'Revista',description:'Editorial e elegante',family:'editorial',weight:700,size:1.08,tracking:-.018,transform:'none',treatment:'editorial'},
 {id:'mono',name:'Digital',description:'Precisão monoespaçada',family:'mono',weight:750,size:.96,tracking:.025,transform:'none',treatment:'mono'},
 {id:'kinetic',name:'Kinetic',description:'Título de impacto',family:'display',weight:800,size:1.15,tracking:.035,transform:'uppercase',treatment:'kinetic'},
 {id:'minimal',name:'Minimal',description:'Discreto e legível',family:'system',weight:560,size:.93,tracking:.008,transform:'none',treatment:'minimal'}
]);
const ids=new Set();
const registry=new Map();
const clean=(x,n=100)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const clamp=(x,min,max,otherwise)=>{const n=Number(x);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):otherwise};
export function registerLyricStyle(raw){
 if(!raw||typeof raw!=='object')return false;
 const id=clean(raw.id,42).toLowerCase();
 if(!/^[a-z][a-z0-9-]{1,41}$/.test(id)||registry.has(id)||!Object.hasOwn(LYRIC_FONT_FAMILIES,raw.family))return false;
 const style=Object.freeze({
  id,name:clean(raw.name,48)||id,description:clean(raw.description,115),
  group:['clean','expressive','poster','mono','serif','hand','art','studio'].includes(raw.group)?raw.group:'original',
  design:KARAOKE_DESIGNS.some(x=>x.id===id)?id:null,
  family:raw.family,weight:Math.round(clamp(raw.weight,400,900,700)),
  size:clamp(raw.size,.78,1.27,1),tracking:clamp(raw.tracking,-.05,.10,0),
  transform:['none','uppercase'].includes(raw.transform)?raw.transform:'none',
  treatment:['original','neon','editorial','mono','kinetic','minimal'].includes(raw.treatment)?raw.treatment:'original'
 });
 registry.set(id,style);ids.add(id);return true;
}
for(const style of BUILTINS)registerLyricStyle(style);
for(const font of FONT_CATALOG)registerLyricStyle({id:font.id,name:font.name,description:font.description,group:font.group,family:font.family,
 weight:font.weight,size:font.group==='poster'?1.12:font.group==='hand'?1.04:font.group==='serif'?1.08:1.0,
 tracking:font.group==='mono'?.015:font.group==='poster'?.018:0,
 transform:'none',treatment:font.group==='poster'?'kinetic':font.group==='serif'?'editorial':font.group==='mono'?'mono':'original'});
for(const design of KARAOKE_DESIGNS){
 const face=findFont(design.fontId);
 if(!face)throw new Error('GNARLY typeface alias unavailable: '+design.fontId);
 registerLyricStyle({id:design.id,name:design.name,description:design.description,
   family:face.family,group:design.group,weight:face.weight,
   size:design.group==='art'?1.08:1.03,tracking:design.group==='art'?.015:0,
   transform:'none',treatment:'original'});
}
export const DEFAULT_LYRIC_STYLE='original';
export function allLyricStyles(){return [...registry.values()]}
export function resolveLyricStyle(id){return registry.get(id)||registry.get(DEFAULT_LYRIC_STYLE)}
export function applyLyricStyle(target,id){
 const style=resolveLyricStyle(id);
 if(!target?.style||!target.dataset)return style;
 target.dataset.lyricStyle=style.id;
 target.dataset.lyricArt=style.design||'';
 target.dataset.lyricTreatment=style.treatment;
 target.dataset.lyricFontGroup=style.group;
 target.style.setProperty('--gnarly-lyric-font',LYRIC_FONT_FAMILIES[style.family]);
 target.style.setProperty('--gnarly-lyric-weight',String(style.weight));
 target.style.setProperty('--gnarly-lyric-scale',String(style.size));
 target.style.setProperty('--gnarly-lyric-spacing',style.tracking+'em');
 target.style.setProperty('--gnarly-lyric-transform',style.transform);
 return style;
}
