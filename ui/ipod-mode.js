/** GNARLY iPod — optional visual shell, never a second media player.
 * A user-supplied Canva skin lives only in this browser's IndexedDB; the
 * existing audio element, queue, presets and MediaSession remain authoritative.
 */
export const IPOD_SKIN_DB='gnarly-ipod-skin-v1';
export const IPOD_SKIN_MAX_BYTES=8*1024*1024;
const MEDIA_TYPES=new Set(['image/png','image/jpeg','image/webp']);
export function validIPodSkin(file){
 return !!file&&MEDIA_TYPES.has(file.type)&&
  Number.isFinite(file.size)&&file.size>=4096&&file.size<=IPOD_SKIN_MAX_BYTES;
}
export function openIPodSkinDB(factory=globalThis.indexedDB){
 if(!factory)return Promise.reject(Error('Armazenamento local não disponível'));
 return new Promise((resolve,reject)=>{
  let request;
  try{request=factory.open(IPOD_SKIN_DB,1)}
  catch(error){reject(error);return}
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains('skins'))
    request.result.createObjectStore('skins');
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Erro ao abrir o armazenamento'));
  request.onblocked=()=>reject(Error('Feche outras abas para atualizar a arte'));
 });
}
export function createIPodSkinStore(factory=globalThis.indexedDB){
 async function operation(mode,action){
  const db=await openIPodSkinDB(factory);
  try{
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction('skins',mode),store=tx.objectStore('skins');
    let value;
    try{
     const request=action(store);
     request.onsuccess=()=>{value=request.result};
     request.onerror=()=>reject(request.error||Error('Não foi possível acessar a arte'));
    }catch(error){reject(error);return}
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error||Error('Falha ao guardar a arte'));
    tx.onabort=()=>reject(tx.error||Error('Armazenamento interrompido'));
   });
  }finally{db.close()}
 }
 return Object.freeze({
  get:()=>operation('readonly',store=>store.get('current')),
  save:blob=>{
   if(!validIPodSkin(blob))return Promise.reject(Error('Use PNG, JPG ou WebP de até 8 MB'));
   return operation('readwrite',store=>store.put(blob,'current'));
  },
  remove:()=>operation('readwrite',store=>store.delete('current'))
 });
}
/** User images are untrusted. Decode in an image element before making the
 * imported artwork visible. No external CSS URLs or arbitrary HTML accepted.
 */
export async function validateIPodSkinDimensions(file,createURL=URL.createObjectURL,revoke=URL.revokeObjectURL){
 if(!validIPodSkin(file))throw Error('Escolha um PNG, JPG ou WebP de até 8 MB');
 const url=createURL(file);
 try{
  const image=new Image();
  image.src=url;
  if(image.decode)await image.decode();
  else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject});
  if(image.naturalWidth<640||image.naturalHeight<640)
   throw Error('A arte precisa ter pelo menos 640 × 640 pixels');
  const aspect=image.naturalWidth/image.naturalHeight;
  if(aspect<.53||aspect>1.1)
   throw Error('Importe a arte quadrada do Canva ou a carcaça recortada');
  return {width:image.naturalWidth,height:image.naturalHeight};
 }finally{revoke(url)}
}
export function ipodSourceLabel(playing=false){
 return playing?'TOCANDO • GNARLY':'GNARLY • iPOD';
}
