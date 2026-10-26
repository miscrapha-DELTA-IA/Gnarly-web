import {FluidVisual,PALETTES} from './lib/visual-engine.js';
import {WebAudioEngine} from './lib/audio-engine.js';
import {parseLRC,lyricIndex} from './lib/lrc.js';
import {searchCatalog,searchNativeBackend,resolveTrackMetadata} from './lib/catalog.js';
import {applyMetadata,enrichSearchCredits,isGenericArtist,inferredCredit,displayArtist,reconcileCatalogCredits} from './lib/metadata-intelligence.js';
import {OmniboxSession,classifyIntent,rank} from './lib/omnibox.js';
import {MUSIC_PRESETS,musicalPreset} from './lib/music-presets.js';
import {autoLyrics,cachedAutoLyrics,prefetchAutoLyrics} from './lib/lyrics-auto.js';
import {cycleValue,bindQuickCreative} from './lib/quick-creative-controls.js';
import {trackAudioURL,selectMusicResults,playbackFailureMessage} from './lib/playback-source.js';
import {AudioDeliveryRecovery} from './lib/audio-delivery.js';
import {appendUnique,commitPlaying,moveTrack,removeTrack,radioQuery,chooseSmartTracks,effectiveMode,PlaylistLibrary,AudioConnectionWarmup} from './lib/smart-queue.js';
import {renderSmartQueuePanel} from './ui/smart-queue-panel.js';
import {CLASSIC_THEMES,MATERIAL_THEMES,GNARLY_MODES,EXPERIENCES,REACTIONS,ROLE_EXPLANATION,resolveVisual,restoredThemeAfterGnarly} from './lib/visual-selection.js';
import {StemMixer,STEM_KINDS,STEM_LABELS,STEM_PRESETS} from './lib/stem-mixer.js';
import {PerformancePads,PAD_KEYS} from './lib/performance-pads.js';
import {renderPerformancePanel} from './ui/performance-panel.js';
import {resolveLyricStyle,applyLyricStyle,allLyricStyles} from './lib/lyric-style.js';
import {loadLyricTypeface,findFont} from './lib/lyric-font-catalog.js';
import {renderLyricArtwork,findKaraokeDesign,designFont} from './lib/karaoke-art-direction.js';
import {LyricFontPreferences,artistKey} from './lib/lyric-font-preferences.js';
import {renderLyricStylePanel} from './ui/lyric-style-panel.js';
import {transcribeMidiFile,PITCH_FILE_LIMIT} from './lib/audio-midi-transcriber.js';
import {validateNotes,harmonySummary,notesToMidi} from './lib/music-note-intelligence.js';
import {renderAppInstallGuide,installModeFromBrowser,installPlatform} from './lib/app-install.js';
import {demucsStatus,prepareDemucsAudio,separateWithBestModel} from './lib/demucs-cloud.js';
import {renderMusicPanel,mixerValue} from './ui/music-panel.js';
import {createDisplayStore,renderDisplayPanel} from './ui/display-panel.js';
import {normalizePlayerSurfaceMode,renderPlayerSurfaceMenu,playerSurfaceShortLabel,preferHighResolutionArtwork} from './ui/player-surface.js';

const $=(selector)=>document.querySelector(selector);
const app=$('#app-shell'), background=$('#gnarly-background'), audio=$('#player-audio'), visual=new FluidVisual($('#fluid-canvas'));
const engine=new WebAudioEngine(audio);
const stems=new StemMixer(engine,audio);
const pads=new PerformancePads(engine);
const midiAnalysis={busy:false,status:'MIDI estimado, sem alterar a reprodução.',notes:[],duration:0,harmony:null,abort:null,trackId:null,revision:0};
function midiView(){return {...pads.snapshot(),intelligence:{...midiAnalysis.harmony,notes:midiAnalysis.notes.length,ready:midiAnalysis.notes.length>0,busy:midiAnalysis.busy,status:midiAnalysis.status}}}
const audioDelivery=new AudioDeliveryRecovery();
let recoveryOperation=null;
const icon='/assets/gnarly-icon.png';
let omniboxStorage=null;try{omniboxStorage=window.localStorage}catch{}
const omnibox=new OmniboxSession(omniboxStorage);
const displayStore=createDisplayStore(omniboxStorage);
const lyricFonts=new LyricFontPreferences(omniboxStorage);
let lyricScope='song',lyricGroup='art',fontPreviewObserver=null;
const safe=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const svg=(name)=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;
const getSetting=(name,fallback)=>{try{return localStorage.getItem('gnarly.web.'+name)||fallback}catch{return fallback}};
const setSetting=(name,value)=>{try{localStorage.setItem('gnarly.web.'+name,String(value))}catch{/* private mode */}};
const parseJSON=(s,fallback)=>{try{return JSON.parse(s)}catch{return fallback}};
const playlistStore=new PlaylistLibrary(omniboxStorage);
let selectedPlaylist=getSetting('smartPlaylist','Meu Mix');
if(!playlistStore.names().includes(selectedPlaylist))selectedPlaylist='Meu Mix';
let smartMode=effectiveMode(getSetting('smartMode','off'));
let smartStatus='Escolha um modo para complementar a fila sem substituir músicas.';
let pendingQueueId=null,smartFillEpoch=0,smartFillPending=false,lastSmartSeed='';
const audioWarmup=new AudioConnectionWarmup((url,options)=>fetch(url,options));
let playbackStartedAt=0;
const state={
  tracks:[],queue:[],current:null,playing:false,searchResults:[],searchTerm:'',
  playerSurfaceMode:normalizePlayerSurfaceMode(getSetting('playerSurfaceMode','turbulent')),
  theme:getSetting('theme','ACID'),reaction:getSetting('reaction','FLUIDO'),experience:getSetting('experience','original'),previousTheme:getSetting('previousTheme','ACID'),visualTab:'theme',lyricStyle:lyricFonts.global,
  stemStatus:'Separação neural de quatro fontes por GPU gratuita quando disponível. Você também pode carregar quatro Stems.',
  demucsBusy:false,demucsAbort:null,demucsAvailable:false,demucsChecked:false,stemModel:'',
  speed:Number(getSetting('speed','1')),reverb:Number(getSetting('reverb','0')),bass:Number(getSetting('bass','0')),
  pitch:getSetting('pitch','yes')!=='no',musicTab:'speedPitch',omniboxTab:getSetting('omniboxTab','search'),micRecorder:null,micStream:null,micChunks:[],exportStyle:'Clássica',
  favorites:parseJSON(getSetting('favorites','[]'),[]),preset:getSetting('preset','ORIGINAL'),
  audioState:'idle', playbackError:'',userPaused:false,
  lyrics:[],plainLyrics:[],lyricsSource:null,lyricsSynced:false,lyricsInstrumental:false,lyricsLoading:false,lyricsAIWorking:false,lyricsStatus:'As letras aparecem automaticamente quando disponíveis.',lyricsAbort:null,sheet:null,backgroundURL:null,backgroundMode:getSetting('backgroundMode','visual'),photoZoom:Number(getSetting('photoZoom','1')),photoX:Number(getSetting('photoX','0')),photoY:Number(getSetting('photoY','0')),photoAdjust:false,artworkHue:.58,searchTimer:null,lastLyric:-2,searchLoading:false,searchError:'',searchTerm:omnibox.query,history:omnibox.history,searchGeneration:0
};
const MODULE_NAMES=['controls','export','performance'];
const expandedModules=Object.fromEntries(MODULE_NAMES.map(name=>[name,getSetting('module.'+name,'closed')==='open']));
function isModuleVisible(name){
 if(name==='controls')return !displayStore.zen&&(displayStore.isVisible('presets')||displayStore.isVisible('controls'));
 return displayStore.isVisible(name);
}
function isModuleOpen(name){return !!expandedModules[name]&&isModuleVisible(name)}
function renderMusicModule(){return renderMusicPanel({
 tab:state.musicTab,preset:state.preset,speed:state.speed,reverb:state.reverb,bass:state.bass,pitch:state.pitch,reaction:state.reaction,
 showPresets:displayStore.isVisible('presets'),showControls:displayStore.isVisible('controls'),stemsReady:stems.ready,
 stemLevels:stems.levels,stemStatus:state.stemStatus,stemModel:state.stemModel,
 demucsBusy:state.demucsBusy,demucsAvailable:state.demucsAvailable,stemLabels:STEM_LABELS
})}
function renderExportModule(){return `<p class="section-note">Formatos da Stage 72. Opções ainda não disponíveis não serão exportadas silenciosamente.</p><div class="export-formats">${[['image','Imagem estática'],['video','Vídeo · Story de até 15 s'],['player-audio','Player com áudio'],['lyrics-audio','Letras com áudio'],['player-noaudio','Player sem áudio'],['lyrics-noaudio','Letras sem áudio']].map(([id,name])=>`<button data-export-format="${id}" class="export-option">${name}<small>${id==='image'?'PNG · visual atual':'Requer renderização web'}</small></button>`).join('')}</div><div class="section-head">ESTILO</div><div class="chip-row">${['Clássica','Neon','Mono','Cinema','Máquina'].map(x=>`<button class="chip ${state.exportStyle===x?'selected':''}" data-export-style="${x}">${x}</button>`).join('')}</div>`}
function renderModule(name){
 if(!isModuleOpen(name))return;
 const body=$('#module-'+name+'-body');if(!body)return;
 body.hidden=false;body.innerHTML=name==='controls'?renderMusicModule():name==='export'?renderExportModule():renderPerformancePanel(midiView());
 refreshMixerRails();
}
function syncModuleState(){
 let any=false;
 for(const name of MODULE_NAMES){
  const root=$('#module-'+name),body=$('#module-'+name+'-body'),visible=isModuleVisible(name);
  if(!root||!body)continue;
  root.hidden=!visible;if(visible)any=true;
  const open=visible&&expandedModules[name];root.classList.toggle('is-open',open);body.hidden=!open;
  const shortcut=name==='controls'?'#music-toggle-button':name==='export'?'#share-button':'#performance-button';
  for(const button of document.querySelectorAll('[data-module-toggle="'+name+'"],'+shortcut))button.setAttribute('aria-expanded',String(open));
  if(open&&!body.hasChildNodes())renderModule(name);
  if(!open&&body.hasChildNodes())body.replaceChildren();
 }
 $('#module-dock').hidden=!any;
}
function toggleModule(name,force){
 if(!MODULE_NAMES.includes(name))return;
 if(!isModuleVisible(name)){if(name==='controls')displayStore.set('controls',true);else displayStore.set(name,true);applyPanelVisibility()}
 expandedModules[name]=typeof force==='boolean'?force:!expandedModules[name];
 setSetting('module.'+name,expandedModules[name]?'open':'closed');
 syncModuleState();
 if(isModuleOpen(name)){
  renderModule(name);
  if(name==='performance')void pads.prepareSong(state.current);
  $('#module-'+name)?.scrollIntoView?.({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  if(name==='controls'&&state.musicTab==='stems')void refreshCloudStemAvailability();
 }
}
function renderActiveSurfaces(){if(state.sheet)renderSheet();for(const name of MODULE_NAMES)if(isModuleOpen(name))renderModule(name)}
if(!PALETTES[state.theme])state.theme='ACID';
if(!['DESLIGADO','FLUIDO','REATIVO'].includes(state.reaction))state.reaction='FLUIDO';
visual.setTheme(state.theme);visual.setExperience(state.experience);visual.setReaction(state.reaction);visual.startLoop();
applyLyricStyle(app,state.lyricStyle);
void loadLyricTypeface(designFont(state.lyricStyle));
engine.setSpeed(state.speed,state.pitch);engine.setReverb(state.reverb);engine.setBass(state.bass);
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,4200)}
function flashDJPad(index){
 const pad=document.querySelector('[data-dj-pad="'+index+'"]');
 if(!pad)return;
 pad.classList.remove('is-hit');void pad.offsetWidth;pad.classList.add('is-hit');
 clearTimeout(pad._djFlashTimeout);pad._djFlashTimeout=setTimeout(()=>pad.classList.remove('is-hit'),145);
}
function syncDJControls(){
 if(!isModuleOpen('performance'))return;
 const root=$('#module-performance-body'),m=pads.snapshot();
 if(root.querySelector('.dj-current-track')?.dataset.djState!==m.songStatus){renderModule('performance');return}
 for(const pad of root.querySelectorAll('[data-dj-pad]'))pad.classList.toggle('is-programmed',m.programmed[Number(pad.dataset.djPad)]>0);
 const loop=root.querySelector('[data-dj-command="loop"]'),record=root.querySelector('[data-dj-command="record"]');
 if(loop){loop.textContent=m.running?'■ Parar':'▶ Loop';loop.classList.toggle('active',m.running);loop.setAttribute('aria-pressed',String(m.running))}
 if(record){record.classList.toggle('recording',m.recording);record.setAttribute('aria-pressed',String(m.recording))}
 const out=root.querySelector('#dj-bpm-label');if(out)out.textContent=String(m.bpm);
}
function invalidateMidiAnalysis(){
 midiAnalysis.revision++;midiAnalysis.abort?.abort();
 midiAnalysis.abort=null;midiAnalysis.busy=false;midiAnalysis.notes=[];midiAnalysis.duration=0;
 midiAnalysis.harmony=null;midiAnalysis.trackId=null;midiAnalysis.status='MIDI estimado, sem alterar a reprodução.';
}
async function analyzeMidi(file){
 if(!file)return;
 if(file.size>PITCH_FILE_LIMIT){toast('Selecione um trecho de até 10 MB.');return}
 midiAnalysis.abort?.abort();
 const controller=new AbortController(),revision=++midiAnalysis.revision;
 const trackId=state.current?.id||'standalone';
 midiAnalysis.abort=controller;midiAnalysis.busy=true;midiAnalysis.notes=[];midiAnalysis.harmony=null;
 midiAnalysis.status='Preparando áudio local · sem enviar arquivo à nuvem…';
 renderModule('performance');
 try{
  const result=await transcribeMidiFile(file,{signal:controller.signal,onProgress:p=>{
   if(revision!==midiAnalysis.revision)return;
   midiAnalysis.status='Basic Pitch · '+Math.round(p*100)+'% · analisando notas localmente';
   const element=document.querySelector('#dj-intelligence-status');if(element)element.textContent=midiAnalysis.status;
  }});
  if(revision!==midiAnalysis.revision||controller.signal.aborted||trackId!==(state.current?.id||'standalone'))return;
  midiAnalysis.notes=validateNotes(result.notes||[],result.duration||25);
  midiAnalysis.duration=Math.min(25,Number(result.duration)||25);
  midiAnalysis.harmony=harmonySummary(midiAnalysis.notes,midiAnalysis.duration);
  midiAnalysis.trackId=trackId;
  midiAnalysis.status=midiAnalysis.notes.length?
   'Notas e acordes estimados. Revise antes de exportar; nenhum áudio saiu do dispositivo.':
   'Não foram encontradas notas suficientemente confiáveis. Experimente instrumento isolado.';
 }catch(error){
  if(revision!==midiAnalysis.revision)return;
  midiAnalysis.status=error?.name==='AbortError'?'Análise cancelada.':String(error?.message||'Não foi possível analisar.');
 }finally{
  if(revision===midiAnalysis.revision){
   midiAnalysis.abort=null;midiAnalysis.busy=false;
   renderModule('performance');
  }
 }
}
function exportEstimatedMidi(){
 if(!midiAnalysis.notes.length)return;
 try{
  const bytes=notesToMidi(midiAnalysis.notes,{duration:midiAnalysis.duration,bpm:120});
  const blob=new Blob([bytes],{type:'audio/midi'}),link=document.createElement('a'),url=URL.createObjectURL(blob);
  link.href=url;link.download='GNARLY-notas-estimadas.mid';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('MIDI estimado exportado · 120 BPM de referência.');
 }catch(error){toast(error?.message||'Não foi possível exportar MIDI.')}
}

