/** Gesture enhancement for the ONE existing device and native media clock. */
import {seekWindow,clampSeek,angularDelta,rotationSeconds,timeText} from '../lib/ipod-seek.js';
export function createIPodTransport({device,audio,onSeek,getTrack=()=>null,isVisible=()=>!device.hidden,holdMs=450,idleMs=8000}={}){
 const $=selector=>device.querySelector(selector),wheel=$('.ipod-wheel'),center=$('#ipod-center-button');
 const slider=$('#ipod-seek-slider'),elapsed=$('#ipod-screen-elapsed'),duration=$('#ipod-screen-duration'),fill=$('#ipod-screen-progress'),status=$('#ipod-seek-status');
 let active=false,holding=null,gesture=null,preview=null,pending=null,writeTimer=0,holdTimer=0,idleTimer=0;
 let remaining=false,identity=getTrack(),skipClickUntil=0,lastWrite=-Infinity,direction=0,deltaTotal=0,notice='';
 const listeners=[];
 const listen=(el,event,fn,options)=>{el.addEventListener(event,fn,options);listeners.push(()=>el.removeEventListener(event,fn,options))};
 function armIdle(){clearTimeout(idleTimer);if(active)idleTimer=setTimeout(()=>exit(),idleMs)}
 function render(){
  const window=seekWindow(audio),position=preview??(Number(audio.currentTime)||0),total=Number.isFinite(audio.duration)?audio.duration:0;
  slider.disabled=!window;slider.max=String(window?.max||1);slider.min=String(window?.min||0);
  slider.value=String(window?Math.min(window.max,Math.max(window.min,position)):0);
  slider.setAttribute('aria-valuetext',window?`${timeText(position)} de ${timeText(total)}`:'Navegação indisponível');

  elapsed.textContent=timeText(position);duration.textContent=(remaining?'−':'')+timeText(remaining?total-position:total);
  duration.setAttribute('aria-label',remaining?'Mostrar duração total':'Mostrar tempo restante');duration.setAttribute('aria-pressed',String(remaining));
  fill.style.width=(total?Math.max(0,Math.min(100,position/total*100)):0)+'%';
  device.dataset.scrubbing=String(active);device.dataset.seekDirection=direction>0?'forward':direction<0?'backward':'';
  center.setAttribute('aria-describedby','ipod-seek-help');
  center.setAttribute('aria-label',active?'Confirmar posição':audio.paused?'Reproduzir':'Pausar');
  if(active||notice){status.hidden=false;const text=active?'NAVEGAR · GIRE A RODA':notice;if(status.textContent!==text)status.textContent=text;$('#ipod-seek-delta').textContent=active?(direction>0?'› ':direction<0?'‹ ':'')+(deltaTotal>=0?'+':'−')+timeText(Math.abs(deltaTotal)):'';}
  else{status.hidden=true;$('#ipod-seek-delta').textContent=''}
 }
 function flush(){
  clearTimeout(writeTimer);writeTimer=0;
  if(pending===null)return;
  const position=clampSeek(pending,seekWindow(audio));pending=null;
  if(position!==null){lastWrite=performance.now();onSeek(position)}
 }
 function seek(seconds,{immediate=false}={}){
  const target=clampSeek(seconds,seekWindow(audio));if(target===null)return false;
  preview=target;pending=target;render();armIdle();
  if(immediate||performance.now()-lastWrite>=120)flush();
  else if(!writeTimer)writeTimer=setTimeout(flush,120-(performance.now()-lastWrite));
  return true;
 }
 function release(){
  const id=gesture?.id;gesture=null;
  try{if(id!==undefined&&wheel.hasPointerCapture(id))wheel.releasePointerCapture(id)}catch{}
 }
 function clearHold(){clearTimeout(holdTimer);holdTimer=0;holding=null}
 function exit({commit=true}={}){
  clearHold();if(commit)flush();else{clearTimeout(writeTimer);writeTimer=0;pending=null}
  active=false;notice='';release();preview=null;direction=0;deltaTotal=0;clearTimeout(idleTimer);render();
 }
 function activate(){
  if(!isVisible())return false;
  if(!seekWindow(audio)){notice='Navegação indisponível';render();clearTimeout(idleTimer);idleTimer=setTimeout(()=>{notice='';render()},2000);return false}
  notice='';
  active=true;preview=Number(audio.currentTime)||0;deltaTotal=0;direction=0;armIdle();render();return true;
 }
 function sync(){
  const next=getTrack();if(identity!==next){identity=next;exit({commit:false});return}
  if((active&&(!isVisible()||!seekWindow(audio)))||(holding&&!isVisible())){exit({commit:false});return}
  if(!gesture&&pending===null)preview=null;
  render();
 }
 function point(event){const r=wheel.getBoundingClientRect(),x=event.clientX-r.left-r.width/2,y=event.clientY-r.top-r.height/2;return {angle:Math.atan2(y,x),radius:Math.hypot(x,y)/r.width}}
 function capture(event){try{wheel.setPointerCapture(event.pointerId)}catch{}}
 listen(device,'pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false||!event.target.closest('.ipod-wheel')||!isVisible())return;
  if(active){
   event.preventDefault();armIdle();const p=point(event);
   gesture={id:event.pointerId,angle:p.radius>.27?p.angle:null,time:performance.now(),sum:0,moved:false,button:event.target.closest('button')?.id};capture(event);
  }else if(event.target.closest('#ipod-center-button')){
   holding={id:event.pointerId,x:event.clientX,y:event.clientY};
   holdTimer=setTimeout(()=>{if(holding){skipClickUntil=Infinity;activate()}holding=null},holdMs);
  }
 },true);
 listen(device,'pointermove',event=>{
  if(holding?.id===event.pointerId&&Math.hypot(event.clientX-holding.x,event.clientY-holding.y)>8)clearHold();
  if(!active||gesture?.id!==event.pointerId)return;
  event.preventDefault();const p=point(event),now=performance.now();
  if(p.radius<.27||p.radius>1){gesture.angle=null;gesture.sum=0;return}
  if(gesture.angle===null){gesture.angle=p.angle;gesture.time=now;return}
  const delta=angularDelta(gesture.angle,p.angle),dt=now-gesture.time;gesture.angle=p.angle;gesture.time=now;
  // Reject a discontinuous jump; require ~2 degrees before each update.
  if(Math.abs(delta)>Math.PI/2){gesture.sum=0;return}
  gesture.sum+=delta;if(Math.abs(gesture.sum)<.035)return;
  const seconds=rotationSeconds(gesture.sum,dt);gesture.sum=0;
  const before=preview??audio.currentTime;
  if(seek(before+seconds)){direction=Math.sign(seconds);deltaTotal+=preview-before;gesture.moved=true;render()}
 },{passive:false});
 function endPointer(event,canceled=false){
  if(holding?.id===event.pointerId){if(canceled)skipClickUntil=performance.now()+500;clearHold()}
  if(gesture?.id!==event.pointerId)return;
  if(canceled){clearTimeout(writeTimer);writeTimer=0;pending=null;preview=null}else flush();
  const confirm=!canceled&&!gesture.moved&&['ipod-center-button','ipod-menu-button'].includes(gesture.button);
  if(gesture.moved||confirm)skipClickUntil=performance.now()+500;
  release();if(confirm)exit();else{render();armIdle()}
 }
 listen(device,'pointerup',e=>endPointer(e));listen(device,'pointercancel',e=>endPointer(e,true));
 listen(wheel,'lostpointercapture',event=>{if(gesture?.id===event.pointerId)endPointer(event,true)});
 // Release/cancel outside the center must clear its long-press timer too.
 listen(window,'pointerup',e=>{if(holding?.id===e.pointerId)clearHold();if(skipClickUntil===Infinity)skipClickUntil=performance.now()+500});
 listen(window,'pointercancel',e=>{if(holding?.id===e.pointerId)clearHold();if(skipClickUntil===Infinity)skipClickUntil=performance.now()+500});
 listen(device,'click',event=>{
  const button=event.target.closest('.ipod-wheel button');if(!button)return;
  if(performance.now()<skipClickUntil){skipClickUntil=0;event.preventDefault();event.stopImmediatePropagation();return}
  if(active){event.preventDefault();event.stopImmediatePropagation();if(button===center||button.id==='ipod-menu-button')exit();else armIdle()}
 },true);
 listen(device,'keydown',event=>{
  if(event.target===slider){event.stopPropagation();return}
  if(event.target!==center&&!active)return;
  if(event.key==='Escape'&&active){event.preventDefault();event.stopPropagation();exit();return}
  if(event.target===center&&[' ','Enter'].includes(event.key)){
   event.stopPropagation();if(event.repeat){event.preventDefault();return}
   if(active){event.preventDefault();skipClickUntil=performance.now()+500;exit();return}
   if(event.key===' '){clearHold();holdTimer=setTimeout(()=>{skipClickUntil=Infinity;activate()},holdMs)}
  }
  if(active&&['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){
   event.preventDefault();event.stopPropagation();const w=seekWindow(audio);if(!w)return;
   const step=event.shiftKey?1:5,sign=['ArrowLeft','ArrowDown','PageDown'].includes(event.key)?-1:1;
   seek(event.key==='Home'?w.min:event.key==='End'?w.max:(preview??audio.currentTime)+sign*(event.key.startsWith('Page')?15:step),{immediate:true});
  }
 },true);
 listen(center,'keyup',event=>{if(event.key===' '){clearTimeout(holdTimer);holdTimer=0;if(skipClickUntil===Infinity)skipClickUntil=performance.now()+500;if(active||performance.now()<skipClickUntil){event.preventDefault();event.stopPropagation()}}});
 listen(center,'blur',()=>{clearHold();if(skipClickUntil===Infinity)skipClickUntil=performance.now()+500});
 listen(slider,'pointerdown',()=>{if(active)exit();gesture={id:null};preview=Number(slider.value)});
 listen(slider,'input',()=>seek(Number(slider.value)));
 listen(slider,'change',()=>{flush();gesture=null;preview=null;render()});
 listen(slider,'blur',()=>{flush();gesture=null;preview=null;render()});
 listen(slider,'pointercancel',()=>{clearTimeout(writeTimer);writeTimer=0;pending=null;gesture=null;preview=null;render()});
 listen(window,'pointerup',event=>{if(gesture?.id===null&&event.target!==slider){flush();gesture=null;preview=null;render()}});
 listen(duration,'keydown',event=>event.stopPropagation());
 listen(center,'contextmenu',event=>{if(active||holding)event.preventDefault()});
 listen(window,'blur',()=>{clearHold();if(active)exit();if(skipClickUntil===Infinity)skipClickUntil=performance.now()+500});
 listen(duration,'click',()=>{remaining=!remaining;render()});
 for(const event of ['timeupdate','loadedmetadata','durationchange','progress','seeked','emptied'])listen(audio,event,sync);
 listen(document,'visibilitychange',()=>{if(document.hidden)exit({commit:false})});
 render();
 return {sync,cancel:()=>exit({commit:false}),activate,active:()=>active,destroy(){exit({commit:false});listeners.forEach(off=>off())}};
}
