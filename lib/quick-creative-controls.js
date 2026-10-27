/** GNARLY quick visual/typography controls.
 * Tap cycles. Downward swipe opens the manual selector. No long-press timers:
 * iOS Safari used to start native text selection/callouts during the hold.
 * Right-click and keyboard remain accessible on desktop.
 */
export function cycleValue(values,current){
 const items=[...new Set(values.filter(Boolean))];
 if(!items.length)return current;
 const at=items.indexOf(current);
 return items[(at+1)%items.length];
}
export function bindQuickCreative(button,{cycle,expand,swipeThreshold=32}={}){
 if(!button||typeof cycle!=='function'||typeof expand!=='function')
  throw new TypeError('Invalid GNARLY quick action');
 let start=null,suppressClick=false,lastPointerType='mouse';
 const pt=e=>({x:Number(e.clientX)||0,y:Number(e.clientY)||0});
 const down=e=>{
  if(button.disabled||(e.button!==undefined&&e.button!==0))return;
  start={...pt(e),id:e.pointerId};suppressClick=false;
  lastPointerType=e.pointerType||'mouse';
  if(e.pointerId!==undefined&&button.setPointerCapture)
   try{button.setPointerCapture(e.pointerId)}catch{}
 };
 const move=e=>{
  if(!start||(e.pointerId!==undefined&&start.id!==undefined&&e.pointerId!==start.id))return;
  const p=pt(e);
  if(Math.hypot(p.x-start.x,p.y-start.y)>10&&e.cancelable)e.preventDefault?.();
 };
 const up=e=>{
  if(!start||(e.pointerId!==undefined&&start.id!==undefined&&e.pointerId!==start.id))return;
  const dx=(Number(e.clientX)||0)-start.x,dy=(Number(e.clientY)||0)-start.y;
  start=null;
  if(e.type==='pointercancel')return;
  if(dy>=swipeThreshold&&dy>=Math.abs(dx)*1.15){
   suppressClick=true;expand();
  }else if(Math.abs(dx)>=swipeThreshold||dy<=-swipeThreshold){
   // A deliberate sideways/upwards drag should not accidentally cycle.
   suppressClick=true;
  }
 };
 const click=e=>{
  if(suppressClick){suppressClick=false;e.preventDefault?.();e.stopPropagation?.();return}
  if(!button.disabled)cycle();
 };
 const contextmenu=e=>{
  e.preventDefault?.();
  // Safari sometimes reports a long-touch as a right click. Touch-origin
  // context menus must NEVER open Exibição / selectors.
  if(lastPointerType==='touch'||e.pointerType==='touch'||e.sourceCapabilities?.firesTouchEvents)return;
  if(e.pointerType==='mouse'||e.button===2){
   suppressClick=true;expand();
  }
 };
 const keydown=e=>{
  if((e.key==='Enter'||e.key===' ')&&e.shiftKey){
   e.preventDefault?.();suppressClick=true;expand();
  }else if(e.key==='ArrowDown'){
   e.preventDefault?.();expand();
  }
 };
 const noSelection=e=>e.preventDefault?.();
 const onTouchMove=e=>{
  // Only block native drag-to-select/scroll on an active creative button.
  if(start&&e.cancelable)e.preventDefault?.();
 };
 const events=[['pointerdown',down],['pointermove',move],['pointerup',up],
  ['pointercancel',up],['click',click],['contextmenu',contextmenu],
  ['keydown',keydown],['selectstart',noSelection],['dragstart',noSelection]];
 for(const [name,listener]of events)button.addEventListener(name,listener);
 button.addEventListener('touchmove',onTouchMove,{passive:false});
 return ()=>{
  start=null;for(const [name,listener]of events)button.removeEventListener(name,listener);
  button.removeEventListener('touchmove',onTouchMove);
 };
}
