/** GNARLY Creative Karaoke · art-directed visual treatments, not font names.
 * Native inspiration: MagazineCutoutStyle.swift resolves per-word palette,
 * face and rotation deterministically. We never copy external font assets.
 * All effects are pure DOM/CSS: no shader, timer, audio analysis or ML runtime.
 */
const RAW_ART=[["magazine-cutout","Magazine Cutout","Recortes físicos, palavras com papéis diferentes","font-bricolage-grotesque","cutout","collage"],["xerox-ransom","Xerox Ransom","Xerografia granulada + impressões rasgadas","font-archivo-black","ransom","photocopy"],["neon-stencil","Neon Stencil","Letras estêncil atravessadas pela luz","font-rajdhani","stencil","neon"],["chrome-surge","Chrome Surge","Chrome extrudado com reflexos em pulso","font-unbounded","chrome","pulse"],["glitch-zine","Glitch Zine","Offset RGB e fita de fotocopiadora","font-syne","glitch","glitch"],["type-tornado","Type Tornado","Palavras em rotação de tensão gráfica","font-bebas-neue","tilt","spin"],["prism-split","Prism Split","Refração tipográfica em camadas","font-orbitron","prism","prism"],["digital-havoc","Digital Havoc","Terminal pixelado e leitura acelerada","font-space-mono","digital","scan"],["spray-tag","Spray Tag","Cartaz de rua em tinta crua","font-permanent-marker","spray","spray"],["liquid-type","Liquid Type","Morfologia fluida com respiração lenta","font-fraunces","liquid","liquid"],["tape-collage","Tape Collage","Fitas, etiquetas, transparências e ângulos","font-dm-sans","tape","tape"],["ransom-spectrum","Ransom Spectrum","Múltiplos materiais em cores alternadas","font-playfair-display","spectrum","bounce"],["electric-ticket","Electric Ticket","Ingressos perfurados, impressão e saltos","font-oswald","ticket","ticket"],["halftone-punch","Halftone Punch","Trama xerográfica, serigrafia e impacto","font-anton","halftone","punch"],["y2k-warp","Y2K Warp","Metal pop 2000 com lâmina torcida","font-righteous","y2k","warp"],["barcode-beats","Barcode Beats","Tipografia codificada com linhas cinéticas","font-chakra-petch","barcode","scan"],["elastic-words","Elastic Words","Compressão e mola por palavra","font-outfit","elastic","elastic"],["kinetic-masthead","Kinetic Masthead","Títulos em movimento de revista","font-barlow-condensed","masthead","kinetic"],["paper-trail","Paper Trail","Páginas sobrepostas e marcas de registro","font-eb-garamond","paper","paper"],["stereo-echo","Stereo Echo","Ecos duplos e deslocamento estereofônico","font-unbounded","stereo","echo"]];
const RAW_STUDIO=[["vogue-editorial","Vogue Editorial","Contraste alto, moda e serifas monumentais","font-playfair-display","vogue"],["swiss-grid","Swiss Grid","Grade suíça, proporções rigorosas","font-inter","swiss"],["brutalist-index","Brutalist Index","Hierarquia industrial sem ornamento supérfluo","font-archivo-black","brutalist"],["typographic-atlas","Typographic Atlas","Anotações cartográficas e coordenadas","font-space-grotesk","atlas"],["midnight-serif","Midnight Serif","Elegância noturna, contraste de luz","font-cormorant-garamond","midnight"],["monochrome-folio","Monochrome Folio","Publicação monocromática de luxo","font-instrument-serif","folio"],["acid-broadsheet","Acid Broadsheet","Jornal underground acid","font-syne","broadsheet"],["art-deco-cinema","Art Deco Cinema","Intertítulos dourados, arquitetura radial","font-bebas-neue","deco"],["cyanotype","Cyanotype","Blueprint de engenharia, tinta azul","font-ibm-plex-mono","cyanotype"],["hot-metal","Hot Metal","Impressão tipográfica com relevo de chumbo","font-eb-garamond","hotmetal"],["fashion-caption","Fashion Caption","Legenda de desfile em microtipografia","font-dm-sans","fashion"],["analog-contact","Analog Contact","Folha de contato, marcas de filme","font-space-mono","analog"],["cyber-monogram","Cyber Monogram","Sistema de identidade cyber editorial","font-orbitron","monogram"],["archival-stamp","Archival Stamp","Carimbo numerado em papel envelhecido","font-oswald","archive"],["brutalist-italic","Brutalist Italic","Diagonal de propaganda com sombra dura","font-unbounded","italic"],["liquid-chrome","Liquid Chrome","Relevo líquido perolado e metálico","font-fraunces","chrome"],["velvet-noir","Velvet Noir","Preto profundo e contraste teatral","font-instrument-serif","velvet"],["ultra-minimal","Ultra Minimal","Silêncio editorial, generoso espaço negativo","font-manrope","ultra"],["neon-serif","Neon Serif","Serifa de assinatura iluminada","font-lora","serifneon"],["concrete-poster","Concrete Poster","Pôster arquitetônico e sinalética pública","font-anton","concrete"]];
const map=(items,group)=>items.map(([suffix,name,description,fontId,treatment,motion])=>Object.freeze({
  id:group==='art'?'art-'+suffix:'studio-'+suffix,name,description,group,fontId,
  treatment,motion:group==='art'?motion:'none'
}));
export const KARAOKE_ART_PRESETS=Object.freeze(map(RAW_ART,'art'));
export const KARAOKE_STUDIO_PRESETS=Object.freeze(map(RAW_STUDIO,'studio'));
export const KARAOKE_DESIGNS=Object.freeze([...KARAOKE_ART_PRESETS,...KARAOKE_STUDIO_PRESETS]);
const lookup=new Map(KARAOKE_DESIGNS.map(x=>[x.id,x]));
export const findKaraokeDesign=id=>lookup.get(id)||null;
export const designFont=id=>findKaraokeDesign(id)?.fontId||id;
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
/** Stable deterministic hash (FNV-1a 32bit); no flicker when scrolling or repainting. */
export function lyricWordHash(text,lineId,index){
 const raw=String(lineId)+':'+String(index)+':'+String(text);
 let hash=2166136261;
 for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)}
 return hash>>>0;
}
const charLimit=210;
/** Passive visual markup; aria-label on group, visible word-tile clones hidden
 * from assistive tech. Long lines gracefully use plain text, preventing DOM bloat.
 * Timings and words are NEVER modified, and markup uses escaped text only.
 */
