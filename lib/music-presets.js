// GNARLY WEB quick musical presets. HTMLAudio playbackRate with preservesPitch=false
// matches the Nightcore/Slowed intent but does not emulate time-stretch DSP.
export const MUSIC_PRESETS=Object.freeze({
 ORIGINAL:Object.freeze({speed:1,reverb:0,pitch:true}),
 NIGHTCORE:Object.freeze({speed:1.25,reverb:0,pitch:false}),
 SLOWED:Object.freeze({speed:.8,reverb:0,pitch:false}),
 'SLOWED + REVERB':Object.freeze({speed:.8,reverb:.4,pitch:false})
});
export function musicalPreset(id){return MUSIC_PRESETS[id]||null}
