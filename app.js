import {FluidVisual,PALETTES} from './lib/visual-engine.js';
import {WebAudioEngine} from './lib/audio-engine.js';
import {parseLRC,lyricIndex} from './lib/lrc.js';
import {searchCatalog,searchNativeBackend} from './lib/catalog.js';
import {OmniboxSession,classifyIntent,rank} from './lib/omnibox.js';
import {MUSIC_PRESETS,musicalPreset} from './lib/music-presets.js';
import {autoLyrics,normalizeIdentity} from './lib/lyrics-auto.js';
import {trackAudioURL,selectMusicResults} from './lib/playback-source.js';
import {CLASSIC_THEMES,MATERIAL_THEMES,GNARLY_MODES,EXPERIENCES,REACTIONS,ROLE_EXPLANATION,resolveVisual,restoredThemeAfterGnarly} from './lib/visual-selection.js';
import {StemMixer,STEM_KINDS,STEM_LABELS,STEM_PRESETS} from './lib/stem-mixer.js';

const $=(selector)=>document.querySelector(selector);
const app=$('#app-shell'), audio=$('#player-audio'), visual=new FluidVisual($('#fluid-canvas'));
const engine=new WebAudioEngine(audio);
const stems=new StemMixer(engine,audio);
const icon='/assets/gnarly-icon.png';
let omniboxStorage=null;try{omniboxStorage=window.localStorage}catch{}
const omnibox=new OmniboxSession(omniboxStorage);
const safe=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const svg=(name)=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;
const getSetting=(name,fallback)=>{try{return localStorage.getItem('gnarly.web.'+name)||fallback}catch{return fallback}};
const setSetting=(name,value)=>{try{localStorage.setItem('gnarly.web.'+name,String(value))}catch{/* private mode */}};
const parseJSON=(s,fallback)=>{try{return JSON.parse(s)}catch{return fallback}};
const state={
  tracks:[],queue:[],current:null,playing:false,searchResults:[],searchTerm:'',
  theme:getSetting('theme','ACID'),reaction:getSetting('reaction','FLUIDO'),experience:getSetting('experience','original'),previousTheme:getSetting('previousTheme','ACID'),visualTab:'theme',
  stemStatus:'Importe os quatro stems separados para controlar cada fonte. Separação neural automática ainda não está disponível na web.',
  speed:Number(getSetting('speed','1')),reverb:Number(getSetting('reverb','0')),bass:Number(getSetting('bass','0')),
  pitch:getSetting('pitch','yes')!=='no',
  favorites:parseJSON(getSetting('favorites','[]'),[]),preset:getSetting('preset','ORIGINAL'),
  audioState:'idle', playbackError:'',
  lyrics:[],lyricsStatus:'As letras aparecem automaticamente quando disponíveis.',lyricsAbort:null,sheet:null,backgroundURL:null,backgroundMode:getSetting('backgroundMode','visual'),artworkHue:.58,searchTimer:null,lastLyric:-2,searchLoading:false,searchError:'',searchTerm:omnibox.query,history:omnibox.history,searchGeneration:0
};
if(!PALETTES[state.theme])state.theme='ACID';
if(!['DESLIGADO','FLUIDO','REATIVO'].includes(state.reaction))state.reaction='FLUIDO';
visual.setTheme(state.theme);visual.setExperience(state.experience);visual.setReaction(state.reaction);visual.startLoop();
engine.setSpeed(state.speed,state.pitch);engine.setReverb(state.reverb);engine.setBass(state.bass);
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,4200)}
function fmt(secs){if(!Number.isFinite(secs))return '0:00';return `${Math.floor(secs/60)}:${String(Math.floor(secs%60)).padStart(2,'0')}`}
function titleForFile(file){const name=file.name.replace(/\.[^.]+$/,'');const parts=name.split(/\s+[—–-]\s+/);return {title:parts.length>=2?parts.slice(1).join(' - '):name,artist:parts.length>=2?parts[0]:'Arquivo local'}}
function updateBadges(){
 document.documentElement.style.setProperty('--acid', ({'ACID':'#46ff12','CYBER NIGHT':'#35d5ff','CRIMSON':'#ff425d','CHROME':'#e6f2ef','SMOKE':'#d5c2ec','XEROX SERPENTINE':'#d5ec46','PRISM CARMINE':'#ff56ab','GNARLY':'#45ff8a'})[state.theme]||'#46ff12');
 $('.build-badge').textContent=`WEB α6 · ${state.theme}`;
 $('#reaction-label').textContent=state.reaction;
 visual.setTheme(state.theme);visual.setExperience(state.experience);visual.setReaction(state.reaction);
 const fave=state.current&&state.favorites.some(x=>x.id===state.current.id);
 $('#favorite-button').classList.toggle('is-favorite',!!fave);
 $('#favorite-button').setAttribute('aria-label',fave?'Remover dos favoritos':'Adicionar aos favoritos');
}
// Same media source as Stage72's AudioDownloadManager: Render /download.
// Do not start an external player or load a file picker as an implicit fallback.
function prepareNativeAudio(track){
 const url=trackAudioURL(track);
 if(!url)return false;
 if(audio.src!==url){audio.preload='none';audio.src=url;}
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
 $('#track-artist').textContent=track?.artist||'Selecione uma música para começar';
 $('#cover-image').src=track?.artwork||icon;
 $('#cover-image').onerror=()=>{$('#cover-image').onerror=null;$('#cover-image').src=icon};
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
 if('mediaSession' in navigator && typeof MediaMetadata!=='undefined'){try{navigator.mediaSession.metadata=track?new MediaMetadata({title:track.title,artist:track.artist,album:track.album||'GNARLY WEB',artwork:[{src:track.artwork||new URL(icon,location.href).href,sizes:'256x256'}]}):null}catch{}}
}
function updateProgress(){const d=audio.duration||0,t=audio.currentTime||0,p=d?Math.min(1000,1000*t/d):0;const slider=$('#seek-slider');slider.value=String(p);slider.style.setProperty('--progress',`${p/10}%`);$('#elapsed-label').textContent=fmt(t);if(state.current?.source!=='preview')$('#duration-label').textContent=fmt(d||state.current?.duration||0)}
function applyBackground(){
 const cover=state.current?.artwork;const mode=state.backgroundMode;app.classList.toggle('custom-bg',mode==='custom'&&!!state.backgroundURL);app.classList.toggle('cover-bg',mode==='cover'&&!!cover);if(mode==='cover'&&cover){app.style.backgroundImage=`linear-gradient(#0002,#0007), url("${cover.replaceAll('\"','%22')}")`}else if(mode==='custom'&&state.backgroundURL){app.style.backgroundImage=`linear-gradient(#0002,#0006),url("${state.backgroundURL}")`}else app.style.backgroundImage='';visual.setPaused(app.classList.contains('cover-bg')||app.classList.contains('custom-bg'));}
