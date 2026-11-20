/**
 * Adaptive visual-only workload budget. Audio, static album artwork, typography,
 * source resolution and authored shader equations are not modified.
 * A desktop Retina viewport can be 8MP+; expensive multilayer fragments at
 * that size × 60fps can stall the browser/compositor even on capable machines.
 */
import {resolveVisual,GNARLY_MODES} from './visual-selection.js';

export function visualWorkload({theme='ACID',experience='original',reaction='FLUIDO',materialLayer='none'}={}){
 const independent=materialLayer&&materialLayer!=='none'&&!GNARLY_MODES.includes(theme);
 const choice=resolveVisual(independent?materialLayer:theme,experience,reaction);
 const layered=theme==='GNARLY 2'||!!choice.secondary||!!independent;
 const complex=!!choice.look||!!choice.texture;
 return layered?'layered':complex?'complex':'classic';
}

export function visualPixelBudget({
 desktop=false,playing=false,workload='classic',deviceMemory=8,saveData=false
}={}){
 const heavy=workload==='complex'||workload==='layered';
 const layered=workload==='layered';
 // Rendering 8.3 million animated fragments every 16ms is inappropriate for
 // a first paint. Offer higher resolution after real playback, with smaller
 // targets for expensive textures and GNARLY 2 composition.
 let pixels=desktop?
  (playing?(layered?2200000:heavy?3000000:4600000):
   (layered?1250000:heavy?1750000:2600000)):
  (playing?(layered?1500000:heavy?2000000:3200000):
   (layered?900000:heavy?1300000:2200000));
 if(saveData)pixels=Math.min(pixels,1250000);
 const memory=Number(deviceMemory)||8;
 if(memory<=2)pixels=Math.min(pixels,1100000);
 else if(memory<=4)pixels=Math.min(pixels,2100000);
 return pixels;
}

export function visualFramePeriod({
 reduced=false,playing=false,workload='classic',interacting=false,
 audioPriority=false,severeAudioPressure=false
}={}){
 if(reduced)return 1000/12;
 if(playing&&audioPriority)return severeAudioPressure?1000/24:1000/30;
 if(workload==='layered')return playing?1000/30:1000/18;
 if(workload==='complex')return playing?1000/36:1000/22;
 if(playing)return 1000/60;
 return interacting?1000/60:1000/24;
}
