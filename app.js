import {FluidVisual,PALETTES} from './lib/visual-engine.js';
import {WebAudioEngine} from './lib/audio-engine.js';
import {parseLRC,lyricIndex} from './lib/lrc.js';
import {searchCatalog} from './lib/catalog.js';
import {autoLyrics,normalizeIdentity} from './lib/lyrics-auto.js';

const $=(selector)=>document.querySelector(selector);
const app=$('#app-shell'), audio=$('#player-audio'), visual=new FluidVisual($('#fluid-canvas'));
const engine=new WebAudioEngine(audio);
const icon='/assets/gnarly-icon.png';
const safe=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const svg=(name)=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;
const getSetting=(name,fallback)=>{try{return localStorage.getItem('gnarly.web.'+name)||fallback}catch{return fallback}};
const setSetting=(name,value)=>{try{localStorage.setItem('gnarly.web.'+name,String(value))}catch{/* private mode */}};
const parseJSON=(s,fallback)=>{try{return JSON.parse(s)}catch{return fallback}};
const state={
  tracks:[],queue:[],current:null,playing:false,searchResults:[],searchTerm:'',
  theme:getSetting('theme','ACID'),reaction:getSetting('reaction','FLUIDO'),
  speed:Number(getSetting('speed','1')),reverb:Number(getSetting('reverb','0')),bass:Number(getSetting('bass','0')),
  pitch:getSetting('pitch','yes')!=='no',
  favorites:parseJSON(getSetting('favorites','[]'),[]),
  lyrics:[],lyricsStatus:'As letras aparecem automaticamente quando disponíveis.',lyricsAbort:null,sheet:null,backgroundURL:null,backgroundMode:getSetting('backgroundMode','visual'),artworkHue:.58,searchTimer:null,lastLyric:-2
};
if(!PALETTES[state.theme])state.theme='ACID';
if(!['DESLIGADO','FLUIDO','REATIVO'].includes(state.reaction))state.reaction='FLUIDO';
visual.setTheme(state.theme);visual.setReaction(state.reaction);visual.startLoop();
engine.setSpeed(state.speed,state.pitch);engine.setReverb(state.reverb);engine.setBass(state.bass);
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,4200)}
function fmt(secs){if(!Number.isFinite(secs))return '0:00';return `${Math.floor(secs/60)}:${String(Math.floor(secs%60)).padStart(2,'0')}`}
function titleForFile(file){const name=file.name.replace(/\.[^.]+$/,'');const parts=name.split(/\s+[—–-]\s+/);return {title:parts.length>=2?parts.slice(1).join(' - '):name,artist:parts.length>=2?parts[0]:'Arquivo local'}}
function updateBadges(){
 document.documentElement.style.setProperty('--acid', ({'ACID':'#46ff12','CYBER NIGHT':'#35d5ff','CRIMSON':'#ff425d','CHROME':'#e6f2ef','SMOKE':'#d5c2ec','XEROX SERPENTINE':'#d5ec46','PRISM CARMINE':'#ff56ab','GNARLY':'#45ff8a'})[state.theme]||'#46ff12');
 $('.build-badge').textContent=`WEB α2 · ${state.theme}`;
 $('#reaction-label').textContent=state.reaction;
 visual.setTheme(state.theme);visual.setReaction(state.reaction);
 const fave=state.current&&state.favorites.some(x=>x.id===state.current.id);
 $('#favorite-button').classList.toggle('is-favorite',!!fave);
 $('#favorite-button').setAttribute('aria-label',fave?'Remover dos favoritos':'Adicionar aos favoritos');
}
function updatePlayer(){
 const track=state.current;
 $('#track-title').textContent=track?.title||'Sua música. Seu universo.';
 $('#track-artist').textContent=track?.artist||'Selecione uma música para começar';
 $('#cover-image').src=track?.artwork||icon;
 $('#cover-image').onerror=()=>{$('#cover-image').onerror=null;$('#cover-image').src=icon};
 $('#cover-play-overlay').textContent=track?'Fundo da capa':'Escolher música';$('#cover-button').setAttribute('aria-label',track?'Configurar o fundo':'Abrir Busca');applyBackground();
 $('#cover-button').classList.toggle('has-audio',!!track);
 $('#play-button').innerHTML=svg(state.playing?'pause':'play');
 $('#play-button').setAttribute('aria-label',state.playing?'Pausar':'Reproduzir');
 $('#next-button').disabled=state.queue.length===0;
 $('#duration-label').textContent=track?.source==='preview'?'PRÉVIA · 0:30':fmt(audio.duration||track?.duration||0);
 updateBadges(); updateProgress();
 if('mediaSession' in navigator&&typeof MediaMetadata!=='undefined'){try{navigator.mediaSession.metadata=track?new MediaMetadata({title:track.title,artist:track.artist,album:track.album||'GNARLY WEB',artwork:[{src:track.artwork||new URL(icon,location.href).href,sizes:'256x256'}]}):null}catch{}}
}
function updateProgress(){const d=audio.duration||0,t=audio.currentTime||0,p=d?Math.min(1000,1000*t/d):0;const slider=$('#seek-slider');slider.value=String(p);slider.style.setProperty('--progress',`${p/10}%`);$('#elapsed-label').textContent=fmt(t);if(!state.current||state.current.source!=='preview')$('#duration-label').textContent=fmt(d||state.current?.duration||0)}

