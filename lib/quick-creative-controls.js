/** GNARLY quick creative controls: short tap cycles; press-and-hold opens full library.
 * No global handlers; one event listener set per control with accessible keyboard fallback.
 */
export function cycleValue(values,current){
 const items=[...new Set(values.filter(Boolean))];
 if(!items.length)return current;
 const at=items.indexOf(current);
 return items[(at+1)%items.length];
}
export function bindQuickCreative(button,{cycle,expand,holdMs=470}){
 if(!button||typeof cycle!=='function'||typeof expand!=='function')throw new TypeError('Invalid GNARLY quick action');
 let timer=null,suppressUntil=0,down=false;
 const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null}down=false};
 button.addEventListener('pointerdown',e=>{
  if(e.button!==0||button.disabled)return;
  clear();down=true;
  timer=setTimeout(()=>{
   timer=null;
   if(!down)return;
   suppressUntil=Date.now()+900;
   expand();
  },holdMs);
 });
 button.addEventListener('pointerup',clear);
 button.addEventListener('pointercancel',clear);
 button.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')clear()});
 button.addEventListener('click',e=>{
  if(Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();return}
  cycle();
 });
 button.addEventListener('contextmenu',e=>{
  e.preventDefault();clear();suppressUntil=Date.now()+800;expand();
 });
 button.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.shiftKey){
   e.preventDefault();clear();suppressUntil=Date.now()+800;expand();
  }
  if(e.key==='ArrowDown'){e.preventDefault();clear();expand()}
 });
 return ()=>clear();
}
