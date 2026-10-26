/** GNARLY browser fullscreen. Browser native API first, true viewport
 * fallback for Safari/iOS; hiding Safari chrome requires installed PWA.
 */
export function createFullscreenController(doc,{onChange=()=>{},onFallback=()=>{}}={}){
 const root=doc.documentElement,body=doc.body;
 const isActive=()=>Boolean(doc.fullscreenElement||body.classList.contains('gnarly-immersive'));
 function sync(){
  const active=isActive();
  root.classList.toggle('gnarly-fullscreen',active);
  onChange(active,Boolean(doc.fullscreenElement));
 }
 async function toggle(){
  if(doc.fullscreenElement){
   if(typeof doc.exitFullscreen==='function'){
    try{await doc.exitFullscreen()}catch{body.classList.remove('gnarly-immersive')}
   }
   sync();return false;
  }
  if(body.classList.contains('gnarly-immersive')){
   body.classList.remove('gnarly-immersive');sync();return false;
  }
  if(typeof root.requestFullscreen==='function'){
   try{await root.requestFullscreen({navigationUI:'hide'});sync();return isActive()}
   catch{/* Safari/mobile may reject; use viewport-filling fallback */}
  }
  body.classList.add('gnarly-immersive');sync();onFallback();return true;
 }
 doc.addEventListener('fullscreenchange',sync);
 doc.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&body.classList.contains('gnarly-immersive')){
   body.classList.remove('gnarly-immersive');sync();
  }
 });
 sync();
 return {toggle,isActive,sync};
}
