/** GNARLY 2: deterministic musical-stage visual director, not a new shader.
 * Reuses the exact authored materials and experiences. At most two shader passes
 * per frame; no new GL pipelines, allocations, decoding or external metadata.
 */
import {CLASSIC_THEMES,MATERIAL_THEMES,NATIVE_COLOR_THEMES,CREATIVE_COLOR_THEMES,EXPERIENCES,resolveVisual} from './visual-selection.js';
export const GNARLY2_PHASES=Object.freeze(['IDENTIDADE','EVOLUÇÃO','EXPANSÃO','CLÍMAX','RESOLUÇÃO']);
const MATS=Object.freeze(['PRISM CARMINE','JACQUARD SIGNAL','XEROX SERPENTINE','SUBATOMIC BUBBLE','LENTICULAR WILD','ISOMETRIC CHASM']);
const COLORS=Object.freeze(['NEON PULSE COLORS','VOID GLOSS COLORS','AIRBRUSH MIRAGE COLORS','GROOVE EBRU COLORS','CYMATIC RORSCHACH COLORS','SUBCULTURAL ARCHIVE COLORS','TECTONIC MESH COLORS','NOCTURNAL LITHOGRAPH COLORS']);
const GEOMETRIES=Object.freeze(['gnarly-exp-vector-drift-2000','gnarly-texture-plasma-lava','liquid-dream','gnarly-exp-subcultural-archive','gnarly-texture-topographic-moire','gnarly-exp-caustic-dissection']);
const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x)};
const mod=(x,n)=>(x%n+n)%n;
export function gnarly2Director({time=0,duration=0,artworkHue=.5,anchorTheme='ACID',experience='original',lockColors=false,lockExperience=false}={}){
 const usableTime=Math.max(0,Number.isFinite(time)?time:0);
 const phaseDuration=duration>1?duration/5:27;
 const phaseNumber=Math.min(4,Math.floor(usableTime/phaseDuration)%(duration>1?5:5));
 const phaseStep=usableTime/phaseDuration;
 const progress=phaseStep-Math.floor(phaseStep);
 const nextIndex=duration>1?Math.min(4,phaseNumber+1):mod(phaseNumber+1,5);
 const offset=mod(Math.floor((Number.isFinite(artworkHue)?artworkHue:.5)*13),MATS.length);
 const anchor=CLASSIC_THEMES.includes(anchorTheme)||MATERIAL_THEMES.includes(anchorTheme)||
  NATIVE_COLOR_THEMES.includes(anchorTheme)||CREATIVE_COLOR_THEMES.includes(anchorTheme)?anchorTheme:'ACID';
 const validExp=EXPERIENCES.some(e=>e.id===experience)?experience:'original';
 function phase(index){
  const theme=index===0?anchor:MATS[mod(offset+index*2,MATS.length)];
  const paletteTheme=lockColors||index===0?anchor:COLORS[mod(offset+index-1,COLORS.length)];
  const exp=lockExperience||index===0?validExp:GEOMETRIES[mod(offset+index-1,GEOMETRIES.length)];
  return {theme,paletteTheme,experience:exp,visual:resolveVisual(theme,exp,'FLUIDO')};
 }
 const current=phase(phaseNumber),next=phase(nextIndex);
 // 80% of every musical section keeps one stable material/experience identity;
 // the last fifth evolves smoothly into the following authored scene.
 const transition=(duration>1&&phaseNumber===4)?0:smooth((progress-.80)/.20);
 return {current,next,transition,phase:GNARLY2_PHASES[phaseNumber],index:phaseNumber,
  phaseProgress:progress,referenceAnchor:anchor};
}
/** Timeless selection contract. No new shader compilation when the selector changes. */
export function shouldLayerVisual(scene){
 return !!scene?.secondary&&scene.secondary.experience!=='original';
}
export function compositionStrength(scene,{reducedMotion=false,renderScale=1}={}){
 if(!shouldLayerVisual(scene)||reducedMotion||renderScale<.67)return 0;
 const material=scene.theme&&MATERIAL_THEMES.includes(scene.theme);
 return Math.max(.16,Math.min(.34,(material?.27:.22)*(renderScale<.8?.75:1)));
}