pads.onHit=flashDJPad;
pads.onChange=syncDJControls;
pads.onStep=step=>document.querySelectorAll('[data-dj-step]').forEach(el=>el.classList.toggle('is-current',Number(el.dataset.djStep)===step));
function fmt(secs){if(!Number.isFinite(secs))return '0:00';return `${Math.floor(secs/60)}:${String(Math.floor(secs%60)).padStart(2,'0')}`}
function titleForFile(file){const name=file.name.replace(/\.[^.]+$/,'');const parts=name.split(/\s+[—–-]\s+/);return {title:parts.length>=2?parts.slice(1).join(' - '):name,artist:parts.length>=2?parts[0]:'Arquivo local'}}
function updateBadges(){
 document.documentElement.style.setProperty('--acid', ({'ACID':'#46ff12','CYBER NIGHT':'#35d5ff','CRIMSON':'#ff425d','CHROME':'#e6f2ef','SMOKE':'#d5c2ec','XEROX SERPENTINE':'#d5ec46','PRISM CARMINE':'#ff56ab','GNARLY':'#45ff8a'})[state.theme]||'#46ff12');
 $('.build-badge').textContent=`WEB · ${state.theme}`;
 visual.setTheme(state.theme);visual.setExperience(state.experience);visual.setReaction(state.reaction);
 const fave=state.current&&state.favorites.some(x=>x.id===state.current.id);
 $('#favorite-button').classList.toggle('is-favorite',!!fave);
 $('#favorite-button').setAttribute('aria-label',fave?'Remover dos favoritos':'Adicionar aos favoritos');
}
// Same media source as Stage72's AudioDownloadManager: Render /download.
// Do not start an external player or load a file picker as an implicit fallback.
function prepareNativeAudio(track,attempt=0){
 const url=trackAudioURL(track,{attempt});
 if(!url)return false;
 // Only start the native extraction when the user requests Play; once started,
 // let the media element buffer ahead instead of forcing metadata-only mode.
 if(audio.src!==url){audio.preload='auto';audio.src=url;}
 return true;
}
function reportAudioError(text){
 state.audioState='error';state.playbackError=text;
 const status=$('#player-status');if(status){status.textContent=text;status.hidden=false;}
 toast(text);
}
function reportAudioStatus(text){
 const status=$('#player-status');if(status){status.textContent=text;status.hidden=!text;}
}
function updatePlayer(){
 const track=state.current;
 $('#track-title').textContent=track?.title||'Sua música. Seu universo.';
 $('#track-artist').textContent=track?displayArtist(track):'Selecione uma música para começar';
 $('#cover-image').src=track?.artwork||icon;
 $('#cover-image').onerror=()=>{$('#cover-image').onerror=null;$('#cover-image').src=icon};
 updatePlayerSurfaceArtwork();
 $('#cover-play-overlay').textContent=track?'Fundo da capa':'Escolher música';
 $('#cover-button').setAttribute('aria-label',track?'Configurar fundo a partir da capa':'Abrir busca de músicas');
 applyBackground();
 $('#cover-button').classList.toggle('has-audio',!!track);
 $('#play-button').innerHTML=svg(state.playing?'pause':'play');
 $('#play-button').setAttribute('aria-label',state.playing?'Pausar':'Reproduzir');
 $('#next-button').disabled=state.queue.length===0;
 $('#duration-label').textContent=track?.source==='preview'?'PRÉVIA · 0:30':fmt(Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:track?.duration||0);
 updatePresetButtons();
 updateBadges(); updateProgress();
 if('mediaSession' in navigator && typeof MediaMetadata!=='undefined'){try{navigator.mediaSession.metadata=track?new MediaMetadata({title:track.title,artist:displayArtist(track),album:track.album||'GNARLY WEB',artwork:[{src:track.artwork||new URL(icon,location.href).href,sizes:'256x256'}]}):null}catch{}}
}
function updateProgress(){const d=audio.duration||0,t=audio.currentTime||0,p=d?Math.min(1000,1000*t/d):0;const slider=$('#seek-slider');slider.value=String(p);slider.style.setProperty('--progress',`${p/10}%`);$('#elapsed-label').textContent=fmt(t);if(state.current?.source!=='preview')$('#duration-label').textContent=fmt(d||state.current?.duration||0)}
// Internal artwork uses a separate layer, never the app's backgroundMode.
// Repeating two identical tiles produces a cyclic lateral loop with no reset jump.
let lastSurfaceArtwork='';
function safeSurfaceArtwork(raw){
 try{
  const url=new URL(raw||icon,location.href);
  if(['https:','http:','blob:'].includes(url.protocol))return url.href;
 }catch{}
 return new URL(icon,location.href).href;
}
function updatePlayerSurfaceArtwork(){
 const original=safeSurfaceArtwork(state.current?.artwork);
 const url=safeSurfaceArtwork(preferHighResolutionArtwork(original,1600));
 if(lastSurfaceArtwork===original)return;
 lastSurfaceArtwork=original;
 const fallback=new URL(icon,location.href).href;
 // Add the local logo underneath third-party artwork as a network-error fallback.
 const images=`url(${JSON.stringify(url)}),url(${JSON.stringify(fallback)})`;
 $('#player-surface-artwork').style.backgroundImage=images;
 $('#player-surface-artwork-repeat').style.backgroundImage=images;
 if(url!==original){
  const probe=new Image();
  probe.onerror=()=>{
   if(lastSurfaceArtwork!==original)return; // Old track should never replace the new cover.
   const originalImages='url('+JSON.stringify(original)+'),url('+JSON.stringify(fallback)+')';
   $('#player-surface-artwork').style.backgroundImage=originalImages;
   $('#player-surface-artwork-repeat').style.backgroundImage=originalImages;
  };
  probe.src=url;
 }
}
function closePlayerSurfaceMenu(restoreFocus=false){
 const menu=$('#player-surface-menu');
 const wasOpen=!menu.hidden;
 menu.hidden=true;
 $('#player-surface-button').setAttribute('aria-expanded','false');
 if(restoreFocus&&wasOpen)$('#player-surface-button').focus();
}
function openPlayerSurfaceMenu(){
 if(state.sheet)closeSheet();
 const menu=$('#player-surface-menu');
 menu.innerHTML=renderPlayerSurfaceMenu(state.playerSurfaceMode);
 menu.hidden=false;
 $('#player-surface-button').setAttribute('aria-expanded','true');
 menu.querySelector('[aria-checked="true"]')?.focus();
}
function applyPlayerSurfaceMode(next,{persist=true}={}){
 const mode=normalizePlayerSurfaceMode(next);
 state.playerSurfaceMode=mode;
 app.dataset.playerSurfaceMode=mode;
 $('#player-surface-label').textContent=playerSurfaceShortLabel(mode);
 if(persist)setSetting('playerSurfaceMode',mode);
 updatePlayerSurfaceArtwork();
}

