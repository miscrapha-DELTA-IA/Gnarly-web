/** Stage 72 — card-only player surfaces; independent of global themes and backgrounds. */
export const PLAYER_SURFACE_MODES=Object.freeze(['turbulent','frosted','sharp','moving']);
const OPTIONS=Object.freeze([
  ['frosted','Fosco','◌'],
  ['sharp','Nítido','▧'],
  ['moving','Em movimento','↔'],
  ['turbulent','Turbulent Displacement','◈']
]);
export function normalizePlayerSurfaceMode(value){
  return PLAYER_SURFACE_MODES.includes(value)?value:'turbulent';
}
export function playerSurfaceShortLabel(value){
  return {turbulent:'TURBULENT',frosted:'FOSCO',sharp:'NÍTIDO',moving:'MOVIMENTO'}[normalizePlayerSurfaceMode(value)];
}
export function renderPlayerSurfaceMenu(selected){
  const mode=normalizePlayerSurfaceMode(selected);
  return OPTIONS.map(([id,label,glyph])=>
    `<button type="button" class="player-surface-option ${id===mode?'selected':''}" role="menuitemradio" data-player-surface="${id}" aria-checked="${String(id===mode)}"><span>${label}</span><span class="surface-option-glyph" aria-hidden="true">${mode===id?'✓':glyph}</span></button>`
  ).join('');
}

/** Upgrade only recognized Apple Music artwork URLs to an actually available
 * larger artwork variant. Other providers retain their original URL.
 */
export function preferHighResolutionArtwork(raw,pixels=800){
 const source=String(raw||'');
 try{
  const url=new URL(source);
  if(!/^(?:[a-z0-9-]+\.)*mzstatic\.com$/i.test(url.hostname))return source;
  const size=Math.round(Math.min(2400,Math.max(800,Number(pixels)||800))/100)*100;
  url.pathname=url.pathname.replace(/\/\d{2,4}x\d{2,4}bb(?=\.(?:jpe?g|png|webp)$)/i,/`/** Stage 72 — card-only player surfaces; independent of global themes and backgrounds. */
export const PLAYER_SURFACE_MODES=Object.freeze(['turbulent','frosted','sharp','moving']);
const OPTIONS=Object.freeze([
  ['frosted','Fosco','◌'],
  ['sharp','Nítido','▧'],
  ['moving','Em movimento','↔'],
  ['turbulent','Turbulent Displacement','◈']
]);
export function normalizePlayerSurfaceMode(value){
  return PLAYER_SURFACE_MODES.includes(value)?value:'turbulent';
}
export function playerSurfaceShortLabel(value){
  return {turbulent:'TURBULENT',frosted:'FOSCO',sharp:'NÍTIDO',moving:'MOVIMENTO'}[normalizePlayerSurfaceMode(value)];
}
export function renderPlayerSurfaceMenu(selected){
  const mode=normalizePlayerSurfaceMode(selected);
  return OPTIONS.map(([id,label,glyph])=>
    `<button type="button" class="player-surface-option ${id===mode?'selected':''}" role="menuitemradio" data-player-surface="${id}" aria-checked="${String(id===mode)}"><span>${label}</span><span class="surface-option-glyph" aria-hidden="true">${mode===id?'✓':glyph}</span></button>`
  ).join('');
}

/** Upgrade only recognized Apple Music artwork URLs to an actually available
 * larger artwork variant. Other providers retain their original URL.
 */
export function preferHighResolutionArtwork(raw,pixels=800){
 const source=String(raw||'');
 try{
  const url=new URL(source);
  if(!/^(?:[a-z0-9-]+\.)*mzstatic\.com$/i.test(url.hostname))return source;
  {size}x${size}bb`);
  return url.href;
 }catch{return source}
}
