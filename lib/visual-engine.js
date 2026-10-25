/** GNARLY WEB experimental Canvas 2D material engine.
 * Visual reconstruction of the Stage 72 acid palette; NOT a compiled Metal shader.
 * Animation phase uses absolute elapsed time, so changing FPS never changes motion speed.
 */
export const PALETTES = Object.freeze({
  'ACID':['#011905','#003509','#086711','#099e0d','#509b20','#9fb331'],
  'CYBER NIGHT':['#020315','#071e3d','#08456d','#007aac','#40bbdd','#ec62d8'],
  'CRIMSON':['#180206','#36050f','#650a20','#a51832','#e22c4e','#ed8b5b'],
  'CHROME':['#080a10','#161d24','#303948','#6e7982','#b6c3be','#f1eeee'],
  'SMOKE':['#090b12','#1b2031','#313753','#575875','#9b90a2','#e2cad5'],
  'XEROX SERPENTINE':['#070b08','#212d12','#566823','#858e35','#c3c643','#e7efad'],
  'PRISM CARMINE':['#160713','#390727','#70033b','#a91156','#fa4b98','#91dcff'],
  'GNARLY':['#042010','#06512f','#10948c','#42b579','#a7d136','#f7ee74'],
});
function rgb(h){return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16))}
function mix(a,b,t){return a.map((v,i)=>Math.round(v*(1-t)+b[i]*t))}
function smoothstep(x){return x*x*(3-2*x)}
export class FluidVisual {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});this.theme='ACID';this.reaction='FLUIDO';this.energy=0;this.start=performance.now();this.latest=0;this.running=false;this.reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;this.resize=()=>{const r=canvas.getBoundingClientRect();this.width=Math.max(140,Math.min(265,Math.round(r.width*.43)));this.height=Math.max(210,Math.min(480,Math.round(r.height*.43)));canvas.width=this.width;canvas.height=this.height};this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);this.resize();this.frame=this.frame.bind(this);document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.latest=0});}
  startLoop(){if(!this.running){this.running=true;requestAnimationFrame(this.frame)}}
  stopLoop(){this.running=false}
  setTheme(name){if(PALETTES[name]){this.theme=name;this.latest=0}}
  setReaction(mode){this.reaction=mode;this.latest=0}
  setEnergy(energy){this.energy=Math.max(0,Math.min(1,energy||0))}
  frame(now){if(!this.running)return;requestAnimationFrame(this.frame);if(document.hidden)return;const interval=this.reduced?120:34;if(now-this.latest<interval)return;this.latest=now;const w=this.width,h=this.height;const img=this.ctx.createImageData(w,h);const data=img.data;const C=PALETTES[this.theme].map(rgb);const sec=(now-this.start)/1000;const t=this.reduced?0:sec*.23;const reactive=this.reaction==='DESLIGADO'?0:this.reaction==='REATIVO'?this.energy*.22:this.energy*.075;const contrast=reactive+1;for(let y=0;y<h;y++){const v=y/h;for(let x=0;x<w;x++){const u=x/w;const px=u*3.5,py=v*6.5;
   const warpX=Math.sin(py*2.1-t*.94+Math.cos(px*1.7+t*.24))*.36+Math.cos(py*1.8+px*1.9+t*.55)*.14;
   const warpY=Math.cos(px*2.9+t*.79+Math.sin(py*1.1))*.42+Math.sin(px*3.6-py*.9-t*.68)*.19;
   const X=px+warpX,Y=py+warpY;
   let field=Math.sin(X*2.35+Math.sin(Y*1.15+t*.8)*1.1)*.47+Math.cos(Y*2.45-X*.85+Math.cos(X*2+t*.42))*.40+Math.sin((X+Y)*3.4+t*.41)*.13;
   field+=(Math.sin(X*6.1-Y*4.8+t)*Math.cos(Y*5.3+X*.7-t*.55))*.115;
   field=field*contrast*.52+.50;
   const level=Math.max(0,Math.min(5.999,field*6));const ix=Math.min(5,Math.floor(level));const f=level-ix;const edge=f<.065||f>.953;
   let col= C[ix];if(edge)col=mix(col,[0,14,1],.48);
   const dither=(Math.sin(x*12.989+y*78.233)*43758.5453)%1;let k=(y*w+x)*4;data[k]=Math.max(0,col[0]+dither*1.6);data[k+1]=Math.max(0,col[1]+dither*2);data[k+2]=Math.max(0,col[2]+dither*1.6);data[k+3]=255;
  }}this.ctx.putImageData(img,0,0)}
}