function applyBackground(){
 const cover=state.current?.artwork,mode=state.backgroundMode,photo=$('#photo-background');
 const ownPhoto=mode==='custom'&&!!state.backgroundURL;
 const coverPhoto=mode==='cover'&&!!cover;
 // All three modes use the SAME viewport-fixed visual layer, never a
 // background image on the document-height-dependent player shell.
 app.classList.toggle('custom-bg',ownPhoto);
 app.classList.toggle('cover-bg',coverPhoto);
 background.classList.toggle('custom-bg',ownPhoto);
 background.classList.toggle('cover-bg',coverPhoto);
 photo.hidden=!ownPhoto&&!coverPhoto;
 if(ownPhoto){
  photo.style.backgroundImage=`url("${state.backgroundURL}")`;
  photo.style.transform=`translate3d(${state.photoX}%,${state.photoY}%,0) scale(${state.photoZoom})`;
 }else if(coverPhoto){
  const original=safeSurfaceArtwork(cover),large=safeSurfaceArtwork(preferHighResolutionArtwork(original,2000));
  photo.style.backgroundImage=`linear-gradient(#0002,#0007),url("${large.replaceAll('"','%22')}"),url("${original.replaceAll('"','%22')}")`;
  photo.style.transform='';
 }else{
  photo.style.backgroundImage='';
  photo.style.transform='';
 }
 app.style.backgroundImage='';
 visual.setPaused(ownPhoto||coverPhoto);
}
async function loadArtworkHue(track){if(!track?.artwork||track.artwork===icon){state.artworkHue=.58;return}try{const img=new Image();img.crossOrigin='anonymous';img.src=track.artwork;await img.decode();if(state.current!==track)return;const cv=document.createElement('canvas');cv.width=cv.height=20;const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,20,20);const data=ctx.getImageData(0,0,20,20).data;let x=0,y=0;for(let i=0;i<data.length;i+=4){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d>.08){if(max===r)h=((g-b)/d+6)%6/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6}x+=Math.cos(h*2*Math.PI)*d;y+=Math.sin(h*2*Math.PI)*d}if(x||y)state.artworkHue=(Math.atan2(y,x)/(Math.PI*2)+1)%1}catch{/* third-party artwork might be CORS protected; deterministic fallback */}}
let lyricsAIAutoSession=false;
const lyricsAIOnce=new Set();
async function loadAutoLyrics(track){
 state.lyricsAbort?.abort();const ac=new AbortController();state.lyricsAbort=ac;
 const immediate=cachedAutoLyrics(track);
 state.lyrics=immediate?.lines||[];state.plainLyrics=immediate?.plainLines||[];
 state.lyricsSource=immediate?.source||null;state.lyricsSynced=!!immediate?.synced;state.lyricsInstrumental=!!immediate?.instrumental;
 state.lyricsLoading=!immediate;state.lastLyric=-2;
 state.lyricsStatus=immediate?.status||'Procurando letra automaticamente…';
 syncLyrics();
 if(state.sheet==='karaoke')renderSheet();
 if(immediate)return; // Synchronous cached LRC: no blank frame on a returning song.
 try{
  const found=await autoLyrics(track,{signal:ac.signal});
  if(ac.signal.aborted||state.current!==track)return;
  state.lyrics=found.lines||[];state.plainLyrics=found.plainLines||[];
  state.lyricsSource=found.source;state.lyricsSynced=!!found.synced;state.lyricsInstrumental=!!found.instrumental;
  state.lyricsStatus=found.status;state.lastLyric=-2;
 }catch{
  if(ac.signal.aborted||state.current!==track)return;
  state.lyricsStatus='Não foi possível consultar as letras neste momento.';
 }finally{
  if(state.lyricsAbort===ac&&!ac.signal.aborted&&state.current===track){
   state.lyricsLoading=false;syncLyrics();if(state.sheet==='karaoke')renderSheet();
   if(lyricsAIAutoSession&&track.source==='local'&&track.file&&!state.lyrics.length&&!state.plainLyrics.length&&!state.lyricsAIWorking&&!lyricsAIOnce.has(track.id)&&!state.lyricsStatus.includes('limitou')&&!state.lyricsInstrumental){
    lyricsAIOnce.add(track.id);void transcribeOwnLyrics(track.file);
   }
  }
 }
}
let lyricsAIController=null;
async function transcribeOwnLyrics(file){
 const track=state.current;if(!track||!file)return;
 if(!/^audio\//.test(file.type)&&!/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name)){toast('Selecione um arquivo de áudio válido.');return}
 if(file.size>9*1024*1024){toast('Para transcrição, o áudio deve ter até 9 MB.');return}
 lyricsAIController?.abort();const ctl=new AbortController();lyricsAIController=ctl;
 state.lyricsAIWorking=true;state.lyricsStatus='IA transcrevendo áudio autorizado · pode demorar…';
 if(state.sheet==='karaoke')renderSheet();
 try{
  const r=await fetch('/api/lyrics-ai',{
   method:'POST',
   headers:{'content-type':file.type||'application/octet-stream','x-gnarly-audio-consent':'yes'},
   body:file,signal:ctl.signal
  });
  const response=await r.json();
  if(state.current!==track)return;
  if(!r.ok){state.lyricsStatus=response.error||'IA temporariamente indisponível.';return}
  if(!response.lines?.length&&!response.plainLines?.length){
   state.lyricsStatus=response.status||'Não foi possível reconhecer letras.';return;
  }
  state.lyrics=(response.lines||[]).slice(0,220);state.plainLyrics=(response.plainLines||[]).slice(0,240);
  state.lyricsSource='whisper-ai';state.lyricsSynced=!!response.synced;
  state.lyricsStatus=response.status||'Transcrição por IA · verifique a letra.';
  state.lastLyric=-2;syncLyrics();
 }catch{if(state.current===track)state.lyricsStatus='Sem conexão com o serviço de transcrição.'}
 finally{if(lyricsAIController===ctl){lyricsAIController=null;state.lyricsAIWorking=false;if(state.current===track&&state.sheet==='karaoke')renderSheet()}}
}
function syncLyrics(){
 const i=lyricIndex(state.lyrics,audio.currentTime||0);
 if(state.lastLyric===i)return;
 state.lastLyric=i;
 const el=$('#floating-lyrics'),line=$('#floating-line');
 el.hidden=!state.current;
 if(!state.current)return;
 // Automatic feedback even before the very first LRC arrives; compact mic remains visible.
 // This is a status line, not fabricated synchronized lyrics.
 const text=state.lyrics.length?(i>=0?state.lyrics[i].text:'♪ ♪ ♪'):
  state.lyricsLoading?'Buscando letra…':state.plainLyrics.length?state.plainLyrics[0]:
  state.lyricsInstrumental?'♪ Faixa instrumental':'Karaokê · abra para cantar';
 // Escaped per-word paper compositions only for the active line; no LRC changes.
 line.innerHTML=renderLyricArtwork(text,state.lyricStyle,{lineId:i,active:true});
 if(state.sheet==='karaoke')renderSheet();
}
function refreshLyricArtwork(){state.lastLyric=-2;syncLyrics()}
let metadataAbort=null;
async function enrichSelectedTrack(track,knownDuration=0){
 if(!track||!['youtube','local'].includes(track.source)||state.current!==track)return;
 // An opaque video ID is not a song title; do not invent an artist for it.
 if(/^[A-Za-z0-9_-]{11}$/.test(track.title||'')&&isGenericArtist(track.artist))return;
 if(track.metadataConfidence>=84&&track.album&&track.artwork&&!isGenericArtist(track.artist))return;
 const duration=Number(track.duration)>0?Number(track.duration):Number(knownDuration)||0;
 const credit=inferredCredit(track.title,track.artist);
 if(!duration&&!credit.artist)return;
 metadataAbort?.abort();const controller=new AbortController();metadataAbort=controller;
 try{
  const metadata=await resolveTrackMetadata({...track,duration},{signal:controller.signal});
  if(controller.signal.aborted||state.current!==track||!metadata)return;
  const before=track.artist,changed=applyMetadata(track,metadata);
  if(!changed)return;
  if(isGenericArtist(before)&&!isGenericArtist(track.artist)){
   const choice=lyricFonts.selected(track).style;
   if(choice!==state.lyricStyle){state.lyricStyle=choice;applyLyricStyle(app,choice);void loadLyricTypeface(designFont(choice))}
  }
  // Transport, playback URL, audio graph and queue identity remain untouched.
  omnibox.updateMetadata(track);state.history=omnibox.history;
  for(const favorite of state.favorites)if(favorite.id===track.id){
   for(const key of ['title','artist','album','artwork'])favorite[key]=track[key];
  }
  updatePlayer();void loadArtworkHue(track);
  if(isGenericArtist(before)&&!isGenericArtist(track.artist))void loadAutoLyrics(track);
  if(state.sheet==='search')displaySearch(state.searchResults);
 }catch(error){if(error?.name!=='AbortError')console.debug('Metadata enrichment unavailable');}
}
function selectTrack(track,autoplay=true,{fromQueue=false}={}){
 if(!track)return;
 pendingQueueId=fromQueue?track.id:null;
 if(isGenericArtist(track.artist))track.artist=displayArtist(track);
 audioDelivery.select(track);recoveryOperation=null;state.userPaused=false;
 state.demucsAbort?.abort();metadataAbort?.abort();invalidateMidiAnalysis();lyricsAIController?.abort();state.lyricsAIWorking=false;pads.resetSong();stems.clear();state.stemModel='';state.stemStatus='Escolha quatro Stems ou solicite separação automática.';
 closeYouTubePlayer();audio.pause();state.playing=false;state.current=track;
 state.lyricStyle=lyricFonts.selected(track).style;applyLyricStyle(app,state.lyricStyle);void loadLyricTypeface(designFont(state.lyricStyle));
 state.artworkHue=.58;state.playbackError='';state.audioState='idle';
 if(track.source==='youtube'){
   // Deferred until Play: avoids wasting a Render extraction on every tapped row.
   audio.removeAttribute('src');audio.preload='none';audio.load();
 }else{audio.preload='metadata';audio.src=track.url;audio.load();}
 reportAudioStatus('');state.lastLyric=-2;updatePlayer();void loadArtworkHue(track);void loadAutoLyrics(track);prefetchNextLyrics();
 if(track.source==='youtube')void enrichSelectedTrack(track);omnibox.record(track);state.history=omnibox.history;
 if(isModuleOpen('performance'))void pads.prepareSong(track);
 if(autoplay)void play();if(state.sheet&&['library','queue','search','lyric-style'].includes(state.sheet))renderSheet();
}
async function recoverNativeAudio(track,initialError=null){
 if(!track||track.source!=='youtube'||state.current!==track||state.userPaused)return false;
 if(recoveryOperation)return recoveryOperation;
 const operation=(async()=>{
  const recovered=await audioDelivery.retry({
   track,error:initialError,mediaError:audio.error,
   isCurrent:()=>state.current===track&&!state.userPaused,
   onRetry:(attempt,total)=>{state.audioState='recovering';reportAudioStatus(`Restabelecendo áudio · tentativa ${attempt}/${total}…`);},
   restart:async attempt=>{
    if(state.current!==track||state.userPaused)return false;
    const position=Number(audio.currentTime)||0;
    if(!prepareNativeAudio(track,attempt))return false;
    // A new URL already starts resource selection: avoid a duplicate load().
    // Restore the former position only when the same recording is still active.
    const restore=()=>{
     if(position>3&&state.current===track&&!state.userPaused&&Number.isFinite(audio.duration)&&audio.duration>position)
      audio.currentTime=position;
    };
    audio.addEventListener('loadedmetadata',restore,{once:true});
    try{
     const unlock=engine.resume(),start=audio.play();
     await Promise.all([unlock,start]);
     restore();
     return true;
    }finally{audio.removeEventListener('loadedmetadata',restore);}
   }
  });
  if(state.current!==track||state.userPaused)return false;
  if(recovered){state.audioState='playing';state.playbackError='';reportAudioStatus('');return true;}
  state.playing=false;updatePlayer();reportAudioError(playbackFailureMessage(initialError,audio.error));
  return false;
 })();
 recoveryOperation=operation;
 try{return await operation}finally{if(recoveryOperation===operation)recoveryOperation=null;}
}
async function play(){
 if(!state.current){openSheet('search');toast('Escolha uma música na Busca ou adicione seu áudio pelo botão +.');return;}
 if(recoveryOperation)return recoveryOperation;
 const track=state.current;
 playbackStartedAt=performance.now();
 if(state.audioState==='error'||state.userPaused)audioDelivery.select(track); // Manual retry starts a new bounded session.
 state.userPaused=false;
 if(track.source==='youtube'){
  if(!prepareNativeAudio(track,audioDelivery.attempt)){reportAudioError('ID de música inválido. Escolha outro resultado.');return;}
  state.audioState='loading';reportAudioStatus('Conectando ao backend GNARLY · preparando áudio…');
 }
 try{
  // Both calls start synchronously within the user's click gesture (Safari).
  const unlock=engine.resume(),start=audio.play();
  await Promise.all([unlock,start]);
  if(state.current!==track||state.userPaused)return;
  state.playing=true;state.audioState='playing';state.playbackError='';reportAudioStatus('');updatePlayer();
 }catch(e){
  if(state.current!==track||state.userPaused)return;
  if(track.source==='youtube'){await recoverNativeAudio(track,e);}
  else{state.playing=false;updatePlayer();reportAudioError('Falha ao reproduzir este arquivo de áudio.');}
  console.warn('GNARLY WEB audio play:',e);
 }
}
function pause(){state.userPaused=true;audioDelivery.cancel();recoveryOperation=null;audio.pause();stems.pause();closeYouTubePlayer();state.playing=false;updatePlayer()}
function next(){const nextTrack=state.queue[0];if(nextTrack)selectTrack(nextTrack,true,{fromQueue:true});else{pause();audio.currentTime=0;toast('Fim da fila')}updatePlayer()}
function prefetchNextLyrics(){
 const nextTrack=state.queue.find(x=>x.id!==state.current?.id);
 if(nextTrack)void prefetchAutoLyrics(nextTrack).catch(()=>{});
}
function previous(){if(audio.currentTime>3){audio.currentTime=0;return}const idx=state.tracks.findIndex(x=>x.id===state.current?.id);if(idx>0)selectTrack(state.tracks[idx-1]);else audio.currentTime=0}
function addToQueue(track,{quiet=false}={}){if(!track)return false;const before=state.queue.length;state.queue=appendUnique(state.queue,[track],state.current?.id);if(before===state.queue.length){if(!quiet)toast('Esta música já está na fila ou tocando.');return false}updatePlayer();prefetchNextLyrics();if(state.sheet==='queue')renderSheet();if(!quiet)toast('Adicionado à fila: '+track.title);return true}
function importAudio(files){const valid=[...files].filter(x=>x.type.startsWith('audio/')||/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(x.name));if(!valid.length){toast('Escolha arquivos de áudio compatíveis.');return}for(const file of valid){const names=titleForFile(file);state.tracks.push({id:`local:${crypto.randomUUID?.()||Date.now()+Math.random()}`,title:names.title,artist:names.artist,album:'Biblioteca local',artwork:icon,url:URL.createObjectURL(file),file,source:'local',duration:0})}if(!state.current){selectTrack(state.tracks[0],true);state.queue=appendUnique(state.queue,state.tracks.slice(1),state.current?.id);updatePlayer()}else if(valid.length>1)toast(`${valid.length} músicas importadas`);if(state.sheet==='library')renderSheet()}
function applyPreset(id){const v=musicalPreset(id);if(!v)return;state.preset=id;state.speed=v.speed;state.reverb=v.reverb;state.pitch=v.pitch;engine.setSpeed(v.speed,v.pitch);engine.setReverb(v.reverb);for(const key of ['speed','reverb','pitch','preset'])setSetting(key,key==='pitch'?(state.pitch?'yes':'no'):state[key]);updatePresetButtons();renderModule('controls');if(stems.ready)stems.sync();toast(id==='ORIGINAL'?'Som original restaurado':id+' ativado')}
function updatePresetButtons(){document.querySelectorAll('[data-preset]').forEach(b=>{const selected=b.dataset.preset===state.preset;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))})}
function openYouTubePlayer(track){if(!/^[A-Za-z0-9_-]{11}$/.test(track?.videoId||''))return toast('Link do YouTube inválido');audio.pause();const dialog=$('#youtube-player-dialog'),frame=$('#youtube-player-frame');frame.src='https://www.youtube-nocookie.com/embed/'+track.videoId+'?autoplay=1&playsinline=1';$('#youtube-player-title').textContent=track.title;$('#youtube-player-link').href='https://www.youtube.com/watch?v='+track.videoId;dialog.hidden=false;dialog.setAttribute('aria-hidden','false');toast('Player oficial: Nightcore e reverb não podem alterar o áudio dentro do YouTube.');}
function closeYouTubePlayer(){const dialog=$('#youtube-player-dialog');if(!dialog)return;dialog.hidden=true;dialog.setAttribute('aria-hidden','true');$('#youtube-player-frame').src='about:blank'}
function toggleFavorite(){if(!state.current){openSheet('library');return}const at=state.favorites.findIndex(x=>x.id===state.current.id);if(at>=0){state.favorites.splice(at,1);toast('Removido dos favoritos')}else{state.favorites.push(state.current);toast('Adicionado aos favoritos')}setSetting('favorites',JSON.stringify(state.favorites.filter(x=>x.source!=='local').slice(-100)));updatePlayer();if(state.sheet==='favorites')renderSheet()}
const OMNIBOX_TABS=['search','library','queue','karaoke'];
function openSheet(which){
 closePlayerSurfaceMenu();
 if(which==='search'||which==='queue')audioWarmup.start();
 if(which==='stems'){state.musicTab='stems';which='controls'}
 if(MODULE_NAMES.includes(which)){if(state.sheet)closeSheet();toggleModule(which,true);return}
 if(OMNIBOX_TABS.includes(which)){state.omniboxTab=which;setSetting('omniboxTab',which)}
 state.sheet=which;
 $('#bottom-sheet').hidden=false;$('#panel-backdrop').hidden=false;
 $('#bottom-sheet').classList.toggle('display-sheet',which==='display');
  $('#bottom-sheet').classList.toggle('music-sheet',which==='controls');
 $('#bottom-sheet').classList.toggle('performance-sheet',which==='performance');
 $('#sheet-title').textContent=({search:'Busca',queue:'Próximas músicas',library:'Mix / Biblioteca',favorites:'Favoritos',controls:'Música',display:'Exibição',performance:'Performance / DJ',more:'GNARLY',install:'Instalar GNARLY',export:'Exportar',theme:'Camada 1 · Tema',experience:'Camada 2 · Experiência',reaction:'Ritmo visual', 'lyric-style':'Aa · Estilo de legenda',karaoke:'Karaokê',background:'Fundo'})[which]||'GNARLY';
 $('#search-toggle').setAttribute('aria-expanded',String(which==='display'));
 $('#omnibox-toggle').setAttribute('aria-expanded',String(OMNIBOX_TABS.includes(which)));
 syncCreativeQuickActions();
 renderSheet();
 if(which==='search')setTimeout(()=>$('#search-term')?.focus(),80);
 if(which==='controls'&&state.musicTab==='stems')void refreshCloudStemAvailability();
}
function closeSheet(){
 state.sheet=null;$('#bottom-sheet').hidden=true;$('#panel-backdrop').hidden=true;
 $('#bottom-sheet').classList.remove('display-sheet','music-sheet','performance-sheet');
 $('#search-toggle').setAttribute('aria-expanded','false');
 $('#omnibox-toggle').setAttribute('aria-expanded','false');
 syncCreativeQuickActions();
}
function syncCreativeQuickActions(){
 for(const [id,sheet] of [['theme-button','theme'],['experience-button','experience'],['lyric-style-button','lyric-style']]){
  const control=$('#'+id);if(control)control.setAttribute('aria-expanded',String(state.sheet===sheet));
 }
}
function applyPanelVisibility(){
 const visible=key=>displayStore.isVisible(key);
 app.classList.toggle('zen-mode',displayStore.zen);
 app.dataset.playerSurfaceMode=state.playerSurfaceMode;
 app.dataset.playerSize=displayStore.size;
 app.dataset.playerMaterial=displayStore.material;
 $('#brand-line').hidden=!visible('header');
 $('#player-section').hidden=!visible('player');
 $('#omnibox-shell').hidden=!visible('search');
 $('#share-button').hidden=!visible('export');
 for(const id of ['theme-button','experience-button','lyric-style-button','background-button','music-toggle-button','record-button'])$('#'+id).hidden=!visible('header');
 syncModuleState();
}
function omniboxTabs(){return `<div class="omnibox-tabs" role="tablist" aria-label="Omnibox">${[['search','Busca'],['library','Mix · Offline'],['queue','Fila'],['karaoke','Karaokê']].map(([id,label])=>`<button role="tab" data-omnibox-tab="${id}" aria-selected="${state.sheet===id}" class="${state.sheet===id?'active':''}">${label}</button>`).join('')}</div>`}
function mediaList(tracks,context){
 if(!tracks.length)return '<p class="section-note">Nenhuma música por aqui ainda.</p>';
 return '<div class="media-list">'+tracks.map((tr,i)=>{
  const label=safe(tr.title),attrs=' data-context="'+safe(context)+'" data-index="'+i+'"';
  const source=tr.source==='preview'?'Prévia · 30 s':tr.source==='youtube'?'GNARLY · áudio via backend':'Áudio completo · local';
  const play='<button data-action="play"'+attrs+' aria-label="Reproduzir '+label+'">'+svg('play')+'</button>';
  const actions=context==='queue'
   ? '<button data-action="up"'+attrs+' aria-label="Subir '+label+' na fila">↑</button><button data-action="down"'+attrs+' aria-label="Descer '+label+' na fila">↓</button><button data-action="remove"'+attrs+' aria-label="Remover '+label+' da fila">×</button>'
   :context==='playlist'
   ? '<button data-action="enqueue"'+attrs+' aria-label="Enfileirar '+label+'">'+svg('plus')+'</button><button data-action="playlist-remove"'+attrs+' aria-label="Remover '+label+' da playlist">×</button>'
   : '<button data-action="enqueue"'+attrs+' aria-label="Enfileirar '+label+'">'+svg('plus')+'</button><button data-action="playlist-add"'+attrs+' aria-label="Salvar '+label+' na playlist">♫+</button>';
  return '<div class="media-item"><img src="'+safe(tr.artwork||icon)+'" alt="" loading="lazy" /><div class="media-text"><strong>'+label+'</strong><small>'+safe(displayArtist(tr))+' · '+source+'</small></div>'+play+actions+'</div>';
 }).join('')+'</div>';
}
const visualTile=(name)=>`<button class="visual-choice ${state.theme===name?'active':''}" data-theme="${safe(name)}"><i class="swatch" style="--swatch-a:${PALETTES[name]?.[0]||'#000'};--swatch-b:${PALETTES[name]?.[1]||'#444'};--swatch-c:${PALETTES[name]?.[2]||'#aaa'}"></i><strong>${safe(name)}</strong></button>`;
const experienceTile=(v)=>`<button class="visual-choice ${state.experience===v.id?'active':''}" data-experience="${v.id}"><strong>${safe(v.name)}</strong><small>${safe(v.detail)}</small></button>`;
const btn=(caption,command,other='')=>`<button class="action-button ${other}" data-command="${command}">${caption}</button>`;
const setting=(id,title,value,minimum,maximum,step,unit)=>`<div class="setting"><div class="setting-title"><span>${title}</span><span id="${id}-value">${Number(value).toFixed(step<1?2:0)}${unit}</span></div><input id="${id}" data-slider="${id}" type="range" min="${minimum}" max="${maximum}" step="${step}" value="${value}" aria-label="${title}" /></div>`;
async function refreshCloudStemAvailability(){
 try{
  const status=await demucsStatus();
  state.demucsChecked=true;state.demucsAvailable=status.ready;
  if(isModuleOpen('controls')&&state.musicTab==='stems'&&!state.demucsBusy&&!stems.ready){
   state.stemStatus=status.ready?'GPU gratuita disponível · '+status.providerName+' · quatro fontes. Sujeito a cota, fila e consentimento.':'GPU temporariamente indisponível. Ainda é possível carregar quatro arquivos separados.';
   renderModule('controls');
  }
 }catch{state.demucsChecked=true;state.demucsAvailable=false;
  if(isModuleOpen('controls')&&state.musicTab==='stems'&&!stems.ready&&!state.demucsBusy){state.stemStatus='Não foi possível verificar a GPU. Confira a conexão ou importe os quatro arquivos.';renderModule('controls')}
 }
}

