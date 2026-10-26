import {PAD_NAMES,PAD_KEYS,MIDI_BASE_NOTE} from '../lib/performance-pads.js';
const escapeText=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
/** The performance page is a tactile part of the currently active Gnarly theme,
 * not a separate industrial console or a mandatory MIDI routing utility.
 */
export function renderPerformancePanel(model){
 const ready=!!model.songReady;
 const status=ready?'16 trechos reais desta faixa · toque qualquer pad':
  model.songStatus==='loading'?'Preparando 16 pads a partir da música…':
  model.songStatus==='unavailable'?'Áudio indisponível para recortes · banco de demonstração':
  'Escolha uma música para criar os pads automaticamente';
 const subtitle=ready?'DA MÚSICA':model.songStatus==='loading'?'PREPARANDO':'DEMONSTRAÇÃO';
 const pads=PAD_NAMES.map((name,i)=>{
  const marked=(model.programmed?.[i]||0)>0,display=ready?model.songClips[i]:name;
  const label=ready?'Trecho '+String(i+1).padStart(2,'0')+' da música em '+display:name;
  return '<button type="button" class="dj-pad'+(marked?' is-programmed':'')+
   '" data-dj-pad="'+i+'" aria-label="'+escapeText(label)+' · tecla '+PAD_KEYS[i].toUpperCase()+
   ' · nota MIDI '+(MIDI_BASE_NOTE+i)+'" title="'+escapeText(label)+'"><span class="dj-pad-top"><span class="dj-pad-number">'+
   String(i+1).padStart(2,'0')+'</span><span class="dj-pad-spark" aria-hidden="true">✳</span></span><span class="dj-pad-center">'+
   escapeText(display)+'</span><span class="dj-pad-bottom"><span>'+PAD_KEYS[i].toUpperCase()+
   '</span><span class="dj-pattern-dot" aria-hidden="true"></span></span></button>';
 }).join('');
 const steps=Array.from({length:16},(_,i)=>'<span class="dj-step'+(model.running&&i===model.step?' is-current':'')+'" data-dj-step="'+i+'" aria-hidden="true"></span>').join('');
 const midiStatus=!model.midiSupported?'Seu navegador não oferece controladores MIDI externos. Os pads funcionam sem eles.':
  model.midiReady?'Controlador conectado · as notas 36 a 51 disparam os pads desta música.':'Conectar teclado/controlador MIDI é opcional.';
 const intelligence=model.intelligence||{};
 const outputs=model.midiReady&&model.outputs?.length?'<label class="dj-output-label">Saída do controlador (opcional)<select data-dj-output aria-label="Saída MIDI"><option value="off">Nenhuma</option>'+
  model.outputs.map(p=>'<option value="'+escapeText(p.id)+'"'+(p.id===model.outputId?' selected':'')+'>'+escapeText(p.name)+'</option>').join('')+'</select></label>':'';
 return '<section class="dj-panel" aria-label="Performance musical"><div class="dj-heading"><div><span class="dj-overline">GNARLY / LIVE</span>'+
  '<strong>Performance<span class="dj-title-star" aria-hidden="true"> ✦</span></strong><p>Um instrumento que acompanha sua música.</p></div>'+
  '<span class="dj-bank-mark" aria-hidden="true">16</span></div>'+
  '<div class="dj-current-track" data-dj-state="'+escapeText(model.songStatus||'idle')+'"><span class="dj-track-icon" aria-hidden="true">♫</span>'+
  '<div class="dj-track-copy"><span class="dj-track-eyebrow">'+subtitle+'</span><strong id="dj-song-name">'+escapeText(model.songTitle||'Nenhuma faixa selecionada')+
  '</strong><span id="dj-song-status" role="status">'+escapeText(status)+'</span></div>'+
  '<button type="button" class="dj-refresh" data-dj-command="refresh" aria-label="Recriar pads desta música" title="Recriar pads">↻</button></div>'+
  '<details class="dj-intelligence"><summary>✧ INTELIGÊNCIA MUSICAL <small>Opcional · local</small></summary>'+
  '<div class="dj-intelligence-inner"><p>Spotify Basic Pitch analisa um arquivo de áudio <strong>no seu aparelho</strong>, sem enviar a gravação a servidores. O modelo carrega apenas ao solicitar. Até 25 s / 10 MB; melhores resultados com instrumento isolado.</p>'+
  '<div class="dj-intelligence-actions">'+
  '<button type="button" data-dj-command="analyze-midi"'+(intelligence.busy?' disabled':'')+'>♮ '+(intelligence.busy?'Analisando…':'Áudio → MIDI')+'</button>'+
  (intelligence.busy?'<button type="button" data-dj-command="cancel-midi">Cancelar</button>':'')+
  (intelligence.ready?'<button type="button" data-dj-command="save-midi">↓ Exportar .mid</button><button type="button" data-dj-command="map-midi">◈ Mapear aos pads</button>':'')+
  '</div><p class="dj-intelligence-status" id="dj-intelligence-status" role="status">'+escapeText(intelligence.status||'MIDI transcrito não é o MIDI original embutido na música.')+'</p>'+
  (intelligence.ready?'<div class="dj-intelligence-results"><strong>'+escapeText(intelligence.notes+' notas estimadas')+'</strong><span>Centro tonal: '+escapeText(intelligence.tonalCenter)+'</span><span>Acordes sugeridos: '+escapeText(intelligence.displayChords?.join(' · ')||'indeterminados')+'</span></div>':'')+
  '<p class="dj-intelligence-hint">Notas estimadas podem conter erros. “Mapear aos pads” transforma as notas detectadas em comandos para os 16 recortes existentes, sem substituir o timbre da música.</p></div></details>'+
  '<div class="dj-stage"><div class="dj-grid-head"><span>TOQUE / RECOMBINE</span><span>01 — 16</span></div>'+
  '<div class="dj-pads" role="group" aria-label="16 pads de bateria e efeitos">'+pads+'</div>'+
  '<div class="dj-under-grid"><span class="dj-under-accent" aria-hidden="true"></span>'+
  '<span>Toque para ouvir · teclas 1–4, QWER, ASDF, ZXCV</span></div></div>'+
  '<details class="dj-advanced"><summary><span>Sequência e controlador</span><span class="dj-summary-note">Opcional</span></summary>'+
  '<div class="dj-advanced-inner"><p>Grave um padrão de 16 passos usando os sons desta música. Não é necessário configurar MIDI.</p>'+
  '<div class="dj-steps" role="group" aria-label="Passos da sequência">'+steps+'</div>'+
  '<div class="dj-actions"><button type="button" data-dj-command="loop" aria-pressed="'+model.running+'">'+(model.running?'■ Parar':'▶ Loop')+'</button>'+
  '<button type="button" data-dj-command="record" aria-pressed="'+model.recording+'" class="'+(model.recording?'recording':'')+'">● Gravar</button>'+
  '<button type="button" data-dj-command="clear">Limpar</button></div>'+
  '<label class="dj-tempo" for="dj-bpm"><span>BPM</span><input id="dj-bpm" data-dj-bpm type="range" min="70" max="160" step="1" value="'+model.bpm+'"/>'+
  '<output id="dj-bpm-label" for="dj-bpm">'+model.bpm+'</output></label>'+
  '<div class="dj-midi"><div class="dj-midi-head"><strong>Controlador externo</strong>'+
  (model.midiReady?'<span class="dj-midi-enabled">Conectado</span>':'<button type="button" data-dj-command="midi"'+(model.midiSupported?'':' disabled')+'>Conectar</button>')+
  '</div><p id="dj-midi-status">'+escapeText(midiStatus)+'</p>'+outputs+
  '<p class="dj-midi-note">MIDI serve como comando das notas 36–51. MP3 não contém MIDI original. Os pads usam trechos do áudio quando a faixa pode ser decodificada no navegador.</p></div></div></details></section>';
}