async function loadArtworkHue(track){if(!track?.artwork||track.artwork===icon){state.artworkHue=.58;return}try{const img=new Image();img.crossOrigin='anonymous';img.src=track.artwork;await img.decode();if(state.current!==track)return;const cv=document.createElement('canvas');cv.width=cv.height=20;const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,20,20);const data=ctx.getImageData(0,0,20,20).data;let x=0,y=0;for(let i=0;i<data.length;i+=4){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d>.08){if(max===r)h=((g-b)/d+6)%6/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6}x+=Math.cos(h*2*Math.PI)*d;y+=Math.sin(h*2*Math.PI)*d}if(x||y)state.artworkHue=(Math.atan2(y,x)/(Math.PI*2)+1)%1}catch{/* third-party artwork might be CORS protected; deterministic fallback */}}
async function loadAutoLyrics(track){state.lyricsAbort?.abort();const ac=new AbortController();state.lyricsAbort=ac;state.lyrics=[];state.lastLyric=-2;state.lyricsStatus='Procurando letra sincronizada automaticamente…';syncLyrics();if(state.sheet==='karaoke')renderSheet();const result=await autoLyrics(track,{signal:ac.signal});if(ac.signal.aborted||state.current!==track)return;state.lyrics=result.lines;state.lyricsStatus=result.status;state.lastLyric=-2;syncLyrics();if(state.sheet==='karaoke')renderSheet()}
function syncLyrics(){const i=lyricIndex(state.lyrics,audio.currentTime||0);if(state.lastLyric===i)return;state.lastLyric=i;const el=$('#floating-lyrics');const line=$('#floating-line');if(!state.lyrics.length||!state.current){el.hidden=true;return}el.hidden=false;line.textContent=i>=0?state.lyrics[i].text:'♪ ♪ ♪';if(state.sheet==='karaoke')renderSheet()}
async function enrichLocalTrack(track){
 if(track?.source!=='local'||!track.artist||track.artist==='Arquivo local')return;
 try{const found=await searchCatalog(`${track.artist} ${track.title}`);
   if(state.current!==track)return;
   const wanted=normalizeIdentity(track.title),artist=normalizeIdentity(track.artist);
   const matched=found.find(x=>normalizeIdentity(x.title)===wanted&&normalizeIdentity(x.artist)===artist);
   if(!matched)return;
   track.artwork=matched.artwork||track.artwork;track.album=matched.album||track.album;
   updatePlayer();void loadArtworkHue(track);
 }catch{/* Offline files must still play without the catalog. */}
}
function selectTrack(track,autoplay=true){
 if(!track)return;
 stems.clear();state.stemStatus='Escolha 4 arquivos separados para a faixa atual.';
 closeYouTubePlayer();audio.pause();state.playing=false;state.current=track;state.artworkHue=.58;state.playbackError='';state.audioState='idle';
 if(track.source==='youtube'){
   // Deferred until Play: avoids wasting a Render extraction on every tapped row.
   audio.removeAttribute('src');audio.preload='none';audio.load();
 }else{audio.preload='metadata';audio.src=track.url;audio.load();}
 reportAudioStatus('');state.lastLyric=-2;updatePlayer();void loadArtworkHue(track);void loadAutoLyrics(track);
 if(track.source==='local')void enrichLocalTrack(track);omnibox.record(track);state.history=omnibox.history;
 if(autoplay)void play();if(state.sheet&&['library','queue','search'].includes(state.sheet))renderSheet();
}
async function play(){
 if(!state.current){openSheet('search');toast('Escolha uma música na Busca ou adicione seu áudio pelo botão +.');return;}
 if(state.current.source==='youtube'){
  if(!prepareNativeAudio(state.current)){reportAudioError('ID de música inválido. Escolha outro resultado.');return;}
  state.audioState='loading';reportAudioStatus('Conectando ao backend GNARLY · preparando áudio…');
 }
 try{
  // Both calls start synchronously within the user's click gesture (Safari).
  const unlock=engine.resume(),start=audio.play();
  await Promise.all([unlock,start]);state.playing=true;state.audioState='playing';state.playbackError='';reportAudioStatus('');updatePlayer();
 }catch(e){
  state.playing=false;updatePlayer();
  reportAudioError(state.current?.source==='youtube'
   ?'Não foi possível reproduzir pelo backend. Confira a conexão e tente novamente; pode ser bloqueio ou limite do servidor.'
   :'Falha ao reproduzir este arquivo de áudio.');
  console.warn('GNARLY WEB audio play:',e);
 }
}
function pause(){audio.pause();stems.pause();closeYouTubePlayer();state.playing=false;updatePlayer()}
function next(){const nextTrack=state.queue.shift();if(nextTrack)selectTrack(nextTrack);else{pause();audio.currentTime=0;toast('Fim da fila')}updatePlayer()}
function previous(){if(audio.currentTime>3){audio.currentTime=0;return}const idx=state.tracks.findIndex(x=>x.id===state.current?.id);if(idx>0)selectTrack(state.tracks[idx-1]);else audio.currentTime=0}
function addToQueue(track){if(!track)return;state.queue.push(track);updatePlayer();toast(`Adicionado à fila: ${track.title}`)}
function importAudio(files){const valid=[...files].filter(x=>x.type.startsWith('audio/')||/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(x.name));if(!valid.length){toast('Escolha arquivos de áudio compatíveis.');return}for(const file of valid){const names=titleForFile(file);state.tracks.push({id:`local:${crypto.randomUUID?.()||Date.now()+Math.random()}`,title:names.title,artist:names.artist,album:'Biblioteca local',artwork:icon,url:URL.createObjectURL(file),source:'local',duration:0})}if(!state.current){selectTrack(state.tracks[0],true);state.queue.push(...state.tracks.slice(1));updatePlayer()}else if(valid.length>1)toast(`${valid.length} músicas importadas`);if(state.sheet==='library')renderSheet()}
function applyPreset(id){const v=musicalPreset(id);if(!v)return;state.preset=id;state.speed=v.speed;state.reverb=v.reverb;state.pitch=v.pitch;engine.setSpeed(v.speed,v.pitch);engine.setReverb(v.reverb);for(const key of ['speed','reverb','pitch','preset'])setSetting(key,key==='pitch'?(state.pitch?'yes':'no'):state[key]);updatePresetButtons();if(state.sheet==='controls')renderSheet();if(stems.ready)stems.sync();toast(id==='ORIGINAL'?'Som original restaurado':id+' ativado')}
function updatePresetButtons(){document.querySelectorAll('[data-preset]').forEach(b=>{const selected=b.dataset.preset===state.preset;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))})}
function openYouTubePlayer(track){if(!/^[A-Za-z0-9_-]{11}$/.test(track?.videoId||''))return toast('Link do YouTube inválido');audio.pause();const dialog=$('#youtube-player-dialog'),frame=$('#youtube-player-frame');frame.src='https://www.youtube-nocookie.com/embed/'+track.videoId+'?autoplay=1&playsinline=1';$('#youtube-player-title').textContent=track.title;$('#youtube-player-link').href='https://www.youtube.com/watch?v='+track.videoId;dialog.hidden=false;dialog.setAttribute('aria-hidden','false');toast('Player oficial: Nightcore e reverb não podem alterar o áudio dentro do YouTube.');}
function closeYouTubePlayer(){const dialog=$('#youtube-player-dialog');if(!dialog)return;dialog.hidden=true;dialog.setAttribute('aria-hidden','true');$('#youtube-player-frame').src='about:blank'}
function toggleFavorite(){if(!state.current){openSheet('library');return}const at=state.favorites.findIndex(x=>x.id===state.current.id);if(at>=0){state.favorites.splice(at,1);toast('Removido dos favoritos')}else{state.favorites.push(state.current);toast('Adicionado aos favoritos')}setSetting('favorites',JSON.stringify(state.favorites.filter(x=>x.source!=='local').slice(-100)));updatePlayer();if(state.sheet==='favorites')renderSheet()}
function openSheet(which){state.sheet=which;$('#bottom-sheet').hidden=false;$('#panel-backdrop').hidden=false;$('#sheet-title').textContent=({search:'Busca',queue:'Próximas músicas',library:'Mix / Biblioteca',favorites:'Favoritos',controls:'Música',stems:'Stems',theme:'Universo visual',create:'Criar',karaoke:'Karaokê',background:'Fundo'})[which]||'GNARLY';$('#search-toggle').setAttribute('aria-expanded',String(which==='search'));renderSheet();if(which==='search')setTimeout(()=>$('#search-term')?.focus(),80)}
function closeSheet(){state.sheet=null;$('#bottom-sheet').hidden=true;$('#panel-backdrop').hidden=true;$('#search-toggle').setAttribute('aria-expanded','false')}
function mediaList(tracks,context){if(!tracks.length)return `<p class="section-note">Nenhuma música por aqui ainda.</p>`;return `<div class="media-list">${tracks.map((tr,i)=>`<div class="media-item"><img src="${safe(tr.artwork||icon)}" alt="" loading="lazy" /><div class="media-text"><strong>${safe(tr.title)}</strong><small>${safe(tr.artist)} · ${tr.source==='preview'?'Prévia · 30 s':tr.source==='youtube'?'GNARLY · áudio via backend':'Áudio completo · local'}</small></div><button data-action="play" data-context="${context}" data-index="${i}" aria-label="Reproduzir ${safe(tr.title)}">${svg('play')}</button><button data-action="enqueue" data-context="${context}" data-index="${i}" aria-label="Adicionar ${safe(tr.title)} à fila">${svg('plus')}</button></div>`).join('')}</div>`}
const visualTile=(name)=>`<button class="visual-choice ${state.theme===name?'active':''}" data-theme="${safe(name)}"><i class="swatch" style="--swatch-a:${PALETTES[name]?.[0]||'#000'};--swatch-b:${PALETTES[name]?.[1]||'#444'};--swatch-c:${PALETTES[name]?.[2]||'#aaa'}"></i><strong>${safe(name)}</strong></button>`;
const experienceTile=(v)=>`<button class="visual-choice ${state.experience===v.id?'active':''}" data-experience="${v.id}"><strong>${safe(v.name)}</strong><small>${safe(v.detail)}</small></button>`;
const btn=(caption,command,other='')=>`<button class="action-button ${other}" data-command="${command}">${caption}</button>`;
const setting=(id,title,value,minimum,maximum,step,unit)=>`<div class="setting"><div class="setting-title"><span>${title}</span><span id="${id}-value">${Number(value).toFixed(step<1?2:0)}${unit}</span></div><input id="${id}" data-slider="${id}" type="range" min="${minimum}" max="${maximum}" step="${step}" value="${value}" aria-label="${title}" /></div>`;
function renderSheet(){const content=$('#sheet-content');switch(state.sheet){
 case 'search':content.innerHTML=`<form id="search-form" class="search-bar"><input id="search-term" type="search" autocomplete="off" placeholder="Buscar música ou colar link" aria-label="Omnibox GNARLY" value="${safe(state.searchTerm)}"/><button type="submit">Buscar</button></form><p class="section-note">Omnibox Stage 72: histórico imediato e busca no catálogo musical ao confirmar. Resultados musicais priorizados, fila, histórico e reprodução pelo backend GNARLY. A reprodução pode falhar em faixas indisponíveis ou sem autorização.</p><div id="search-state" class="status-text">${safe(state.searchError||'Digite uma busca e pressione Buscar')}</div><div id="search-results">${mediaList(state.searchResults,'search')}</div>${state.history.length?`<div class="section-head">Ouvidas recentemente</div>${mediaList(state.history.slice(0,4),'history')}`:''}`;break;
 case 'library':content.innerHTML=`<div class="card-help">Sua <strong>biblioteca local</strong> toca arquivos do dispositivo, sem servidor e sem conta. Os arquivos importados permanecem apenas nesta sessão.</div>${btn('＋ Adicionar músicas','import')}<div class="section-head">Mix · ${state.tracks.length} músicas</div>${mediaList(state.tracks,'library')}<div class="section-head">Favoritas · ${state.favorites.length}</div>${mediaList(state.favorites,'favorites')}`;break;
 case 'favorites':content.innerHTML=`<div class="section-head">Favoritos</div>${mediaList(state.favorites,'favorites')}`;break;
 case 'queue':content.innerHTML=`<div class="row-end"><p class="section-note">A seguir, nesta sessão</p>${btn('Limpar fila','clear-queue','alt')}</div>${mediaList(state.queue,'queue')}`;break;
 case 'controls':content.innerHTML=`<div class="visual-status"><strong>MÚSICA · Stage 72</strong><small>Velocidade, tom, graves, reverb e fontes Stems</small></div><div class="section-head">PRESETS</div><div class="chip-row">${Object.keys(MUSIC_PRESETS).map(id=>`<button data-preset="${id}" class="chip ${state.preset===id?'selected':''}">${id}</button>`).join('')}</div>${setting('speed','Velocidade',state.speed,.5,2,.01,'×')}${setting('reverb','Reverb',state.reverb,0,.7,.025,'')}${setting('bass','Graves',state.bass,0,12,1,' dB')}<div class="setting"><div class="setting-title"><label for="pitch-check">Preservar tom original</label><input id="pitch-check" type="checkbox" ${state.pitch?'checked':''}/></div></div><div class="button-row">${btn('STEMS · voz, bateria, baixo e outros','go-stems')}${btn('Restaurar ajustes','reset-audio','alt')}</div><p class="section-note">Áudio processado pelo Web Audio. O time-stretch ainda não é idêntico ao AVAudioEngine do iPhone.</p>`;break;
 case 'stems':content.innerHTML=`<div class="visual-status"><strong>STEMS · 4 fontes reais</strong><small>${stems.ready?'4 arquivos carregados · mixer ativo':'Separação neural requer modelo e processamento dedicado'}</small></div><p class="section-note" id="stem-status">${safe(state.stemStatus)}</p><div class="button-row">${btn('Carregar 4 stems','load-stems')}${btn('Restaurar 100%','reset-stems','alt')}${stems.ready?btn('Desativar Stems','clear-stems','alt'):''}</div><p class="section-note">Selecione arquivos nomeados <code>vocals</code>, <code>drums</code>, <code>bass</code> e <code>other</code>. A separação automática por Demucs no navegador ainda não foi portada; isto não é simulação por equalizador.</p>${stems.ready?`<div class="section-head">ATALHOS DO MIXER</div><div class="chip-row">${Object.entries({karaoke:'Sem voz',acapella:'Só voz',rhythm:'Ritmo',original:'Original'}).map(([id,label])=>`<button class="chip" data-stem-preset="${id}">${label}</button>`).join('')}</div>`:''}${STEM_KINDS.map(kind=>`<div class="setting"><div class="setting-title"><span>${STEM_LABELS[kind]}</span><span id="stem-${kind}-value">${Math.round(stems.levels[kind]*100)}%</span></div><input data-stem-level="${kind}" type="range" min="0" max="2" step="0.01" value="${stems.levels[kind]}" aria-label="Nível de ${STEM_LABELS[kind]}" ${stems.ready?'':'disabled'}/></div>`).join('')}<div class="button-row">${btn('Voltar para Música','go-controls','alt')}</div>`;break;
 case 'theme':{const v=resolveVisual(state.theme,state.experience,state.reaction);content.innerHTML=`<div class="visual-status"><strong>${safe(state.theme)}</strong><small>Experiência: ${safe(v.experienceName)} · ${safe(v.reaction)}</small>${v.override?`<span>Modo GNARLY ativo; sua experiência permanece salva.</span>`:`<span>${safe(v.description)}</span>`}</div><p class="section-note">${ROLE_EXPLANATION}</p><div class="visual-tabs" role="tablist" aria-label="Personalizar visual">${[['theme','1 · Tema'],['experience','2 · Experiência'],['reaction','3 · Ritmo']].map(([id,label])=>`<button role="tab" data-visual-tab="${id}" aria-selected="${state.visualTab===id}" class="${state.visualTab===id?'active':''}">${label}</button>`).join('')}</div>${state.visualTab==='theme'?`<div class="section-head">CLÁSSICOS · cor e material</div><div class="visual-choices">${CLASSIC_THEMES.map(x=>visualTile(x)).join('')}</div><div class="section-head">MATERIAIS GNARLY</div><div class="visual-choices">${MATERIAL_THEMES.map(x=>visualTile(x)).join('')}</div><div class="section-head">MODOS GNARLY · substituem temporariamente a experiência</div><div class="visual-choices">${GNARLY_MODES.map(x=>visualTile(x)).join('')}</div>${v.override?btn('Voltar ao tema anterior','restore-theme'):''}`:state.visualTab==='experience'?`<div class="section-head">EXPERIÊNCIAS CLÁSSICAS</div><div class="visual-choices">${EXPERIENCES.filter(x=>x.category==='classic').map(experienceTile).join('')}</div><div class="section-head">EXPERIÊNCIAS GNARLY</div><div class="visual-choices">${EXPERIENCES.filter(x=>x.category==='gnarly').map(experienceTile).join('')}</div><p class="section-note">A experiência escolhida permanece salva ao mudar temas, inclusive no modo GNARLY.</p>`:`<div class="section-head">FORÇA DA RESPOSTA AO ÁUDIO</div><div class="visual-choices">${REACTIONS.map(m=>`<button class="visual-choice ${state.reaction===m?'active':''}" data-reaction="${m}"><strong>${m}</strong><small>${m==='DESLIGADO'?'Movimento natural, sem pulso de áudio':m==='FLUIDO'?'Reação suave e contínua':'Intensidade elevada, resposta às batidas'}</small></button>`).join('')}</div>`}<div class="button-row">${btn('Aplicar visual','apply-theme')}${btn('Padrão original','reset-visual','alt')}</div><p class="section-note">Texturas portadas para WebGL2 a partir da taxonomia Swift/Metal. Equivalência visual pixel a pixel ainda requer portar os shaders completos.</p>`;break;}
 case 'create':content.innerHTML=`<div class="card-help"><strong>CRIAR · universo visual</strong><p>${ROLE_EXPLANATION}</p>O tema define a matéria e a experiência define como se move; o ritmo regula a reatividade.</div><div class="visual-status"><strong>${safe(state.theme)}</strong><small>${safe(resolveVisual(state.theme,state.experience,state.reaction).experienceName)} · ${state.reaction}</small></div><div class="button-row">${btn('Escolher tema','go-theme')}${btn('Escolher experiência','go-experience','alt')}${btn('Ajustar ritmo visual','go-reaction','alt')}${btn('Música e Stems','go-controls','alt')}${btn('Foto de fundo','load-background','alt')}</div><div class="section-head">EXPERIÊNCIAS DA STAGE 72</div><div class="visual-choices">${EXPERIENCES.filter(x=>x.category==='classic').slice(0,4).map(experienceTile).join('')}</div>`;break;
 case 'karaoke':content.innerHTML=`<div class="card-help">O GNARLY procura automaticamente letras sincronizadas no LRCLIB ao selecionar uma música. Você também pode importar seu .lrc. As prévias de 30 segundos podem começar em trechos diferentes da faixa, então a sincronia não é garantida nelas.</div><p class="status-text" id="lyrics-status">${safe(state.lyricsStatus)}</p>${btn('Importar letra .lrc','load-lrc')}<div class="section-head">Letra sincronizada</div>${state.lyrics.length?`<div class="lyrics-box">${state.lyrics.map((line,i)=>{const active=i===lyricIndex(state.lyrics,audio.currentTime);return `<div class="lyric-line ${active?'active':''}" data-lyric-time="${line.time}">${safe(line.text)}</div>`}).join('')}</div>`:'<p class="section-note">Nenhuma letra disponível para esta faixa. Você pode adicionar seu próprio .lrc.</p>'}`;break;
 case 'background':content.innerHTML=`<div class="card-help">Escolha como o fundo ocupa a tela. A capa usa sua resolução disponível; fotos próprias ficam somente no aparelho, sem upload.</div><div class="button-row">${btn('Tema animado · original','show-visual')}${btn('Capa preenchendo a tela','show-cover','alt')}${btn('Minha foto','load-background','alt')}${btn('Remover foto','remove-background','alt')}</div>`;break;
 default:content.textContent='';
 }}
