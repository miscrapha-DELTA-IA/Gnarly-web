import {allLyricStyles,resolveLyricStyle} from '../lib/lyric-style.js';
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
/** Only outputs static registry names/labels; never renders lyric HTML. */
export function renderLyricStylePanel(current='original'){
 const selected=resolveLyricStyle(current).id;
 const rows=allLyricStyles().map(x=>
  '<button type="button" class="lyric-font-option" data-lyric-style="'+safe(x.id)+'" data-preview-font="'+safe(x.family)+'" aria-pressed="'+(selected===x.id)+'">'+
  '<span class="lyric-font-specimen" aria-hidden="true">Aa</span>'+
  '<span class="lyric-font-detail"><strong>'+safe(x.name)+'</strong><small>'+safe(x.description)+'</small></span>'+
  '<span class="lyric-font-selection" aria-hidden="true">'+(selected===x.id?'✓':'')+'</span></button>').join('');
 return '<div class="lyric-style-panel"><p class="section-note">Tipografia independente · aparência das letras. Muda apenas a tipografia e o tratamento visual, sem alterar a música, o texto ou o sincronismo.</p>'+
 '<div class="section-head">ESTILOS DE LEGENDA</div>'+
 '<div class="lyric-font-grid" role="group" aria-label="Estilos tipográficos do karaokê">'+rows+'</div>'+
 '<p class="section-note lyric-font-future">Fontes e estilos adicionais poderão ser cadastrados por manifests quando os repositórios e datasets forem avaliados. Nenhum arquivo de fonte externo foi instalado.</p></div>';
}
