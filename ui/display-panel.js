/** Editable Stage72 panel visibility, independent of the music transport. */
export const PANEL_KEYS=Object.freeze(['search','presets','controls','header','player','export']);
const defaults=Object.freeze({search:true,presets:true,controls:true,header:true,player:true,export:true});
export const LAYOUTS=Object.freeze({
 all:{search:true,presets:true,controls:true,header:true,player:true,export:true},
 essential:{search:true,presets:false,controls:true,header:true,player:true,export:false},
 listening:{search:false,presets:false,controls:false,header:false,player:true,export:false}
});
export function createDisplayStore(storage=null){
 let saved=null;try{saved=JSON.parse(storage?.getItem('gnarly.web.panels.v1')||'null')}catch{}
 let values={...defaults};for(const k of PANEL_KEYS)if(typeof saved?.visible?.[k]==='boolean')values[k]=saved.visible[k];
 let zen=typeof saved?.zen==='boolean'?saved.zen:false;
 const persist=()=>{try{storage?.setItem('gnarly.web.panels.v1',JSON.stringify({visible:values,zen}))}catch{}};
 return {
  get zen(){return zen},
  get visible(){return {...values}},
  isVisible(k){return zen?false:values[k]!==false},
  toggle(k){if(!PANEL_KEYS.includes(k))return;values[k]=!values[k];zen=false;persist()},
  set(k,v){if(!PANEL_KEYS.includes(k))return;values[k]=Boolean(v);zen=false;persist()},
  setGroup(keys,v){for(const k of keys)if(PANEL_KEYS.includes(k))values[k]=Boolean(v);zen=false;persist()},
  apply(layout){if(!LAYOUTS[layout])return;values={...LAYOUTS[layout]};zen=false;persist()},
  setZen(v){zen=Boolean(v);persist()},
  showAll(){values={...LAYOUTS.all};zen=false;persist()}
 }
}
export function renderDisplayPanel(display){
 const v=display.visible,toggle=(id,title,icon)=>`<label class="display-toggle"><span class="display-toggle-text">${icon} <span>${title}</span></span><input type="checkbox" data-panel-toggle="${id}" ${v[id]?'checked':''} aria-label="${title}"/><span class="display-toggle-switch" aria-hidden="true"></span></label>`;
 return `<div class="display-panel"><div class="display-lead"><strong>◉ Exibição</strong><button data-command="close-display" type="button">Concluído</button></div><p>Escolha quantos painéis quiser. Este editor permanece aberto.</p><h3>LAYOUTS RÁPIDOS</h3><div class="display-layouts">${[['all','◉','Tudo'],['essential','▦','Essencial'],['listening','♫','Só ouvir']].map(([id,icon,title])=>`<button data-layout="${id}" class="display-layout-btn"><span>${icon}</span>${title}</button>`).join('')}</div><label class="display-toggle zen-toggle"><span class="display-toggle-text">◉ <span>Fundo livre (Zen)</span></span><input type="checkbox" data-zen-toggle ${display.zen?'checked':''}/><span class="display-toggle-switch" aria-hidden="true"></span></label><h3>BUSCA</h3>${toggle('search','Busca','⌕')}<div class="display-group-head"><h3>ÁUDIO · PRESETS E CONTROLES</h3><button data-layout-group="all">Tudo</button><button data-layout-group="none">Nada</button></div>${toggle('presets','Presets','☷')}${toggle('controls','Controles','☷')}<h3>OUTRAS JANELAS</h3>${toggle('header','Cabeçalho e atalhos','▤')}${toggle('player','Player','♫')}${toggle('export','Exportar','⇧')}<button class="display-hide-button" data-command="hide-display-panels">Ocultar janelas desta tela</button><p class="display-footer">A reprodução continua enquanto as janelas são ocultadas. O botão do olho fica acessível para restaurá-las.</p></div>`;
}
