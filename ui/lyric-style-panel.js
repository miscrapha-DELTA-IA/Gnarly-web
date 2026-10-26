import {allLyricStyles,resolveLyricStyle} from '../lib/lyric-style.js';
import {FONT_GROUPS,findFont} from '../lib/lyric-font-catalog.js';
import {artistKey} from '../lib/lyric-font-preferences.js';
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const escapeRe=s=>safe(s);
function fontSample(x){
 const descriptor=findFont(x.id);
 if(!descriptor)return '<span class="lyric-font-specimen" aria-hidden="true">Aa</span>';
 const family=escapeRe(descriptor.fontFamily+','+descriptor.fallback);
 return '<span class="lyric-font-specimen" aria-hidden="true" style="font-family:'+family+';font-weight:'+descriptor.weight+'">Aa</span>';
}
/** A touch chooses the font immediately. Manual scope determines where
 * that explicit choice is remembered, never inferred from song mood.
 */
export function renderLyricStylePanel(current='original',{scope='song',track=null,resolution=null,recents=[]}={}){
 const selected=resolveLyricStyle(current).id;
 if(!track&&scope!=='global')scope='global';
 const usable=track&&track.id;
 const buttons=[
  {scope:'song',label:'Esta música',enabled:!!usable},
  {scope:'artist',label:'Este artista',enabled:!!artistKey(track)},
  {scope:'global',label:'Todas as músicas',enabled:true}
 ];
 const scopeOptions=buttons.map(x=>
  '<button type="button" data-lyric-scope="'+x.scope+'" aria-pressed="'+(scope===x.scope)+'"'+(x.enabled?'':' disabled')+'>'+x.label+'</button>'
 ).join('');
 const chips=FONT_GROUPS.map(g=>'<button type="button" data-font-group="'+g.id+'" aria-pressed="'+(g.id==='all')+'">'+escapeRe(g.label)+'</button>').join('');
 const currentStyle=resolveLyricStyle(current);
 const rows=allLyricStyles().map(x=>{
  const font=findFont(x.id),group=font?.group||'original',recency=recents.includes(x.id)?' ★':'';
  return '<button type="button" class="lyric-font-option" data-lyric-style="'+safe(x.id)+'" data-font-category="'+group+
   '" data-font-label="'+safe((x.name+' '+x.description).toLocaleLowerCase('pt-BR'))+'" data-preview-font="'+safe(x.family)+
   '" aria-pressed="'+(selected===x.id)+'" aria-label="Usar '+safe(x.name)+'"'+(font?' data-lazy-typeface="'+safe(x.id)+'"':'')+'>'+
   fontSample(x)+
   '<span class="lyric-font-detail"><strong>'+safe(x.name)+recency+'</strong><small>'+safe(x.description)+'</small></span>'+
   '<span class="lyric-font-selection" aria-hidden="true">'+(selected===x.id?'✓':'')+'</span></button>';
 }).join('');
 const previewStyle=findFont(current)?.fontFamily||'inherit';
 const preview='<div class="lyric-type-preview" aria-live="polite"><small>PRÉVIA AO VIVO · '+safe(currentStyle.name)+'</small>'+
  '<div id="lyric-live-specimen" style="font-family:'+safe(previewStyle)+'">A música me leva para outro lugar…</div>'+
  '<span>Fonte aplicada ao player e à legenda imediatamente ao selecionar.</span></div>';
 return '<div class="lyric-style-panel"><p class="section-note">Aa · Escolha livre. Toque em qualquer fonte para aplicá-la imediatamente, mesmo enquanto a música está tocando. Não altera a letra nem seu tempo.</p>'+
  preview+'<div class="section-head">LEMBRAR ESCOLHA</div>'+
  '<div class="lyric-font-scope" role="group" aria-label="Aplicar tipografia a">'+scopeOptions+'</div>'+
  '<p class="lyric-font-scope-description">'+(resolution?.source==='song'?'Esta música já tem uma fonte própria salva.':resolution?.source==='artist'?'Usando sua preferência salva para o artista.':'Usando o estilo padrão, até você escolher outro.')+'</p>'+
  '<div class="lyric-font-actions"><button type="button" data-lyric-reset>↺ Restaurar escolha deste nível</button>'+
  '<button type="button" data-lyric-next>Próxima fonte ›</button></div>'+
  '<div class="section-head">BIBLIOTECA · '+allLyricStyles().length+' ESTILOS</div>'+
  '<input class="lyric-font-search" id="lyric-font-search" type="search" placeholder="Buscar fonte, estilo ou categoria" aria-label="Filtrar fontes de karaokê" autocomplete="off" />'+
  '<div class="lyric-font-filters" role="group" aria-label="Filtrar por família">'+chips+'</div>'+
  '<div class="lyric-font-grid" role="group" aria-label="Estilos tipográficos do karaokê">'+rows+'</div>'+
  '<p class="lyric-font-empty" hidden>Nenhuma fonte nesta categoria. Limpe o filtro.</p>'+
  '<p class="section-note lyric-font-future">Fontes licenciadas, carregadas sob demanda. A prévia pode inicialmente usar uma fonte substituta até o arquivo chegar. Fontes e estilos adicionais podem ser cadastrados no futuro.</p></div>';
}
