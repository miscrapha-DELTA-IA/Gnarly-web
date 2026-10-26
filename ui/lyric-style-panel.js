import {allLyricStyles,resolveLyricStyle} from '../lib/lyric-style.js';
import {FONT_GROUPS,findFont} from '../lib/lyric-font-catalog.js';
import {KARAOKE_DESIGNS,findKaraokeDesign,renderLyricArtwork} from '../lib/karaoke-art-direction.js';
import {artistKey} from '../lib/lyric-font-preferences.js';
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const isDesign=id=>!!findKaraokeDesign(id);
const chooseFont=style=>findFont(findKaraokeDesign(style.id)?.fontId||style.id);
export function specimenMarkup(style,sample='GNARLY NOW',id=0){
 const design=findKaraokeDesign(style.id),font=chooseFont(style);
 if(design)return '<span class="lyric-design-specimen" aria-hidden="true">'+
  renderLyricArtwork(sample,style.id,{lineId:id,active:true,preview:true})+'</span>';
 if(!font)return '<span class="lyric-font-specimen" aria-hidden="true">Aa</span>';
 return '<span class="lyric-font-specimen" aria-hidden="true" style="font-family:'+safe(font.fontFamily+','+font.fallback)+';font-weight:'+font.weight+'">Aa</span>';
}
export function renderLyricStylePanel(current='original',{scope='song',track=null,resolution=null,recents=[],group='art',previewText='A música me leva para outro lugar…'}={}){
 const selected=resolveLyricStyle(current).id;
 if(!track&&scope!=='global')scope='global';
 const usable=track&&track.id;
 const scopes=[
  {scope:'song',label:'Esta música',enabled:!!usable},
  {scope:'artist',label:'Este artista',enabled:!!artistKey(track)},
  {scope:'global',label:'Todas as músicas',enabled:true}
 ];
 const buttons=scopes.map(x=>'<button type="button" data-lyric-scope="'+x.scope+'" aria-pressed="'+(scope===x.scope)+'"'+(x.enabled?'':' disabled')+'>'+x.label+'</button>').join('');
 const chips=FONT_GROUPS.map(g=>'<button type="button" data-font-group="'+g.id+'" aria-pressed="'+(g.id===group)+'">'+safe(g.label)+'</button>').join('');
 const chosen=resolveLyricStyle(selected),chosenArt=findKaraokeDesign(chosen.id);
 // The top 40 are real art-directed compositions, not font substitutions.
 const designs=KARAOKE_DESIGNS.map(x=>resolveLyricStyle(x.id));
 const legacy=allLyricStyles().filter(x=>!isDesign(x.id));
 const rows=[...designs,...legacy].map((x,index)=>{
  const design=findKaraokeDesign(x.id),font=chooseFont(x),category=design?.group||x.group;
  const recent=recents.includes(x.id)?' ★':'';
  const title=design?'data-design-mode="'+safe(category)+'" ':'';
  return '<button type="button" class="lyric-font-option" '+title+'data-lyric-style="'+safe(x.id)+
   '" data-font-category="'+safe(category)+'" data-font-label="'+safe((x.name+' '+x.description).toLocaleLowerCase('pt-BR'))+
   '" data-preview-font="'+safe(x.family)+'" aria-pressed="'+(selected===x.id)+'" aria-label="Usar '+safe(x.name)+
   '"'+(font?' data-lazy-typeface="'+safe(font.id)+'"':'')+'>'+
    specimenMarkup(x,design?.group==='art'?'MAKE NOISE':'GNARLY',index)+
   '<span class="lyric-font-detail"><strong>'+safe(x.name)+recent+'</strong><small>'+safe(x.description)+'</small></span>'+
   '<span class="lyric-font-selection" aria-hidden="true">'+(selected===x.id?'✓':'')+'</span></button>';
 }).join('');
 const previewTextSafe=String(previewText||'A música me leva para outro lugar…').slice(0,110);
 const previewContent=chosenArt?renderLyricArtwork(previewTextSafe,chosen.id,{lineId:7,active:true,preview:true}):safe(previewTextSafe);
 return '<div class="lyric-style-panel"><p class="section-note">Aa · Estúdio de tipografia. 20 experiências com recortes e movimento + 20 composições premium. Toque para transformar a legenda instantaneamente.</p>'+
  '<div class="lyric-type-preview" aria-live="polite"><small>PRÉVIA AO VIVO · '+safe(chosen.name)+'</small>'+
  '<div id="lyric-live-specimen" data-sample="'+safe(previewTextSafe)+'">'+previewContent+'</div>'+
  '<span>O áudio e os tempos LRC não são modificados.</span></div>'+
  '<div class="section-head">APLICAR A</div><div class="lyric-font-scope" role="group" aria-label="Aplicar tipografia a">'+buttons+'</div>'+
  '<p class="lyric-font-scope-description">'+(resolution?.source==='song'?'Esta música tem um estilo próprio.':resolution?.source==='artist'?'Usando a escolha salva para o artista.':'Usando o estilo global.')+'</p>'+
  '<div class="lyric-font-actions"><button type="button" data-lyric-reset>↺ Restaurar este nível</button><button type="button" data-lyric-next>Próximo estilo ›</button></div>'+
  '<div class="section-head">40 COMPOSIÇÕES GNARLY · '+(20+20)+' EXCLUSIVAS</div>'+
  '<input class="lyric-font-search" id="lyric-font-search" type="search" placeholder="Buscar recorte, zine, glitch, cinema, serif…" aria-label="Buscar estilos de karaokê" autocomplete="off" />'+
  '<div class="lyric-font-filters" role="group" aria-label="Filtrar tipos de composição">'+chips+'</div>'+
  '<div class="lyric-font-grid" role="group" aria-label="Estilos tipográficos do karaokê">'+rows+'</div>'+
  '<p class="lyric-font-empty" hidden>Nenhuma composição encontrada. Escolha outro filtro.</p>'+
  '<p class="section-note lyric-font-future">40 composições exclusivas + 40 opções tipográficas anteriores. A arte usa CSS leve; as famílias licenciadas são carregadas sob demanda. Movimento reduzido segue suas preferências do sistema.</p></div>';
}
