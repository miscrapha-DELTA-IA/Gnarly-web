import {SHARE_FORMATS,exportProfile,freezeShareRequest} from '../lib/share-model.js';
import {createShareRenderer} from '../lib/share-renderer.js';
import {encodeShare,videoMime} from '../lib/share-encoder.js';
import {PALETTES} from '../lib/visual-engine.js';
import {EXPERIENCES,MATERIAL_THEMES} from '../lib/visual-selection.js';
import {allLyricStyles} from '../lib/lyric-style.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(items,value)=>items.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join('');
/** A frozen draft, one renderer and one bounded export job. Never owns player transport. */
export class ShareStudio{
 constructor({snapshot,onOpen=()=>{},onClose=()=>{}}){
  Object.assign(this,{snapshot,onOpen,onClose});this.generation=0;this.urls=[];
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./share-studio.css',import.meta.url).href;document.head.append(css);
  this.dialog=document.createElement('dialog');this.dialog.className='share-studio';this.dialog.setAttribute('aria-labelledby','share-studio-title');document.body.append(this.dialog);
  this.dialog.addEventListener('keydown',e=>e.stopPropagation());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.busy)this.abort?.abort()});
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close()});
  this.dialog.addEventListener('click',e=>{const action=e.target.closest('[data-share-action]')?.dataset.shareAction;if(action==='close')this.close();if(action==='generate')void this.generate();if(action==='cancel')this.abort?.abort();if(action==='share')void this.share();if(action==='share-media')void this.share('media');if(action?.startsWith('save-'))this.save(action.slice(5))});
  this.dialog.addEventListener('change',e=>{if(e.target.matches('[data-share-setting]'))void this.update()});
  this.dialog.addEventListener('input',e=>{if(e.target.matches('[data-share-scrub]')&&this.renderer){const time=Number(e.target.value);this.renderer.draw(time);this.copyPreview();this.dialog.querySelector('[data-share-clock]').textContent=time.toFixed(1)+' s'}});
 }
 async open(format,trigger){
  if(this.busy)throw Error('Aguarde o cancelamento da exportação anterior.');
  if(this.dialog.open)this.close();
  const data=this.snapshot(),request=freezeShareRequest(data,format);this.base=request;this.audioSource=data.audioSource;this.impulse=data.impulse;this.trigger=trigger;
  this.clearResult();this.onOpen();
  this.dialog.innerHTML=`<header><div><p>EXPORTAR / COMPARTILHAR</p><h2 id="share-studio-title">${escape(request.title)}</h2></div><button data-share-action="close" aria-label="Fechar exportação">✕</button></header>
   <div class="share-studio-body"><section class="share-studio-preview" aria-label="Prévia do arquivo"><canvas data-share-preview></canvas><label>Prévia · <output data-share-clock>0.0 s</output><input type="range" data-share-scrub min="0" max="${request.duration}" step="0.05" value="0"></label></section>
   <section class="share-studio-settings"><label>Formato<select data-share-setting="format">${options(SHARE_FORMATS,format)}</select></label>
   <label>Proporção<select data-share-setting="aspect">${options([['portrait','Retrato · 9:16'],['square','Quadrado · 1:1'],['landscape','Paisagem · 16:9']],'portrait')}</select></label>
   <label>Qualidade<select data-share-setting="quality">${options([['economy','Leve · 540p / até 15 fps'],['balanced','Equilibrada · 720p / até 20 fps'],['high','Alta · 1080p / até 30 fps']],'balanced')}</select></label>
   <label>Enquadramento<select data-share-setting="crop">${options([['safe','Preservar cena'],['fit','Ajustar com bordas pretas'],['crop','Preencher / recortar']],'safe')}</select></label>
   <label>Estilo<select data-share-setting="style">${options(['Clássica','Neon','Mono','Cinema','Máquina'].map(s=>[s,s]),request.style)}</select></label>
   <details><summary>Visual e tipografia do arquivo</summary><label>Tema<select data-share-setting="theme">${options(Object.keys(PALETTES).map(x=>[x,x]),request.visual.theme)}</select></label><label>Experiência<select data-share-setting="experience">${options(EXPERIENCES.map(x=>[x.id,x.name]),request.visual.experience)}</select></label><label>Material<select data-share-setting="material">${options([['none','Sem camada extra'],...MATERIAL_THEMES.map(x=>[x,x])],request.visual.materialLayer||'none')}</select></label><label>Tipografia das letras<select data-share-setting="lyricStyle">${options(allLyricStyles().filter(x=>['original','neon','editorial','mono','kinetic','minimal',request.lyricStyle].includes(x.id)).map(x=>[x.id,x.name]),request.lyricStyle)}</select></label></details>
   <div class="share-studio-times"><label>Início na música (s)<input data-share-setting="start" type="number" min="0" max="${request.sourceDuration}" step="0.1" value="${request.start.toFixed(1)}"></label><label>Duração (até 15 s)<input data-share-setting="duration" type="number" min="0.5" max="15" step="0.1" value="${request.duration.toFixed(1)}"></label></div>
   <p class="section-note">A prévia e o arquivo usam a mesma cena. A música continua tocando. O áudio exportado usa a faixa original com velocidade, pitch, grave e reverb; não inclui sua voz, Stems ou pads.</p>
   <p data-share-capability class="section-note"></p><p role="status" data-share-status>Preparando prévia…</p><progress data-share-progress max="1" value="0" hidden></progress>
   <div class="share-studio-actions"><button class="action-button" data-share-action="generate" disabled>Gerar arquivo</button><button class="action-button alt" data-share-action="cancel" hidden>Cancelar</button></div>
   <section data-share-result hidden><div data-share-playback></div><p data-share-summary></p><div class="share-studio-actions"><button class="action-button" data-share-action="share">Compartilhar pacote</button><button class="action-button alt" data-share-action="share-media">Compartilhar mídia</button><button class="action-button alt" data-share-action="save-media">Baixar arquivo</button><button class="action-button alt" data-share-action="save-thumbnail">Miniatura JPG</button><button class="action-button alt" data-share-action="save-metadata">Metadados JSON</button></div></section>
   </section></div>`;
  try{this.dialog.showModal()}catch(error){this.onClose();throw Error('Atualize o navegador para abrir o estúdio de exportação.')}await this.update();
 }
 status(message){const el=this.dialog.querySelector('[data-share-status]');if(el&&el.textContent!==message)el.textContent=message}
 copyPreview(){const canvas=this.dialog.querySelector('[data-share-preview]');if(!canvas||!this.renderer)return;const source=this.renderer.canvas;if(canvas===source)return;canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0)}
 async update(){
  if(this.busy)return;
  const token=++this.generation;this.previewAbort?.abort();const abort=this.previewAbort=new AbortController();this.renderer?.destroy();this.renderer=null;this.clearResult();
  const get=name=>this.dialog.querySelector(`[data-share-setting="${name}"]`).value;
  const generate=this.dialog.querySelector('[data-share-action="generate"]');generate.disabled=true;
  try{
   const format=get('format'),start=Math.max(0,Math.min(this.base.sourceDuration,Number(get('start'))||0));
   const request=freezeShareRequest({track:{id:this.base.trackId,title:this.base.title,artist:this.base.artist,source:this.base.sourceKind,artwork:this.base.artwork},lines:this.base.lines,synced:this.base.lines.length>0,duration:this.base.sourceDuration,position:start,speed:this.base.speed,pitch:this.base.pitch,bass:this.base.bass,reverb:this.base.reverb,visual:{...this.base.visual,theme:get('theme'),experience:get('experience'),materialLayer:get('material')==='none'?null:get('material')},background:this.base.background,backgroundMode:this.base.backgroundMode,lyricStyle:get('lyricStyle'),style:get('style')},format);
   this.request=Object.freeze({...request,duration:Math.min(request.duration,Math.max(.5,Number(get('duration'))||15))});
   this.profile=exportProfile({aspect:get('aspect'),quality:get('quality'),crop:get('crop')},request.mode);
   this.dialog.querySelector('[data-share-setting="crop"]').value=this.profile.crop;
   this.dialog.querySelector('[data-share-setting="duration"]').value=this.request.duration.toFixed(1);
   const scrub=this.dialog.querySelector('[data-share-scrub]');scrub.max=this.request.duration;scrub.value=0;this.dialog.querySelector('[data-share-clock]').textContent='0.0 s';
   const mime=videoMime(request.includeAudio);this.dialog.querySelector('[data-share-capability]').textContent=format==='image'?'PNG + miniatura JPG + metadados JSON.':mime?`${mime.includes('mp4')?'MP4':'WebM'} neste navegador · gravação em tempo real, até 15 segundos. Compartilhamento depende do suporte do aparelho.`:'Vídeo indisponível neste navegador. Escolha imagem PNG.';
   this.status('Preparando prévia…');const requestForPreview=this.request,profileForPreview=this.profile;
   this.previewTask=Promise.resolve(this.previewTask).catch(()=>{}).then(()=>createShareRenderer(requestForPreview,profileForPreview,{signal:abort.signal}));
   const renderer=await this.previewTask;
   if(token!==this.generation||!this.dialog.open){renderer.destroy();return}
   this.renderer=renderer;renderer.canvas.dataset.sharePreview='';this.dialog.querySelector('[data-share-preview]').replaceWith(renderer.canvas);this.copyPreview();generate.disabled=format!=='image'&&!mime;this.status('Prévia pronta. Toque Gerar arquivo.');
  }catch(e){if(token===this.generation)this.status(e.message||'Não foi possível preparar a exportação.')}
 }
 async generate(){
  if(this.busy||!this.renderer)return;this.busy=true;this.clearResult();const abort=this.abort=new AbortController();let context;
  const controls=[...this.dialog.querySelectorAll('[data-share-setting],[data-share-scrub],[data-share-action="generate"]')];controls.forEach(x=>x.disabled=true);
  this.dialog.querySelector('[data-share-action="cancel"]').hidden=false;const progress=this.dialog.querySelector('[data-share-progress]');progress.hidden=false;progress.value=0;
  try{
   // Resume from THIS click, before any fetch/decode await (Safari activation).
   if(this.request.includeAudio&&this.request.format!=='image'){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw Error('Áudio de exportação indisponível.');context=new Audio();let timer,cancel;
    try{await Promise.race([context.resume(),new Promise((_,reject)=>{cancel=()=>reject(new DOMException('Exportação cancelada.','AbortError'));abort.signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>reject(Error('Toque Gerar novamente para liberar o áudio.')),5000)})])}finally{clearTimeout(timer);abort.signal.removeEventListener('abort',cancel)}}
   const result=await encodeShare(this.request,this.profile,this.renderer,{signal:abort.signal,audioContext:context,audioSource:this.audioSource,impulse:this.impulse,onProgress:(n,label)=>{progress.value=n;this.status(label)}});
   if(abort.signal.aborted||!this.dialog.open)return;this.result=result;const url=URL.createObjectURL(result.media);this.urls.push(url);
   const playback=this.dialog.querySelector('[data-share-playback]');const media=document.createElement(result.media.type.startsWith('image/')?'img':'video');media.src=url;media.alt='Arquivo gerado';if(media.tagName==='VIDEO'){media.controls=true;media.playsInline=true;media.muted=true}playback.replaceChildren(media);
   this.dialog.querySelector('[data-share-summary]').textContent=`${result.info.width} × ${result.info.height} · ${(result.media.size/1048576).toFixed(2)} MB · ${result.media.name}`;
   this.dialog.querySelector('[data-share-result]').hidden=false;this.status('Arquivo pronto. Baixe ou compartilhe abaixo.');
  }catch(e){if(this.dialog.open)this.status(e.name==='AbortError'?'Exportação cancelada.':e.message||'Não foi possível gerar o arquivo.')}
  finally{if(context&&context.state!=='closed')await context.close().catch(()=>{});this.busy=false;if(this.abort===abort)this.abort=null;controls.forEach(x=>x.disabled=false);this.dialog.querySelector('[data-share-action="cancel"]').hidden=true;progress.hidden=true;this.renderer?.draw(0);this.copyPreview()}
 }
 save(key){const file=this.result?.[key];if(!file)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 async share(key){
  if(!this.result)return;const files=key?[this.result[key]]:[this.result.media,this.result.thumbnail,this.result.metadata];
  try{
   if(!navigator.canShare?.({files})||!navigator.share){this.status('Compartilhamento de arquivos indisponível. Tente Compartilhar mídia ou use os botões para baixar cada arquivo.');return}
   await navigator.share({files,title:this.request.title,text:'Criado com GNARLY'});this.status('Arquivos entregues ao compartilhamento do aparelho.');
  }catch(e){this.status(e.name==='AbortError'?'Compartilhamento cancelado.':'Não foi possível compartilhar. Os arquivos continuam disponíveis para baixar.')}
 }
 clearResult(){this.result=null;this.urls.forEach(url=>URL.revokeObjectURL(url));this.urls=[];const result=this.dialog.querySelector('[data-share-result]');if(result)result.hidden=true;this.dialog.querySelector('[data-share-playback]')?.replaceChildren()}
 close(){if(!this.dialog.open)return;++this.generation;this.previewAbort?.abort();this.abort?.abort();this.renderer?.destroy();this.renderer=null;this.clearResult();this.dialog.close();this.onClose();this.trigger?.focus?.({preventScroll:true});this.audioSource=null;this.impulse=null}
}
