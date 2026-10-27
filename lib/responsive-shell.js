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
/** Eye gesture contract: click toggles, horizontal swipe retracts/expands,
 * vertical swipe opens or dismisses display controls. Never use a long-press:
 * iOS Safari can interpret that as native text selection or callout.
 */
export function attachEyeGestures(button,{
 tap,swipeHorizontal,swipeVertical,context,threshold=32
}={}){
 if(!button)return ()=>{};
 let down=null,suppressPointerClick=false,lastPointerType='mouse';
 const coords=e=>({x:Number(e.clientX)||0,y:Number(e.clientY)||0});
 const downHandler=e=>{
  if(e.button!==undefined&&e.button!==0)return;
  suppressPointerClick=false;
  lastPointerType=e.pointerType||'mouse';
  down={...coords(e),pointerId:e.pointerId,pointerType:lastPointerType};
  if(e.pointerId!==undefined&&button.setPointerCapture)
   try{button.setPointerCapture(e.pointerId)}catch{}
 };
 const moveHandler=e=>{
  if(!down)return;
  if(e.pointerId!==undefined&&down.pointerId!==undefined&&e.pointerId!==down.pointerId)return;
  // Stops iOS scrolling/selection only while interacting with this button,
  // not with the body or any surrounding app control.
  const point=coords(e),dx=point.x-down.x,dy=point.y-down.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>=12&&e.cancelable)e.preventDefault();
 };
 const release=e=>{
  if(!down)return;
  if(e.pointerId!==undefined&&down.pointerId!==undefined&&e.pointerId!==down.pointerId)return;
  const point=coords(e),dx=point.x-down.x,dy=point.y-down.y;
  down=null;
  if(e.type==='pointercancel')return;
  const x=Math.abs(dx),y=Math.abs(dy);
  if(Math.max(x,y)<threshold)return; // ordinary tap left to click
  suppressPointerClick=true;
  if(x>=y*1.2)swipeHorizontal?.(dx<0?'left':'right');
  else if(y>=x*1.2)swipeVertical?.(dy>0?'down':'up');
  // Diagonal drags are ignored rather than activating an unexpected command.
 };
 const click=e=>{
  if(suppressPointerClick){suppressPointerClick=false;e.preventDefault?.();e.stopPropagation?.();return}
  tap?.();
 };
 const contextHandler=e=>{
  e.preventDefault?.();
  // Right mouse click still offers the editor on desktop; never trigger it
  // through the iOS touch context menu.
  if(e.pointerType==='mouse'||(lastPointerType!=='touch'&&e.pointerType!=='touch'&&e.button===2))context?.();
 };
 const keydown=e=>{
  suppressPointerClick=false;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   e.preventDefault?.();e.stopPropagation?.();swipeHorizontal?.(e.key==='ArrowLeft'?'left':'right');
  }else if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault?.();e.stopPropagation?.();swipeVertical?.(e.key==='ArrowDown'?'down':'up');
  }
 };
 const handlers=[['pointerdown',downHandler],['pointermove',moveHandler],
  ['pointerup',release],['pointercancel',release],['click',click],
  ['contextmenu',contextHandler],['keydown',keydown],
  ['selectstart',e=>e.preventDefault?.()]];
 for(const [name,fn] of handlers)button.addEventListener(name,fn);
 return ()=>{down=null;for(const [name,fn] of handlers)button.removeEventListener(name,fn)};
}
