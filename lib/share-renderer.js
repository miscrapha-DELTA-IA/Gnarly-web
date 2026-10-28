import {FluidVisual} from './visual-engine.js';
import {shareFrame} from './share-model.js';
import {resolveLyricStyle,LYRIC_FONT_FAMILIES} from './lyric-style.js';
export async function readShareAsset(url,{signal,maxBytes=5*1024*1024}={}){
 const response=await fetch(url,{signal,mode:'cors',credentials:'omit'});
 if(response.status!==200)throw Error('O arquivo completo não está disponível para exportação.');
 if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('Arquivo acima do limite de memória da exportação.');}
 const parts=[];let size=0;const reader=response.body?.getReader();
 if(!reader){const bytes=await response.arrayBuffer();if(bytes.byteLength>maxBytes)throw Error('Arquivo muito grande.');return bytes}
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error('Arquivo acima do limite de memória da exportação.');parts.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}
 const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length}return all.buffer;
}
async function image(url,{signal}={}){
 if(!url)return null;let objectURL;const controller=new AbortController(),cancel=()=>controller.abort();
 if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,8000);
 try{
  const bytes=await readShareAsset(url,{signal:controller.signal});const blob=new Blob([bytes]);
  if(globalThis.createImageBitmap)return await createImageBitmap(blob,{resizeWidth:1000,resizeQuality:'high'});
  objectURL=URL.createObjectURL(blob);const img=new Image();img.src=objectURL;await img.decode();return img;
 }catch{return null}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(objectURL)URL.revokeObjectURL(objectURL)}
}
function cover(ctx,img,x,y,w,h){if(!img)return;const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale;ctx.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h)}
function lines(ctx,text,x,y,width,size,{max=3,line=1.2}={}){
 const words=String(text).split(/\s+/);let row='',i=0;
 for(const word of words){const next=row?row+' '+word:word;if(ctx.measureText(next).width>width&&row){ctx.fillText(row,x,y+i*size*line);row=word;i++;if(i>=max-1)break}else row=next}
 if(i<max)ctx.fillText(row,x,y+i*size*line,width);return (i+1)*size*line;
}
export async function createShareRenderer(request,profile,{signal}={}){
 if(signal?.aborted)throw new DOMException('Prévia cancelada.','AbortError');
 const artTask=image(request.artwork,{signal}),backgroundURL=request.backgroundMode!=='visual'?request.background||request.artwork:null;
 const [art,background]=await Promise.all([artTask,backgroundURL===request.artwork?artTask:image(backgroundURL,{signal})]);
 if(signal?.aborted){art?.close?.();background?.close?.();throw new DOMException('Prévia cancelada.','AbortError')}
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:540px;height:960px;pointer-events:none';
 const surface=document.createElement('canvas');surface.style.cssText='width:540px;height:960px';host.append(surface);document.body.append(host);
 let visual;
 try{
  visual=new FluidVisual(surface);visual.observer.disconnect();Object.assign(visual,request.visual);const width=profile.quality==='high'?270:profile.quality==='balanced'?216:162,height=Math.round(width*16/9);visual.canvas.width=width;visual.canvas.height=height;visual.gl?.viewport(0,0,width,height);
 }catch(error){host.remove();art?.close?.();background?.close?.();throw error}
 const scene=document.createElement('canvas');scene.width=540;scene.height=960;const ctx=scene.getContext('2d',{willReadFrequently:true,alpha:false});
 const canvas=document.createElement('canvas');canvas.width=profile.width;canvas.height=profile.height;const output=canvas.getContext('2d',{willReadFrequently:true,alpha:false});
 function draw(elapsed=0){
  const frame=shareFrame(request,profile,elapsed);visual.setSong(frame.sourceTime,request.sourceDuration,request.visual.artworkHue||.58);
  visual.renderFrame((request.visual.phase||0)+frame.elapsed*(request.mode==='lyrics'?.8:.6));ctx.clearRect(0,0,540,960);
  if(background)cover(ctx,background,0,0,540,960);else ctx.drawImage(visual.canvas,0,0,540,960);
  ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(0,0,540,960);
  const shade=ctx.createLinearGradient(0,250,0,960);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.9)');ctx.fillStyle=shade;ctx.fillRect(0,0,540,960);
  ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='900 24px sans-serif';ctx.fillText('GNARLY',42,72);ctx.font='600 12px sans-serif';ctx.textAlign='right';ctx.fillText(request.visual.theme||'ACID',498,70,225);
  if(request.mode==='player'){
   ctx.save();ctx.beginPath();ctx.roundRect(60,205,420,420,26);ctx.clip();if(art)cover(ctx,art,60,205,420,420);else{ctx.fillStyle='#112b20';ctx.fillRect(60,205,420,420);ctx.fillStyle='#ceefaa';ctx.font='100px sans-serif';ctx.textAlign='center';ctx.fillText('♫',270,450)}ctx.restore();
   ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='800 34px '+(request.style==='Máquina'?'monospace':request.style==='Cinema'?'Georgia':'sans-serif');const used=lines(ctx,request.title,270,690,450,34);ctx.fillStyle='#e6e6e6';ctx.font='20px sans-serif';lines(ctx,request.artist,270,700+used,445,20,{max:2});
   ctx.fillStyle='#ffffff40';ctx.fillRect(60,845,420,4);ctx.fillStyle='#d0f5a5';ctx.fillRect(60,845,420*Math.min(1,frame.sourceTime/Math.max(1,request.sourceDuration)),4);
  }else{
   const style=resolveLyricStyle(request.lyricStyle),families=LYRIC_FONT_FAMILIES[style.family]||'sans-serif';
   const size=44*(style.size||1);ctx.font=`${style.weight||700} ${size}px ${families}`;ctx.textAlign='center';ctx.fillStyle=request.style==='Mono'?'#fff':'#e2fac9';
   if(['neon','Neon'].includes(style.treatment)||request.style==='Neon'){ctx.shadowColor='#bfff5f';ctx.shadowBlur=15}
   const text=frame.line?.text||'♪';lines(ctx,style.transform==='uppercase'?text.toUpperCase():text,270,440,448,size,{max:6,line:1.24});ctx.shadowBlur=0;
   ctx.fillStyle='#fff';ctx.font='700 21px sans-serif';lines(ctx,request.title,270,790,450,21,{max:2});ctx.font='16px sans-serif';ctx.fillText(request.artist,270,850,440);
  }
  ctx.fillStyle='#d5e3cb';ctx.textAlign='center';ctx.font='600 12px sans-serif';ctx.fillText('SEU SOM. SEU UNIVERSO.',270,918);
  const fit=profile.crop==='crop'?Math.max(profile.width/540,profile.height/960):Math.min(profile.width/540,profile.height/960),w=540*fit,h=960*fit;
  output.fillStyle=profile.crop==='fit'?'#000':'#0b1c12';output.fillRect(0,0,canvas.width,canvas.height);output.drawImage(scene,(canvas.width-w)/2,(canvas.height-h)/2,w,h);return frame;
 }
 draw();
 return {canvas,draw,destroy(){visual.stopLoop();visual.observer.disconnect();visual.gl?.getExtension('WEBGL_lose_context')?.loseContext();host.remove();art?.close?.();background?.close?.();canvas.width=canvas.height=scene.width=scene.height=1}};
}
export const canvasBlob=(canvas,type='image/png')=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.size?resolve(blob):reject(Error('Não foi possível gerar a imagem.')),type,.91));
