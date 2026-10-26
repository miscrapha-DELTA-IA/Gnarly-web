import {PAD_NAMES,PAD_KEYS} from '../lib/performance-pads.js';
const escapeText=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function renderPerformancePanel(model){
 const steps=Array.from({length:16},(_,i)=>'<span class="dj-step'+(model.running&&i===model.step?' is-current':'')+'" data-dj-step="'+i+'" aria-hidden="true"></span>').join('');
 const pads=PAD_NAMES.map((name,i)=>{
  const marked=model.programmed?.[i]>0;
  return '<button type="button" class="dj-pad dj-pad-'+Math.floor(i/4)+(marked?' is-programmed':'')+
   '" data-dj-pad="'+i+'" aria-label="'+escapeText(name)+' · pad '+(i+1)+' · tecla '+PAD_KEYS[i]+
   '" title="Tecla '+PAD_KEYS[i]+'"><span class="dj-pad-led" aria-hidden="true"></span><span class="dj-pad-name">'+
   escapeText(name)+'</span><span class="dj-pad-foot"><span>'+PAD_KEYS[i].toUpperCase()+
   '</span><span class="dj-pattern-dot" aria-hidden="true"></span></span></button>';
 }).join('');
 const midiStatus=!model.midiSupported?'MIDI não disponível neste navegador. Pads funcionam normalmente.':
  !model.midiReady?'Web MIDI opcional · conecte um controlador para feedback de LEDs.':
  model.outputs.length?'MIDI ativo · pads 36–51 (C2–D#3); LEDs dependem do hardware.':
  'MIDI ativo, mas nenhuma saída detectada · conecte um controlador.';
 const outputs=model.midiReady?'<label class="dj-output-label">Saída LED <select data-dj-output aria-label="Saída MIDI para LEDs"><option value="off">Desligada</option>'+
  model.outputs.map(p=>'<option value="'+escapeText(p.id)+'"'+(p.id===model.outputId?' selected':'')+'>'+escapeText(p.name)+'</option>').join('')+'</select></label>':'';
 return '<div class="dj-panel"><header class="dj-heading"><div><span class="dj-overline">GNARLY / PERFORMANCE</span><strong>MPC <em>16</em></strong><p>Toque, crie e deixe o ambiente reagir.</p></div><span class="dj-live-dot" aria-hidden="true"></span></header>'+
  '<div class="dj-stage"><div class="dj-topline"><span>DRUM GRID / BANK A</span><span>INSTANT PLAY</span></div>'+
  '<div class="dj-pads" role="group" aria-label="16 pads de bateria e efeitos">'+pads+'</div>'+
  '<div class="dj-steps" role="group" aria-label="Passos do loop">'+steps+'</div>'+
  '<div class="dj-actions"><button type="button" data-dj-command="loop" aria-pressed="'+model.running+'" class="'+(model.running?'active':'')+'">'+(model.running?'■ Parar':'▶ Loop')+'</button>'+
  '<button type="button" data-dj-command="record" aria-pressed="'+model.recording+'" class="'+(model.recording?'recording':'')+'">● REC</button>'+
  '<button type="button" data-dj-command="clear">Limpar</button></div>'+
  '<label class="dj-tempo" for="dj-bpm"><span>BPM</span><input id="dj-bpm" data-dj-bpm type="range" min="70" max="160" step="1" value="'+model.bpm+'" aria-label="Tempo do loop em BPM"/><output id="dj-bpm-label" for="dj-bpm">'+model.bpm+'</output></label></div>'+
  '<section class="dj-midi"><div class="dj-midi-head"><strong><span class="dj-midi-icon">◈</span> MIDI / LED FEEDBACK</strong>'+
  (model.midiReady?'<span class="dj-midi-enabled">CONECTADO</span>':'<button type="button" data-dj-command="midi"'+(model.midiSupported?'':' disabled')+'>Ativar MIDI</button>')+
  '</div><p id="dj-midi-status" role="status">'+escapeText(midiStatus)+'</p>'+outputs+'</section>'+
  '<p class="dj-hint">Pads: 1–4 · QWER · ASDF · ZXCV. REC + Loop grava uma sequência de 16 passos. Os sons são criados no navegador, sem downloads.</p></div>';
}
