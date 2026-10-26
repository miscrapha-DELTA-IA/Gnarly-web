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
float valueNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);
 vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
 return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),u.x),
            mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),u.x),u.y);
}
float fbm3(vec2 p){
 float v=0.,a=.5;
 for(int i=0;i<3;i++){v+=a*valueNoise(p);p=mat2(.8,.6,-.6,.8)*p*2.02+17.3;a*=.5;}
 return v;
}
float fbm4(vec2 p){
 float v=0.,a=.5;
 for(int i=0;i<4;i++){v+=a*valueNoise(p);p=mat2(.8,.6,-.6,.8)*p*2.02+17.3;a*=.5;}
 return v;
}
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
  // Stage72-derived distinct material families. Marble uses the iOS
  // double-fBM warp and quantized ten-level bands; other materials have
  // independent scalar geometry rather than a shared Cyber Night base.
  float k=u_kind;
  float f=0.,micro=0.,spec=0.,contour=0.;
  if(k<1.5){
    vec2 uv0=p*.56;
    float ang=exp(-.5*dot(uv0,uv0))*(1.1*sin(tm*.2)+.9);
    uv0=mat2(cos(ang),sin(ang),-sin(ang),cos(ang))*uv0;
    float slow=tm*.15*move;
    vec2 a=vec2(fbm3(uv0+vec2(0.,slow)),fbm3(uv0+vec2(5.2-slow,1.3)));
    vec2 b=vec2(fbm3(uv0+3.2*a+vec2(1.7+.6*slow,9.2)),
                fbm3(uv0+3.2*a+vec2(8.3,2.8-.5*slow)));
    f=clamp(fbm4(uv0+3.2*b)*1.5+b.x*.6+a.y*.25-.35,0.,1.);
    float band=fract(f*10.);
    float level=floor(f*10.);
    f=abs(fract(level/10.*1.5)*2.-1.);
    contour=1.-smoothstep(0.,.05,min(band,1.-band));
    spec=smoothstep(.90,.97,band)*(1.-smoothstep(.97,1.,band))*.35;
  }else if(k<2.5){
    vec2 x=q*vec2(10.,11.);
    vec2 cell=floor(x+vec2(mod(floor(x.y),2.)*.5,0.));
    vec2 local=fract(x+vec2(mod(floor(x.y),2.)*.5,0.))-.5;
    float tex=valueNoise(q*2.+t*.08);
    float radial=length(local*(1.+.24*tex));
    float scale=.18+.16*tex;
    float dotmask=1.-smoothstep(scale,scale+.055,radial);
    f=mix(.12,.83,dotmask);
    micro=dotmask*.24;
    contour=(1.-smoothstep(.08,.13,abs(radial-.26)))*.45;
  }else if(k<3.5){
    // Angular prisms and sharp caustic fractures, not smooth swirling marble.
    vec2 grid=q*3.6+vec2(t*.10,-t*.08);
    vec2 cell=floor(grid), local=fract(grid)-.5;
    float shard=abs(local.x+.55*local.y);
    float facets=hash21(cell);
    float ridge=1.-smoothstep(.015,.14,abs(shard-.24));
    f=clamp(.13+facets*.68+ridge*.22,0.,1.);
    spec=pow(ridge,5.)*.65;
    contour=(1.-smoothstep(.018,.09,abs(local.x-local.y)))*.4;
  }else if(k<4.5){
    float lent=sin(q.x*24.+sin(q.y*3.+t*.24)*2.1);
    float drift=fbm3(q*1.1+vec2(0.,t*.16));
    f=clamp(drift*.82+lent*.28+.12,0.,1.);
    micro=pow(max(0.,lent),12.)*.24;
    contour=.16*(1.-smoothstep(.08,.28,abs(lent)));
  }else if(k<5.5){
    // Chrome: oblique high-contrast metal reflection bands.
    float ridge=sin(q.y*11.+q.x*3.+1.8*fbm3(q*.8+vec2(0.,t*.2)));
    f=smoothstep(-.74,.68,ridge);
    spec=pow(max(0.,ridge),24.)*.7;
    contour=.12*(1.-smoothstep(.01,.07,abs(ridge)));
  }else if(k<6.5){
    // Glass: large lens cells / concentric refraction and caustic rims.
    vec2 lens=q+vec2(.3*sin(t*.18),.25*cos(t*.14));
    float r=length(lens+vec2(.4*fbm3(lens*1.4),-.4*fbm3(lens*1.6+5.2)));
    float wave=sin(r*9.-t*.6);
    f=smoothstep(-.8,.8,wave)*.68+.15;
    spec=pow(max(0.,wave),16.)*.44;
    contour=.05;
  }else if(k<7.5){
    // Neon Pulse: independent luminous conductors pulsing with energy.
    float stripes=sin(q.y*14.+sin(q.x*3.-t*.3)*3.);
    float conductor=pow(max(0.,stripes),18.);
    f=clamp(.10+.25*fbm3(q*1.4)+conductor*(.48+.25*u_energy),0.,1.);
    spec=conductor*(.28+.38*u_energy);
    contour=.06;
  }else if(k<8.5){
    // Organic: soft cellular membranes, never Cyber metallic contours.
    vec2 warped=q+vec2(fbm3(q*1.8+vec2(t*.2,0.)),fbm3(q*1.8+vec2(0.,-t*.18)))*1.5;
    vec2 cell=fract(warped*2.5)-.5;
    float membrane=abs(length(cell)-.37);
    f=clamp(.18+.6*fbm4(warped*.8)+.16*(1.-smoothstep(.02,.09,membrane)),0.,1.);
    contour=(1.-smoothstep(.01,.055,membrane))*.5;
  }else if(k<9.5){
    float fog=fbm4(q*.46+vec2(t*.05,-t*.04));
    float fog2=fbm3(q*.73+vec2(-t*.025,t*.06));
    f=smoothstep(.28,.80,.7*fog+.3*fog2);
    contour=0.;
    spec=0.;
  }else if(k<10.5){
    // Independent isometric elevation map and engineering contour lines.
    vec2 iso=vec2(q.x+q.y*.58,q.y*.8);
    float height=fbm4(iso*.88+vec2(t*.055,0.));
    float lines=abs(fract(height*19.)-.5);
    f=clamp(height*.94+.1,0.,1.);
    contour=(1.-smoothstep(.014,.055,lines))*.8;
  }else if(k<11.5){
    vec2 drift=q+vec2(t*.16,-t*.07);
    float stripes=sin(drift.x*14.+3.*sin(drift.y*2.));
    f=clamp(.45+.27*stripes+.13*fbm3(drift*1.2),0.,1.);
    micro=pow(max(0.,stripes),20.)*.35;
    contour=.07;
  }else if(k<12.5){
    float ink=fbm4(q*.92+vec2(t*.055,-t*.05));
    float etch=sin(q.x*30.+q.y*7.+ink*8.);
    f=clamp(.18+.70*ink+.07*etch,0.,1.);
    contour=(1.-smoothstep(.01,.09,abs(etch)))*.36;
  }else{
    float archive=fbm4(q*1.5+vec2(t*.08,0.));
    float fractal=sin((q.x+q.y)*16.+sin(q.y*4.+t)*2.);
    f=clamp(.17+.68*archive+.15*fractal,0.,1.);
    micro=pow(max(0.,fractal),12.)*.24;
    contour=.16;
  }
  // Crisp five-tone material: dark cavities / body / luminous ribs.
  float cell=floor(clamp(f,0.,.999)*5.0)/4.0;
  vec3 color=palette(cell);
  float line=1.-smoothstep(.014,.055,abs(fract(f*5.0)-.5));
  color=mix(color,u_dark,.58*contour+(k<1.5?.0:.10)*line);
  float shine=k<1.5?0.:pow(max(0.,sin(f*29.0+q.y*1.3)),22.0);
  color+=u_glow*(shine*.09+spec*.55+micro*.42);
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
