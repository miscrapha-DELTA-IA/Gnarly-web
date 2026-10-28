/** Editable Stage72 panel visibility, independent of the music transport. */
export const PANEL_KEYS=Object.freeze(['search','presets','controls','header','player','lyrics','export','performance']);
const defaults=Object.freeze({search:true,presets:true,controls:true,header:true,player:true,lyrics:true,export:true,performance:true});
export const PLAYER_SIZES=Object.freeze(['compact','standard','minimal']);
export const PLAYER_MATERIALS=Object.freeze(['clear','balanced','frosted']);
export const LAYOUTS=Object.freeze({
 all:{search:true,presets:true,controls:true,header:true,player:true,lyrics:true,export:true,performance:true},
 essential:{search:true,presets:false,controls:true,header:true,player:true,lyrics:true,export:false,performance:false},
 listening:{search:false,presets:true,controls:true,header:false,player:true,lyrics:false,export:false,performance:false}
});
export function createDisplayStore(storage=null){
 let saved=null;try{saved=JSON.parse(storage?.getItem('gnarly.web.panels.v1')||'null')}catch{}
 let values={...defaults};for(const k of PANEL_KEYS)if(typeof saved?.visible?.[k]==='boolean')values[k]=saved.visible[k];
 // Native Stage72 Zen is a session-only mask, not a saved preference.
 let zen=false;
 let size=PLAYER_SIZES.includes(saved?.size)?saved.size:'compact';
 let material=PLAYER_MATERIALS.includes(saved?.material)?saved.material:'clear';
 const persist=()=>{try{storage?.setItem('gnarly.web.panels.v1',JSON.stringify({visible:values,size,material}))}catch{}};
 return {
  get zen(){return zen},
  get size(){return size},
  get material(){return material},
  setSize(next){if(!PLAYER_SIZES.includes(next))return;size=next;persist()},
  setMaterial(next){if(!PLAYER_MATERIALS.includes(next))return;material=next;persist()},
  get visible(){return {...values}},
  isVisible(k){return zen?false:values[k]!==false},
  toggle(k){if(!PANEL_KEYS.includes(k))return;values[k]=!values[k];zen=false;persist()},
  set(k,v){if(!PANEL_KEYS.includes(k))return;values[k]=Boolean(v);zen=false;persist()},
  setGroup(keys,v){for(const k of keys)if(PANEL_KEYS.includes(k))values[k]=Boolean(v);zen=false;persist()},
  apply(layout){if(!LAYOUTS[layout])return;values={...LAYOUTS[layout]};zen=false;persist()},
  setZen(v){zen=Boolean(v)},
  showAll(){values={...LAYOUTS.all};zen=false;persist()}
 }
}
export function renderDisplayPanel(display){
 const v=display.visible,toggle=(id,title,icon)=>`<label class="display-toggle"><span class="display-toggle-text">${icon} <span>${title}</span></span><input type="checkbox" data-panel-toggle="${id}" ${v[id]?'checked':''} aria-label="${title}"/><span class="display-toggle-switch" aria-hidden="true"></span></label>`;
 return `<div class="display-panel"><div class="display-lead"><strong>◉ Exibição</strong><button data-command="close-display" type="button">Concluído</button></div><p>Escolha quantos painéis quiser. Este editor permanece aberto.</p><h3>LAYOUTS RÁPIDOS</h3><div class="display-layouts">${[['all','◉','Tudo'],['essential','▦','Essencial'],['listening','♫','Só ouvir']].map(([id,icon,title])=>`<button data-layout="${id}" class="display-layout-btn"><span>${icon}</span>${title}</button>`).join('')}</div><label class="display-toggle zen-toggle"><span class="display-toggle-text">◉ <span>Fundo livre (Zen)</span></span><input type="checkbox" data-zen-toggle ${display.zen?'checked':''}/><span class="display-toggle-switch" aria-hidden="true"></span></label><section class="display-player-settings" aria-label="Aparência do player">
 <h3>PLAYER · TAMANHO</h3><div class="display-segmented" role="group" aria-label="Tamanho do player">
 ${[['compact','Compacto'],['standard','Clássico'],['minimal','Mínimo']].map(([id,title])=>`<button type="button" data-player-size="${id}" aria-pressed="${display.size===id}" class="${display.size===id?'active':''}">${title}</button>`).join('')}
 </div>
 <p class="display-player-hint">Toque no botão de aparência junto ao tempo da faixa para escolher Fosco, Nítido, Em movimento ou Turbulent Displacement. O tamanho é independente do visual e da música.</p>
 </section><h3>BUSCA</h3>${toggle('search','Busca','⌕')}<div class="display-group-head"><h3>ÁUDIO · PRESETS E CONTROLES</h3><button data-layout-group="all">Tudo</button><button data-layout-group="none">Nada</button></div>${toggle('presets','Presets','☷')}${toggle('controls','Controles','☷')}<h3>OUTRAS JANELAS</h3>${toggle('lyrics','Legendas','Aa')}${toggle('header','Cabeçalho e atalhos','▤')}${toggle('player','Player','♫')}${toggle('export','Exportar','⇧')}${toggle('performance','Performance / DJ','◈')}<button class="display-hide-button" data-command="hide-display-panels">Ocultar janelas desta tela</button><p class="display-footer">A reprodução continua enquanto as janelas são ocultadas. O botão do olho fica acessível para restaurá-las.</p></div>`;
}