export function renderLyricArtwork(text,styleId,{lineId=0,active=true,preview=false}={}){
 const design=findKaraokeDesign(styleId),source=String(text??'').slice(0,1200);
 if(!design)return safe(source);
 const parts=source.match(/\s+|\S+/gu)||[];
 const words=parts.filter(x=>!/^\s+$/u.test(x));
 const elaborate=design.group==='art'&&active&&source.length<=charLimit&&words.length<=26;
 const label=safe(source);
 if(!elaborate){
  return '<span class="gnarly-typeart gnarly-typeart--'+design.group+' gnarly-typeart--'+design.treatment+
   '" data-lyric-art="'+design.id+'" aria-label="'+label+'"><span aria-hidden="true">'+label+'</span></span>';
 }
 let i=0;
 const html=parts.map(part=>{
  if(/^\s+$/u.test(part))return '<span class="gnarly-word-gap" aria-hidden="true"> </span>';
  const hash=lyricWordHash(part,lineId,i++);
  const tilt=((hash%9)-4);
  // Native Magazine Cutout has three purposeful combinations: black/white/accent and rounded/serif/mono.
  const nativeCutout=design.id==='art-magazine-cutout';
  const tone=(hash>>>9)%(nativeCutout?3:4),face=(hash>>>17)%(nativeCutout?3:4);
  const order=(hash>>>24)%5;
  return '<span class="gnarly-word gnarly-tone-'+tone+' gnarly-face-'+face+
    '" style="--word-tilt:'+tilt+'deg;--word-order:'+order+'" aria-hidden="true">'+safe(part)+'</span>';
 }).join('');
 return '<span class="gnarly-typeart gnarly-typeart--art gnarly-typeart--'+design.treatment+
   (preview?' gnarly-typeart--preview':'')+'" data-lyric-art="'+design.id+
   '" aria-label="'+label+'">'+html+'</span>';
}
