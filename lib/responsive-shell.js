/** Responsive GNARLY header and native theme palette contract.
 * A desktop is not a scaled-up iPhone: only touch-first compact viewports lose
 * redundant DJ/fullscreen shortcuts. Both remain available through More.
 */
export const OFFICIAL_SUPPORT_URL='https://apoia.se/gnarlyapp';
export function deviceLayout({width=390,coarse=false}={}){
 const n=Number(width)||390;
 if(n<=640||(coarse&&n<=920))return 'phone';
 if(n<=1024)return 'tablet';
 return 'desktop';
}
export function themeAccent(theme,palettes,previousTheme='ACID'){
 const key=(theme==='GNARLY'||theme==='GNARLY 2'||theme==='GNARLY STRATA'||
 theme==='GNARLY ORGANISM'||theme==='GNARLY COMPILER')?previousTheme:theme;
 const stops=palettes?.[key]||palettes?.[theme]||palettes?.ACID||['#45ff8a'];
 // The visual engine already authors the colors. Prefer colorful, legible
 // second/third stops; this avoids green fallback for creative material themes.
 const candidates=stops.filter(c=>/^#[\da-f]{6}$/i.test(c));
 const score=hex=>{
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const light=(.2126*r+.7152*g+.0722*b)/255;
  const sat=(Math.max(r,g,b)-Math.min(r,g,b))/255;
  return sat*.8+Math.max(0,1-Math.abs(light-.66)*1.8)*.35;
 };
 return [...candidates].sort((a,b)=>score(b)-score(a))[0]||'#45ff8a';
}
export function attachEyeGestures(button,{tap,hold,delay=520,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!button) return ()=>{};
 let timer=null,held=false,start=null;
 const cancel=()=>{if(timer!==null){clearTimer(timer);timer=null}};
 const down=e=>{
  if(e.button!==undefined&&e.button!==0)return;
  held=false;start={x:e.clientX||0,y:e.clientY||0};
  cancel();timer=setTimer(()=>{timer=null;held=true;hold?.()},delay);
 };
 const move=e=>{
  if(start&&Math.hypot((e.clientX||0)-start.x,(e.clientY||0)-start.y)>14){cancel();start=null}
 };
 const up=()=>{cancel();start=null};
 const click=e=>{
  if(held){e.preventDefault();e.stopPropagation();held=false;return}
  tap?.();
 };
 const context=e=>{e.preventDefault();if(!held){held=true;hold?.()}cancel()};
 button.addEventListener('pointerdown',down);
 button.addEventListener('pointermove',move);
 button.addEventListener('pointerup',up);
 button.addEventListener('pointercancel',up);
 button.addEventListener('pointerleave',up);
 button.addEventListener('click',click);
 button.addEventListener('contextmenu',context);
 return ()=>{cancel();for(const [name,fn] of [['pointerdown',down],['pointermove',move],
  ['pointerup',up],['pointercancel',up],['pointerleave',up],['click',click],
  ['contextmenu',context]])button.removeEventListener(name,fn)};
}
