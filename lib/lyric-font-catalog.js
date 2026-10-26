/** GNARLY karaoke font catalogue.
 * Families are curated from openly licensed Google Fonts (mostly SIL OFL 1.1).
 * No font binaries are copied/bundled. CSS is fetched lazily, only when chosen.
 * A catalogue URL, GitHub source, or icon font is NOT by itself a license.
 */
const ENTRIES=[
 [
  "inter",
  "Inter",
  "Legível · limpo",
  "clean",
  700
 ],
 [
  "dm-sans",
  "DM Sans",
  "Editorial preciso",
  "clean",
  700
 ],
 [
  "space-grotesk",
  "Space Grotesk",
  "Futurista orgânico",
  "clean",
  700
 ],
 [
  "manrope",
  "Manrope",
  "Ultra clean",
  "clean",
  700
 ],
 [
  "outfit",
  "Outfit",
  "Geométrico macio",
  "clean",
  700
 ],
 [
  "work-sans",
  "Work Sans",
  "Legibilidade alta",
  "clean",
  700
 ],
 [
  "plus-jakarta-sans",
  "Plus Jakarta Sans",
  "Contemporâneo",
  "clean",
  700
 ],
 [
  "lexend",
  "Lexend",
  "Leitura confortável",
  "clean",
  700
 ],
 [
  "nunito-sans",
  "Nunito Sans",
  "Arredondado delicado",
  "clean",
  700
 ],
 [
  "bricolage-grotesque",
  "Bricolage Grotesque",
  "Experimental sofisticado",
  "expressive",
  700
 ],
 [
  "unbounded",
  "Unbounded",
  "Largo e cyber",
  "expressive",
  700
 ],
 [
  "syne",
  "Syne",
  "Editorial irreverente",
  "expressive",
  700
 ],
 [
  "chakra-petch",
  "Chakra Petch",
  "Tech minimal",
  "expressive",
  700
 ],
 [
  "orbitron",
  "Orbitron",
  "Futurista geométrico",
  "expressive",
  700
 ],
 [
  "righteous",
  "Righteous",
  "Retro contemporâneo",
  "expressive",
  400
 ],
 [
  "archivo-black",
  "Archivo Black",
  "Massivo e legível",
  "poster",
  400
 ],
 [
  "bebas-neue",
  "Bebas Neue",
  "Condensado cinematográfico",
  "poster",
  400
 ],
 [
  "oswald",
  "Oswald",
  "Vertical impactante",
  "poster",
  700
 ],
 [
  "anton",
  "Anton",
  "Headline forte",
  "poster",
  400
 ],
 [
  "teko",
  "Teko",
  "Estreito e expressivo",
  "poster",
  600
 ],
 [
  "barlow-condensed",
  "Barlow Condensed",
  "Sport editorial",
  "poster",
  700
 ],
 [
  "rajdhani",
  "Rajdhani",
  "Industrial clean",
  "poster",
  700
 ],
 [
  "space-mono",
  "Space Mono",
  "Tech monoespaçado",
  "mono",
  700
 ],
 [
  "ibm-plex-mono",
  "IBM Plex Mono",
  "Monoespaçado clássico",
  "mono",
  700
 ],
 [
  "jetbrains-mono",
  "JetBrains Mono",
  "Digital nítido",
  "mono",
  700
 ],
 [
  "playfair-display",
  "Playfair Display",
  "Editorial clássico",
  "serif",
  700
 ],
 [
  "instrument-serif",
  "Instrument Serif",
  "Cinema e moda",
  "serif",
  400
 ],
 [
  "fraunces",
  "Fraunces",
  "Editorial de personalidade",
  "serif",
  700
 ],
 [
  "cormorant-garamond",
  "Cormorant Garamond",
  "Luxo expressivo",
  "serif",
  700
 ],
 [
  "eb-garamond",
  "EB Garamond",
  "Revista clássica",
  "serif",
  700
 ],
 [
  "lora",
  "Lora",
  "Serif legível",
  "serif",
  700
 ],
 [
  "caveat",
  "Caveat",
  "Anotação manual",
  "hand",
  700
 ],
 [
  "permanent-marker",
  "Permanent Marker",
  "Cartaz de rua",
  "hand",
  400
 ],
 [
  "dancing-script",
  "Dancing Script",
  "Cursivo fluido",
  "hand",
  700
 ]
];
export const FONT_GROUPS=Object.freeze([
 {id:'all',label:'Todas'}, {id:'clean',label:'Clean'}, {id:'expressive',label:'Experimental'},
 {id:'poster',label:'Poster'}, {id:'mono',label:'Digital'},
 {id:'serif',label:'Editorial'}, {id:'hand',label:'Manuscrito'}
]);
export const FONT_CATALOG=Object.freeze(ENTRIES.map(([id,name,description,group,weight])=>Object.freeze({
 id:'font-'+id,name,description,group,weight,
 family:'gf-'+id,fontFamily:'"'+name.replaceAll('"','')+'"',
 fallback:group==='serif'?'Georgia,serif':group==='mono'?'Menlo,monospace':group==='hand'?'cursive':'Arial,sans-serif',
 provider:'Google Fonts',license:'Open-source (verify per-family license)',urlFamily:name
})));
export const findFont=id=>FONT_CATALOG.find(x=>x.id===id||x.family===id)||null;
const requested=new Map();
/** Never interpolates user-provided family names/URLs. Font load is best effort:
 * applying a selection always takes effect first with its metric-safe fallback.
 */
export function loadLyricTypeface(styleId,doc=globalThis.document){
 const font=findFont(styleId);
 if(!font||!doc?.head||!doc.createElement)return Promise.resolve(false);
 if(requested.has(font.id))return requested.get(font.id);
 const family=font.urlFamily.split(' ').join('+');
 const weight=font.weight;
 const url='https://fonts.googleapis.com/css2?family='+family+':wght@'+weight+'&display=swap';
 const task=new Promise(resolve=>{
  const node=doc.createElement('link');
  node.rel='stylesheet';node.href=url;node.setAttribute('data-gnarly-typeface',font.id);
  let settled=false;
  const finish=ok=>{if(settled)return;settled=true;resolve(ok)};
  node.onload=()=>finish(true);
  node.onerror=()=>finish(false);
  doc.head.append(node);
  // No timer/global network assumptions in tests or render path.
 });
 requested.set(font.id,task);
 return task;
}
