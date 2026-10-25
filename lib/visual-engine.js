import {resolveVisual,GNARLY_MODES} from './visual-selection.js';
/** GNARLY WEB GPU material port.
 * Palette values below are taken from Stage 72 MarbleTheme in TurbulentMarbleView.swift.
 * Distortion is an authored WebGL2 approximation; the original is Metal and not byte-identical.
 * Render directly at device pixel resolution, never a scaled 25–40% CPU bitmap.
 */
export const PALETTES = Object.freeze({
 'ACID':['#001f08','#1ad91a','#d9ff40'],
 'CYBER NIGHT':['#1a0538','#00e6ff','#ff1acc'],
 'CRIMSON':['#080000','#bf0814','#ff730d'],
 'ULTRAVIOLET':['#08051a','#7566f0','#b8bde0'],
 'SOLAR':['#0f121c','#a640ff','#ffcc33'],
 'ORCHID':['#050008','#822e87','#bdb3cc'],
 'SAPPHIRE':['#030517','#1f40d6','#a3b3f2'],
 'ATOMIC':['#030808','#0d9494','#eb3d24'],
 'LAGOON':['#000812','#0d6ba8','#ffc226'],
 'VOLT':['#000000','#e0c705','#b3b5bf'],
 'PRISM':['#05030d','#614da8','#fa851a'],
 'MAGMA':['#03051a','#0d2b85','#ff730f'],
 'NOIR':['#000000','#d90a0f','#bdbdc4'],
 'ULTRAPINK':['#12000d','#ff1494','#fa99d9'],
 'ULTRAORANGE':['#000000','#fa4514','#b8c7e6'],
 'PUREWHITE':['#000000','#858a94','#bdbfc9'],
 'ULTRABLACK':['#000000','#121217','#474a57'],
 'GNARLY':['#05051f','#3385de','#bae8ff'],
 'XEROX SERPENTINE':['#0d0d0f','#f7ed17','#f2f0e6'],
 'PRISM CARMINE':['#38000d','#ff0d38','#7ae6f2'],
 'SUBATOMIC BUBBLE':['#0a2145','#f5b82e','#3894d4'],
 'JACQUARD SIGNAL':['#0f0814','#b5944a','#8030cc'],
 'ISOMETRIC CHASM':['#030308','#294fff','#c7d4ff'],
 'LENTICULAR WILD':['#0a0a0a','#cf9c47','#f5ede0'],
 'GNARLY STRATA':['#05050d','#6da6ff','#e0b573'],
 'GNARLY COMPILER':['#05050d','#52e0e6','#f5b82e'],
 'GNARLY ORGANISM':['#05050d','#ff6baa','#61c7d1']
});
const vertex=`#version 300 es
precision highp float;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment=`#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time,u_energy,u_mode,u_kind,u_motion;
uniform vec3 u_dark,u_body,u_glow;
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
vec3 palette(float v){
  float a=smoothstep(.10,.40,v),b=smoothstep(.48,.83,v);
  return mix(mix(u_dark,u_body,a),u_glow,b);
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_resolution;
  float aspect=u_resolution.x/u_resolution.y;
  vec2 p=(uv-.5)*vec2(3.4*aspect,3.4);
  float tm=u_time;
  float move=u_mode==0.0?(.18+u_motion*.3):(u_mode==1.0?(.34+u_motion*.35+u_energy*.13):(.53+u_motion*.4+u_energy*.26));
  float t=tm*move;
  // Domain warping: broad continuous swirls with sharp marble boundaries.
  vec2 q=p;
  q.x+=.41*sin(q.y*2.4+t*.49)+.21*sin(q.y*4.5-q.x*.9-t*.26);
  q.y+=.38*cos(q.x*2.65-t*.42)+.24*cos(q.y*2.8+q.x*.75+t*.16);
  q+=vec2(.13*sin(q.y*7.2+t*.32),.11*cos(q.x*6.2-t*.27));
  float f=sin(q.x*3.7+2.1*sin(q.y*1.9+t*.5))*.45+
          cos(q.y*3.1-q.x*1.45+sin(q.x*2.3-t*.2))*.42+
          sin((q.x+q.y)*2.8+t*.35)*.13;
  f=f*.5+.5;
  float edge=abs(sin(f*21.0+sin(q.y*7.0+t*.25)*.8));
  float contour=1.-smoothstep(.035,.17,1.-edge);
  // Stage72 family-specific material geometry. Color always comes from the
  // selected theme; geometry + cadence come from the chosen experience.
  float k=u_kind;
  float micro=0.,spec=0.;
  if(k>1.5&&k<2.5){ // Xerox Serpentine: halftone / scaly xerography
     vec2 dots=fract((q+vec2(.12*f))*vec2(32.,38.))-.5;
     float d=1.-smoothstep(.16,.39,length(dots));
     f=clamp(f*.90+d*.25,0.,1.);micro+=d*.17;contour*=.65;
  }else if(k>2.5&&k<3.5){ // Prism Carmine: angular facets / caustics
     vec2 facet=floor(q*4.5+vec2(.22*t));
     float edgeFac=abs(fract(q.x*4.5+sin(q.y*2.2))-.5);
     f=clamp(f+.3*(hash21(facet)-.5),0.,1.);
     spec=pow(1.-2.*edgeFac,13.)*.32;
  }else if(k>3.5&&k<4.5){ // Lenticular Wild
     float ribs=sin(q.x*20.+sin(q.y*3.+t)*1.8);
     f=clamp(f+ribs*.16,0.,1.);
     micro+=pow(max(0.,ribs),12.)*.17;
  }else if(k>4.5&&k<5.5){ // chrome night
     f=clamp(f+.09*sin(q.x*8.+t*.8),0.,1.);
     spec=pow(abs(sin(f*17.)),20.)*.32;
  }else if(k>5.5&&k<6.5){ // liquid glass
     float glass=sin(length(q+vec2(sin(t*.2),cos(t*.22)))*7.-t);
     f=clamp(f+.11*glass,0.,1.);
     spec=pow(max(0.,glass),12.)*.30;
  }else if(k>6.5&&k<7.5){ // neon pulse
     f=clamp(f+sin(q.x*20.+sin(q.y*3.0+t)*3.)*.1,0.,1.);
     micro+=pow(max(0.,sin(f*30.+t)),24.)*(.1+.19*u_energy);
  }else if(k>7.5&&k<8.5){ // organic pulse
     vec2 cell=floor((q+sin(q.yx*4.+t*.6)) * 7.);
     f=clamp(f+sin(hash21(cell)*6.283+q.x*4.+t*.4)*.14,0.,1.);
     micro+=.065*hash21(cell);
  }else if(k>8.5&&k<9.5){ // atmospheric smoke
     f=clamp(f*.7+.3*sin(q.y*.8+sin(q.x+t*.16))*cos(q.x*.9),0.,1.);
     contour*=.12;
  }else if(k>9.5&&k<10.5){ // isometric topography
     float contourIso=abs(fract((q.x+q.y*.58+sin(q.y*1.8+t)*.12)*12.)-.5);
     micro+=(1.-smoothstep(.015,.08,contourIso))*.28;
     f=clamp(f+.12*sin((q.x-q.y)*9.),0.,1.);
  }else if(k>10.5&&k<11.5){ // vector drift 2000
     float vect=abs(sin(q.x*13.+sin(q.y*2.-t*.4)*3.));
     f=clamp(f+.16*vect-.08,0.,1.);
     micro+=pow(vect,19.)*.14;
  }else if(k>11.5&&k<12.5){ // engravings / lithograph
     float engraving=sin(q.x*24.+q.y*7.+sin(q.y*3.2+t)*2.);
     micro+=pow(max(0.,engraving),19.)*.26;
     f=clamp(f*.94+engraving*.055,0.,1.);
  }else if(k>12.5){ // GNARLY full-spectrum cycle
     float cut=sin((q.x+q.y)*16.+sin(q.y*4.+t)*2.);
     f=clamp(f+cut*.11,0.,1.);
     micro+=pow(max(0.,cut),13.)*.16;
  }
  // Crisp five-tone material: dark cavities / body / luminous ribs.
  float cell=floor(clamp(f,0.,.999)*5.0)/4.0;
  vec3 color=palette(cell);
  float line=1.-smoothstep(.014,.055,abs(fract(f*5.0)-.5));
  color=mix(color,u_dark,.38*contour+.22*line);
  float shine=pow(max(0.,sin(f*29.0+q.y*1.3)),22.0);
  color+=u_glow*(shine*.15+spec*.3+micro*.42);
  float grain=(hash21(gl_FragCoord.xy)-.5)*.025;
  color=clamp(color*(.91+.16*sin(q.x*2.6+q.y*3.2+t*.09))+grain,0.,1.);
  fragColor=vec4(color,1.0);
}`;
function hex(c){const n=Number.parseInt(c.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
function hsv(h,s,v){h=(h%1+1)%1;let i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]}
export function themeKind(name){if(name==='XEROX SERPENTINE')return 2;if(name==='PRISM CARMINE'||name==='PRISM')return 3;if(/JACQUARD|LENTICULAR|ORGANISM|STRATA/.test(name))return 4;return 1}
export function gnarlyProgress(time,duration){return duration>0?Math.min(1,Math.max(0,time/duration)):0}
export class FluidVisual{
 constructor(canvas){this.canvas=canvas;this.theme='ACID';this.experience='original';this.mode='FLUIDO';this.energy=0;this.songTime=0;this.songDuration=0;this.artworkHue=.58;this.start=performance.now();this.last=0;this.running=false;this.paused=false;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.gl=null;
  try{this.initGL()}catch(e){console.warn('GNARLY WebGL2 unavailable; Canvas fallback',e);this.gl=null;this.ctx=canvas.getContext('2d',{alpha:false});
    // Once a WebGL context is allocated, browsers may prohibit switching the
    // same canvas to 2D. Replace the surface so a shader compile failure does
    // not bring down playback or all GNARLY controls.
    if(!this.ctx){const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;this.canvas=replacement;this.ctx=canvas.getContext('2d',{alpha:false});}
  }
  if(!this.gl&&!this.ctx)throw Error('Nenhuma API gráfica disponível');
  this.resize=()=>{const r=canvas.getBoundingClientRect();if(this.gl){const target=Math.min(devicePixelRatio||1,2,Math.sqrt(2100000/Math.max(1,r.width*r.height)));canvas.width=Math.max(2,Math.floor(r.width*target));canvas.height=Math.max(2,Math.floor(r.height*target));this.gl.viewport(0,0,canvas.width,canvas.height)}else{canvas.width=Math.max(160,Math.round(r.width*.78));canvas.height=Math.max(200,Math.round(r.height*.78))}};
  this.resize();this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.gl=null});
  canvas.addEventListener('webglcontextrestored',()=>{this.initGL();this.resize()});
  this.draw=this.draw.bind(this);
 }
 initGL(){const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});if(!gl)throw Error('WebGL2 unavailable');const compile=(kind,code)=>{const sh=gl.createShader(kind);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh};const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);this.gl=gl;this.program=program;this.uniforms={};for(const n of ['resolution','time','energy','mode','kind','motion','dark','body','glow'])this.uniforms[n]=gl.getUniformLocation(program,'u_'+n);gl.bindVertexArray(gl.createVertexArray())}
 setTheme(name){if(PALETTES[name])this.theme=name}
 setExperience(id){this.experience=id}
 setReaction(name){this.mode=name}
 setEnergy(n){this.energy=Math.max(0,Math.min(1,n||0))}
 setSong(time,duration,hue){this.songTime=time||0;this.songDuration=duration||0;if(Number.isFinite(hue))this.artworkHue=hue}
 setPaused(v){this.paused=!!v}
 startLoop(){if(!this.running){this.running=true;requestAnimationFrame(this.draw)}}
 stopLoop(){this.running=false}
 colors(){if(!GNARLY_MODES.includes(this.theme))return PALETTES[this.theme].map(hex);
  const at=gnarlyProgress(this.songTime,this.songDuration),s=Math.min(1,Math.max(0,(at-.2)/.08)),blend=s*s*(3-2*s);
  const album=[hsv(this.artworkHue,.72,.09),hsv(this.artworkHue-.032,.83,.68),hsv(this.artworkHue+.032,.67,.98)];
  const palettes=[['#FFFFFF','#050507','#F28C28'],['#000000','#00D2E6','#FF1A1A'],['#0B0D11','#E87A1E','#D91414'],['#121214','#8E7CFF','#FFB340'],['#008B94','#F5A623','#EE4035'],['#050714','#6699CC','#F5F9FF'],['#040406','#FF0088','#00E5FF']];
  const interval=this.songTime/14,ix=Math.floor(interval)%palettes.length,t=interval-Math.floor(interval),smooth=t*t*(3-2*t);
  const curr=palettes[ix].map(hex),next=palettes[(ix+1)%palettes.length].map(hex);
  const cycle=curr.map((c,i)=>c.map((v,j)=>v*(1-smooth)+next[i][j]*smooth));
  return album.map((c,i)=>c.map((v,j)=>v*(1-blend)+cycle[i][j]*blend));
 }
 draw(now){if(!this.running)return;requestAnimationFrame(this.draw);if(document.hidden||this.paused||now-this.last<(this.reduced?120:32))return;this.last=now;const colors=this.colors(),elapsed=(now-this.start)/1000;
  if(this.gl){const g=this.gl,u=this.uniforms;g.useProgram(this.program);g.uniform2f(u.resolution,this.canvas.width,this.canvas.height);g.uniform1f(u.time,this.reduced?0:elapsed);g.uniform1f(u.energy,this.energy);g.uniform1f(u.mode,this.mode==='DESLIGADO'?0:this.mode==='FLUIDO'?1:2);const choice=resolveVisual(this.theme,this.experience,this.mode);
    const cycle=[2,3,6,8,10,11,12],kind=this.theme==='GNARLY'&&gnarlyProgress(this.songTime,this.songDuration)>.2?cycle[Math.floor(this.songTime/14)%cycle.length]:choice.kind;
    g.uniform1f(u.kind,kind);g.uniform1f(u.motion,choice.motion);g.uniform3fv(u.dark,colors[0]);g.uniform3fv(u.body,colors[1]);g.uniform3fv(u.glow,colors[2]);g.drawArrays(g.TRIANGLES,0,3);return}
  // Canvas fallback: correct author palettes + higher internal resolution than alpha1.
  const c=this.ctx,w=this.canvas.width,h=this.canvas.height,img=c.createImageData(w,h),d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=x/w*8,b=y/h*12,t=elapsed*.22;let f=(Math.sin(a+Math.sin(b*.65+t)*1.5)+Math.cos(b*.8-a*.42+t*.6)+2)/4;const idx=Math.min(2,Math.floor(Math.max(0,Math.min(.999,f))*3));let col=colors[idx],k=(y*w+x)*4;d[k]=col[0]*255;d[k+1]=col[1]*255;d[k+2]=col[2]*255;d[k+3]=255}c.putImageData(img,0,0)
 }
}
