/** Four *real separated media* tracks mixed through the ONE GNARLY AudioContext.
 * This never claims to run neural separation. Each supplied file is real.
 * The main HTMLAudio element remains playback clock and is gated while stems play.
 */
export const STEM_KINDS=Object.freeze(['vocal','drums','bass','other']);
export const STEM_LABELS=Object.freeze({vocal:'Voz',drums:'Bateria',bass:'Baixo',other:'Outros'});
export const STEM_PRESETS=Object.freeze({original:{vocal:1,drums:1,bass:1,other:1},karaoke:{vocal:0,drums:1,bass:1,other:1},acapella:{vocal:1,drums:0,bass:0,other:0},rhythm:{vocal:0,drums:1,bass:1,other:0}});
export function classifyStemFilename(name){const s=String(name||'').toLowerCase();if(/vocal|voice|voz|acapella/.test(s))return 'vocal';if(/drum|bateria|percuss/.test(s))return 'drums';if(/bass|baixo/.test(s))return 'bass';if(/other|outros|instrument|accompaniment/.test(s))return 'other';return null;}
export function mapStemFiles(files){const result={};for(const file of files){const type=classifyStemFilename(file.name);if(!type||result[type])throw Error(`Nome de arquivo não identificado ou repetido: ${file.name}. Use vocals, drums, bass e other.`);result[type]=file;}if(STEM_KINDS.some(k=>!result[k]))throw Error('Importe 4 arquivos: vocals, drums, bass e other.');return result;}
export class StemMixer{
 constructor(engine,clock){this.engine=engine;this.clock=clock;this.ready=false;this.entries=new Map();this.levels={...STEM_PRESETS.original};this.syncing=false;this.revision=0;}
 async load(files){const mapped=mapStemFiles(files);await this.engine.resume({requireGraph:true});this.clear();const version=++this.revision;
  for(const kind of STEM_KINDS){const el=new Audio();el.preload='auto';el.crossOrigin='anonymous';el.src=URL.createObjectURL(mapped[kind]);el.playsInline=true;
   const source=this.engine.ctx.createMediaElementSource(el),gain=this.engine.ctx.createGain();gain.gain.value=this.levels[kind];source.connect(gain);gain.connect(this.engine.input);
   this.entries.set(kind,{el,source,gain,url:el.src});
  }
  try{await Promise.all([...this.entries.values()].map(({el})=>new Promise((resolve,reject)=>{if(el.readyState>=1)return resolve();const ok=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(new Error('Arquivo de Stems não pode ser decodificado.'))};const cleanup=()=>{el.removeEventListener('loadedmetadata',ok);el.removeEventListener('error',fail)};el.addEventListener('loadedmetadata',ok,{once:true});el.addEventListener('error',fail,{once:true});el.load();})));if(version!==this.revision)return;const duration=this.clock.duration||0;for(const {el} of this.entries.values())if(duration&&Math.abs(el.duration-duration)>3)throw Error('Stems têm duração diferente da música original.');this.ready=true;this.engine.setOriginalGain(0);this.seek();if(!this.clock.paused)await this.play();}
  catch(err){this.clear();throw err;}
 }
 setLevel(kind,level){if(!STEM_KINDS.includes(kind))return;this.levels[kind]=Math.max(0,Math.min(2,Number(level)||0));const entry=this.entries.get(kind);if(entry)entry.gain.gain.setTargetAtTime(this.levels[kind],this.engine.ctx.currentTime,.025);}
 applyPreset(name){const p=STEM_PRESETS[name];if(!p)return false;for(const k of STEM_KINDS)this.setLevel(k,p[k]);return true;}
 seek(){if(!this.ready)return;for(const {el} of this.entries.values()){if(el.readyState>=1)try{el.currentTime=Math.max(0,Math.min(this.clock.currentTime||0,el.duration||Infinity))}catch{}}}
 sync(){if(!this.ready)return;const t=this.clock.currentTime||0;for(const {el} of this.entries.values()){el.playbackRate=this.clock.playbackRate;el.preservesPitch=this.clock.preservesPitch;if(Math.abs((el.currentTime||0)-t)>.16&&el.readyState>=1)try{el.currentTime=t}catch{}}}
 async play(){if(!this.ready)return;this.seek();await Promise.allSettled([...this.entries.values()].map(({el})=>el.play()));}
 pause(){for(const {el} of this.entries.values())el.pause();}
 clear(){this.revision++;this.pause();for(const {el,source,gain,url} of this.entries.values()){el.removeAttribute('src');el.load();source.disconnect();gain.disconnect();URL.revokeObjectURL(url)}this.entries.clear();this.ready=false;this.engine.setOriginalGain(1);}
}