function resolveTracks(context){return ({search:state.searchResults,library:state.tracks,queue:state.queue,favorites:state.favorites,history:state.history})[context]||[]}
function handleCommand(command){switch(command){case 'import':$('#audio-import').click();break;case 'load-lrc':$('#lrc-import').click();break;case 'load-background':$('#background-import').click();break;case 'show-visual':state.backgroundMode='visual';setSetting('backgroundMode','visual');applyBackground();closeSheet();break;case 'show-cover':if(!state.current?.artwork){toast('Selecione uma música com capa primeiro.');break}state.backgroundMode='cover';setSetting('backgroundMode','cover');applyBackground();closeSheet();break;case 'remove-background':if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL);state.backgroundURL=null;state.backgroundMode='visual';setSetting('backgroundMode','visual');applyBackground();toast('Tema animado restaurado');break;case 'clear-queue':state.queue.length=0;updatePlayer();renderSheet();break;case 'play-youtube':if(state.current?.source==='youtube')openYouTubePlayer(state.current);break;case 'reset-audio':state.speed=1;state.reverb=0;state.bass=0;state.pitch=true;state.preset='ORIGINAL';engine.setSpeed(1,true);engine.setBass(0);engine.setReverb(0);for(const p of ['speed','bass','reverb','pitch','preset'])setSetting(p,p==='pitch'?'yes':p==='preset'?'ORIGINAL':p==='speed'?1:0);renderSheet();break;case 'go-theme':state.visualTab='theme';openSheet('theme');break;case 'go-experience':state.visualTab='experience';openSheet('theme');break;case 'go-reaction':state.visualTab='reaction';openSheet('theme');break;case 'restore-theme':state.theme=restoredThemeAfterGnarly(state.previousTheme);setSetting('theme',state.theme);updateBadges();renderSheet();break;case 'reset-visual':state.theme='ACID';state.experience='original';state.reaction='FLUIDO';for(const k of ['theme','experience','reaction'])setSetting(k,state[k]);updateBadges();renderSheet();break;case 'go-stems':openSheet('stems');break;case 'load-stems':if(!state.current){toast('Selecione uma música antes de importar Stems.');break}$('#stems-import').click();break;case 'reset-stems':stems.applyPreset('original');renderSheet();break;case 'clear-stems':stems.clear();state.stemStatus='Mixer desativado. Voltamos ao áudio original.';renderSheet();break;case 'go-controls':openSheet('controls');break;case 'apply-theme':closeSheet();break}}
function syncVisual(){visual.setSong(audio.currentTime||0,Number.isFinite(audio.duration)&&state.current?.source!=='preview'?audio.duration:state.current?.duration||0,state.artworkHue);if(!document.hidden&&state.playing)visual.setEnergy(engine.sampleEnergy());else visual.setEnergy(0);requestAnimationFrame(syncVisual)}requestAnimationFrame(syncVisual);
$('#audio-import').addEventListener('change',e=>{importAudio(e.target.files||[]);e.target.value='' });
$('#lrc-import').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;state.lyricsAbort?.abort();state.lyrics=parseLRC(await file.text());state.lyricsStatus='Letra sincronizada importada por você';state.lastLyric=-2;syncLyrics();toast(`${state.lyrics.length} linhas sincronizadas carregadas`);if(state.sheet==='karaoke')renderSheet();e.target.value=''});
$('#stems-import').addEventListener('change',async e=>{const files=[...(e.target.files||[])];e.target.value='';if(!state.current)return toast('Escolha uma música primeiro');state.stemStatus='Carregando fontes Stems…';if(state.sheet==='stems')renderSheet();try{await stems.load(files);state.stemStatus='Quatro fontes reais conectadas ao mixer GNARLY.';toast('Stems prontos: voz, bateria, baixo e outros.')}catch(err){state.stemStatus=err.message;toast(err.message)}if(state.sheet==='stems')renderSheet()});
$('#background-import').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file||!file.type.startsWith('image/'))return;if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL);state.backgroundURL=URL.createObjectURL(file);state.backgroundMode='custom';setSetting('backgroundMode','custom');applyBackground();if(state.sheet==='background')closeSheet();toast('Foto de fundo aplicada');e.target.value=''});
$('#cover-button').addEventListener('click',()=>{if(!state.current)openSheet('search');else openSheet('background')});
$('#add-button').addEventListener('click',()=>$('#audio-import').click());
$('#library-button').addEventListener('click',()=>openSheet('library'));
$('#favorite-button').addEventListener('click',toggleFavorite);
$('#controls-button').addEventListener('click',()=>openSheet('controls'));
$('#theme-button').addEventListener('click',()=>openSheet('theme'));
$('#create-button').addEventListener('click',()=>openSheet('create'));
$('#background-button').addEventListener('click',()=>openSheet('background'));
$('#search-toggle').addEventListener('click',()=>state.sheet==='search'?closeSheet():openSheet('search'));
$('#reaction-button').addEventListener('click',()=>{const modes=['DESLIGADO','FLUIDO','REATIVO'];state.reaction=modes[(modes.indexOf(state.reaction)+1)%modes.length];visual.setReaction(state.reaction);setSetting('reaction',state.reaction);updateBadges();toast(`Ritmo visual: ${state.reaction}`)});
$('#share-button').addEventListener('click',async()=>{const data={title:'GNARLY WEB',text:'Sua música, seu ritmo, seu visual.',url:location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);toast('Link copiado!')}}catch(e){if(e.name!=='AbortError')toast('Não foi possível compartilhar')}});
$('#play-button').addEventListener('click',()=>state.playing?pause():void play());
$('#youtube-close').addEventListener('click',closeYouTubePlayer);
$('#youtube-player-dialog').addEventListener('click',e=>{if(e.target.id==='youtube-player-dialog')closeYouTubePlayer()});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
$('#next-button').addEventListener('click',next);
$('#previous-button').addEventListener('click',previous);
$('#seek-slider').addEventListener('input',e=>{if(Number.isFinite(audio.duration)&&audio.duration)audio.currentTime=audio.duration*Number(e.target.value)/1000;updateProgress()});
$('#close-sheet').addEventListener('click',closeSheet);$('#panel-backdrop').addEventListener('click',closeSheet);
for(const el of document.querySelectorAll('[data-drawer]'))el.addEventListener('click',()=>openSheet(el.dataset.drawer));
$('#sheet-content').addEventListener('submit',e=>{if(e.target.id==='search-form'){e.preventDefault();void runSearch($('#search-term').value)}});
$('#sheet-content').addEventListener('click',e=>{const target=e.target.closest('button,[data-lyric-time]');if(!target)return;if(target.dataset.lyricTime){audio.currentTime=Number(target.dataset.lyricTime);return}if(target.dataset.command){handleCommand(target.dataset.command);return}if(target.dataset.visualTab){state.visualTab=target.dataset.visualTab;renderSheet();return}if(target.dataset.experience){state.experience=target.dataset.experience;setSetting('experience',state.experience);updateBadges();renderSheet();return}if(target.dataset.stemPreset){stems.applyPreset(target.dataset.stemPreset);renderSheet();return}if(target.dataset.preset){applyPreset(target.dataset.preset);return}if(target.dataset.theme){if(!GNARLY_MODES.includes(state.theme)&&GNARLY_MODES.includes(target.dataset.theme)){state.previousTheme=state.theme;setSetting('previousTheme',state.theme)}state.theme=target.dataset.theme;setSetting('theme',state.theme);updateBadges();renderSheet();return}if(target.dataset.reaction){state.reaction=target.dataset.reaction;setSetting('reaction',state.reaction);updateBadges();renderSheet();return}if(target.dataset.action){const list=resolveTracks(target.dataset.context),track=list[Number(target.dataset.index)];if(!track)return;if(target.dataset.action==='enqueue')addToQueue(track);else if(target.dataset.action==='play'){if(target.dataset.context==='queue')state.queue.splice(Number(target.dataset.index),1);selectTrack(track);closeSheet()}}});
$('#sheet-content').addEventListener('input',e=>{const el=e.target;if(el.id==='search-term'){state.searchTerm=el.value;const local=omnibox.setQuery(state.searchTerm);const kind=classifyIntent(state.searchTerm);state.searchResults=local;searchCounter++;displaySearch(local,kind.kind==='direct'?'Link do YouTube detectado · pressione Buscar':local.length?'Histórico local · pressione Buscar para atualizar':'Pressione Buscar para consultar o catálogo')}if(el.dataset.stemLevel){const kind=el.dataset.stemLevel;stems.setLevel(kind,el.value);const label=$(`#stem-${kind}-value`);if(label)label.textContent=`${Math.round(stems.levels[kind]*100)}%`;return}if(el.dataset.slider){const id=el.dataset.slider,v=Number(el.value);if(id==='speed'){state.speed=v;engine.setSpeed(v,state.pitch);state.preset='CUSTOM';setSetting('preset','CUSTOM');updatePresetButtons()}if(id==='reverb'){state.reverb=v;engine.setReverb(v);state.preset='CUSTOM';setSetting('preset','CUSTOM');updatePresetButtons()}if(id==='bass'){state.bass=v;engine.setBass(v)}setSetting(id,v);const out=$(`#${id}-value`);if(out)out.textContent=v.toFixed(id==='bass'?0:2)+(id==='speed'?'×':id==='bass'?' dB':'')}if(el.id==='pitch-check'){state.pitch=el.checked;engine.setSpeed(state.speed,state.pitch);setSetting('pitch',state.pitch?'yes':'no');state.preset='CUSTOM';setSetting('preset','CUSTOM');updatePresetButtons()}});
// Stage72 Omnibox: local hits while typing, remote search on submit, fresh/stale cache.
let searchCounter=0;
function displaySearch(results,info=''){if(state.sheet!=='search')return;const resultsEl=$('#search-results'),status=$('#search-state');if(resultsEl)resultsEl.innerHTML=mediaList(results,'search');if(status)status.textContent=info}
async function runSearch(raw){const query=String(raw||'').trim();state.searchTerm=query;omnibox.setQuery(query);const intent=classifyIntent(query);const count=++searchCounter;
 if(intent.kind==='direct'){const id=intent.videoId,track={id:'youtube:'+id,videoId:id,title:id,artist:'YouTube',artwork:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',source:'youtube',duration:0};state.searchResults=[track];selectTrack(track,false);displaySearch([track],'Link reconhecido · pronto para reprodução no GNARLY');return}
 if(intent.kind==='empty'){state.searchResults=state.history.slice(0,4);displaySearch(state.searchResults,'Suas músicas recentes');return}
 if(query.length<2){state.searchResults=[];displaySearch([],'Digite pelo menos 2 caracteres');return}
 const cached=omnibox.fromCache(query);if(cached){state.searchResults=cached.results;displaySearch(state.searchResults,cached.stale?'Resultados anteriores · atualizando…':'Resultados em cache');if(!cached.stale)return}
 displaySearch(state.searchResults,'Buscando no catálogo do app…');
 try{const outcome=await Promise.allSettled([searchNativeBackend(query),searchCatalog(query)]);if(count!==searchCounter)return;
 const songs=outcome[0].status==='fulfilled'?outcome[0].value:[],previews=outcome[1].status==='fulfilled'?outcome[1].value:[];
 // Stage72 metadata: prefer exact iTunes title matches to resolve the artist name for LRCLIB, without treating previews as the full audio source.
 for(const song of songs){if(song.artist&&song.artist!=='YouTube Music')continue;const match=previews.find(x=>normalizeIdentity(x.title)===normalizeIdentity(song.title));if(match){song.artist=match.artist; song.album=match.album||song.album}}
 const hits=rank(query,selectMusicResults(songs,previews),omnibox.history);state.searchResults=hits;omnibox.cacheResults(query,hits);displaySearch(hits,`${songs.length} músicas no catálogo GNARLY · ${previews.length} prévias autorizadas`+(songs.length===0?' · servidor musical indisponível ou sem resultados':''));
 }catch(error){if(count!==searchCounter)return;displaySearch(state.searchResults,'Falha de rede. Resultados locais mantidos.');console.warn('Omnibox',error)}
}
audio.addEventListener('play',()=>{if(stems.ready)void stems.play();state.playing=true;updatePlayer()});audio.addEventListener('pause',()=>{stems.pause();state.playing=false;updatePlayer()});audio.addEventListener('timeupdate',()=>{if(stems.ready)stems.sync();updateProgress();syncLyrics()});audio.addEventListener('loadedmetadata',updateProgress);audio.addEventListener('seeked',()=>stems.seek());audio.addEventListener('ended',()=>{state.queue.length?next():pause()});audio.addEventListener('waiting',()=>{if(state.current?.source==='youtube')reportAudioStatus('Carregando áudio…')});audio.addEventListener('playing',()=>{state.audioState='playing';reportAudioStatus('')});audio.addEventListener('error',()=>{if(state.current){state.playing=false;updatePlayer();reportAudioError(state.current.source==='youtube'?'O servidor não entregou o áudio. Pode ser erro 403/422, limite ou faixa indisponível.':'Não foi possível carregar o áudio.');}});
for(const [action,fn] of [['play',()=>void play()],['pause',pause],['previoustrack',previous],['nexttrack',next],['seekto',details=>{audio.currentTime=details.seekTime||0}]]){try{navigator.mediaSession?.setActionHandler(action,fn)}catch{/* not supported */}}
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||e.ctrlKey||e.altKey||e.metaKey)return;if(e.code==='Space'){e.preventDefault();state.playing?pause():void play()}if(e.code==='Escape'){closeSheet();closeYouTubePlayer()};if(e.key==='ArrowRight'&&state.current)audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5);if(e.key==='ArrowLeft'&&state.current)audio.currentTime=Math.max(0,audio.currentTime-5)});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();app.classList.add('dragover')}});window.addEventListener('dragleave',e=>{if(!e.relatedTarget)app.classList.remove('dragover')});window.addEventListener('drop',e=>{e.preventDefault();app.classList.remove('dragover');importAudio(e.dataTransfer?.files||[])});
window.addEventListener('beforeunload',()=>{stems.clear();for(const item of state.tracks)if(item.source==='local')URL.revokeObjectURL(item.url);if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL)});
updatePlayer();

// Direct backend playback has no separate invite login or YouTube modal on Play.
