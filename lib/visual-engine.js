export const PALETTES = {
 ACID:['#020e02','#044b07','#268e14','#8caf34','#000400'],
 CYBER:['#001127','#0556a8','#00caff','#210c46','#010209'],
 CRIMSON:['#1d040a','#870d34','#ff3061','#4d1222','#020103'],
 ULTRAPINK:['#230922','#a21795','#ff70ee','#320a55','#030104'],
 AMBER:['#301800','#8c4400','#fbc543','#4c2606','#090500'],
 CHROME:['#0c1417','#496875','#c1e0ed','#2d414b','#010304'],
 VIOLET:['#100921','#5332b2','#b299ff','#29105b','#010104'],
 GNARLY:['#031a10','#237d32','#73d9a7','#2d3985','#010a09']
};
export class FluidVisual {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.theme='ACID';this.mode='FLUIDO';this.energy=0;this.w=0;this.h=0;this.image=null;this.last=0;this.t=0;this.palette=[];this.hexCache='';requestAnimationFrame(t=>this.tick(t))}
 setTheme(name){this.theme=PALETTES[name]?name:'ACID';this.hexCache=''}
 setReaction(mode){this.mode=mode}
 setEnergy(n){this.energy=n}
 hex(v){const n=Number.parseInt(v.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]}
 tick(now){requestAnimationFrame(t=>this.tick(t));if(document.hidden||now-this.last<43)return;const dt=Math.min(.12,(now-this.last)/1000||.045);this.last=now;const motion=this.mode==='DESLIGADO'?.06:this.mode==='FLUIDO'?.36+this.energy*.12:.68+this.energy*.50;this.t+=dt*motion;const c=this.canvas,w=Math.max(70,Math.ceil(c.clientWidth/4)),h=Math.max(90,Math.ceil(c.clientHeight/4));if(this.w!==w||this.h!==h){this.w=c.width=w;this.h=c.height=h;this.image=this.ctx.createImageData(w,h)}if(!this.image)return;const pal=PALETTES[this.theme],key=pal.join();if(key!==this.hexCache){this.palette=pal.map(x=>this.hex(x));this.hexCache=key}const data=this.image.data,time=this.t;for(let y=0;y<h;y++){const v=y/h;for(let x=0;x<w;x++){const u=x/w,a=Math.sin(u*12+Math.sin(v*9+time)*1.9+time*.4),b=Math.cos(v*14+Math.sin(u*10-time)*1.6-time*.3),c1=Math.sin((u+v)*19+Math.cos(u*8-v*7+time)*2),d=Math.sin(u*29-v*25+time*.42);const intensity=(a*.37+b*.3+c1*.25+d*.08+1)*.5;const border=Math.sin(intensity*21+Math.sin(u*7+v*7+time)*.5);const idx=intensity<.19?4:intensity<.40?0:intensity<.57?1:intensity<.73?2:3;const color=this.palette[border>.94&&idx!==4?3:idx],shade=.83+.16*Math.sin(u*13+v*10+time*.3),k=(y*w+x)*4;data[k]=color[0]*shade;data[k+1]=color[1]*shade;data[k+2]=color[2]*shade;data[k+3]=255}}this.ctx.putImageData(this.image,0,0)}
}
