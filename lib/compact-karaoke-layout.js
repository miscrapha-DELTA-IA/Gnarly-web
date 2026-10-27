/** Fixed-slot compact karaoke typography. This adjusts only the inner text,
 * not the HUD geometry or the player. For stanzas longer than the available
 * space even at a readable minimum size, keep real native text scrolling.
 */
export function fitCompactLyricContent(hud,line,{minScale=.6}={}){
 if(!hud||!line||hud.hidden)return {fitted:false,scrollable:false,scale:1};
 hud.style.setProperty('--gnarly-hud-fit-scale','1');
 line.scrollTop=0;
 const scales=[1,.93,.86,.79,.72,.66,Math.max(.5,Math.min(.66,minScale))];
 let scale=1;
 for(const candidate of scales){
  scale=candidate;
  hud.style.setProperty('--gnarly-hud-fit-scale',String(scale));
  if(line.scrollHeight<=line.clientHeight+2 && line.scrollWidth<=line.clientWidth+2)break;
 }
 const scrollable=line.scrollHeight>line.clientHeight+2;
 line.dataset.compactScrollable=String(scrollable);
 return {fitted:!scrollable,scrollable,scale};
}
