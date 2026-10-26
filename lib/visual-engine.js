import {resolveVisual,GNARLY_MODES,CREATIVE_LOOKS,CREATIVE_PALETTES,EXPERIENCE_MATERIALS,NATIVE_COLOR_STOPS,CREATIVE_COLOR_THEMES} from './visual-selection.js';
import {gnarly2Director,compositionStrength} from './gnarly2-director.js';
import {classicFragment,creativeFragment} from './metal-shader-port.js';
import {textureFragment} from './texture-shader.js';
import {finishedShader,improveCreativeEdges} from './visual-finish.js';
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
 'XEROX SERPENTINE':['#0d0d0e','#f2f0e6','#f7ee18'],
 'PRISM CARMINE':['#38000c','#ff0d38','#79e5f2'],
 'SUBATOMIC BUBBLE':['#0a2246','#f5b82e','#3895d3'],
 'JACQUARD SIGNAL':['#0f0814','#b5944b','#521296'],
 'ISOMETRIC CHASM':['#020208','#0a19d6','#ffffff'],
 'LENTICULAR WILD':['#0a0909','#cf9b48','#f4eedf'],
 'GNARLY STRATA':['#141820','#0a19d6','#d1a960'],
 'GNARLY COMPILER':['#030609','#68ecea','#f5b82e'],
 'GNARLY ORGANISM':['#080608','#ff6ba5','#62c3d0'],
 'GNARLY 2':['#060d17','#3b88bb','#ff65a9'],
 // Seven exact five-stop Native VisualMaterialCatalog combinations; three
 // representative stops are used as a portable theme palette. The original
 // five authored stops remain unmodified in NATIVE_COLOR_STOPS.
 ...Object.fromEntries(Object.entries(NATIVE_COLOR_STOPS).map(([name,stops])=>[
  name,name==='AGATE ZEBRA COLORS'?[stops[1],stops[2],stops[3]]:
   [stops[0],stops[2],stops[3]]
 ])),
 // Six additional CreativeUniverse authored palettes previously trapped
 // inside the selected experience, now available with any surface/movement.
 ...Object.fromEntries(CREATIVE_COLOR_THEMES.map((name,index)=>[name,CREATIVE_PALETTES[index+7]]))
});
const vertex=`#version 300 es
precision highp float;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
function hex(c){const n=Number.parseInt(c.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
function hsv(h,s,v){h=(h%1+1)%1;let i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]}
/** Map five-stop material luminance to a selected theme's three chromatic
 * stops. Maintains authored relief while avoiding forced colors on Crimson.
 */
export function themedMaterialStops(authored,colors){
 const stops=(authored||[]).map(hex);
 if(stops.length!==5)return [...colors,colors[1],colors[2]].flat();
 const lum=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
 const values=stops.map(lum),lowest=Math.min(...values),highest=Math.max(...values);
 return stops.flatMap((c,i)=>{
  const position=Math.max(0,Math.min(1,(values[i]-lowest)/Math.max(.01,highest-lowest)));
  const low=position<.52?colors[0]:colors[1],high=position<.52?colors[1]:colors[2];
  const amount=position<.52?position/.52:(position-.52)/.48;
  return low.map((v,k)=>v*(1-amount)+high[k]*amount);
 });
}
export function themeKind(name){if(name==='XEROX SERPENTINE')return 2;if(name==='PRISM CARMINE'||name==='PRISM')return 3;if(/JACQUARD|LENTICULAR|ORGANISM|STRATA/.test(name))return 4;return 1}
export function gnarlyProgress(time,duration){return duration>0?Math.min(1,Math.max(0,time/duration)):0}
export class FluidVisual{
 constructor(canvas){this.canvas=canvas;this.theme='ACID';this.experience='original';this.mode='FLUIDO';this.energy=0;this.spectrum={bass:0,mid:0,treble:0,beat:0,energy:0};this.songTime=0;this.songDuration=0;this.artworkHue=.58;this.accentTheme='ACID';this.gnarly2ColorLock=false;this.gnarly2ExperienceLock=false;this.start=performance.now();this.last=0;this.nextFrameAt=0;this.running=false;this.paused=false;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.gl=null;this.renderScale=1;this.activePixelRatio=1;this.pixelBudget=0;this.slowWindows=0;this.stableWindows=0;this.windowFrames=0;this.windowSlow=0;this.lastQualityChange=0;this.fallbackFrame=null;
  try{this.initGL()}catch(e){console.warn('GNARLY WebGL2 unavailable; Canvas fallback',e);this.gl=null;this.ctx=canvas.getContext('2d',{alpha:false});
    // Once a WebGL context is allocated, browsers may prohibit switching the
    // same canvas to 2D. Replace the surface so a shader compile failure does
    // not bring down playback or all GNARLY controls.
    if(!this.ctx){const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;this.canvas=replacement;this.ctx=canvas.getContext('2d',{alpha:false});}
  }
  if(!this.gl&&!this.ctx)throw Error('Nenhuma API gráfica disponível');
  this.resize=()=>{const box=canvas.getBoundingClientRect();
   if(box.width<=0||box.height<=0)return;
   const cssWidth=box.width,cssHeight=box.height;
   if(this.gl){
     const nativeDpr=Math.min(3,Math.max(1,window.devicePixelRatio||1));
     const desktop=matchMedia('(min-width:900px) and (pointer:fine)').matches;
     // 4K-capable desktop targets up to 8 MP; mobile targets up to 5 MP.
     // The live governor only lowers resolution after sustained missed frames.
     const pixelBudget=desktop?8300000:5000000;
     const maxSide=this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE)||8192;
     const ratio=Math.max(.5,Math.min(nativeDpr,Math.sqrt(pixelBudget/Math.max(1,cssWidth*cssHeight)),maxSide/cssWidth,maxSide/cssHeight))*this.renderScale;
     const width=Math.max(2,Math.round(cssWidth*ratio)),height=Math.max(2,Math.round(cssHeight*ratio));
     if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;this.gl.viewport(0,0,width,height);}
     this.activePixelRatio=ratio;this.pixelBudget=pixelBudget;
   }else{
     const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
     const budget=950000;
     const ratio=Math.min(dpr,Math.sqrt(budget/Math.max(1,cssWidth*cssHeight)))*this.renderScale;
     const width=Math.max(2,Math.round(cssWidth*ratio)),height=Math.max(2,Math.round(cssHeight*ratio));
     if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;this.fallbackFrame=null;}
     this.activePixelRatio=ratio;
   }};
  this.resize();this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.gl=null});
  canvas.addEventListener('webglcontextrestored',()=>{this.initGL();this.resize()});
  this.draw=this.draw.bind(this);
 }
 initGL(){
 const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
 if(!gl)throw Error('WebGL2 unavailable');
 const compile=(kind,code)=>{const sh=gl.createShader(kind);gl.shaderSource(sh,code);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh};
 const vert=compile(gl.VERTEX_SHADER,vertex);
 const programFor=fragment=>{const program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));return program};
 this.classicProgram=programFor(finishedShader(classicFragment));
 this.creativeProgram=programFor(finishedShader(improveCreativeEdges(creativeFragment)));
 this.textureProgram=programFor(finishedShader(textureFragment));
 this.gl=gl;this.uniformSets=new Map();
 const names=['resolution','time','energy','low','mid','high','beat','progress','seed','dark','body','glow','material','controls','textureA','textureB','textureC','distortion','pulse','pulseWarp','pulseGlow','quality','look','family','stops[0]'];
 for(const program of [this.classicProgram,this.creativeProgram,this.textureProgram]){
  const uniforms={};for(const n of names)uniforms[n.replace('[0]','')]=gl.getUniformLocation(program,'u_'+n);
  this.uniformSets.set(program,uniforms);
 }
 gl.bindVertexArray(gl.createVertexArray());
}
 setTheme(name){if(PALETTES[name])this.theme=name}
 setAccentTheme(name){if(PALETTES[name]&&!GNARLY_MODES.includes(name))this.accentTheme=name}
 setGnarly2Locks({colors=false,experience=false}={}){this.gnarly2ColorLock=!!colors;this.gnarly2ExperienceLock=!!experience}
 setExperience(id){this.experience=id}
 setReaction(name){this.mode=name}
 setEnergy(n){this.energy=Math.max(0,Math.min(1,n||0));this.spectrum.energy=this.energy}
 setSpectrum(levels){this.spectrum=levels||this.spectrum;this.energy=this.spectrum.energy||0}
 setSong(time,duration,hue){this.songTime=time||0;this.songDuration=duration||0;if(Number.isFinite(hue))this.artworkHue=hue}
 setPaused(v){this.paused=!!v}
 // Adjust physical resolution only on sustained load, never for one late frame.
 // WebGL programs and GPU materials remain alive across viewport resizes.
 noteFramePacing(delta,now){
  if(!this.gl||!Number.isFinite(delta)||delta>250||delta<0)return;
  this.windowFrames++;
  if(delta>38)this.windowSlow++;
  if(this.windowFrames<80)return;
  const struggling=this.windowSlow/this.windowFrames>.32;
  const healthy=this.windowSlow/this.windowFrames<.055;
  this.windowFrames=0;this.windowSlow=0;
  this.slowWindows=struggling?this.slowWindows+1:0;
  this.stableWindows=healthy?this.stableWindows+1:0;
  if(now-this.lastQualityChange<8000)return;
  if(this.slowWindows>=2&&this.renderScale>.66){
   this.renderScale=Math.max(.65,Math.round((this.renderScale-.12)*100)/100);
   this.slowWindows=0;this.stableWindows=0;this.lastQualityChange=now;this.resize();
  }else if(this.stableWindows>=5&&this.renderScale<1){
   this.renderScale=Math.min(1,Math.round((this.renderScale+.08)*100)/100);
   this.slowWindows=0;this.stableWindows=0;this.lastQualityChange=now;this.resize();
  }
 }
 startLoop(){if(!this.running){this.running=true;requestAnimationFrame(this.draw)}}
 stopLoop(){this.running=false}
 colors(){if(!GNARLY_MODES.includes(this.theme))return (PALETTES[this.theme]||PALETTES.ACID).map(hex);
  const at=gnarlyProgress(this.songTime,this.songDuration),s=Math.min(1,Math.max(0,(at-.2)/.08)),blend=s*s*(3-2*s);
  const album=[hsv(this.artworkHue,.72,.09),hsv(this.artworkHue-.032,.83,.68),hsv(this.artworkHue+.032,.67,.98)];
  const palettes=[['#FFFFFF','#050507','#F28C28'],['#000000','#00D2E6','#FF1A1A'],['#0B0D11','#E87A1E','#D91414'],['#121214','#8E7CFF','#FFB340'],['#008B94','#F5A623','#EE4035'],['#050714','#6699CC','#F5F9FF'],['#040406','#FF0088','#00E5FF']];
  const interval=this.songTime/14,ix=Math.floor(interval)%palettes.length,t=interval-Math.floor(interval),smooth=t*t*(3-2*t);
  const curr=palettes[ix].map(hex),next=palettes[(ix+1)%palettes.length].map(hex);
  const cycle=curr.map((c,i)=>c.map((v,j)=>v*(1-smooth)+next[i][j]*smooth));
  const accented=(PALETTES[this.accentTheme]||PALETTES.ACID).map(hex);
  // Familiar GNARLY style stays 84% unchanged; palette selected immediately
  // before GNARLY can gently tint it instead of being completely ignored.
  return album.map((c,i)=>c.map((v,j)=>{
   const base=v*(1-blend)+cycle[i][j]*blend;
   return base*.84+accented[i][j]*.16;
  }));
 }
 paletteForScene(scene,colors,{force=false}={}){
  const look=scene.look??0;if(!look)return colors;
  const authored=CREATIVE_PALETTES[look]?.map(hex)||colors;
  if(force)return authored.map((rgb,i)=>rgb.map((v,k)=>v*.28+colors[i][k]*.72));
  if(look>=7&&look<=12)return colors;
  if(look>=13){
   const progress=gnarlyProgress(this.songTime,this.songDuration);
   const t=Math.max(0,Math.min(1,(progress-.2)/.08)),mix=t*t*(3-2*t),h=this.artworkHue;
   const cover=[hsv(h,.65,.06),hsv(h+.025,.82,.78),hsv(h-.025,.47,.94)];
   const accent=(PALETTES[this.accentTheme]||PALETTES.ACID).map(hex);
   return authored.map((c,i)=>c.map((v,k)=>(v*mix+cover[i][k]*(1-mix))*.84+accent[i][k]*.16));
  }
  // Original material-palette fidelity untouched. Secondary experience will
  // use the same selected chromatic family without resetting the author palette.
  return authored;
 }
 gnarly2SceneColors(recipe,stageIndex,progress){
  const colors=(PALETTES[recipe.paletteTheme]||PALETTES.ACID).map(hex);
  if(stageIndex!==0)return colors;
  const h=this.artworkHue;
  const album=[hsv(h,.70,.10),hsv(h-.03,.78,.66),hsv(h+.03,.58,.94)];
  const t=Math.min(.38,Math.max(0,progress)*.38);
  return album.map((c,i)=>c.map((v,k)=>v*(1-t)+colors[i][k]*t));
 }
 drawGLScene(scene,palette,elapsed,levels,opacity=1){
  const g=this.gl,look=scene.look??0,texture=scene.texture??0;
  const program=texture?this.textureProgram:(look?this.creativeProgram:this.classicProgram);
  const u=this.uniformSets.get(program);
  if(opacity>=.999)g.disable(g.BLEND);
  else{g.enable(g.BLEND);g.blendColor(0,0,0,opacity);g.blendFunc(g.CONSTANT_ALPHA,g.ONE_MINUS_CONSTANT_ALPHA)}
  g.useProgram(program);g.uniform2f(u.resolution,this.canvas.width,this.canvas.height);
  g.uniform1f(u.time,elapsed);
  g.uniform1f(u.energy,levels.energy);g.uniform1f(u.low,levels.low);
  g.uniform1f(u.mid,levels.mid);g.uniform1f(u.high,levels.high);g.uniform1f(u.beat,levels.beat);
  g.uniform1f(u.progress,levels.progress);
  g.uniform1f(u.seed,look*129.71+7.0);
  g.uniform3fv(u.dark,palette[0]);g.uniform3fv(u.body,palette[1]);g.uniform3fv(u.glow,palette[2]);
  g.uniform1f(u.quality,1.0);
  if(texture)g.uniform1f(u.family,texture);
  else if(look)g.uniform1f(u.look,look);
  else{
   const preset=EXPERIENCE_MATERIALS[scene.experience]||EXPERIENCE_MATERIALS.original;
   const type=preset.type==='procedural'?1:preset.type==='textured'?2:0;
   g.uniform1f(u.material,type);
   g.uniform4fv(u.controls,preset.controls||[0,0,0,0]);
   g.uniform4fv(u.textureA,preset.textureA||[0,0,0,0]);
   g.uniform4fv(u.textureB,preset.textureB||[0,0,0,0]);
   g.uniform4fv(u.textureC,[preset.shaderKind||0,...(preset.textureC||[0,0,0])]);
   g.uniform1f(u.distortion,(preset.distortion||0)+levels.low*.16);
   g.uniform1f(u.pulse,levels.beat*(preset.pulse??.4));
   g.uniform1f(u.pulseWarp,preset.pulseWarp??.18);
   g.uniform1f(u.pulseGlow,preset.pulseGlow??.1);
   g.uniform3fv(u.stops,themedMaterialStops(preset.palette,palette));
  }
  g.drawArrays(g.TRIANGLES,0,3);
 }
 draw(now){if(!this.running)return;requestAnimationFrame(this.draw);
  if(document.hidden||this.paused)return;
  // 60Hz, 90Hz, 120Hz and 144Hz screens share a 60fps target. A frame
  // deadline is used instead of skipping every other 90Hz requestAnimationFrame.
  const period=this.reduced?1000/12:1000/60;
  if(!this.nextFrameAt)this.nextFrameAt=now;
  if(now+.8<this.nextFrameAt)return;
  const frameDelta=this.last?now-this.last:period;
  this.last=now;
  this.nextFrameAt=Math.max(now-period,this.nextFrameAt)+period;
  this.noteFramePacing(frameDelta,now);
  const elapsed=(now-this.start)/1000;
  const choice=resolveVisual(this.theme,this.experience,this.mode),s=this.spectrum;
  const active=this.mode!=='DESLIGADO',gain=this.mode==='REATIVO'?1.0:0.53;
  const low=active?Math.min(1,s.bass*gain):0,mid=active?Math.min(1,s.mid*gain):0,high=active?Math.min(1,s.treble*gain):0;
  const beat=active?Math.min(1,s.beat*gain):0;
  const progress=gnarlyProgress(this.songTime,this.songDuration);
  const colors=this.colors();
  const look=choice.look??0,texture=choice.texture??0;
  let palette=this.paletteForScene(choice,colors);
  if(this.gl){
   const levels={low,mid,high,beat,energy:active?this.energy*gain:0,
    progress:this.songDuration>0?progress:Math.min(1,this.songTime/180)};
   if(this.theme==='GNARLY 2'){
    const choreography=gnarly2Director({time:this.songTime,duration:this.songDuration,
     artworkHue:this.artworkHue,anchorTheme:this.accentTheme,experience:this.experience,
     lockColors:this.gnarly2ColorLock,lockExperience:this.gnarly2ExperienceLock});
    const current=choreography.current,next=choreography.next;
    const baseColors=this.gnarly2SceneColors(current,choreography.index,choreography.phaseProgress);
    const primary=this.paletteForScene(current.visual,baseColors,{force:true});
    this.drawGLScene(current.visual,primary,elapsed,levels);
    if(choreography.transition>.001 && !this.reduced && this.renderScale>=.67){
     const nextColors=this.gnarly2SceneColors(next,choreography.index+1,0);
     this.drawGLScene(next.visual,this.paletteForScene(next.visual,nextColors,{force:true}),
      elapsed,levels,choreography.transition);
    }else{
     const alpha=compositionStrength(current.visual,{reducedMotion:this.reduced,renderScale:this.renderScale});
     if(alpha>0)this.drawGLScene(current.visual.secondary,
      this.paletteForScene(current.visual.secondary,baseColors,{force:true}),elapsed,levels,alpha);
    }
   }else{
    this.drawGLScene(choice,palette,elapsed,levels);
    const alpha=compositionStrength(choice,{reducedMotion:this.reduced,renderScale:this.renderScale});
    if(alpha>0)this.drawGLScene(choice.secondary,
      this.paletteForScene(choice.secondary,colors,{force:true}),elapsed,levels,alpha);
   }
   this.gl.disable(this.gl.BLEND);return;
  }
  if(this.theme==='GNARLY 2'){
   const dance=gnarly2Director({time:this.songTime,duration:this.songDuration,
    artworkHue:this.artworkHue,anchorTheme:this.accentTheme,experience:this.experience,
    lockColors:this.gnarly2ColorLock,lockExperience:this.gnarly2ExperienceLock});
   palette=this.gnarly2SceneColors(dance.current,dance.index,dance.phaseProgress);
  }
  // CPU Canvas fallback is intentionally lower fidelity when WebGL2 is unavailable.
  const legacyColors=palette;
  // Canvas fallback: correct author palettes + higher internal resolution than alpha1.
  const c=this.ctx,w=this.canvas.width,h=this.canvas.height,img=this.fallbackFrame&&(this.fallbackFrame.width===w&&this.fallbackFrame.height===h)?this.fallbackFrame:(this.fallbackFrame=c.createImageData(w,h)),d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=x/w*8,b=y/h*12,t=elapsed*.22;let f=(Math.sin(a+Math.sin(b*.65+t)*1.5)+Math.cos(b*.8-a*.42+t*.6)+2)/4;const idx=Math.min(2,Math.floor(Math.max(0,Math.min(.999,f))*3));let col=legacyColors[idx],k=(y*w+x)*4;d[k]=col[0]*255;d[k+1]=col[1]*255;d[k+2]=col[2]*255;d[k+3]=255}c.putImageData(img,0,0)
 }
}