async function startDemucs(){
 if(state.demucsBusy)return;
 if(stems.ready){toast('Stems já carregados. Desative-os para separar novamente.');return;}
 if(!state.current){toast('Escolha uma música para separar.');return;}
 const ac=new AbortController();state.demucsAbort=ac;state.demucsBusy=true;
 const current=state.current, update=s=>{state.stemStatus=s;if(isModuleOpen('controls')&&state.musicTab==='stems')renderModule('controls')};
 try{
  update('Verificando modelo e cota GPU…');
  const status=await demucsStatus();
  state.demucsChecked=true;state.demucsAvailable=status.ready;
  if(!status.ready)throw Error(status.enabled&&!status.provider_available?'O serviço gratuito de separação está temporariamente indisponível.':'Nenhuma GPU de separação autorizada está ativa.');
  if(!confirm('Separar em 4 fontes com '+status.providerName+'? O áudio será enviado para um Space externo do Hugging Face, sujeito a filas e cotas. Continue apenas se tem autorização para processar esta música.')){update('Separação cancelada.');return;}
  const source=await prepareDemucsAudio(current,audio,{signal:ac.signal});
  if(state.current!==current)throw Error('Faixa trocada; separação cancelada.');
  const result=await separateWithBestModel({...source,status,signal:ac.signal,onStatus:update});
  if(state.current!==current)throw Error('Faixa trocada; resultado descartado.');
  update('Conectando 4 fontes ao mixer…');
  await stems.load(result.files);state.stemModel=result.model;
  update(result.model+' pronto · Voz, Bateria, Baixo e Outros independentes.');
  toast('Stems '+result.model+' prontos.');
 }catch(e){update(e?.name==='AbortError'?'A solicitação foi cancelada (a GPU pode continuar processando na fila).':e.message||'Não foi possível separar esta música.');}
 finally{state.demucsBusy=false;state.demucsAbort=null;if(isModuleOpen('controls'))renderModule('controls')}
}

