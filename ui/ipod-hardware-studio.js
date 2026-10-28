/** Lazy editor for the existing iPod DOM. Owns appearance, never transport. */
import {MATERIALS,PATTERNS,PALETTE,DEVICE_PRESETS,createAppearanceStore,normalizeAppearance,hex,exportAppearance,importAppearance} from '../lib/ipod-appearance.js';
import {applyAppearance,appearanceVariables,svgURL,patternSVG} from '../lib/ipod-materials.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const options=(items,value)=>items.map(([id,name])=>`<option value="${id}" ${id===value?'selected':''}>${esc(name)}</option>`).join('');
const groups=[...new Set(PATTERNS.filter(p=>p.id!=='none').map(p=>p.group))];
const displayValue=(key,value)=>['density','texture','finish','tint','contrast'].includes(key)?Math.round(value*100)+'%':key==='scale'?value.toFixed(2)+'×':['angle','rotation'].includes(key)?value+'°':['x','y'].includes(key)?value+'%':String(value);
export function createHardwareStudio({device,storage=globalThis.localStorage}={}){
 if(!device)throw Error('Dispositivo iPod indisponível.');
 const store=createAppearanceStore(storage);
 let dialog=null,controls=null,placeholder=null,originParent=null,frame=0,saveTimer=0,tab='designs',advanced=false,collection='Camuflagem',renameId=null,chosen='',lastScroll=0;
 try{advanced=storage?.getItem('gnarly.ipod.editor.advanced')==='true'}catch{}
 const tabs=[['designs','Designs'],['finish','Material'],['print','Estampas'],['parts','Detalhes'],['saved','Meus estilos']];
 const query=selector=>dialog?.querySelector(selector);
 const isOpen=()=>!!dialog?.hasAttribute('open');
 let fallbackBackdrop=null,backgroundState=null;
 const say=message=>{const el=query('[data-studio-status]');if(el)el.textContent=message};
 const persist=()=>{clearTimeout(saveTimer);store.flush();if(store.snapshot().persistenceError)say('Design ativo nesta sessão. Não foi possível salvar no navegador.')};
 function schedule(snapshot){
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   applyAppearance(device,snapshot.config,{enabled:snapshot.enabled});
   if(isOpen()){
    const proof=query('.ipod-studio-mini');if(proof)applyAppearance(proof,snapshot.config);
    for(const item of dialog.querySelectorAll('[data-design]'))item.setAttribute('aria-pressed',String(item.dataset.design===chosen));
    const active=query('[data-material-name]');if(active)active.textContent=MATERIALS.find(m=>m.id===snapshot.config.material)?.name||'';
   }
  });
 }
 const unsubscribe=store.subscribe(schedule);schedule(store.snapshot());
 function color(key,label,c){return `<label>${label}<span class="ipod-studio-color"><input type="color" data-color="${key}" value="${c.colors[key]}" aria-label="${label}"/><input type="text" data-color="${key}" value="${c.colors[key]}" spellcheck="false" maxlength="7" pattern="#[0-9A-Fa-f]{6}" aria-label="${label} em HEX"/></span></label>`}
 function slider(key,label,min,max,step,c,suffix=''){
  return `<label><span class="ipod-studio-label">${label}<output data-output="${key}">${displayValue(key,c[key])}</output></span><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${c[key]}" aria-label="${label}"/></label>`;
 }
 function mini(config){const c=normalizeAppearance(config),v=appearanceVariables(c);return `--mini-base:${esc(v['--ipod-base'])};--mini-frame:${c.colors.frame};--mini-wheel:${c.colors.wheel};--mini-center:${c.colors.center};--mini-print:${esc(v['--ipod-pattern'])}`}
 function content(){
  const snap=store.snapshot(),c=snap.config;
  if(tab==='designs')return `<p class="ipod-studio-subtitle">Escolha um estilo.</p><div class="ipod-studio-presets">${DEVICE_PRESETS.map(p=>`<button type="button" class="ipod-design-card" data-design="${p.id}" aria-pressed="${chosen===p.id}" aria-label="Aplicar ${esc(p.name)}"><span class="ipod-design-mini" style="${mini(p.config)}" aria-hidden="true"></span><span>${esc(p.name)}</span></button>`).join('')}</div><p class="ipod-studio-note">Combine materiais e estampas.</p>`;
  if(tab==='finish')return `<p class="ipod-studio-subtitle">Material e cor.</p><label>Superfície<select data-setting="material" aria-label="Material do corpo">${options(MATERIALS.map(m=>[m.id,m.name]),c.material)}</select></label><p class="ipod-studio-note" data-material-help>${esc(MATERIALS.find(m=>m.id===c.material)?.detail)}</p>
   <fieldset class="ipod-studio-section"><legend>BASE DE COR</legend><label>Composição<select data-setting="baseMode" aria-label="Composição da cor">${options([['solid','Cor sólida'],['duo','Degradê de duas cores'],['trio','Degradê de três cores']],c.baseMode)}</select></label>
   ${color('body','Cor do corpo',c)}<div class="ipod-studio-palette">${PALETTE.map(tone=>`<button type="button" data-tone="${tone}" style="--swatch:${tone}" aria-label="Cor ${tone}" aria-pressed="${c.colors.body===tone}"></button>`).join('')}</div>
   ${c.baseMode!=='solid'?color('secondary','Segunda cor',c):''}${c.baseMode==='trio'?color('tertiary','Terceira cor',c):''}${c.baseMode!=='solid'?slider('angle','Direção',0,360,1,c,'°'):''}</fieldset>
   <fieldset class="ipod-studio-section"><legend>ACABAMENTO</legend>${slider('finish','Reflexo',0,1,.05,c)}${slider('texture','Microtextura',0,1,.05,c)}${advanced?color('metallic','Tonalidade metálica',c)+slider('tint','Intensidade da tonalidade',0,1,.05,c):''}</fieldset>`;
  if(tab==='print'){
   const patterns=PATTERNS.filter(p=>p.group===collection||p.id==='none');
   return `<p class="ipod-studio-subtitle">Escolha uma estampa.</p><label>Coleção<select data-studio-collection aria-label="Coleção de estampas">${options(groups.map(x=>[x,x]),collection)}</select></label><div class="ipod-studio-patterns">${patterns.map(p=>{
    const conf=normalizeAppearance({...c,pattern:p.id,colors:{...c.colors,primary:p.palette[0],secondaryInk:p.palette[1],accent:p.palette[2]}});
    return `<button type="button" class="ipod-pattern-card" data-pattern="${p.id}" aria-pressed="${c.pattern===p.id}" aria-label="Estampa ${esc(p.name)}"><i aria-hidden="true" style="--sample-print:${esc(p.id==='none'?'none':svgURL(patternSVG(conf)))};--sample-base:${c.colors.body}"></i>${esc(p.name)}</button>`;
   }).join('')}</div><fieldset class="ipod-studio-section"><legend>TINTAS DA ESTAMPA</legend>${color('primary','Tinta principal',c)}${color('secondaryInk','Tinta secundária',c)}${color('accent','Acento',c)}</fieldset><fieldset class="ipod-studio-section"><legend>COMPOSIÇÃO</legend>${slider('scale','Escala',.4,2.4,.05,c)}${advanced?slider('rotation','Rotação',0,360,1,c,'°')+slider('density','Densidade',.2,1,.05,c)+slider('contrast','Contraste da impressão',.6,1.7,.05,c)+slider('x','Posição horizontal',-100,100,1,c)+slider('y','Posição vertical',-100,100,1,c):''}
   <label>Variação / seed<input type="number" data-setting="seed" value="${c.seed}" min="0" max="4294967295" step="1"/></label><div class="ipod-studio-actions"><button type="button" data-studio-action="variation">Nova variação</button></div></fieldset>`;
  }
  if(tab==='parts')return `<p class="ipod-studio-subtitle">Cores de cada peça.</p><div class="ipod-studio-grid">${color('body','Corpo',c)}${color('wheel','Click wheel',c)}${color('center','Botão central',c)}${advanced?color('frame','Moldura lateral',c)+color('bezel','Moldura da tela',c)+color('labels','Símbolos e botões',c)+color('brand','Marca GNARLY',c):''}</div>${advanced?`<label>Acabamento da moldura<select data-setting="frameFinish" aria-label="Material da moldura">${options([['chrome','Cromo'],['brushed','Metal escovado'],['dark','Metal escuro'],['color','Cor acetinada']],c.frameFinish)}</select></label>`:'<p class="ipod-studio-note">Mais peças em Avançado.</p>'}`;
  return `<p class="ipod-studio-subtitle">Salvo neste navegador.</p><form class="ipod-studio-save" data-save-design><input type="text" name="designName" id="ipod-design-name" aria-label="Nome do seu design" placeholder="${renameId?'Novo nome':'Nome do seu design'}" maxlength="40" required/><button type="submit">${renameId?'Renomear':'Salvar'}</button></form>
   ${snap.users.map(p=>`<div class="ipod-user-design"><button type="button" data-user-apply="${p.id}" title="Aplicar design">${esc(p.name)}</button><button type="button" data-user-rename="${p.id}" aria-label="Renomear ${esc(p.name)}">Renomear</button><button type="button" data-user-delete="${p.id}" aria-label="Excluir ${esc(p.name)}">×</button></div>`).join('')}
   <p class="ipod-studio-note">${snap.users.length} de 16 estilos.</p><fieldset class="ipod-studio-section"><legend>COMPARTILHAR</legend><div class="ipod-studio-actions"><button type="button" data-studio-action="export">Exportar JSON</button><button type="button" data-studio-action="import">Importar JSON</button></div><input type="file" data-import-design accept="application/json,.json" hidden/><p class="ipod-studio-note">Apenas cores, materiais e estampas.</p></fieldset>`;
 }
 function render(){
  if(!controls)return;
  const oldScroll=controls.scrollTop,active=document.activeElement;
  const focusKey=controls.contains(active)?['data-design','data-studio-tab','data-editor-mode','data-setting','data-studio-collection','data-user-apply','data-user-rename','data-user-delete'].find(key=>active.hasAttribute(key)):null;
  const focusValue=focusKey?active.getAttribute(focusKey):null;
  controls.innerHTML=`<div class="ipod-studio-mini-live"><div class="gnarly-ipod ipod-studio-mini" aria-hidden="true"><div class="ipod-shell-base"><div class="ipod-body"><div class="ipod-internals"></div><div class="ipod-color"></div><div class="ipod-print"></div><div class="ipod-micro"></div><div class="ipod-light"></div></div></div><div class="ipod-screen"></div><div class="ipod-fallback-brand">Gnarly</div><div class="ipod-wheel"><i class="ipod-mini-center"></i></div></div><div><strong>Seu design ao vivo</strong><span>Prévia ao vivo</span><button type="button" data-studio-action="preview">Ver iPod ↑</button></div></div><div class="ipod-studio-mode" role="group" aria-label="Nível de personalização"><button type="button" data-editor-mode="simple" aria-pressed="${!advanced}">Essencial</button><button type="button" data-editor-mode="advanced" aria-pressed="${advanced}">Avançado</button></div>
   <div class="ipod-studio-tabs" role="tablist" aria-label="Hardware Studio">${tabs.map(([id,name])=>`<button type="button" role="tab" id="ipod-studio-tab-${id}" data-studio-tab="${id}" aria-selected="${tab===id}" aria-controls="ipod-studio-panel" tabindex="${tab===id?'0':'-1'}">${name}</button>`).join('')}</div>
   <div id="ipod-studio-panel" role="tabpanel" aria-labelledby="ipod-studio-tab-${tab}">${content()}</div>
   <div class="ipod-studio-actions ipod-studio-reset"><button type="button" data-studio-action="reset">Restaurar</button>${device.classList.contains('has-skin')?'<button type="button" data-studio-action="legacy">Carcaça anterior</button>':''}</div><p class="ipod-studio-status" data-studio-status role="status" aria-live="polite"></p>`;
  const proof=query('.ipod-studio-mini');if(proof)applyAppearance(proof,store.snapshot().config);
  controls.scrollTop=oldScroll;
  if(focusKey)controls.querySelector(`[${focusKey}="${CSS.escape(focusValue)}"]`)?.focus({preventScroll:true});
 }
 function change(patch,{rebuild=false}={}){
  chosen='';store.update(patch);clearTimeout(saveTimer);saveTimer=setTimeout(persist,180);
  if(rebuild)render();
  if(store.snapshot().persistenceError)say('Design ativo nesta sessão. Não foi possível salvar no navegador.');
 }
 function onInput(event){
  const target=event.target,c=store.snapshot().config;
  if(target.dataset.color){
   const value=hex(target.value);target.setAttribute('aria-invalid',String(!value));if(!value)return;
   const key=target.dataset.color;
   change({colors:{[key]:value}});
   for(const input of controls.querySelectorAll(`[data-color="${key}"]`))if(input!==target)input.value=value;
  }else if(target.dataset.setting){
   const key=target.dataset.setting,value=target.tagName==='SELECT'?target.value:target.valueAsNumber;
   if(typeof value==='number'&&!Number.isFinite(value))return;
   change({[key]:value},{rebuild:['material','baseMode'].includes(key)});
   const output=controls.querySelector(`[data-output="${key}"]`);if(output)output.textContent=displayValue(key,store.snapshot().config[key]);
  }
 }
 function onClick(event){
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.studioTab){tab=button.dataset.studioTab;renameId=null;render();query(`[data-studio-tab="${tab}"]`)?.focus({preventScroll:true});return}
  if(button.dataset.editorMode){advanced=button.dataset.editorMode==='advanced';try{storage?.setItem('gnarly.ipod.editor.advanced',String(advanced))}catch{}render();return}
  if(button.dataset.design){
   const preset=DEVICE_PRESETS.find(p=>p.id===button.dataset.design);if(!preset)return;
   chosen=preset.id;store.apply(preset.config);if(preset.config.pattern!=='none')collection=PATTERNS.find(p=>p.id===preset.config.pattern)?.group||collection;render();say(preset.name+' aplicado.');return;
  }
  if(button.dataset.pattern){
   const print=PATTERNS.find(p=>p.id===button.dataset.pattern);if(!print)return;
   change({pattern:print.id,colors:{primary:print.palette[0],secondaryInk:print.palette[1],accent:print.palette[2]}},{rebuild:true});return;
  }
  if(button.dataset.tone){change({colors:{body:button.dataset.tone}},{rebuild:true});return}
  const snapshot=store.snapshot();
  if(button.dataset.userApply){const item=snapshot.users.find(p=>p.id===button.dataset.userApply);if(item){store.apply(item.config);chosen='';say(item.name+' aplicado.')}return}
  if(button.dataset.userRename){const item=snapshot.users.find(p=>p.id===button.dataset.userRename);if(item){renameId=item.id;render();const input=query('#ipod-design-name');input.value=item.name;input.focus();input.select()}return}
  if(button.dataset.userDelete){store.deletePreset(button.dataset.userDelete);renameId=null;render();say('Design excluído.');return}
  const action=button.dataset.studioAction;
  if(action==='preview'){query('.ipod-studio-main')?.scrollTo({top:0,behavior:'auto'});return}
  if(action==='close'){close();return}
  if(action==='reset'){chosen='silver';store.reset();render();say('Dispositivo original restaurado. Seus designs foram mantidos.');return}
  if(action==='legacy'){store.useLegacy();say('Carcaça anterior restaurada. A música continua.');return}
  if(action==='variation'){change({seed:(snapshot.config.seed+7919)>>>0},{rebuild:true});return}
  if(action==='import'){query('[data-import-design]')?.click();return}
  if(action==='export'){
   const url=URL.createObjectURL(new Blob([exportAppearance(snapshot.config)],{type:'application/json'}));
   const anchor=document.createElement('a');anchor.href=url;anchor.download='gnarly-ipod-design.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Configuração exportada.');
  }
 }
 function ensureDialog(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='ipod-studio';dialog.id='ipod-hardware-studio';dialog.setAttribute('aria-labelledby','ipod-studio-title');
  dialog.innerHTML=`<header class="ipod-studio-header"><div><span class="ipod-studio-eyebrow">GNARLY / HARDWARE STUDIO</span><h2 id="ipod-studio-title">Um objeto. Seu universo.</h2></div><button type="button" class="ipod-studio-close" data-studio-action="close" aria-label="Fechar personalização">×</button></header><div class="ipod-studio-main"><section class="ipod-studio-stage" aria-label="Prévia ao vivo"><div class="ipod-studio-preview"></div><div class="ipod-studio-caption"><strong data-material-name></strong><br/>DESIGN 072 · FEITO PARA OUVIR</div></section><div class="ipod-studio-controls"></div></div>`;
  document.body.append(dialog);controls=query('.ipod-studio-controls');
  dialog.addEventListener('click',onClick);dialog.addEventListener('input',onInput);
  dialog.addEventListener('change',async event=>{
   if(event.target.matches('[data-studio-collection]')){collection=event.target.value;render();return}
   if(!event.target.matches('[data-import-design]'))return;
   const file=event.target.files?.[0];event.target.value='';if(!file)return;
   try{if(file.size>32768)throw Error('Use um JSON de até 32 KB.');store.apply(importAppearance(await file.text()));chosen='';render();say('Configuração importada.')}catch(error){say(error.message)}
  });
  dialog.addEventListener('submit',event=>{
   if(!event.target.matches('[data-save-design]'))return;event.preventDefault();
   try{
    const name=new FormData(event.target).get('designName');
    if(renameId)store.renamePreset(renameId,name);else store.savePreset(name);
    renameId=null;render();say(store.snapshot().persistenceError?'Design ativo nesta sessão. O armazenamento está indisponível.':'Design salvo no navegador.');
   }catch(error){say(error.message)}
  });
  dialog.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Tab'&&dialog.dataset.fallback==='true'){
    const focusable=[...dialog.querySelectorAll('button:not(:disabled),input:not([hidden]),select,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
   const media={MediaTrackNext:'ipod-next-button',MediaTrackPrevious:'ipod-previous-button',MediaPlayPause:'ipod-center-button'};
   if(media[event.key]){event.preventDefault();device.querySelector('#'+media[event.key])?.click();return}
   if(event.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();const index=tabs.findIndex(([id])=>id===tab);
    const ix=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tab=tabs[ix][0];render();query(`[data-studio-tab="${tab}"]`).focus();
   }
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.addEventListener('close',restore);
 }
 function restore(){
  if(!placeholder)return;
  persist();placeholder.replaceWith(device);placeholder=null;originParent=null;
  fallbackBackdrop?.remove();fallbackBackdrop=null;
  if(backgroundState){
   const {element,hidden,inert}=backgroundState;
   hidden===null?element.removeAttribute('aria-hidden'):element.setAttribute('aria-hidden',hidden);
   if('inert' in element)element.inert=inert;
   backgroundState=null;
  }
  document.body.style.overflow=dialog.dataset.previousOverflow||'';
  window.scrollTo({top:lastScroll,behavior:'auto'});device.querySelector('#ipod-menu-button')?.focus({preventScroll:true});
 }
 function open(){
  ensureDialog();if(isOpen())return;
  const pattern=PATTERNS.find(p=>p.id===store.snapshot().config.pattern);if(pattern&&pattern.id!=='none')collection=pattern.group;
  render();originParent=device.parentNode;placeholder=document.createComment('GNARLY iPod live preview');originParent.insertBefore(placeholder,device);
  query('.ipod-studio-preview').append(device);lastScroll=window.scrollY;dialog.dataset.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  if(typeof dialog.showModal==='function')dialog.showModal();else{
   dialog.dataset.fallback='true';dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
   fallbackBackdrop=document.createElement('div');fallbackBackdrop.className='ipod-studio-backdrop';fallbackBackdrop.setAttribute('aria-hidden','true');dialog.before(fallbackBackdrop);
   const element=document.getElementById('app-shell');
   if(element){backgroundState={element,hidden:element.getAttribute('aria-hidden'),inert:element.inert};element.setAttribute('aria-hidden','true');if('inert' in element)element.inert=true}
  }
  const material=query('[data-material-name]');if(material)material.textContent=MATERIALS.find(m=>m.id===store.snapshot().config.material)?.name;
  query('.ipod-studio-close').focus({preventScroll:true});
 }
 function close(){if(!isOpen())return;if(typeof dialog.close==='function'&&dialog.dataset.fallback!=='true')dialog.close();else{dialog.removeAttribute('open');restore()}}
 const menuBack=event=>{if(isOpen()&&event.target.closest('#ipod-menu-button')){event.stopPropagation();event.preventDefault();close()}};
 device.addEventListener('click',menuBack,true);
 const flush=()=>persist();globalThis.addEventListener('pagehide',flush);
 return Object.freeze({open,close,store,apply:schedule,destroy(){close();restore();cancelAnimationFrame(frame);persist();unsubscribe();device.removeEventListener('click',menuBack,true);globalThis.removeEventListener('pagehide',flush);dialog?.remove()}});
}