function applyBackground(){
 const cover=state.current?.artwork;const mode=state.backgroundMode;
 app.classList.toggle('custom-bg',mode==='custom'&&!!state.backgroundURL);
 app.classList.toggle('cover-bg',mode==='cover'&&!!cover);
 if(mode==='cover'&&cover)app.style.backgroundImage='linear-gradient(#0002,#0008),url("'+encodeURI(cover).replaceAll('"','%22')+'")';
 else if(mode==='custom'&&state.backgroundURL)app.style.backgroundImage='linear-gradient(#0002,#0007),url("'+state.backgroundURL+'")';
 else app.style.backgroundImage='';
 visual.setPaused(app.classList.contains('cover-bg')||app.classList.contains('custom-bg'));
}
async function loadArtworkHue(track){
 if(!track?.artwork||track.artwork===icon){state.artworkHue=.58;return}
 try{const image=new Image();image.crossOrigin='anonymous';image.src=track.artwork;await image.decode();if(state.current!==track)return;const cvs=document.createElement('canvas');cvs.width=cvs.height=16;const c=cvs.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,16,16);const p=c.getImageData(0,0,16,16).data;let x=0,y=0;for(let i=0;i<p.length;i+=4){const r=p[i]/255,g=p[i+1]/255,b=p[i+2]/255,v=Math.max(r,g,b),m=Math.min(r,g,b),d=v-m;let h=0;if(d>.08){if(v===r)h=((g-b)/d+6)%6/6;else if(v===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6}x+=Math.cos(h*6.283)*d;y+=Math.sin(h*6.283)*d}if(x||y)state.artworkHue=(Math.atan2(y,x)/6.283+1)%1}catch{}
}
async function loadAutoLyrics(track){
 state.lyricsAbort?.abort();const request=new AbortController();state.lyricsAbort=request;
 state.lyrics=[];state.lastLyric=-2;state.lyricsStatus='Buscando letra sincronizada automaticamente…';
 syncLyrics();if(state.sheet==='karaoke')renderSheet();
 const found=await autoLyrics(track,{signal:request.signal});if(request.signal.aborted||state.current!==track)return;
 state.lyrics=found.lines;state.lyricsStatus=found.status;state.lastLyric=-2;syncLyrics();if(state.sheet==='karaoke')renderSheet();
}
async function enrichLocalTrack(track){
 if(track?.source!=='local'||track.artist==='Arquivo local')return;
 try{const found=await searchCatalog(track.artist+' '+track.title);if(state.current!==track)return;const match=found.find(t=>normalizeIdentity(t.title)===normalizeIdentity(track.title)&&normalizeIdentity(t.artist)===normalizeIdentity(track.artist));if(!match)return;track.artwork=match.artwork;track.album=match.album;updatePlayer();void loadArtworkHue(track)}catch{}
}