function setSmartMode(mode){
 smartMode=effectiveMode(mode);setSetting('smartMode',smartMode);
 smartFillEpoch++;smartFillPending=false;lastSmartSeed='';
 smartStatus=smartMode==='off'?'Fila manual · ordem preservada.':'Modo '+smartMode+' ativo · músicas manuais preservadas.';
 if(smartMode==='playlist'){const items=playlistStore.tracks(selectedPlaylist);state.queue=appendUnique(state.queue,items.filter(t=>!state.history.slice(0,3).some(r=>r.id===t.id)),state.current?.id);}
 updatePlayer();if(state.sheet==='queue')renderSheet();if(smartMode!=='off')void maybeFillSmartQueue({force:true});
}
async function maybeFillSmartQueue({force=false}={}){
 const mode=smartMode,anchor=state.current;
 if(mode==='off'||!anchor||(!force&&state.queue.length>=2))return;
 if(mode==='playlist'){
  const items=playlistStore.tracks(selectedPlaylist).filter(x=>!state.history.slice(0,3).some(r=>r.id===x.id));
  state.queue=appendUnique(state.queue,items,anchor.id);
  updatePlayer();if(state.sheet==='queue')renderSheet();return;
 }
 const query=radioQuery(mode,anchor);
 if(!query){smartStatus='Artista ou álbum não confirmado para esta música.';if(state.sheet==='queue')renderSheet();return;}
 const seed=mode+'|'+anchor.id+'|'+query;
 if(smartFillPending||(!force&&seed===lastSmartSeed))return;
 const ticket=++smartFillEpoch;
 smartFillPending=true;lastSmartSeed=seed;smartStatus='Consultando catálogo GNARLY sem interromper a música…';
 if(state.sheet==='queue')renderSheet();
 try{
  const cached=[...state.searchResults,...state.history,...state.favorites,...state.queue];
  const remote=await searchNativeBackend(query).catch(()=>[]);
  if(ticket!==smartFillEpoch||mode!==smartMode||anchor!==state.current)return;
  const choices=chooseSmartTracks({mode,anchor,candidates:[...cached,...remote],existing:state.queue,recent:state.history,max:7});
  const count=state.queue.length;
  state.queue=appendUnique(state.queue,choices,anchor.id);
  prefetchNextLyrics();
  smartStatus=state.queue.length>count?'Adicionadas '+(state.queue.length-count)+' faixas verificadas.':'Sem novas faixas confirmadas. Sua fila foi preservada.';
  updatePlayer();
 }finally{
  if(ticket===smartFillEpoch){smartFillPending=false;if(state.sheet==='queue')renderSheet();}
 }
}
function renderQueuePanel(){
 return renderSmartQueuePanel({mode:smartMode,queueCount:state.queue.length,playlistNames:playlistStore.names(),selectedPlaylist,playlistCount:playlistStore.tracks(selectedPlaylist).length,status:smartStatus,anchor:state.current})+
 '<div class="smart-playlist-heading"><span>Playlist · '+safe(selectedPlaylist)+'</span></div>'+
 mediaList(playlistStore.tracks(selectedPlaylist),'playlist')+
 '<div class="row-end"><p class="section-note">A seguir · arraste a ordem com ↑ ↓</p>'+btn('Limpar fila','clear-queue','alt')+'</div>'+
 mediaList(state.queue,'queue');
}
function renderVisualLayer(layer){
 const resolved=resolveVisual(state.theme,state.experience,state.reaction);
 const status='<div class="visual-status"><strong>'+safe(layer==='theme'?'🎨 Camada 1 · Tema':layer==='experience'?'⚡ Camada 2 · Experiência':'Ritmo visual')+'</strong>'+
  '<small>Tema: '+safe(state.theme)+' · Experiência: '+safe(resolved.experienceName)+' · '+safe(state.reaction)+'</small>'+
  '<span>'+(layer==='theme'?'Escolha cor e material sem alterar a experiência salva.':layer==='experience'?'Escolha a textura e o movimento sem trocar a paleta de cores.':'Controle apenas a intensidade da reação ao som.')+'</span></div>';
 if(layer==='theme'){
  return status+'<div class="section-head">TEMAS · CORES E MATERIAL</div>'+
   '<div class="visual-choices">'+CLASSIC_THEMES.map(visualTile).join('')+'</div>'+
   '<div class="section-head">MATERIAIS GNARLY</div><div class="visual-choices">'+MATERIAL_THEMES.map(visualTile).join('')+'</div>'+
   '<div class="section-head">MODOS ESPECIAIS GNARLY</div><p class="section-note">Os modos especiais podem sobrepor temporariamente o visual, mas preservam sua experiência escolhida.</p>'+
   '<div class="visual-choices">'+GNARLY_MODES.map(visualTile).join('')+'</div>'+
   (resolved.override?btn('Voltar ao tema anterior','restore-theme','alt'):'')+
   '<div class="button-row">'+btn('Concluído','apply-theme')+btn('Tema original','reset-theme-only','alt')+'</div>';
 }
 if(layer==='experience'){
  return status+'<div class="section-head">EXPERIÊNCIAS · TEXTURAS E MOVIMENTO</div>'+
   '<p class="section-note">Sua paleta continua a mesma ao alternar entre experiências.</p>'+
   '<div class="visual-choices">'+EXPERIENCES.filter(x=>x.category==='classic').map(experienceTile).join('')+'</div>'+
   '<div class="section-head">EXPERIÊNCIAS GNARLY</div>'+
   '<div class="visual-choices">'+EXPERIENCES.filter(x=>x.category==='gnarly').map(experienceTile).join('')+'</div>'+
   '<div class="button-row">'+btn('Concluído','apply-theme')+btn('Experiência original','reset-experience-only','alt')+'</div>';
 }
 return status+'<div class="section-head">INTENSIDADE DA REAÇÃO MUSICAL</div>'+
  '<div class="visual-choices">'+REACTIONS.map(m=>'<button class="visual-choice '+(state.reaction===m?'active':'')+'" data-reaction="'+safe(m)+'">'+
  '<strong>'+safe(m)+'</strong><small>'+(m==='DESLIGADO'?'Movimento natural sem pulso do áudio':m==='FLUIDO'?'Reação suave e contínua':'Resposta musical mais intensa')+'</small></button>').join('')+'</div>'+
  '<div class="button-row">'+btn('Concluído','apply-theme')+btn('Ritmo fluido','reset-reaction-only','alt')+'</div>';
}
function renderSheetCore(){const content=$('#sheet-content');switch(state.sheet){
 case 'search':content.innerHTML=`<form id="search-form" class="search-bar"><input id="search-term" type="search" autocomplete="off" placeholder="Buscar música ou colar link" aria-label="Omnibox GNARLY" value="${safe(state.searchTerm)}"/><button type="submit">Buscar</button></form><p class="section-note">Omnibox Stage 72: histórico imediato e busca no catálogo musical ao confirmar. Resultados musicais priorizados, fila, histórico e reprodução pelo backend GNARLY. A reprodução pode falhar em faixas indisponíveis ou sem autorização.</p><div id="search-state" class="status-text">${safe(state.searchError||'Digite uma busca e pressione Buscar')}</div><div id="search-results">${mediaList(state.searchResults,'search')}</div>${state.history.length?`<div class="section-head">Ouvidas recentemente</div>${mediaList(state.history.slice(0,4),'history')}`:''}`;break;
 case 'library':content.innerHTML=`<div class="card-help">Sua <strong>biblioteca local</strong> toca arquivos do dispositivo, sem servidor e sem conta. Os arquivos importados permanecem apenas nesta sessão.</div>${btn('＋ Adicionar músicas','import')}<div class="section-head">Mix · ${state.tracks.length} músicas</div>${mediaList(state.tracks,'library')}<div class="section-head">Favoritas · ${state.favorites.length}</div>${mediaList(state.favorites,'favorites')}`;break;
 case 'favorites':content.innerHTML=`<div class="section-head">Favoritos</div>${mediaList(state.favorites,'favorites')}`;break;
 case 'queue':content.innerHTML=renderQueuePanel();break;
 case 'controls':
 case 'stems':
  content.innerHTML=renderMusicPanel({
   tab:state.musicTab,preset:state.preset,speed:state.speed,reverb:state.reverb,bass:state.bass,pitch:state.pitch,reaction:state.reaction,
   showPresets:displayStore.visible.presets,showControls:displayStore.visible.controls,stemsReady:stems.ready,
   stemLevels:stems.levels,stemStatus:state.stemStatus,stemModel:state.stemModel,
   demucsBusy:state.demucsBusy,demucsAvailable:state.demucsAvailable,stemLabels:STEM_LABELS
  });break;
 case 'performance':content.innerHTML=renderPerformancePanel(midiView());break;
 case 'display':content.innerHTML=renderDisplayPanel(displayStore);break;
 case 'more':content.innerHTML=`<div class="section-head">ACESSO RÁPIDO</div><div class="button-row">${btn('🎨 Temas','go-theme','alt')}${btn('⚡ Experiências','go-experience','alt')}${btn('Aa · Legendas','go-lyric-style','alt')}${btn('Ritmo visual','go-reaction','alt')}${btn('Performance · DJ','go-performance')}${btn('Música · ajustes','go-controls')}${btn('Adicionar músicas','import','alt')}${btn('Mix e biblioteca','go-library','alt')}${btn('Favoritos','go-favorites','alt')}${btn('Fila','go-queue','alt')}${btn('Karaokê','go-karaoke','alt')}${btn('Exibição','go-display','alt')}</div><div class="section-head">MODO APLICATIVO</div><div class="button-row">${btn('↗ Abrir sem barra do Safari','go-install','alt')}</div>`;break;
  case 'install':content.innerHTML=renderAppInstallGuide({platform:installPlatform(navigator.userAgent,navigator.maxTouchPoints),standalone:installModeFromBrowser()});break;
 case 'export':content.innerHTML=`<p class="section-note">Formatos da Stage 72. Opções ainda não disponíveis não serão exportadas silenciosamente.</p><div class="export-formats">${[['image','Imagem estática'],['video','Vídeo · Story de até 15 s'],['player-audio','Player com áudio'],['lyrics-audio','Letras com áudio'],['player-noaudio','Player sem áudio'],['lyrics-noaudio','Letras sem áudio']].map(([id,name])=>`<button data-export-format="${id}" class="export-option">${name}<small>${id==='image'?'PNG · visual atual':'Requer renderização web'}</small></button>`).join('')}</div><div class="section-head">ESTILO</div><div class="chip-row">${['Clássica','Neon','Mono','Cinema','Máquina'].map(x=>`<button class="chip ${state.exportStyle===x?'selected':''}" data-export-style="${x}">${x}</button>`).join('')}</div>`;break;
 case 'theme':
 case 'experience':
 case 'reaction':content.innerHTML=renderVisualLayer(state.sheet);break;
 case 'lyric-style':content.innerHTML=renderLyricStylePanel(state.lyricStyle,{scope:lyricScope,track:state.current,resolution:lyricFonts.selected(state.current),recents:lyricFonts.recents,group:lyricGroup,previewText:state.lyrics[lyricIndex(state.lyrics,audio.currentTime||0)]?.text||'TUA VOZ ME LEVA'});break;
  case 'karaoke':content.innerHTML=`<div class="card-help">O GNARLY procura letras primeiro no LRCLIB, com conferência de artista, título e duração. Quando só existe letra simples, ela aparece sem tempos inventados. A transcrição por IA usa apenas áudio que você escolher enviar.</div><p class="status-text" id="lyrics-status">${safe(state.lyricsStatus)}</p>${btn('Importar letra .lrc','load-lrc')}<div class="lyrics-actions">${btn('Aa · Estilo da legenda','go-lyric-style','alt')}${state.current&&!state.lyricsLoading&&!state.lyricsAIWorking?btn('Buscar letras novamente','retry-lyrics','alt'):''}${state.current&&!state.lyrics.length?btn(state.lyricsAIWorking?'Transcrevendo…':state.plainLyrics.length?'Transcrever com IA para obter tempos':'Transcrever meu áudio com IA','lyrics-ai','alt'):''}</div><label class="section-note lyrics-ai-consent"><input id="lyrics-ai-autofallback" type="checkbox" ${lyricsAIAutoSession?'checked':''} /> Transcrever automaticamente meus arquivos locais, apenas nesta sessão, caso o banco não encontre letra (envia o áudio à IA).</label><p class="section-note">Transcrição por IA é experimental. Para músicas de catálogo, selecione manualmente um áudio da mesma gravação que você tenha autorização para processar.</p><div class="section-head">${state.lyricsSynced?'Letra sincronizada':state.plainLyrics.length?'Letra sem sincronização':'Letra'}</div>${state.lyrics.length?`<div class="lyrics-box">${state.lyrics.map((line,i)=>{const active=i===lyricIndex(state.lyrics,audio.currentTime);return `<div class="lyric-line ${active?'active':''}" data-lyric-time="${line.time}">${active?renderLyricArtwork(line.text,state.lyricStyle,{lineId:i,active:true}):safe(line.text)}</div>`}).join('')}</div>`:state.plainLyrics.length?`<div class="lyrics-box lyrics-unsynced">${state.plainLyrics.map(line=>`<div class="lyric-line">${safe(line)}</div>`).join('')}</div>`:'<p class="section-note">Nenhuma letra confirmada. Você pode importar .lrc ou transcrever seu arquivo de áudio autorizado.</p>'}`;break;
 case 'background':content.innerHTML=`<div class="background-menu"><button class="background-menu-row" data-command="show-visual">✦ <span>Tema visual</span><b>${state.backgroundMode==='visual'?'✓':''}</b></button><button class="background-menu-row" data-command="show-cover">▧ <span>Capa do álbum</span><b>${state.backgroundMode==='cover'?'✓':''}</b></button><button class="background-menu-row" data-command="load-background">▣ <span>Minha foto · escolher / trocar</span></button><button class="background-menu-row" data-command="use-photo" ${state.backgroundURL?'':'disabled'}>✓ <span>Usar minha foto</span><b>${state.backgroundMode==='custom'?'✓':''}</b></button><button class="background-menu-row" data-command="adjust-photo" ${state.backgroundURL?'':'disabled'}>☷ <span>Ajustar foto</span></button><button class="background-menu-row danger" data-command="remove-background">× <span>Remover foto</span></button></div>${state.photoAdjust&&state.backgroundURL?`<div class="photo-editor"><p class="section-note">Ajustes locais · a imagem não é enviada ao servidor</p><label for="photo-zoom">Zoom <output id="photo-zoom-value">${Math.round(state.photoZoom*100)}%</output></label><input type="range" id="photo-zoom" data-photo-parameter="photoZoom" min="1" max="2.5" step=".025" value="${state.photoZoom}" /><label for="photo-x">Posição horizontal</label><input type="range" id="photo-x" data-photo-parameter="photoX" min="-40" max="40" step="1" value="${state.photoX}"/><label for="photo-y">Posição vertical</label><input type="range" id="photo-y" data-photo-parameter="photoY" min="-40" max="40" step="1" value="${state.photoY}"/><button class="action-button" data-command="done-photo">Concluído</button></div>`:''}`;break;
 default:content.textContent='';
 }}
