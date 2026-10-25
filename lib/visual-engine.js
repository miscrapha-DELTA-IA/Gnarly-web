/** Browser GPU port of the Stage72 MarbleTheme palettes. WebGL2 approximation (not binary-equivalent to Metal). */
export const PALETTES=Object.freeze({
 'ACID':['#001f08','#1ad91a','#d9ff40'],'CYBER NIGHT':['#1a0538','#00e6ff','#ff1acc'],'CRIMSON':['#080000','#bf0814','#ff730d'],
 'ULTRAVIOLET':['#08051a','#7566f0','#b8bde0'],'SOLAR':['#0f121c','#a640ff','#ffcc33'],'ORCHID':['#050008','#822e87','#bdb3cc'],
 'SAPPHIRE':['#030517','#1f40d6','#a3b3f2'],'ATOMIC':['#030808','#0d9494','#eb3d24'],'LAGOON':['#000812','#0d6ba8','#ffc226'],
 'VOLT':['#000000','#e0c705','#b3b5bf'],'PRISM':['#05030d','#614da8','#fa851a'],'MAGMA':['#03051a','#0d2b85','#ff730f'],
 'NOIR':['#000000','#d90a0f','#bdbdc4'],'ULTRAPINK':['#12000d','#ff1494','#fa99d9'],'ULTRAORANGE':['#000000','#fa4514','#b8c7e6'],
 'PUREWHITE':['#000000','#858a94','#bdbfc9'],'ULTRABLACK':['#000000','#121217','#474a57'],'GNARLY':['#05051f','#3385de','#bae8ff'],
 'XEROX SERPENTINE':['#0d0d0f','#f7ed17','#f2f0e6'],'PRISM CARMINE':['#38000d','#ff0d38','#7ae6f2'],
 'SUBATOMIC BUBBLE':['#0a2145','#f5b82e','#3894d4'],'JACQUARD SIGNAL':['#0f0814','#b5944a','#8030cc'],
 'ISOMETRIC CHASM':['#030308','#294fff','#c7d4ff'],'LENTICULAR WILD':['#0a0a0a','#cf9c47','#f5ede0'],
 'GNARLY STRATA':['#05050d','#6da6ff','#e0b573'],'GNARLY COMPILER':['#05050d','#52e0e6','#f5b82e'],
 'GNARLY ORGANISM':['#05050d','#ff6baa','#61c7d1']
});
export function themeKind(n){return /XEROX/.test(n)?2:/PRISM/.test(n)?3:/ORGANISM|STRATA|LENTICULAR|JACQUARD/.test(n)?4:1}
export function gnarlyProgress(time,duration){return duration>0?Math.min(1,Math.max(0,time/duration)):0}
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const hsv=(h,s,v)=>{h=(h%1+1)%1;const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]};
const vertex=`#version 300 es
precision highp float;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time,u_energy,u_mode,u_kind;
uniform vec3 u_dark,u_body,u_glow;
float hash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;vec2 p=(uv-.5)*vec2(3.4*u_resolution.x/u_resolution.y,3.4);
 float t=u_time*(u_mode<.5?.08:u_mode<1.5?.42:.67+u_energy*.2);
 vec2 q=p;
 q.x+=.41*sin(q.y*2.4+t*.49)+.21*sin(q.y*4.5-q.x*.9-t*.26);
 q.y+=.38*cos(q.x*2.65-t*.42)+.24*cos(q.y*2.8+q.x*.75+t*.16);
 q+=vec2(.13*sin(q.y*7.2+t*.32),.11*cos(q.x*6.2-t*.27));
 float f=sin(q.x*3.7+2.1*sin(q.y*1.9+t*.5))*.45+cos(q.y*3.1-q.x*1.45+sin(q.x*2.3-t*.2))*.42+sin((q.x+q.y)*2.8+t*.35)*.13;
 f=f*.5+.5;
 if(u_kind>1.5&&u_kind<2.5)f=mix(f,1.-f,.18*(1.-smoothstep(.18,.28,length(fract(gl_FragCoord.xy/5.)-.5))));
 if(u_kind>2.5&&u_kind<3.5)f=clamp(f+.15*(hash(floor(q*4.))-.5),0.,1.);
 if(u_kind>3.5)f=clamp(f+sin(q.x*11.+sin(q.y*3.+t)*3.)*.095,0.,1.);
 float cell=floor(clamp(f,0.,.999)*5.)/4.;
 vec3 col=mix(mix(u_dark,u_body,smoothstep(.1,.4,cell)),u_glow,smoothstep(.48,.83,cell));
 float edge=1.-smoothstep(.015,.05,abs(fract(f*5.)-.5));
 col=mix(col,u_dark,edge*.2);
 col+=u_glow*pow(max(0.,sin(f*29.+q.y*1.3)),22.)*.16;
 col=clamp(col*(.91+.16*sin(q.x*2.6+q.y*3.2+t*.09))+(hash(gl_FragCoord.xy)-.5)*.025,0.,1.);
 fragColor=vec4(col,1.);
}`;
export class FluidVisual{
 constructor(canvas){this.canvas=canvas;this.theme='ACID';this.mode='FLUIDO';this.energy=0;this.songTime=0;this.songDuration=0;this.hue=.58;this.start=performance.now();this.last=0;this.running=false;this.paused=false;this.reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{this.initGL()}catch(e){console.warn('GNARLY WebGL2 fallback',e);this.gl=null;this.ctx=canvas.getContext('2d',{alpha:false})}
  this.resize=()=>{const r=canvas.getBoundingClientRect();if(this.gl){const d=Math.min(devicePixelRatio||1,2,Math.sqrt(2100000/Math.max(1,r.width*r.height)));canvas.width=Math.max(2,Math.floor(r.width*d));canvas.height=Math.max(2,Math.floor(r.height*d));this.gl.viewport(0,0,canvas.width,canvas.height)}else{canvas.width=Math.max(160,Math.floor(r.width*.7));canvas.height=Math.max(240,Math.floor(r.height*.7))}};
  this.resize();this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);this.draw=this.draw.bind(this);
 }
 initGL(){const g=this.canvas.getContext('webgl2',{alpha:false,depth:false,antialias:false,powerPreference:'high-performance'});if(!g)throw Error('WebGL2 unsupported');const shader=(type,src)=>{const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s};const p=g.createProgram();g.attachShader(p,shader(g.VERTEX_SHADER,vertex));g.attachShader(p,shader(g.FRAGMENT_SHADER,fragment));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));this.program=p;this.gl=g;this.u={};for(const n of ['resolution','time','energy','mode','kind','dark','body','glow'])this.u[n]=g.getUniformLocation(p,'u_'+n);g.bindVertexArray(g.createVertexArray())}
 setTheme(n){if(PALETTES[n])this.theme=n}
 setReaction(n){this.mode=n}
 setEnergy(n){this.energy=Math.max(0,Math.min(1,n||0))}
 setSong(t,d,h){this.songTime=t||0;this.songDuration=d||0;if(Number.isFinite(h))this.hue=h}
 setPaused(v){this.paused=!!v}
 startLoop(){if(!this.running){this.running=true;requestAnimationFrame(this.draw)}}
 stopLoop(){this.running=false}
 colors(){if(this.theme!=='GNARLY')return PALETTES[this.theme].map(rgb);const v=gnarlyProgress(this.songTime,this.songDuration),z=Math.min(1,Math.max(0,(v-.2)/.08)),b=z*z*(3-2*z),a=[hsv(this.hue,.72,.09),hsv(this.hue-.032,.83,.68),hsv(this.hue+.032,.67,.98)],full=['#050714','#6699cc','#f5f9ff'].map(rgb);return a.map((c,i)=>c.map((x,j)=>x*(1-b)+full[i][j]*b))}
 draw(now){if(!this.running)return;requestAnimationFrame(this.draw);if(document.hidden||this.paused||now-this.last<(this.reduce?120:32))return;this.last=now;const colors=this.colors();if(this.gl){const g=this.gl,u=this.u;g.useProgram(this.program);g.uniform2f(u.resolution,this.canvas.width,this.canvas.height);g.uniform1f(u.time,this.reduce?0:(now-this.start)/1000);g.uniform1f(u.energy,this.energy);g.uniform1f(u.mode,this.mode==='DESLIGADO'?0:this.mode==='FLUIDO'?1:2);g.uniform1f(u.kind,themeKind(this.theme));g.uniform3fv(u.dark,colors[0]);g.uniform3fv(u.body,colors[1]);g.uniform3fv(u.glow,colors[2]);g.drawArrays(g.TRIANGLES,0,3);return}if(!this.ctx)return;const w=this.canvas.width,h=this.canvas.height,img=this.ctx.createImageData(w,h),d=img.data;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=x/w*8,b=y/h*12,t=(now-this.start)*.0002,f=(Math.sin(a+Math.sin(b*.65+t)*1.5)+Math.cos(b*.8-a*.42+t*.6)+2)/4,k=(y*w+x)*4,c=colors[Math.min(2,Math.floor(f*3))];d[k]=c[0]*255;d[k+1]=c[1]*255;d[k+2]=c[2]*255;d[k+3]=255}this.ctx.putImageData(img,0,0)}
}
