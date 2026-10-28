/** Static vector printmaking. Seeded paths, no canvas, animation or audio work. */
import {normalizeAppearance} from './ipod-appearance.js';
const cache=new Map(),LIMIT=32;
function rng(seed){let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
const n=value=>Math.round(value*100)/100;
const svg=content=>`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">${content}</svg>`;
const rect=(x,y,w,h,fill,other='')=>`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${other}/>`;
const path=(d,fill,other='')=>`<path d="${d}" fill="${fill}" ${other}/>`;
const circle=(x,y,r,fill,other='')=>`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}" ${other}/>`;
const line=(d,color,width=1,opacity=1)=>path(d,'none',`stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round"`);
function blob(random,x,y,r,angular=false){
 const pts=Array.from({length:10},(_,i)=>{const a=i*Math.PI/5,rad=r*(.55+random()*.65);return [n(x+Math.cos(a)*rad),n(y+Math.sin(a)*rad*.72)]});
 if(angular)return 'M'+pts.map(p=>p.join(' ')).join('L')+'Z';
 let d='M'+[(pts[9][0]+pts[0][0])/2,(pts[9][1]+pts[0][1])/2].map(n).join(' ');
 for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];d+=`Q${a.join(' ')} ${n((a[0]+b[0])/2)} ${n((a[1]+b[1])/2)}`}
 return d+'Z';
}
export function patternSVG(raw){
 const c=normalizeAppearance(raw),id=c.pattern,colors=[c.colors.primary,c.colors.secondaryInk,c.colors.accent];
 const key=JSON.stringify([id,c.seed,c.density,colors]);
 if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit}
 const random=rng(c.seed+Array.from(id).reduce((a,x)=>a+x.charCodeAt(0)*97,0)),pick=()=>colors[Math.floor(random()*3)];
 const count=Math.round(8+c.density*20);let out='';
 if(['woodland','desert','urban','snow','psyche'].includes(id)){
  // Overlapping lobed patches with wrapped edges, not a noise filter.
  for(let layer=0;layer<3;layer++)for(let i=0;i<Math.round(count/2);i++){
   const x=random()*160,y=random()*160,r=(id==='desert'?12:23)+random()*22;
   const d=blob(random,0,0,r,id==='urban');
   const xs=[x],ys=[y];if(x-r<0)xs.push(x+160);if(x+r>160)xs.push(x-160);if(y-r<0)ys.push(y+160);if(y+r>160)ys.push(y-160);
   for(const xx of xs)for(const yy of ys)out+=path(d,colors[layer],`transform="translate(${n(xx)} ${n(yy)})"`);
  }
  if(id==='desert')for(let i=0;i<22;i++)out+=circle(random()*160,random()*160,.6+random()*1.2,colors[0]);
 }else if(id==='digital'){
  for(let i=0;i<count*2;i++){
   const x=Math.floor(random()*20)*8,y=Math.floor(random()*20)*8;
   out+=path(`M${x} ${y}h24v8h16v16h-8v8h-24v-16h-8Z`,pick());
  }
 }else if(id==='tiger'){
  for(let y=-25;y<190;y+=22){const f=y%2?colors[0]:colors[1];out+=path(`M-10 ${y}Q34 ${y+28} 72 ${y+9}T170 ${y+12}L170 ${y+21}Q110 ${y+3} 70 ${y+21}T-10 ${y+7}Z`,f);out+=line(`M10 ${y+3}Q65 ${y+24} 140 ${y+13}`,colors[2],2,.55)}
 }else if(id==='checker'){
  out=rect(0,0,160,160,colors[1])+rect(0,0,80,80,colors[0])+rect(80,80,80,80,colors[0]);
 }else if(id==='graffiti'){
  out=path('M-20 54L60 5L45 58L111 22L87 88L174 38L143 121L55 152L77 101L7 133Z',colors[1]);
  out+=line('M-10 123Q45 8 90 95T180 17',colors[0],11)+line('M10 14L147 149M127 -10L24 174',colors[2],5);
  out+=circle(115,40,23,'none',`stroke="${colors[0]}" stroke-width="6"`)+line('M15 78Q64 39 108 73',colors[2],4);
  for(let i=0;i<16;i++)out+=circle(random()*160,random()*160,random()*2,colors[0]);
 }else if(id==='halftone'){
  for(let y=0;y<170;y+=14)for(let x=0;x<170;x+=14)out+=circle(x+(y%28?7:0),y,1.1+(x/160)*4.5*c.density,colors[0]);
 }else if(id==='stickers'){
  out=rect(9,9,71,35,colors[2],'rx="3" transform="rotate(-12 44 26)"')+path('M98 14L112 40L146 42L122 64L129 93L100 78L77 94L81 64L58 48L90 42Z',colors[1]);
  out+=line('M8 121Q59 74 82 134T165 112',colors[0],17)+circle(40,77,19,colors[0])+line('M23 78L57 77M40 60L40 94',colors[2],4);
 }else if(id==='splatter'){
  for(let i=0;i<count;i++){
   const x=random()*160,y=random()*160;out+=path(blob(random,x,y,3+random()*13),pick());
   for(let j=0;j<3;j++)out+=circle(x+(random()-.5)*40,y+(random()-.5)*40,random()*2,pick());
  }
 }else if(id==='distressed'){
  for(let i=0;i<count*3;i++){const x=random()*160,y=random()*160;out+=line(`M${n(x)} ${n(y)}l${n(3+random()*20)} ${n(random()*3)}`,pick(),random()*1.8+.2,random()*.7)}
 }else if(id==='flames'){
  for(let x=-35;x<200;x+=46)out+=path(`M${x} 165Q${x-17} 122 ${x+10} 98Q${x+29} 78 ${x+13} 40Q${x+54} 70 ${x+33} 108Q${x+24} 126 ${x+43} 113Q${x+48} 144 ${x+33} 165Z`,colors[0],`stroke="${colors[1]}" stroke-width="2"`);
  for(let x=-35;x<200;x+=46)out+=path(`M${x+12} 165Q${x+8} 138 ${x+26} 123Q${x+16} 148 ${x+27} 165Z`,colors[2]);
 }else if(id==='stripes'){
  out=rect(0,0,160,160,colors[0]);for(let x=6;x<160;x+=40)out+=rect(x,0,15,160,colors[1])+rect(x+19,0,4,160,colors[2]);
 }else if(id==='waves'){
  for(let y=-20;y<180;y+=20)out+=line(`M-40 ${y}Q0 ${y-28} 40 ${y}T120 ${y}T200 ${y}`,colors[(Math.round(y/20)+3)%3],7);
 }else if(id==='topo'){
  for(let i=1;i<=18;i++){
   const r=i*9;out+=line(`M${80-r} 80C${70-r} ${30-r} ${133+r} ${47-r} ${103+r} 80S${70-r} ${125+r} ${80-r} 80Z`,colors[i%3],i%3===0?1.8:.85,.85);
  }
 }else if(id==='dots'){
  for(let y=20;y<180;y+=40)for(let x=20;x<180;x+=40)out+=circle(x+(y%80?0:20),y,7+c.density*3,colors[0])+circle(x+(y%80?0:20),y,2,colors[2]);
 }else if(id==='polygons'){
  for(let y=0;y<160;y+=40)for(let x=0;x<160;x+=40){out+=path(`M${x} ${y}h40l-40 40Z`,pick());out+=path(`M${x+40} ${y}v40h-40Z`,pick())}
 }else if(id==='optical'){
  for(let y=0;y<160;y+=20)for(let x=0;x<160;x+=20)out+=path(`M${x} ${y}q20 0 20 20q-20 0-20-20Z`,(x+y)%40?colors[0]:colors[1]);
 }else if(id==='glitch'){
  for(let i=0;i<count*2;i++)out+=rect(Math.floor(random()*16)*10,Math.floor(random()*32)*5,10+Math.floor(random()*7)*10,3+Math.floor(random()*3)*5,pick(),'opacity=".85"');
 }else if(id==='symbols'){
  for(let y=20;y<180;y+=55)for(let x=20;x<180;x+=55){out+=line(`M${x+17} ${y-9}a16 16 0 1 0 0 18v-10h-14`,colors[0],4);out+=rect(x+25,y+16,3,3,colors[2])}
 }else if(id==='marble'){
  for(let i=0;i<7;i++){
   const y=i*32-25;out+=line(`M-20 ${y}Q45 ${y+88} 84 ${y+40}T180 ${y+89}`,colors[i%3],1+random()*3,.55);
   out+=line(`M15 ${y+31}Q60 ${y+55} 73 ${y+44}T165 ${y+86}`,colors[0],.6,.4);
  }
 }else if(id==='terrazzo'){
  for(let i=0;i<count+12;i++)out+=path(blob(random,random()*160,random()*160,2+random()*9,true),pick());
 }else if(id==='weave'){
  let tile=rect(0,0,32,32,colors[0]);
  for(let y=0;y<32;y+=16)for(let x=0;x<32;x+=16){
   const vertical=(x+y)%32===0;tile+=rect(x+1,y+1,14,14,vertical?colors[1]:colors[0]);
   for(let d=3;d<14;d+=3)tile+=line(vertical?`M${x+d} ${y+1}v14`:`M${x+1} ${y+d}h14`,colors[2],.7,.45);
  }
  out=`<defs><pattern id="weave" width="32" height="32" patternUnits="userSpaceOnUse">${tile}</pattern></defs>`+rect(0,0,160,160,'url(#weave)');
 }else if(id==='wood'){
  for(let y=-20;y<190;y+=5)out+=line(`M-10 ${y}Q30 ${y-6} 72 ${y+3}T170 ${y-2}`,colors[Math.abs(y)%3],.6+random()*1.5,.65);
  for(let r=5;r<28;r+=4)out+=`<ellipse cx="70" cy="72" rx="${r}" ry="${r/3}" fill="none" stroke="${colors[0]}" stroke-width="1" opacity=".45"/>`;
 }else if(id==='metal'){
  for(let i=0;i<100;i++){const y=random()*160;out+=line(`M${n(random()*40)} ${n(y)}h${n(40+random()*100)}`,pick(),.3+random()*.7,.3)}
 }else if(id==='iridescent'){
  out=`<defs><linearGradient id="s" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset=".45" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient></defs>`+rect(0,0,160,160,'url(#s)');
  for(let i=-160;i<320;i+=16)out+=line(`M${i} 0l160 160`,'#ffffff',1,.16);
 }else if(id==='mono'){
  for(let i=0;i<count*5;i++)out+=circle(random()*160,random()*160,.3+random()*.65,colors[0],'opacity=".5"');
 }
 const result=svg(out);cache.set(key,result);if(cache.size>LIMIT)cache.delete(cache.keys().next().value);return result;
}
export const svgURL=value=>`url("data:image/svg+xml,${encodeURIComponent(value)}")`;
export function contrastRatio(a,b){
 const luminance=value=>{const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function legibleColor(foreground,background){
 if(contrastRatio(foreground,background)>=4.5)return foreground;
 return contrastRatio('#ffffff',background)>contrastRatio('#000000',background)?'#ffffff':'#000000';
}
export function appearanceVariables(raw){
 const c=normalizeAppearance(raw),v={},colors=c.colors;
 for(const [key,color] of Object.entries(colors))v['--ipod-'+key]=color;
 v['--ipod-labels']=legibleColor(colors.labels,colors.wheel);
 v['--ipod-center-label']=legibleColor(colors.labels,colors.center);
 v['--ipod-brand']=legibleColor(colors.brand,colors.body);
 v['--ipod-base']=c.baseMode==='solid'?colors.body:`linear-gradient(${c.angle}deg,${colors.body},${c.baseMode==='trio'?colors.secondary+',':''}${c.baseMode==='trio'?colors.tertiary:colors.secondary})`;
 v['--ipod-pattern']=c.pattern==='none'?'none':svgURL(patternSVG(c));
 v['--ipod-pattern-size']=(Math.round(36*c.scale*(1.7-c.density)*100)/100)+'%';v['--ipod-rotation']=c.rotation+'deg';
 v['--ipod-pattern-position']=`${50+c.x/2}% ${50+c.y/2}%`;
 v['--ipod-print-contrast']=String(c.contrast);v['--ipod-print-filter']=c.contrast===1?'none':`contrast(${c.contrast})`;
 v['--ipod-print-transform']=c.rotation===0?'none':`rotate(${c.rotation}deg)`;v['--ipod-texture']=String(c.texture);
 v['--ipod-finish']=String(c.finish);v['--ipod-tint']=colors.metallic+Math.round(c.tint*110).toString(16).padStart(2,'0');
 return v;
}
export function applyAppearance(element,config,{enabled=true}={}){
 const c=normalizeAppearance(config);
 for(const [key,value] of Object.entries({ipodMaterial:c.material,ipodFrame:c.frameFinish,ipodPattern:c.pattern,hardwareActive:String(enabled)}))if(element.dataset[key]!==value)element.dataset[key]=value;
 for(const [key,value] of Object.entries(appearanceVariables(c)))if(element.style.getPropertyValue(key)!==value)element.style.setProperty(key,value);
}
export const materialCacheSize=()=>cache.size;
