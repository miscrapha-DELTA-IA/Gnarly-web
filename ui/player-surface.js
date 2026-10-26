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
export function renderPlayerSurfaceMenu(selected){
  const mode=normalizePlayerSurfaceMode(selected);
  return OPTIONS.map(([id,label,glyph])=>
    `<button type="button" class="player-surface-option ${id===mode?'selected':''}" role="menuitemradio" data-player-surface="${id}" aria-checked="${String(id===mode)}"><span>${label}</span><span class="surface-option-glyph" aria-hidden="true">${mode===id?'✓':glyph}</span></button>`
  ).join('');
}