function syncLyrics(){const i=lyricIndex(state.lyrics,audio.currentTime||0);if(state.lastLyric===i)return;state.lastLyric=i;const el=$('#floating-lyrics');const line=$('#floating-line');if(!state.lyrics.length||!state.current){el.hidden=true;return}el.hidden=false;line.textContent=i>=0?state.lyrics[i].text:'♪ ♪ ♪';if(state.sheet==='karaoke')renderSheet()}
function selectTrack(track,autoplay=true){if(!track)return;audio.pause();state.playing=false;state.current=track;state.artworkHue=.58;audio.src=track.url;audio.load();state.lastLyric=-2;updatePlayer();void loadArtworkHue(track);void loadAutoLyrics(track);if(track.source==='local')void enrichLocalTrack(track);if(autoplay)void play();if(state.sheet&&['library','queue','search'].includes(state.sheet))renderSheet()}
async function play(){if(!state.current){openSheet('search');toast('Escolha uma música na Busca ou use o botão + para adicionar seu áudio completo.');return}try{const unlock=engine.resume();const start=audio.play();await Promise.all([unlock,start]);state.playing=true;updatePlayer();}catch(e){state.playing=false;updatePlayer();toast('Falha ao reproduzir. Experimente importar um arquivo de áudio local.');console.warn('GNARLY WEB audio play:',e)}}
function pause(){audio.pause();state.playing=false;updatePlayer()}
function next(){const nextTrack=state.queue.shift();if(nextTrack)selectTrack(nextTrack);else{pause();audio.currentTime=0;toast('Fim da fila')}updatePlayer()}
function previous(){if(audio.currentTime>3){audio.currentTime=0;return}const idx=state.tracks.findIndex(x=>x.id===state.current?.id);if(idx>0)selectTrack(state.tracks[idx-1]);else audio.currentTime=0}
function addToQueue(track){if(!track)return;state.queue.push(track);updatePlayer();toast(`Adicionado à fila: ${track.title}`)}
function importAudio(files){const valid=[...files].filter(x=>x.type.startsWith('audio/')||/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(x.name));if(!valid.length){toast('Escolha arquivos de áudio compatíveis.');return}for(const file of valid){const names=titleForFile(file);state.tracks.push({id:`local:${crypto.randomUUID?.()||Date.now()+Math.random()}`,title:names.title,artist:names.artist,album:'Biblioteca local',artwork:icon,url:URL.createObjectURL(file),source:'local',duration:0})}if(!state.current){selectTrack(state.tracks[0],true);state.queue.push(...state.tracks.slice(1));updatePlayer()}else if(valid.length>1)toast(`${valid.length} músicas importadas`);if(state.sheet==='library')renderSheet()}
function toggleFavorite(){if(!state.current){openSheet('library');return}const at=state.favorites.findIndex(x=>x.id===state.current.id);if(at>=0){state.favorites.splice(at,1);toast('Removido dos favoritos')}else{state.favorites.push(state.current);toast('Adicionado aos favoritos')}setSetting('favorites',JSON.stringify(state.favorites.filter(x=>x.source==='preview').slice(-100)));updatePlayer();if(state.sheet==='favorites')renderSheet()}
function openSheet(which){state.sheet=which;$('#bottom-sheet').hidden=false;$('#panel-backdrop').hidden=false;$('#sheet-title').textContent=({search:'Busca',queue:'Próximas músicas',library:'Mix / Biblioteca',favorites:'Favoritos',controls:'Música',theme:'Temas',create:'Criar',karaoke:'Karaokê',background:'Fundo'})[which]||'GNARLY';$('#search-toggle').setAttribute('aria-expanded',String(which==='search'));renderSheet();if(which==='search')setTimeout(()=>$('#search-term')?.focus(),80)}
function closeSheet(){state.sheet=null;$('#bottom-sheet').hidden=true;$('#panel-backdrop').hidden=true;$('#search-toggle').setAttribute('aria-expanded','false')}
function mediaList(tracks,context){if(!tracks.length)return `<p class="section-note">Nenhuma música por aqui ainda.</p>`;return `<div class="media-list">${tracks.map((tr,i)=>`<div class="media-item"><img src="${safe(tr.artwork||icon)}" alt="" loading="lazy" /><div class="media-text"><strong>${safe(tr.title)}</strong><small>${safe(tr.artist)} · ${tr.source==='preview'?'prévia 30 s':'música local'}</small></div><button data-action="play" data-context="${context}" data-index="${i}" aria-label="Reproduzir ${safe(tr.title)}">${svg('play')}</button><button data-action="enqueue" data-context="${context}" data-index="${i}" aria-label="Adicionar ${safe(tr.title)} à fila">${svg('plus')}</button></div>`).join('')}</div>`}
const btn=(caption,command,other='')=>`<button class="action-button ${other}" data-command="${command}">${caption}</button>`;
const setting=(id,title,value,minimum,maximum,step,unit)=>`<div class="setting"><div class="setting-title"><span>${title}</span><span id="${id}-value">${Number(value).toFixed(step<1?2:0)}${unit}</span></div><input id="${id}" data-slider="${id}" type="range" min="${minimum}" max="${maximum}" step="${step}" value="${value}" aria-label="${title}" /></div>`;
function renderSheet(){const content=$('#sheet-content');switch(state.sheet){
 case 'search':content.innerHTML=`<form id="search-form" class="search-bar"><input id="search-term" type="search" autocomplete="off" placeholder="Busque artista ou música" aria-label="Buscar no catálogo" value="${safe(state.searchTerm)}"/><button type="submit">Buscar</button></form><p class="section-note">Resultados online são prévias oficiais. Toque no + para importar um áudio completo seu. As letras são procuradas automaticamente.</p><div id="search-state" class="status-text"></div><div id="search-results">${mediaList(state.searchResults,'search')}</div>`;break;
 case 'library':content.innerHTML=`<div class="card-help">Sua <strong>biblioteca local</strong> toca arquivos do dispositivo, sem servidor e sem conta. Os arquivos importados permanecem apenas nesta sessão.</div>${btn('＋ Adicionar músicas','import')}<div class="section-head">Mix · ${state.tracks.length} músicas</div>${mediaList(state.tracks,'library')}<div class="section-head">Favoritas · ${state.favorites.length}</div>${mediaList(state.favorites,'favorites')}`;break;
 case 'favorites':content.innerHTML=`<div class="section-head">Favoritos</div>${mediaList(state.favorites,'favorites')}`;break;
 case 'queue':content.innerHTML=`<div class="row-end"><p class="section-note">A seguir, nesta sessão</p>${btn('Limpar fila','clear-queue','alt')}</div>${mediaList(state.queue,'queue')}`;break;
 case 'controls':content.innerHTML=`<p class="section-note">Controles compatíveis com o motor de áudio do navegador. A preservação de tom depende do suporte do dispositivo.</p>${setting('speed','Velocidade',state.speed,.5,2,.05,'×')}${setting('reverb','Reverb',state.reverb,0,.7,.05,'')}${setting('bass','Graves',state.bass,0,12,1,' dB')}<div class="setting"><div class="setting-title"><label for="pitch-check">Preservar tom original</label><input id="pitch-check" type="checkbox" ${state.pitch?'checked':''}/></div></div><div class="button-row">${btn('Restaurar ajustes','reset-audio','alt')}</div>`;break;
 case 'theme':content.innerHTML=`<p class="section-note">Paletas extraídas da Stage 72. Material WebGL2 em resolução de tela; algumas texturas ainda diferem do Metal.</p><div class="section-head">Escolha um material</div><div class="chip-row">${Object.keys(PALETTES).map(theme=>`<button data-theme="${safe(theme)}" class="chip ${theme===state.theme?'selected':''}">${safe(theme)}</button>`).join('')}</div><div class="section-head">Ritmo visual</div><div class="chip-row">${['DESLIGADO','FLUIDO','REATIVO'].map(mode=>`<button data-reaction="${mode}" class="chip ${state.reaction===mode?'selected':''}">${mode}</button>`).join('')}</div>${btn('Aplicar tema','apply-theme')}`;break;
 case 'create':content.innerHTML=`<div class="card-help"><strong>CRIAR</strong> combina suas escolhas de material, movimento e som. Na web, cada controle possui uma implementação própria; os presets SwiftUI completos virão por etapas.</div>${btn('Escolher tema e cores','go-theme')}<div class="button-row">${btn('Editar velocidade / reverb','go-controls','alt')}${btn('Importar letra .lrc','load-lrc','alt')}${btn('Adicionar foto de fundo','load-background','alt')}</div><div class="section-head">Experiências em construção</div><div class="chip-row"><span class="chip selected">Original Fluido</span><span class="chip">GNARLY</span><span class="chip">Cyber Night</span></div>`;break;
 case 'karaoke':content.innerHTML=`<div class="card-help">A letra sincronizada é buscada automaticamente no LRCLIB ao selecionar uma música. Você também pode importar .lrc. Em prévias de 30 segundos, a sincronia pode não corresponder ao trecho.</div><p class="status-text">${safe(state.lyricsStatus)}</p>${btn('Importar letra .lrc','load-lrc')}<div class="section-head">Letra sincronizada</div>${state.lyrics.length?`<div class="lyrics-box">${state.lyrics.map((line,i)=>{const active=i===lyricIndex(state.lyrics,audio.currentTime);return `<div class="lyric-line ${active?'active':''}" data-lyric-time="${line.time}">${safe(line.text)}</div>`}).join('')}</div>`:'<p class="section-note">Nenhuma letra sincronizada encontrada. Você ainda pode importar seu .lrc.</p>'}`;break;
 case 'background':content.innerHTML=`<div class="card-help">Escolha um fundo em tela cheia: material animado, capa da música ou sua própria foto.</div><div class="button-row">${btn('Tema animado','show-visual')}${btn('Capa em tela cheia','show-cover','alt')}${btn('Minha foto','load-background','alt')}${btn('Remover imagem','remove-background','alt')}</div>`;break;
 default:content.textContent='';
 }}