function renderSheet(){renderSheetCore();if(OMNIBOX_TABS.includes(state.sheet))$('#sheet-content').insertAdjacentHTML('afterbegin',omniboxTabs());refreshMixerRails();if(state.sheet==='lyric-style'){updateLyricFontFilter();observeLyricFontCards()}}
function updateLyricFontFilter(){
 const panel=$('#sheet-content .lyric-style-panel');if(!panel)return;
 const q=(panel.querySelector('#lyric-font-search')?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 let count=0;
 for(const card of panel.querySelectorAll('[data-lyric-style]')){
  const label=(card.dataset.fontLabel||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const show=(lyricGroup==='all'||card.dataset.fontCategory===lyricGroup||card.dataset.fontCategory==='original'&&lyricGroup==='clean')
   &&(!q||label.includes(q));
  card.hidden=!show;if(show)count++;
 }
 for(const chip of panel.querySelectorAll('[data-font-group]'))chip.setAttribute('aria-pressed',String(chip.dataset.fontGroup===lyricGroup));
 const empty=panel.querySelector('.lyric-font-empty');if(empty)empty.hidden=count>0;
}
function observeLyricFontCards(){
 fontPreviewObserver?.disconnect();fontPreviewObserver=null;
 const root=$('#sheet-content'),cards=root?.querySelectorAll('[data-lazy-typeface]')||[];
 // Only fetch fonts close to the viewport, never forty families during startup.
 if(typeof IntersectionObserver!=='function')return;
 fontPreviewObserver=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){
   const card=entry.target;void loadLyricTypeface(card.dataset.lazyTypeface);
   fontPreviewObserver?.unobserve(card);
  }
 },{root,rootMargin:'100px 0px',threshold:0});
 cards.forEach(card=>fontPreviewObserver.observe(card));
}
function applyChosenLyricFont(id,scope=lyricScope){
 if(!state.current||scope==='artist'&&!artistKey(state.current))scope='global';
 const style=resolveLyricStyle(id);
 lyricFonts.set(style.id,scope,state.current);
 state.lyricStyle=style.id;
 applyLyricStyle(app,style.id);
 void loadLyricTypeface(designFont(style.id));
 refreshLyricArtwork();
 const picker=$('#sheet-content .lyric-style-panel');
 if(picker){
  for(const b of picker.querySelectorAll('[data-lyric-style]')){
   b.setAttribute('aria-pressed',String(b.dataset.lyricStyle===style.id));
   const mark=b.querySelector('.lyric-font-selection');if(mark)mark.textContent=b.dataset.lyricStyle===style.id?'✓':'';
  }
  const sample=picker.querySelector('#lyric-live-specimen');
  if(sample){
   const currentText=sample.dataset.sample||'TUA VOZ ME LEVA',info=findFont(designFont(style.id));
   sample.style.fontFamily=info?info.fontFamily+','+info.fallback:'var(--gnarly-lyric-font)';
   sample.innerHTML=renderLyricArtwork(currentText,style.id,{lineId:7,active:true,preview:true});
  }
  const title=picker.querySelector('.lyric-type-preview small');if(title)title.textContent='PRÉVIA AO VIVO · '+style.name;
  const help=picker.querySelector('.lyric-font-scope-description');if(help)help.textContent=scope==='song'?'Fonte salva exclusivamente para esta música.':scope==='artist'?'Fonte salva para este artista.':'Fonte padrão salva para músicas sem preferência própria.';
 }
}

function resolveTracks(context){if(context==='playlist')return playlistStore.tracks(selectedPlaylist);return ({search:state.searchResults,library:state.tracks,queue:state.queue,favorites:state.favorites,history:state.history})[context]||[]}
function handleCommand(command){switch(command){
 case 'smart-refresh':lastSmartSeed='';void maybeFillSmartQueue({force:true});break;
 case 'playlist-add-current':if(!state.current){toast('Escolha uma faixa primeiro.');break}if(playlistStore.add(selectedPlaylist,state.current)){toast('Salvo em '+selectedPlaylist);if(state.sheet==='queue')renderSheet()}else toast('Faixa já salva ou não persistível.');break;
 case 'playlist-create':{const name=window.prompt('Nome da nova playlist (até 45 caracteres):');if(name===null)break;if(!playlistStore.create(name)){toast('Nome repetido ou limite de playlists atingido.');break}selectedPlaylist=name.trim().slice(0,45);setSetting('smartPlaylist',selectedPlaylist);if(state.sheet==='queue')renderSheet();break}
 case 'playlist-load':{const items=playlistStore.tracks(selectedPlaylist);const before=state.queue.length;state.queue=appendUnique(state.queue,items,state.current?.id);updatePlayer();if(state.sheet==='queue')renderSheet();toast((state.queue.length-before)+' adicionadas · '+selectedPlaylist);break}
 case 'playlist-delete':if(playlistStore.delete(selectedPlaylist)){selectedPlaylist='Meu Mix';setSetting('smartPlaylist',selectedPlaylist);if(state.sheet==='queue')renderSheet();toast('Playlist removida.')}else toast('A playlist Meu Mix é permanente.');break;
 case 'import':$('#audio-import').click();break;case 'load-lrc':$('#lrc-import').click();break;case 'retry-lyrics':if(state.current)void loadAutoLyrics(state.current);break;case 'lyrics-ai':if(state.current&&!state.lyricsAIWorking)$('#lyrics-ai-import').click();break;case 'load-background':$('#background-import').click();break;case 'use-photo':if(state.backgroundURL){state.backgroundMode='custom';setSetting('backgroundMode','custom');applyBackground();renderActiveSurfaces()}break;case 'adjust-photo':state.photoAdjust=true;renderActiveSurfaces();break;case 'done-photo':state.photoAdjust=false;renderActiveSurfaces();break;case 'show-visual':state.backgroundMode='visual';setSetting('backgroundMode','visual');applyBackground();closeSheet();break;case 'show-cover':if(!state.current?.artwork){toast('Selecione uma música com capa primeiro.');break}state.backgroundMode='cover';setSetting('backgroundMode','cover');applyBackground();closeSheet();break;case 'remove-background':if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL);state.backgroundURL=null;state.photoAdjust=false;state.backgroundMode='visual';setSetting('backgroundMode','visual');applyBackground();toast('Tema animado restaurado');break;case 'clear-queue':state.queue.length=0;pendingQueueId=null;smartFillEpoch++;updatePlayer();renderActiveSurfaces();break;case 'play-youtube':if(state.current?.source==='youtube')openYouTubePlayer(state.current);break;case 'reset-audio':state.speed=1;state.reverb=0;state.bass=0;state.pitch=true;state.preset='ORIGINAL';engine.setSpeed(1,true);engine.setBass(0);engine.setReverb(0);for(const p of ['speed','bass','reverb','pitch','preset'])setSetting(p,p==='pitch'?'yes':p==='preset'?'ORIGINAL':p==='speed'?1:0);renderActiveSurfaces();break;case 'go-theme':openSheet('theme');break;case 'go-experience':openSheet('experience');break;case 'go-reaction':openSheet('reaction');break;case 'go-lyric-style':openSheet('lyric-style');break;case 'restore-theme':state.theme=restoredThemeAfterGnarly(state.previousTheme);setSetting('theme',state.theme);updateBadges();renderActiveSurfaces();break;case 'reset-theme-only':state.theme='ACID';setSetting('theme',state.theme);updateBadges();renderActiveSurfaces();break;case 'reset-experience-only':state.experience='original';setSetting('experience',state.experience);updateBadges();renderActiveSurfaces();break;case 'reset-reaction-only':state.reaction='FLUIDO';setSetting('reaction',state.reaction);updateBadges();renderActiveSurfaces();break;case 'reset-visual':state.theme='ACID';state.experience='original';state.reaction='FLUIDO';for(const k of ['theme','experience','reaction'])setSetting(k,state[k]);updateBadges();renderActiveSurfaces();break;case 'go-stems':state.musicTab='stems';openSheet('controls');void refreshCloudStemAvailability();break;case 'go-speed-pitch':state.musicTab='speedPitch';openSheet('controls');break;case 'auto-demucs':void startDemucs();break;case 'cancel-stems':state.demucsAbort?.abort();state.stemStatus='Cancelamento solicitado; o provedor pode continuar consumindo a cota.';renderActiveSurfaces();break;case 'load-stems':if(!state.current){toast('Selecione uma música antes de importar Stems.');break}$('#stems-import').click();break;case 'reset-stems':stems.applyPreset('original');renderActiveSurfaces();break;case 'clear-stems':stems.clear();state.stemModel='';state.stemStatus='Mixer desativado. Voltamos ao áudio original.';renderActiveSurfaces();break;case 'go-controls':state.musicTab='speedPitch';openSheet('controls');break;case 'go-performance':openSheet('performance');break;case 'go-library':openSheet('library');break;case 'go-favorites':openSheet('favorites');break;case 'go-queue':openSheet('queue');break;case 'go-karaoke':openSheet('karaoke');break;case 'go-display':openSheet('display');break;case 'go-install':openSheet('install');break;case 'close-display':closeSheet();break;case 'hide-display-panels':displayStore.setGroup(['search','presets','controls','header','player','export','performance'],false);applyPanelVisibility();renderActiveSurfaces();break;case 'apply-theme':closeSheet();break}}
