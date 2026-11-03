/** Public player feedback: informational recovery is silent. */
export const PLAYBACK_RETRY_TEXT='Tente novamente';

/** Never show upstream error bodies, provider, cache, device or queue details. */
export function renderPlaybackFeedback({playerStatus,ipodStatus}={}, {error=false}={}){
 const message=error?PLAYBACK_RETRY_TEXT:'';
 if(playerStatus){
  playerStatus.textContent=message;
  playerStatus.hidden=!error;
 }
 if(ipodStatus)ipodStatus.textContent=message;
}
