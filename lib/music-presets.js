// GNARLY WEB quick musical presets. HTMLAudio playbackRate with preservesPitch=false
// matches the Nightcore/Slowed intent but does not emulate time-stretch DSP.
export const MUSIC_PRESETS=Object.freeze({
 ORIGINAL:Object.freeze({speed:1,reverb:0,pitch:true}),
 NIGHTCORE:Object.freeze({speed:1.25,reverb:0,pitch:false}),
 SLOWED:Object.freeze({speed:.8,reverb:0,pitch:false}),
 'SLOWED + REVERB':Object.freeze({speed:.8,reverb:.4,pitch:false})
});
export function musicalPreset(id){return MUSIC_PRESETS[id]||null}
/** Saved speed must agree with its named preset. In particular, a legacy
 * 1.25x speed saved beside ORIGINAL must not silently speed up new songs.
 * CUSTOM is the sole preset that restores an arbitrary explicit slider rate.
 */
export function restoredPlaybackSpeed(rawSpeed,preset='ORIGINAL'){
 const known=musicalPreset(preset);
 if(known)return known.speed;
 const value=Number(rawSpeed);
 return Number.isFinite(value)&&value>=.5&&value<=2?value:1;
}