function syncVisual(){visual.setSong(audio.currentTime||0,Number.isFinite(audio.duration)&&state.current?.source!=='preview'?audio.duration:state.current?.duration||0,state.artworkHue);const pulse=pads.getPulse();const active=!document.hidden&&(state.playing||pads.running||pulse>.009);const signal=active?engine.sampleSpectrum():{bass:0,mid:0,treble:0,beat:0,energy:0};if(pulse>.009){signal.beat=Math.max(signal.beat,pulse);signal.energy=Math.max(signal.energy,pulse*.72);signal.bass=Math.max(signal.bass,pulse*.48)}visual.setSpectrum(signal);requestAnimationFrame(syncVisual)}requestAnimationFrame(syncVisual);
$('#audio-import').addEventListener('change',e=>{importAudio(e.target.files||[]);e.target.value='' });
$('#dj-midi-import').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';if(file)void analyzeMidi(file)});
$('#lyrics-ai-import').addEventListener('change',e=>{
 const file=e.target.files?.[0];e.target.value='';if(file)void transcribeOwnLyrics(file);
});
$('#lrc-import').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;state.lyricsAbort?.abort();state.lyrics=parseLRC(await file.text());state.plainLyrics=[];state.lyricsSource='manual';state.lyricsSynced=true;state.lyricsStatus='Letra sincronizada importada por você';state.lastLyric=-2;syncLyrics();toast(`${state.lyrics.length} linhas sincronizadas carregadas`);if(state.sheet==='karaoke')renderSheet();e.target.value=''});
$('#stems-import').addEventListener('change',async e=>{const files=[...(e.target.files||[])];e.target.value='';if(!state.current)return toast('Escolha uma música primeiro');state.stemStatus='Carregando fontes Stems…';if(isModuleOpen('controls'))renderModule('controls');try{await stems.load(files);state.stemStatus='Quatro fontes reais conectadas ao mixer GNARLY.';toast('Stems prontos: voz, bateria, baixo e outros.')}catch(err){state.stemStatus=err.message;toast(err.message)}if(isModuleOpen('controls'))renderModule('controls')});
$('#background-import').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file||!file.type.startsWith('image/'))return;if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL);state.backgroundURL=URL.createObjectURL(file);state.photoAdjust=false;state.backgroundMode='custom';setSetting('backgroundMode','custom');applyBackground();if(state.sheet==='background')closeSheet();toast('Foto de fundo aplicada');e.target.value=''});
$('#cover-button').addEventListener('click',()=>{closePlayerSurfaceMenu();if(!state.current)openSheet('search');else openSheet('background')});
$('#player-surface-button').addEventListener('click',()=>{
 if($('#player-surface-menu').hidden)openPlayerSurfaceMenu();
 else closePlayerSurfaceMenu(true);
});
$('#player-surface-menu').addEventListener('click',e=>{
 const button=e.target.closest('[data-player-surface]');
 if(!button)return;
 applyPlayerSurfaceMode(button.dataset.playerSurface);
 closePlayerSurfaceMenu(true);
});
$('#player-surface-menu').addEventListener('keydown',e=>{
 if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
 e.preventDefault();
 const items=[...e.currentTarget.querySelectorAll('button')];
 const ix=items.indexOf(document.activeElement),step=e.key==='ArrowDown'?1:-1;
 items[(ix+step+items.length)%items.length]?.focus();
});
document.addEventListener('pointerdown',e=>{
 const menu=$('#player-surface-menu');
 if(!menu.hidden&&!menu.contains(e.target)&&!$('#player-surface-button').contains(e.target)){
  closePlayerSurfaceMenu();
 }
});

