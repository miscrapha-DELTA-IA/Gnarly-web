import {KaraokeMicrophone} from '../lib/karaoke-microphone.js';
import {KaraokeLiveScore} from '../lib/karaoke-live-score.js';
import {applyLyricStyle,allLyricStyles} from '../lib/lyric-style.js';
import {renderLyricArtwork} from '../lib/karaoke-art-direction.js';
import {artworkBudget,resolveArtworkAsset} from '../lib/artwork-quality.js';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function karaokeStageMarkup(){
 return `<section class="karaoke-stage" id="karaoke-stage" role="dialog" aria-modal="true" aria-labelledby="karaoke-stage-heading" hidden>
 <div class="karaoke-stage-wallpaper" aria-hidden="true"><img id="karaoke-stage-wallpaper" alt=""></div>
 <div class="karaoke-stage-glass">
  <header class="karaoke-stage-header">
   <img id="karaoke-stage-art" src="./assets/gnarly-icon.png" alt="" class="karaoke-stage-art">
   <div class="karaoke-stage-song"><h2 id="karaoke-stage-heading">GNARLY · Karaokê</h2><p id="karaoke-stage-artist">Selecione uma música</p></div>
   <button type="button" class="karaoke-stage-transport" id="karaoke-stage-play" aria-label="Reproduzir música">▶</button>
   <button type="button" class="karaoke-stage-fullscreen" id="karaoke-stage-fullscreen" aria-label="Ativar tela cheia" aria-pressed="false" title="Tela cheia"><span data-fullscreen-glyph aria-hidden="true">⛶</span></button>
   <button type="button" class="karaoke-stage-close" id="karaoke-stage-close" aria-label="Recolher karaokê">✕</button>
  </header>
  <nav class="karaoke-stage-actions" aria-label="Controles de karaokê">
   <button type="button" id="karaoke-voice-toggle" aria-pressed="false">🎤 Ligar mic</button>
   <button type="button" id="karaoke-voice-record" disabled aria-pressed="false">● Gravar voz</button>
   <button type="button" id="karaoke-caption-settings">Aa · Legenda</button>
  </nav>
  <p class="karaoke-stage-feedback" id="karaoke-stage-feedback" role="status" aria-live="polite" hidden></p>
  <div class="karaoke-stage-font-menu" id="karaoke-stage-font-menu" aria-label="Escolher estilo da legenda" hidden></div>
  <section class="karaoke-score-card" aria-label="Pontuação do canto">
   <div><span class="karaoke-score-label" id="karaoke-score-label">MICROFONE INATIVO</span><strong class="karaoke-score-number" id="karaoke-score-number">0</strong></div>
   <div class="karaoke-score-right"><strong id="karaoke-score-combo">1× · 0 combo</strong><small id="karaoke-score-mode">Ritmo e presença · tom indisponível</small></div>
   <div class="karaoke-score-meter" aria-label="Presença de voz"><span id="karaoke-voice-meter"></span></div>
   <p id="karaoke-score-rating" class="karaoke-score-rating">Ative o microfone para pontuar sua voz.</p>
  </section>
  <div class="karaoke-stage-status" id="karaoke-stage-status" role="status">Aguardando letra...</div>
  <section class="karaoke-reader" id="karaoke-reader" aria-label="Letras da música">
   <div class="app-shell karaoke-stage-art-root"><div id="karaoke-reader-lines" class="karaoke-reader-lines"></div></div>
  </section>
  <div class="karaoke-stage-footer">
   <button type="button" id="karaoke-follow-live">⌖ Voltar à letra ao vivo</button>
   <span id="karaoke-voice-tuning">Tom: sem referência harmônica · prefira fones</span>
  </div>
 </div>
 </section>`;
}
const SILENCE={rms:0,hz:null,confidence:0,voiced:false};
export class KaraokeStage {
 constructor({root,audio,getState,onStyle,onNotify,onMicConflict,onPlayPause,onFullscreen}){
  this.root=root;this.audio=audio;this.getState=getState;this.onStyle=onStyle;
  this.externalNotify=onNotify||(()=>{});this.onFullscreen=onFullscreen||(()=>{});
  this.onNotify=message=>{
   // The global app toast is BEHIND the modal. Stage feedback must be visible
   // so mic permission errors and recorder actions never feel like dead buttons.
   const feedback=this.query('karaoke-stage-feedback');
   if(this.opened&&feedback){
    feedback.textContent=String(message||'');
    feedback.hidden=!message;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer=setTimeout(()=>{if(this.opened)feedback.hidden=true},4500);
   }else this.externalNotify(message);
  };
  this.onMicConflict=onMicConflict||(()=>false);this.onPlayPause=onPlayPause||(()=>{});
  this.mic=new KaraokeMicrophone();this.scorer=new KaraokeLiveScore();
  this.opened=false;this.follow=true;this.trackId=null;this.lineRef=null;this.currentIndex=-999;
  this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;
  this.trigger=null;this.artworkSource='';this.artworkRequest=0;this.feedbackTimer=null;
  this.savedDocumentScroll={x:0,y:0};
  // Safari may deliver HTMLAudioElement timeupdate only a few times per
  // second. Score on each REAL microphone sample (~90 ms), using the player's
  // currentTime (not Date.now), and keep timeupdate as a harmless fallback.
  this.mic.onChange=()=>{
   if(!this.opened)return;
   if(this.mic.active&&this.scorer.active)
    this.scorer.tick(this.audio.currentTime||0,
     !this.audio.paused&&!this.audio.ended&&!this.audio.seeking,
     this.mic.frameNow());
   this.updateScore();
  };
  this.mic.onRecording=blob=>{if(blob.size){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
   a.download='gnarly-karaoke-voz-'+new Date().toISOString().slice(0,19).replaceAll(':','-')+(blob.type.includes('mp4')?'.m4a':'.webm');
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
   this.onNotify('Gravação da voz salva (sem áudio musical).')
  }else this.onNotify('Nenhuma voz foi gravada.');};
  this.root.addEventListener('click',e=>this.click(e));
  this.root.addEventListener('wheel',()=>this.setFollowing(false),{passive:true});
  this.root.querySelector('#karaoke-reader').addEventListener('touchstart',()=>this.setFollowing(false),{passive:true});
  this.root.querySelector('#karaoke-reader').addEventListener('pointerdown',()=>this.setFollowing(false),{passive:true});
  this.root.addEventListener('keydown',e=>this.handleKey(e));
 }
 query(id){return this.root.querySelector('#'+id)}
 open(trigger){
  if(this.opened)return;
  this.trigger=trigger||null;this.opened=true;this.follow=true;
  this.savedDocumentScroll={x:window.scrollX||0,y:window.scrollY||0};
  this.root.hidden=false;this.query('karaoke-stage-font-menu').hidden=true;document.documentElement.classList.add('karaoke-stage-open');
  this.trackId=null;this.lineRef=null;this.currentIndex=-999;
  this.refresh(true);this.query('karaoke-stage-close').focus({preventScroll:true});
 }
 close(){
  if(!this.opened)return;
  this.opened=false;this.root.hidden=true;this.query('karaoke-stage-font-menu').hidden=true;document.documentElement.classList.remove('karaoke-stage-open');
  clearTimeout(this.feedbackTimer);this.query('karaoke-stage-feedback').hidden=true;
  this.mic.stop();this.scorer.stop();this.updateScore();
  // A pending image upgrade must be retried on reopen, not leave the stage
  // with a permanently stale wallpaper when it completed while hidden.
  ++this.artworkRequest;this.artworkSource='';
  this.trigger?.focus?.({preventScroll:true});this.trigger=null;
 }
 destroy(){this.close();clearTimeout(this.feedbackTimer);this.mic.stop()}
 resetForTrack(){
  this.mic.stop();this.scorer.stop();this.trackId=null;this.lineRef=null;this.currentIndex=-999;
  if(this.opened)this.refresh(true);
 }
 setFollowing(enabled){this.follow=enabled;const btn=this.query('karaoke-follow-live');btn.classList.toggle('is-following',enabled);btn.setAttribute('aria-pressed',String(enabled))}
 refresh(force=false){
  if(!this.opened)return;
  const data=this.getState(),track=data.track,lines=Array.isArray(data.lines)?data.lines:[],plain=Array.isArray(data.plain)?data.plain:[];
  if((track?.id??null)!==this.trackId){this.mic.stop();this.scorer.stop();this.trackId=track?.id??null;force=true}
  if(data.style&&this.root.dataset.lyricStyle!==data.style)applyLyricStyle(this.root,data.style);
  this.query('karaoke-stage-heading').textContent=track?.title||'GNARLY · Karaokê';
  this.query('karaoke-stage-artist').textContent=track?.artist||'Selecione uma música';
  const art=track?.artwork||'./assets/gnarly-icon.png';
  if(this.artworkSource!==art){
   this.artworkSource=art;const revision=++this.artworkRequest;
   // Keep the already decoded wallpaper/cover on screen during the next fetch.
   // Mutating img.src to an uncached remote thumbnail first caused a dark/black
   // frame on iOS Safari before the higher quality candidate decoded.
   const coverElement=this.query('karaoke-stage-art');
   const wallpaperElement=this.query('karaoke-stage-wallpaper');
   const opts={viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,dpr:window.devicePixelRatio||1,
    saveData:!!navigator.connection?.saveData,deviceMemory:Number(navigator.deviceMemory)||8};
   void resolveArtworkAsset(art,{
    pixels:artworkBudget({role:'stage',...opts}),minDimension:340,
    displayWidth:opts.viewportWidth,displayHeight:opts.viewportHeight,dpr:opts.dpr
   }).then(async asset=>{
    if(this.artworkRequest!==revision||this.artworkSource!==art||!this.opened)return;
    const nextUrl=asset.url||art;
    // resolveArtworkAsset already decodes candidates for dimensions; finish
    // the image decode before swapping either visible stage image.
    const prepared=new Image();prepared.src=nextUrl;
    try{if(prepared.decode)await prepared.decode();else await new Promise((resolve,reject)=>{
     prepared.onload=resolve;prepared.onerror=reject;
     if(prepared.complete&&prepared.naturalWidth)resolve();
    })}catch{return}
    if(this.artworkRequest!==revision||this.artworkSource!==art||!this.opened)return;
    if(coverElement.src!==prepared.src)coverElement.src=prepared.src;
    if(wallpaperElement.src!==prepared.src)wallpaperElement.src=prepared.src;
    wallpaperElement.dataset.artQuality=asset.quality;
   }).catch(()=>{/* keep previous decoded artwork instead of a black frame */});
  }
  if(force||this.lineRef!==lines){
   this.lineRef=lines;this.currentIndex=-999;
   const holder=this.query('karaoke-reader-lines');holder.replaceChildren();
   const synced=!!data.synced&&lines.length>0;
   const items=synced?lines:plain.length?plain:lines.map(x=>x.text);
   if(items.length){
    const fragment=document.createDocumentFragment();
    items.slice(0,500).forEach((line,i)=>{
     const button=document.createElement(synced?'button':'div');
     button.className='karaoke-reader-line';
     button.textContent=typeof line==='string'?line:line?.text||'';
     button.dataset.lineIndex=String(i);
     if(synced){button.type='button';button.dataset.lyricSeek=String(line.time);button.setAttribute('aria-label','Ir para a linha: '+button.textContent)}
     fragment.append(button);
    });
    holder.append(fragment);
   }else{const p=document.createElement('p');p.className='karaoke-reader-empty';p.textContent=track?'A letra ainda não está disponível. O áudio continua normalmente.':'Selecione uma música para começar.';holder.append(p)}
   if(this.mic.active){
    // Late LRC arrival switches from presence to synchronized feedback without
    // resetting accumulated real-microphone points to zero.
    this.scorer.retime(synced?lines:[],this.audio.currentTime||0,this.audio.duration||0);
   }
  }
  this.updateTransport();
  this.query('karaoke-stage-status').textContent=data.synced?'Letra sincronizada · acompanhamento ao vivo':(plain.length?'Letra simples · pontos por presença vocal, sem sincronização':data.status||'Buscando letra...');
  this.setFollowing(this.follow);
  this.tick(true);
 }
 tick(force=false){
  if(!this.opened)return;
  const data=this.getState(),time=this.audio.currentTime||0,lines=data.synced?data.lines:[];
  if((data.track?.id??null)!==this.trackId||this.lineRef!==data.lines){this.refresh(true);return}
  if(this.mic.active&&this.scorer.active)this.scorer.tick(time,!this.audio.paused&&!this.audio.ended,this.mic.frameNow());
  let index=-1;
  if(data.synced&&lines?.length){
   // LRC line-time interpolation only; don't fabricate individual word boundaries.
   let low=0,high=lines.length-1;while(low<=high){const mid=(low+high)>>1;if(Number(lines[mid].time)<=time){index=mid;low=mid+1}else high=mid-1}
  }
  if(index!==this.currentIndex||force){
   this.currentIndex=index;
   const holder=this.query('karaoke-reader-lines');
   holder.querySelectorAll('.karaoke-reader-line').forEach((el,i)=>{
    const offset=i-index;
    el.classList.toggle('is-live',index===i&&!!data.synced);
    el.classList.toggle('is-past',index>i&&!!data.synced);
    el.classList.toggle('is-future',index<i&&!!data.synced);
    el.style.setProperty('--distance',Math.min(3,Math.abs(offset)));
    // Latest Aa Creative Editions use deterministic, escaped markup only
    // for the active line; remove DOM treatments once the line is inactive.
    const live=i===index&&!!data.synced,mode=live?'art':'plain';
    const current=typeof lines?.[i]==='object'?lines[i]?.text||'':String(lines?.[i]||'');
    if(el.dataset.renderedMode!==mode||live&&el.dataset.renderedStyle!==data.style){
     if(live)el.innerHTML=renderLyricArtwork(current,data.style,{lineId:i,active:true});
     else if(el.dataset.renderedMode==='art')el.textContent=current;
     el.dataset.renderedMode=mode;el.dataset.renderedStyle=data.style||'original';
    }
   });
   const active=holder.querySelector('.is-live');
   if(active&&this.follow)this.centerActiveLine(active);
  }
  this.updateScore();
 }