function resolveTracks(context){return ({search:state.searchResults,library:state.tracks,queue:state.queue,favorites:state.favorites})[context]||[]}
function handleCommand(command){switch(command){case 'import':$('#audio-import').click();break;case 'load-lrc':$('#lrc-import').click();break;case 'load-background':$('#background-import').click();break;case 'show-visual':state.backgroundMode='visual';setSetting('backgroundMode','visual');applyBackground();closeSheet();break;case 'show-cover':if(!state.current?.artwork){toast('Escolha uma música com capa.');break}state.backgroundMode='cover';setSetting('backgroundMode','cover');applyBackground();closeSheet();break;case 'remove-background':if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL);state.backgroundURL=null;state.backgroundMode='visual';setSetting('backgroundMode','visual');applyBackground();toast('Tema animado restaurado');break;case 'clear-queue':state.queue.length=0;updatePlayer();renderSheet();break;case 'reset-audio':state.speed=1;state.reverb=0;state.bass=0;state.pitch=true;engine.setSpeed(1,true);engine.setBass(0);engine.setReverb(0);for(const p of ['speed','bass','reverb','pitch'])setSetting(p,p==='pitch'?'yes':p==='speed'?1:0);renderSheet();break;case 'go-theme':openSheet('theme');break;case 'go-controls':openSheet('controls');break;case 'apply-theme':closeSheet();break}}
function syncVisual(){visual.setSong(audio.currentTime||0,Number.isFinite(audio.duration)&&state.current?.source!=='preview'?audio.duration:state.current?.duration||0,state.artworkHue);if(!document.hidden&&state.playing)visual.setEnergy(engine.sampleEnergy());else visual.setEnergy(0);requestAnimationFrame(syncVisual)}requestAnimationFrame(syncVisual);
$('#audio-import').addEventListener('change',e=>{importAudio(e.target.files||[]);e.target.value='' });
$('#lrc-import').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;state.lyricsAbort?.abort();state.lyrics=parseLRC(await file.text());state.lyricsStatus='Letra sincronizada importada';state.lastLyric=-2;syncLyrics();toast(`${state.lyrics.length} linhas sincronizadas carregadas`);if(state.sheet==='karaoke')renderSheet();e.target.value=''});
$('#background-import').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file||!file.type.startsWith('image/'))return;if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL);state.backgroundURL=URL.createObjectURL(file);state.backgroundMode='custom';setSetting('backgroundMode','custom');applyBackground();if(state.sheet==='background')closeSheet();toast('Foto de fundo aplicada');e.target.value=''});
$('#cover-button').addEventListener('click',()=>state.current?openSheet('background'):openSheet('search'));
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
$('#next-button').addEventListener('click',next);
$('#previous-button').addEventListener('click',previous);
$('#seek-slider').addEventListener('input',e=>{if(Number.isFinite(audio.duration)&&audio.duration)audio.currentTime=audio.duration*Number(e.target.value)/1000;updateProgress()});
$('#close-sheet').addEventListener('click',closeSheet);$('#panel-backdrop').addEventListener('click',closeSheet);
for(const el of document.querySelectorAll('[data-drawer]'))el.addEventListener('click',()=>openSheet(el.dataset.drawer));
$('#sheet-content').addEventListener('submit',e=>{if(e.target.id==='search-form'){e.preventDefault();void runSearch($('#search-term').value)}});
$('#sheet-content').addEventListener('click',e=>{const target=e.target.closest('button,[data-lyric-time]');if(!target)return;if(target.dataset.lyricTime){audio.currentTime=Number(target.dataset.lyricTime);return}if(target.dataset.command){handleCommand(target.dataset.command);return}if(target.dataset.theme){state.theme=target.dataset.theme;setSetting('theme',state.theme);updateBadges();renderSheet();return}if(target.dataset.reaction){state.reaction=target.dataset.reaction;setSetting('reaction',state.reaction);updateBadges();renderSheet();return}if(target.dataset.action){const list=resolveTracks(target.dataset.context),track=list[Number(target.dataset.index)];if(!track)return;if(target.dataset.action==='enqueue')addToQueue(track);else if(target.dataset.action==='play'){if(target.dataset.context==='queue')state.queue.splice(Number(target.dataset.index),1);selectTrack(track);closeSheet()}}});
$('#sheet-content').addEventListener('input',e=>{const el=e.target;if(el.id==='search-term'){state.searchTerm=el.value;clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>void runSearch(state.searchTerm),460)}if(el.dataset.slider){const id=el.dataset.slider,v=Number(el.value);if(id==='speed'){state.speed=v;engine.setSpeed(v,state.pitch)}if(id==='reverb'){state.reverb=v;engine.setReverb(v)}if(id==='bass'){state.bass=v;engine.setBass(v)}setSetting(id,v);const out=$(`#${id}-value`);if(out)out.textContent=v.toFixed(id==='bass'?0:2)+(id==='speed'?'×':id==='bass'?' dB':'')}if(el.id==='pitch-check'){state.pitch=el.checked;engine.setSpeed(state.speed,state.pitch);setSetting('pitch',state.pitch?'yes':'no')}});
let searchCounter=0;
async function runSearch(raw){const query=String(raw||'').trim();state.searchTerm=query;if(state.sheet!=='search'||query.length<2){const status=$('#search-state');if(status)status.textContent=query.length?'Digite ao menos 2 caracteres':'';return}const count=++searchCounter;const status=$('#search-state');if(status)status.textContent='Buscando prévias musicais…';try{const matches=await searchCatalog(query);if(count!==searchCounter)return;state.searchResults=matches;if(state.sheet==='search'){$('#search-results').innerHTML=mediaList(matches,'search');$('#search-state').textContent=`${matches.length} prévias encontradas`}}catch(e){if(count!==searchCounter)return;if(state.sheet==='search'){$('#search-state').textContent='Catálogo indisponível. Você ainda pode importar músicas locais.';$('#search-results').innerHTML=''}console.warn('GNARLY catalog',e)}}
audio.addEventListener('play',()=>{state.playing=true;updatePlayer()});audio.addEventListener('pause',()=>{state.playing=false;updatePlayer()});audio.addEventListener('timeupdate',()=>{updateProgress();syncLyrics()});audio.addEventListener('loadedmetadata',updateProgress);audio.addEventListener('ended',()=>{state.queue.length?next():pause()});audio.addEventListener('error',()=>{if(state.current)toast('Falha ao carregar este áudio. Confira conexão, formato ou licença de reprodução.')});
for(const [action,fn] of [['play',()=>void play()],['pause',pause],['previoustrack',previous],['nexttrack',next],['seekto',details=>{audio.currentTime=details.seekTime||0}]]){try{navigator.mediaSession?.setActionHandler(action,fn)}catch{/* not supported */}}
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||e.ctrlKey||e.altKey||e.metaKey)return;if(e.code==='Space'){e.preventDefault();state.playing?pause():void play()}if(e.key==='Escape')closeSheet();if(e.key==='ArrowRight'&&state.current)audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5);if(e.key==='ArrowLeft'&&state.current)audio.currentTime=Math.max(0,audio.currentTime-5)});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();app.classList.add('dragover')}});window.addEventListener('dragleave',e=>{if(!e.relatedTarget)app.classList.remove('dragover')});window.addEventListener('drop',e=>{e.preventDefault();app.classList.remove('dragover');importAudio(e.dataTransfer?.files||[])});
window.addEventListener('beforeunload',()=>{for(const item of state.tracks)if(item.source==='local')URL.revokeObjectURL(item.url);if(state.backgroundURL)URL.revokeObjectURL(state.backgroundURL)});
updatePlayer();
