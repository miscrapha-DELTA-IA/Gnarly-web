/**
 * GNARLY duration reconciliation.
 *
 * Browsers can temporarily derive a wildly incorrect duration from a progressive
 * M4A or a source transition. For a canonical YouTube MUSIC search result,
 * the known catalogue duration is a safer timeline until the source proves
 * otherwise. We NEVER seek, pause, trim, replace or re-encode the actual audio.
 *
 * Cached-only R2 and imported files with no known duration continue to use the
 * media element as the authoritative source.
 */
export function finiteSeconds(value){
 const number=Number(value);
 return Number.isFinite(number)&&number>0?number:0;
}
function attachedMediaDuration(audio){
 if(!audio)return 0;
 // removeAttribute('src') does not always synchronously clear the old
 // HTMLMediaElement duration. Never apply the previous track's clock.
 if(typeof audio.hasAttribute==='function'&&!audio.hasAttribute('src'))return 0;
 // During a source swap currentSrc may still name the previous audio file.
 if(audio.currentSrc&&audio.src&&audio.currentSrc!==audio.src)return 0;
 return finiteSeconds(audio.duration);
}
export function durationIsInflated(audio,track){
 if(track?.source!=='youtube')return false;
 const expected=finiteSeconds(track.duration),reported=attachedMediaDuration(audio);
 // Limit comparisons to YT Music songs, which the backend admits below 10 min.
 if(expected<30||expected>=600||!reported)return false;
 // Anomalies must be unmistakable, not tiny encoder padding/rounding differences.
 return reported>expected+Math.max(25,expected*.2);
}
export function playbackTimelineDuration(audio,track){
 const reported=attachedMediaDuration(audio);
 const expected=finiteSeconds(track?.duration);
 if(!reported)return expected;
 if(!durationIsInflated(audio,track))return reported;
 // If real playback progresses beyond the catalogue endpoint, the audio is
 // demonstrably longer: expose the actual clock instead of hiding playable
 // content behind a permanently completed progress slider.
 const elapsed=finiteSeconds(audio?.currentTime);
 return elapsed>expected+3?reported:expected;
}