$('#add-button').addEventListener('click',()=>$('#audio-import').click());
$('#library-button').addEventListener('click',()=>openSheet('library'));
$('#favorite-button').addEventListener('click',toggleFavorite);
$('#controls-button').addEventListener('click',()=>openSheet('controls'));
// Tap: instantly apply next visual / typeface. Hold ~0.5 s, right-click or
// Shift+Enter: open the full curated library for a precise manual selection.
const QUICK_THEMES=['ACID','CYBER NIGHT','CRIMSON','ULTRAVIOLET','PRISM CARMINE','XEROX SERPENTINE','GNARLY','NOIR','SOLAR','SAPPHIRE'];
const QUICK_EXPERIENCES=['original','cyber-night','liquid-dream','neon-pulse','chrome-night','organic-pulse','atmospheric-smoke','gnarly-exp-subcultural-archive','gnarly-exp-vector-drift-2000','gnarly-exp-liquid-monochrome'];
const QUICK_LYRIC_STYLES=['original','art-magazine-cutout','art-xerox-ransom','art-glitch-zine','art-chrome-surge','studio-vogue-editorial','studio-concrete-poster','art-y2k-warp','studio-neon-serif','art-stereo-echo'];
bindQuickCreative($('#theme-button'),{
 cycle:()=>{
  const next=cycleValue(QUICK_THEMES,state.theme);
  if(!GNARLY_MODES.includes(state.theme)&&GNARLY_MODES.includes(next)){state.previousTheme=state.theme;setSetting('previousTheme',next===state.theme?state.previousTheme:state.theme)}
  state.theme=next;setSetting('theme',next);updateBadges();renderActiveSurfaces();
  toast('🎨 Tema · '+next);
 },
 expand:()=>openSheet('theme')
});
bindQuickCreative($('#experience-button'),{
 cycle:()=>{
  state.experience=cycleValue(QUICK_EXPERIENCES,state.experience);
  setSetting('experience',state.experience);updateBadges();renderActiveSurfaces();
  toast('⚡ Experiência · '+(EXPERIENCES.find(x=>x.id===state.experience)?.name||state.experience));
 },
 expand:()=>openSheet('experience')
});
bindQuickCreative($('#lyric-style-button'),{
 cycle:()=>{
  const next=cycleValue(QUICK_LYRIC_STYLES,state.lyricStyle);
  applyChosenLyricFont(next);
  toast('Aa · '+resolveLyricStyle(next).name);
 },
 expand:()=>openSheet('lyric-style')
});
$('#background-button').addEventListener('click',()=>openSheet('background'));
$('#search-toggle').addEventListener('click',()=>state.sheet==='display'?closeSheet():openSheet('display'));
$('#omnibox-toggle').addEventListener('click',()=>OMNIBOX_TABS.includes(state.sheet)?closeSheet():openSheet(OMNIBOX_TABS.includes(state.omniboxTab)?state.omniboxTab:'search'));
$('#more-button').addEventListener('click',()=>openSheet('more'));
$('#performance-button').addEventListener('click',()=>{if(state.sheet)closeSheet();toggleModule('performance')});
$('#music-toggle-button').addEventListener('click',()=>{if(state.sheet)closeSheet();toggleModule('controls')});
$('#share-button').addEventListener('click',()=>{if(state.sheet)closeSheet();toggleModule('export')});
$('#module-dock').addEventListener('click',e=>{const handle=e.target.closest('[data-module-toggle]');if(handle){if(state.sheet)closeSheet();toggleModule(handle.dataset.moduleToggle)}});
async function toggleMicRecording(){
 if(state.micRecorder&&state.micRecorder.state==='recording'){state.micRecorder.stop();return}
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){toast('Gravação de microfone não suportada neste navegador.');return}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const options=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x));
  const recorder=new MediaRecorder(stream,options?{mimeType:options}:undefined);
  state.micStream=stream;state.micRecorder=recorder;state.micChunks=[];
  recorder.ondataavailable=e=>{if(e.data?.size)state.micChunks.push(e.data)};
  recorder.onstop=()=>{
   stream.getTracks().forEach(x=>x.stop());
   const blob=new Blob(state.micChunks,{type:recorder.mimeType||'audio/webm'});
   state.micRecorder=null;state.micStream=null;state.micChunks=[];
   $('#record-button').classList.remove('recording');$('#record-button').setAttribute('aria-pressed','false');
   if(!blob.size){toast('Nenhum áudio capturado.');return}
   const u=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=u;a.download='gnarly-voz-'+new Date().toISOString().slice(0,19).replaceAll(':','-')+(blob.type.includes('mp4')?'.m4a':'.webm');
   a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);toast('Gravação de microfone salva. Não inclui o áudio da música.')
  };
  recorder.start(250);$('#record-button').classList.add('recording');$('#record-button').setAttribute('aria-pressed','true');toast('Gravando apenas o microfone · toque novamente para parar.')
 }catch(err){toast(err?.name==='NotAllowedError'?'Acesso ao microfone não autorizado.':'Não foi possível iniciar gravação.');state.micStream?.getTracks()?.forEach(x=>x.stop());state.micRecorder=null}
}
$('#record-button').addEventListener('click',()=>void toggleMicRecording());
$('#play-button').addEventListener('click',()=>state.playing?pause():void play());
$('#youtube-close').addEventListener('click',closeYouTubePlayer);
$('#youtube-player-dialog').addEventListener('click',e=>{if(e.target.id==='youtube-player-dialog')closeYouTubePlayer()});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
$('#next-button').addEventListener('click',next);
$('#previous-button').addEventListener('click',previous);
$('#seek-slider').addEventListener('input',e=>{if(Number.isFinite(audio.duration)&&audio.duration)audio.currentTime=audio.duration*Number(e.target.value)/1000;updateProgress()});
$('#close-sheet').addEventListener('click',closeSheet);$('#panel-backdrop').addEventListener('click',closeSheet);
for(const el of document.querySelectorAll('[data-drawer]'))el.addEventListener('click',()=>openSheet(el.dataset.drawer));
for(const host of [$('#sheet-content'),$('#module-dock')])host.addEventListener('pointerdown',e=>{const pad=e.target.closest('[data-dj-pad]');if(!pad||!isModuleOpen('performance')||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();void pads.trigger(Number(pad.dataset.djPad));},{passive:false});
for(const host of [$('#sheet-content'),$('#module-dock')])host.addEventListener('change',e=>{if(e.target.hasAttribute('data-dj-output'))pads.setOutput(e.target.value)});
$('#sheet-content').addEventListener('submit',e=>{if(e.target.id==='search-form'){e.preventDefault();void runSearch($('#search-term').value)}});
function handlePanelClick(e){const target=e.target.closest('button,[data-lyric-time]');if(!target)return;if(target.dataset.djPad!==undefined){if(e.detail===0)void pads.trigger(Number(target.dataset.djPad));return}if(target.dataset.djCommand){const c=target.dataset.djCommand;if(c==='loop')void pads.startLoop().catch(()=>toast('Não foi possível iniciar o áudio do loop.'));if(c==='record')void pads.setRecording(!pads.recording).catch(()=>toast('Não foi possível iniciar a gravação.'));if(c==='clear')pads.clearPattern();if(c==='refresh')void pads.prepareSong(state.current,{force:true});if(c==='midi')void pads.connectMIDI().then(ok=>{renderModule('performance');toast(ok?'Controlador MIDI conectado aos pads.':'Controlador MIDI indisponível. Os pads funcionam sem ele.')});if(c==='analyze-midi'){if(state.current?.source==='local'&&state.current.file)void analyzeMidi(state.current.file);else $('#dj-midi-import').click()}if(c==='cancel-midi'){invalidateMidiAnalysis();renderModule('performance')}if(c==='save-midi')exportEstimatedMidi();if(c==='map-midi'){const count=pads.applyNotePattern(midiAnalysis.notes);toast(count?`${count} passos da transcrição mapeados para pads. Toque Loop para ouvir os recortes.`:'Nenhuma nota válida para mapear.');renderModule('performance')}return}if(target.dataset.omniboxTab){openSheet(target.dataset.omniboxTab);return}if(target.dataset.playerSize){displayStore.setSize(target.dataset.playerSize);applyPanelVisibility();renderActiveSurfaces();return}if(target.dataset.playerMaterial){displayStore.setMaterial(target.dataset.playerMaterial);applyPanelVisibility();renderActiveSurfaces();return}if(target.dataset.layout){displayStore.apply(target.dataset.layout);applyPanelVisibility();renderActiveSurfaces();return}if(target.dataset.layoutGroup){displayStore.setGroup(['presets','controls'],target.dataset.layoutGroup==='all');applyPanelVisibility();renderActiveSurfaces();return}if(target.dataset.exportStyle){state.exportStyle=target.dataset.exportStyle;renderActiveSurfaces();return}if(target.dataset.exportFormat){toast(target.dataset.exportFormat==='image'?'A exportação de imagem será habilitada após validar a captura WebGL.':'Este formato ainda depende do motor web de exportação; nenhum arquivo foi gerado.');return}if(target.dataset.lyricTime){audio.currentTime=Number(target.dataset.lyricTime);return}if(target.dataset.command){handleCommand(target.dataset.command);return}if(target.dataset.visualTab){openSheet(target.dataset.visualTab);return}if(target.dataset.lyricScope){if(!['song','artist','global'].includes(target.dataset.lyricScope))return;lyricScope=target.dataset.lyricScope;renderSheet();return}
 if(target.dataset.fontGroup){lyricGroup=target.dataset.fontGroup;updateLyricFontFilter();return}
 if(target.hasAttribute('data-lyric-reset')){const result=lyricFonts.clear(lyricScope,state.current);state.lyricStyle=result.style;applyLyricStyle(app,result.style);void loadLyricTypeface(designFont(result.style));refreshLyricArtwork();renderSheet();return}
 if(target.hasAttribute('data-lyric-next')){const styles=allLyricStyles();const index=styles.findIndex(x=>x.id===state.lyricStyle);applyChosenLyricFont(styles[(index+1)%styles.length].id);return}
 if(target.dataset.lyricStyle){applyChosenLyricFont(target.dataset.lyricStyle);return}if(target.dataset.experience){state.experience=target.dataset.experience;setSetting('experience',state.experience);updateBadges();renderActiveSurfaces();return}if(target.dataset.stemPreset){stems.applyPreset(target.dataset.stemPreset);renderActiveSurfaces();return}if(target.dataset.preset){applyPreset(target.dataset.preset);return}if(target.dataset.theme){if(!GNARLY_MODES.includes(state.theme)&&GNARLY_MODES.includes(target.dataset.theme)){state.previousTheme=state.theme;setSetting('previousTheme',state.theme)}state.theme=target.dataset.theme;setSetting('theme',state.theme);updateBadges();renderActiveSurfaces();return}if(target.dataset.reaction){state.reaction=target.dataset.reaction;setSetting('reaction',state.reaction);updateBadges();renderActiveSurfaces();return}if(target.dataset.smartMode){setSmartMode(target.dataset.smartMode);return}
 if(target.dataset.action){
  const context=target.dataset.context,list=resolveTracks(context),track=list[Number(target.dataset.index)];
  if(!track)return;
  const action=target.dataset.action;
  if(context==='queue'&&['remove','up','down'].includes(action)){
   if(action==='remove'){state.queue=removeTrack(state.queue,track.id);if(pendingQueueId===track.id)pendingQueueId=null;}
   else state.queue=moveTrack(state.queue,track.id,action==='up'?-1:1);
   updatePlayer();renderSheet();return;
  }
  if(action==='playlist-remove'){playlistStore.remove(selectedPlaylist,track.id);renderSheet();return}
  if(action==='playlist-add'){
   toast(playlistStore.add(selectedPlaylist,track)?'Salvo em '+selectedPlaylist:'Já está salvo ou não pode persistir este arquivo.');
   return;
  }
  if(action==='enqueue'){addToQueue(track);return}
  if(action==='play'){
   selectTrack(track,true,{fromQueue:context==='queue'});
   closeSheet();return;
  }
 }
}

function handlePanelInput(e){const el=e.target;if(el.id==='lyric-font-search'){updateLyricFontFilter();return}if(el.id==='lyrics-ai-autofallback'){lyricsAIAutoSession=el.checked;if(el.checked&&state.current?.source==='local'&&state.current.file&&!state.lyrics.length&&!state.plainLyrics.length&&!state.lyricsAIWorking&&!lyricsAIOnce.has(state.current.id)){lyricsAIOnce.add(state.current.id);void transcribeOwnLyrics(state.current.file)}return}if(el.hasAttribute('data-dj-bpm')){pads.setBpm(el.value);return}if(el.dataset.photoParameter){const key=el.dataset.photoParameter;const v=Number(el.value);if(['photoZoom','photoX','photoY'].includes(key)&&Number.isFinite(v)){state[key]=v;setSetting(key,v);applyBackground();if(key==='photoZoom')$('#photo-zoom-value').textContent=Math.round(v*100)+'%'}return}if(el.dataset.panelToggle){displayStore.set(el.dataset.panelToggle,el.checked);applyPanelVisibility();renderActiveSurfaces();return}if(el.hasAttribute('data-zen-toggle')){displayStore.setZen(el.checked);applyPanelVisibility();renderActiveSurfaces();return}if(el.id==='search-term'){state.searchTerm=el.value;const local=omnibox.setQuery(state.searchTerm);const kind=classifyIntent(state.searchTerm);state.searchResults=local;searchCounter++;displaySearch(local,kind.kind==='direct'?'Link do YouTube detectado · pressione Buscar':local.length?'Histórico local · pressione Buscar para atualizar':'Pressione Buscar para consultar o catálogo')}if(el.dataset.stemLevel){const kind=el.dataset.stemLevel;stems.setLevel(kind,el.value);const label=$(`#stem-${kind}-value`);if(label)label.textContent=`${Math.round(stems.levels[kind]*100)}%`;return}if(el.dataset.slider){const id=el.dataset.slider,v=Number(el.value);if(id==='speed'){state.speed=v;engine.setSpeed(v,state.pitch);state.preset='CUSTOM';setSetting('preset','CUSTOM');updatePresetButtons()}if(id==='reverb'){state.reverb=v;engine.setReverb(v);state.preset='CUSTOM';setSetting('preset','CUSTOM');updatePresetButtons()}if(id==='bass'){state.bass=v;engine.setBass(v)}setSetting(id,v);const out=$(`#${id}-value`);if(out)out.textContent=mixerValue(id,v)}if(el.id==='pitch-check'){state.pitch=el.checked;engine.setSpeed(state.speed,state.pitch);setSetting('pitch',state.pitch?'yes':'no');state.preset='CUSTOM';setSetting('preset','CUSTOM');updatePresetButtons()}}
for(const host of [$('#sheet-content'),$('#module-dock')]){host.addEventListener('click',handlePanelClick);host.addEventListener('input',handlePanelInput)}
$('#sheet-content').addEventListener('change',e=>{if(!e.target.hasAttribute('data-smart-playlist'))return;const name=e.target.value;if(!playlistStore.names().includes(name))return;selectedPlaylist=name;setSetting('smartPlaylist',name);if(smartMode==='playlist'){smartFillEpoch++;lastSmartSeed='';void maybeFillSmartQueue({force:true})}renderSheet()});
// Stage72 Omnibox: local hits while typing, remote search on submit, fresh/stale cache.
let searchCounter=0;
function displaySearch(results,info=''){if(state.sheet!=='search')return;const resultsEl=$('#search-results'),status=$('#search-state');if(resultsEl)resultsEl.innerHTML=mediaList(results,'search');if(status)status.textContent=info}
async function runSearch(raw){const query=String(raw||'').trim();state.searchTerm=query;omnibox.setQuery(query);const intent=classifyIntent(query);const count=++searchCounter;
 if(intent.kind==='direct'){const id=intent.videoId,track={id:'youtube:'+id,videoId:id,title:id,artist:'Artista não identificado',artwork:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',source:'youtube',duration:0};state.searchResults=[track];selectTrack(track,false);displaySearch([track],'Link reconhecido · pronto para reprodução no GNARLY');return}
 if(intent.kind==='empty'){state.searchResults=state.history.slice(0,4);displaySearch(state.searchResults,'Suas músicas recentes');return}
 if(query.length<2){state.searchResults=[];displaySearch([],'Digite pelo menos 2 caracteres');return}
 const cached=omnibox.fromCache(query);if(cached){state.searchResults=cached.results;displaySearch(state.searchResults,cached.stale?'Resultados anteriores · atualizando…':'Resultados em cache');if(!cached.stale)return}
 displaySearch(state.searchResults,'Buscando no catálogo do app…');
 try{const native=searchNativeBackend(query).then(songs=>{
  if(count===searchCounter&&songs.length){
   // Repair old favorites/history/queue/current only when native search confirms
   // the SAME 11-character video ID, without changing source or playback URL.
   const repaired=reconcileCatalogCredits(songs,[omnibox.history,state.favorites,state.queue,[state.current]]);
   if(repaired){
    omnibox.save('history',omnibox.history);
    setSetting('favorites',JSON.stringify(state.favorites.filter(x=>x.source!=='local').slice(-100)));
    state.history=omnibox.history;
    updatePlayer();
   }
   const early=rank(query,songs,omnibox.history);
   state.searchResults=early;
   displaySearch(early,'Catálogo GNARLY disponível · complementando créditos…');
  }
  return songs;
 });
 const previewsTask=searchCatalog(query);
 const outcome=await Promise.allSettled([native,previewsTask]);if(count!==searchCounter)return;
 const songs=outcome[0].status==='fulfilled'?outcome[0].value:[],previews=outcome[1].status==='fulfilled'?outcome[1].value:[];
 // Already retrieved iTunes data refines only exact recording/version matches.
 // There is no change to source, URL, ID, transport or duration.
 enrichSearchCredits(songs,previews);
 const hits=rank(query,selectMusicResults(songs,previews),omnibox.history);state.searchResults=hits;omnibox.cacheResults(query,hits);displaySearch(hits,`${songs.length} músicas no catálogo GNARLY · ${previews.length} prévias autorizadas`+(songs.length===0?' · servidor musical indisponível ou sem resultados':''));
 }catch(error){if(count!==searchCounter)return;displaySearch(state.searchResults,'Falha de rede. Resultados locais mantidos.');console.warn('Omnibox',error)}
}
audio.addEventListener('play',()=>{if(stems.ready)void stems.play();state.playing=true;updatePlayer()});audio.addEventListener('pause',()=>{stems.pause();state.playing=false;updatePlayer()});audio.addEventListener('timeupdate',()=>{if(stems.ready)stems.sync();updateProgress();syncLyrics()});audio.addEventListener('loadedmetadata',()=>{updateProgress();if(state.current?.source==='local'&&Number.isFinite(audio.duration))void enrichSelectedTrack(state.current,audio.duration)});audio.addEventListener('seeked',()=>stems.seek());audio.addEventListener('ended',()=>{state.queue.length?next():pause()});audio.addEventListener('waiting',()=>{if(state.current?.source==='youtube')reportAudioStatus('Carregando áudio…')});audio.addEventListener('playing',()=>{state.audioState='playing';reportAudioStatus('');if(pendingQueueId&&pendingQueueId===state.current?.id){state.queue=commitPlaying(state.queue,pendingQueueId);pendingQueueId=null;updatePlayer();if(state.sheet==='queue')renderSheet()}if(playbackStartedAt){console.debug('GNARLY startup ms',Math.round(performance.now()-playbackStartedAt));playbackStartedAt=0}void maybeFillSmartQueue()});audio.addEventListener('error',()=>{if(!state.current||state.userPaused)return;state.playing=false;updatePlayer();if(state.current.source==='youtube'){
 // Ignore a late error from the previous source after another Omnibox selection.
 if(audio.hasAttribute('src')&&audio.src===trackAudioURL(state.current,{attempt:audioDelivery.attempt}))void recoverNativeAudio(state.current);
 }else reportAudioError('Não foi possível carregar o áudio.');});
for(const [action,fn] of [['play',()=>void play()],['pause',pause],['previoustrack',previous],['nexttrack',next],['seekto',details=>{audio.currentTime=details.seekTime||0}]]){try{navigator.mediaSession?.setActionHandler(action,fn)}catch{/* not supported */}}
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||e.ctrlKey||e.altKey||e.metaKey)return;if(isModuleOpen('performance')&&!state.sheet){const pad=PAD_KEYS.indexOf(e.key.toLowerCase());if(pad>=0){e.preventDefault();if(!e.repeat)void pads.trigger(pad);return}}if(e.code==='Space'){e.preventDefault();state.playing?pause():void play()}if(e.code==='Escape'){if(!$('#player-surface-menu').hidden){e.preventDefault();closePlayerSurfaceMenu(true);return}closeSheet();closeYouTubePlayer()};if(e.key==='ArrowRight'&&state.current)audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5);if(e.key==='ArrowLeft'&&state.current)audio.currentTime=Math.max(0,audio.currentTime-5)});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();app.classList.add('dragover')}});window.addEventListener('dragleave',e=>{if(!e.relatedTarget)app.classList.remove('dragover')});window.addEventListener('drop',e=>{e.preventDefault();app.classList.remove('dragover');importAudio(e.dataTransfer?.files||[])});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&pads.running)pads.stopLoop()});
window.addEventListener('beforeunload',()=>{fontPreviewObserver?.disconnect();midiAnalysis.abort?.abort();lyricsAIController?.abort();metadataAbort?.abort();pads.destroy();state.micRecorder?.state==='recording'&&state.micRecorder.stop();state.micStream?.getTracks()?.forEach(x=>x.stop());state.demucsAbort?.abort();stems.clear();for(const item of state.tracks)if(item.source==='local')URL.revokeObjectURL(item.url);if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL)});
applyPlayerSurfaceMode(state.playerSurfaceMode,{persist:false});updatePlayer();applyPanelVisibility();

// Direct backend playback has no separate invite login or YouTube modal on Play.

// Refresh the visual fill as mixing controls change without replacing native inputs.
function refreshMixerRails(){document.querySelectorAll('.setting input[type="range"],.music-range').forEach(el=>{const min=Number(el.min)||0,max=Number(el.max)||1,val=Number(el.value)||0;el.style.setProperty('--mix-fill',Math.max(0,Math.min(100,100*(val-min)/(max-min)))+'%')})}
document.addEventListener('input',e=>{if(e.target.matches?.('.setting input[type="range"],.music-range'))refreshMixerRails()});
const mixerObserve=new MutationObserver(()=>refreshMixerRails());mixerObserve.observe(document.querySelector('#sheet-content'),{childList:true,subtree:false});refreshMixerRails();