 /** Keep the document fixed while auto-following the active LRC line.
  * scrollIntoView() also scrolls the page/ancestors on Chromium and Safari,
  * pushing the modal header/play/pause outside the visible viewport.
  */
 centerActiveLine(line){
  const reader=this.query('karaoke-reader');
  if(!reader||!line)return;
  const bounds=reader.getBoundingClientRect(),target=line.getBoundingClientRect();
  const offset=(target.top-bounds.top)+(target.height-bounds.height)/2;
  if(!Number.isFinite(offset)||Math.abs(offset)<1)return;
  reader.scrollTo({top:Math.max(0,reader.scrollTop+offset),behavior:this.reducedMotion?'instant':'smooth'});
 }
 updateTransport(){
  const button=this.query('karaoke-stage-play'),playing=!this.audio.paused&&!this.audio.ended;
  button.textContent=playing?'❚❚':'▶';
  button.setAttribute('aria-label',playing?'Pausar música':'Reproduzir música');
 }
 updateScore(){
  this.updateTransport();
  const result=this.scorer.snapshot(),voice=this.mic.frameNow(),active=this.mic.active;
  this.query('karaoke-voice-toggle').textContent=active?'🎤 Desligar mic':'🎤 Ligar mic';
  this.query('karaoke-voice-toggle').setAttribute('aria-pressed',String(active));
  const record=this.query('karaoke-voice-record');record.disabled=!active;record.textContent=this.mic.recording?'■ Parar gravação':'● Gravar voz';
  record.setAttribute('aria-pressed',String(this.mic.recording));
  this.query('karaoke-score-label').textContent=active?(result.mode==='presence'?'VOZ AO VIVO':result.active?'CANTO AO VIVO':'MICROFONE ATIVO'):'MICROFONE INATIVO';
  this.query('karaoke-score-number').textContent=String(result.score);
  this.query('karaoke-score-combo').textContent=result.multiplier+'× · '+result.combo+' combo';
  this.query('karaoke-score-mode').textContent=!active?'Ative o microfone para pontuar':
   result.mode==='presence'?'Presença vocal · sem sincronização':
   result.active?'Ritmo e presença · tom indisponível':'Aguardando letra';
  this.query('karaoke-score-rating').textContent=result.rating||(!active?'Ative o microfone para pontuar sua voz.':
   result.mode==='presence'?'Pontos pela sua voz · sincronização e afinação não avaliadas.':
   !result.active?'Microfone ligado; aguardando letra.':
   voice.voiced?'Sua voz está sendo acompanhada.':'Cante junto usando fones para evitar retorno.');
  this.query('karaoke-voice-meter').style.width=active?Math.min(100,Math.round(voice.rms*850))+'%':'0%';
  this.query('karaoke-voice-tuning').textContent=active&&voice.voiced&&voice.hz
   ?'Voz detectada: '+Math.round(voice.hz)+' Hz · sem referência para nota musical'
   :'Tom indisponível · referência melódica não verificada';
 }
 async toggleMic(){
  if(this.mic.active){this.mic.stop();this.scorer.stop();this.updateScore();return}
  if(this.onMicConflict()){this.onNotify('Pare outra gravação de voz antes de ativar o karaokê.');return}
  this.query('karaoke-voice-toggle').disabled=true;
  try{
   const ok=await this.mic.start();
   if(!ok||!this.opened){this.mic.stop();return}
   const d=this.getState();
   if(d.synced&&Array.isArray(d.lines)&&d.lines.length)
    this.scorer.start(d.lines,this.audio.currentTime||0,this.audio.duration||0);
   else this.scorer.startPresence(this.audio.currentTime||0,this.audio.duration||0);
   this.onNotify(this.scorer.mode==='synced'&&this.scorer.active?
    'Microfone ativo · pontuação sincronizada com a letra.':
    'Microfone ativo · pontuação por presença vocal enquanto buscamos LRC.');
  }catch(e){
   this.onNotify(e?.name==='NotAllowedError'?'Permissão de microfone negada. Autorize o microfone no navegador.':'Não foi possível ativar o microfone (requer HTTPS e autorização).');
  }finally{this.query('karaoke-voice-toggle').disabled=false;this.updateScore()}
 }
 click(e){
  const target=e.target.closest('button');if(!target)return;
  switch(target.id){
   case 'karaoke-stage-close':this.close();break;
   case 'karaoke-stage-play':
    // Playback belongs to the existing app audio graph, never a new player.
    this.onPlayPause();this.updateTransport();break;
   case 'karaoke-stage-fullscreen':this.onFullscreen();break;
   case 'karaoke-voice-toggle':void this.toggleMic();break;
   case 'karaoke-voice-record':
    if(this.mic.recording)this.mic.stopRecording();
    else if(!this.mic.beginRecording())this.onNotify('Gravação não suportada pelo navegador.');
    this.updateScore();break;
   case 'karaoke-caption-settings':{
    const menu=this.query('karaoke-stage-font-menu');
    if(!menu.hidden){menu.hidden=true;break}
    menu.replaceChildren();
    const available=allLyricStyles().slice(0,14);
    for(const style of available){
     const option=document.createElement('button');
     option.type='button';option.dataset.stageFont=style.id;option.textContent=style.name;
     option.setAttribute('aria-pressed',String(this.root.dataset.lyricStyle===style.id));
     menu.append(option);
    }
    const full=document.createElement('button');full.type='button';full.dataset.stageFont='__all__';
    full.textContent='Mais fontes…';menu.append(full);menu.hidden=false;break
   }
   
   case 'karaoke-follow-live':this.setFollowing(true);this.tick(true);break;
   default:
    if(target.dataset.stageFont){
     const name=target.dataset.stageFont;this.query('karaoke-stage-font-menu').hidden=true;
     if(name==='__all__')this.onStyle(null);
     else this.onStyle(name);
     break;
    }
    if(target.hasAttribute('data-lyric-seek')&&this.getState().synced){
     const at=Number(target.dataset.lyricSeek);
     if(Number.isFinite(at)){this.audio.currentTime=at;this.setFollowing(true);this.scorer.retime(this.getState().lines,at,this.audio.duration||0);this.tick(true)}
    }
  }
 }
 handleKey(e){
  if(e.key==='Escape'){e.preventDefault();this.close();return}
  if(e.key==='Tab'){
   const focus=[...this.root.querySelectorAll('button:not(:disabled)')].filter(x=>x.offsetParent!==null);
   const index=focus.indexOf(document.activeElement);
   if(!focus.length)return;
   if(e.shiftKey&&index<=0){e.preventDefault();focus[focus.length-1].focus()}
   else if(!e.shiftKey&&index===focus.length-1){e.preventDefault();focus[0].focus()}
  }
 }
}
