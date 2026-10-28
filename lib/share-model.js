/** Product contracts ported from NightcoreLab ExportProfile/StoryRenderTimeline. */
export const SHARE_FORMATS=Object.freeze([['image','Imagem estática'],['video','Vídeo · Story de até 15 s'],['player-audio','Player com áudio'],['lyrics-audio','Letras com áudio'],['player-noaudio','Player sem áudio'],['lyrics-noaudio','Letras sem áudio']]);
export function exportProfile({aspect='portrait',quality='balanced',crop='safe'}={},mode='player'){
 aspect=['portrait','square','landscape'].includes(aspect)?aspect:'portrait';quality=['economy','balanced','high'].includes(quality)?quality:'balanced';crop=['safe','fit','crop'].includes(crop)?crop:'safe';
 if(mode==='lyrics'&&crop==='crop')crop='safe';
 const short={economy:540,balanced:720,high:1080}[quality],long=Math.round(short*16/9);
 return {aspect,quality,crop,width:aspect==='landscape'?long:short,height:aspect==='portrait'?long:short,fps:{economy:15,balanced:20,high:30}[quality],bitrate:{economy:1600000,balanced:2800000,high:5500000}[quality]};
}
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const text=(s,max=300)=>String(s||'').replace(/[\u0000-\u001f]/g,' ').slice(0,max);
export function freezeShareRequest(state,format='image'){
 if(!state.track)throw Error('Escolha uma música para exportar.');
 if(!SHARE_FORMATS.some(([id])=>id===format))throw Error('Formato desconhecido.');
 const mode=format.startsWith('lyrics')?'lyrics':'player',lines=(state.lines||[]).filter(l=>Number.isFinite(l.time)&&l.text).map(l=>Object.freeze({time:l.time,text:text(l.text,600)}));
 if(mode==='lyrics'&&(!state.synced||!lines.length))throw Error('Aguarde uma letra sincronizada ou importe um arquivo LRC.');
 const sourceDuration=Math.max(0,finite(state.duration)),speed=Math.max(.5,Math.min(2,finite(state.speed,1))),start=Math.max(0,Math.min(sourceDuration,finite(state.position)));
 if(format!=='image'&&sourceDuration-start<=.05)throw Error('Não há trecho disponível nesta posição.');
 if(state.track.source==='preview'&&(format==='video'||format.endsWith('-audio')))throw Error('Uma prévia não é uma música completa para exportação com áudio. Use um arquivo autorizado.');
 return Object.freeze({format,mode,title:text(state.track.title),artist:text(state.track.artist),trackId:text(state.track.id),sourceKind:state.track.source,
  artwork:state.track.artwork||null,background:state.background||null,backgroundMode:state.backgroundMode||'visual',lines:Object.freeze(lines),lyricStyle:state.lyricStyle||'original',style:state.style||'Clássica',
  sourceDuration,start,speed,pitch:state.pitch!==false,bass:Math.max(0,Math.min(12,finite(state.bass))),reverb:Math.max(0,Math.min(.7,finite(state.reverb))),
  duration:Math.min(15,Math.max(0,(sourceDuration-start)/speed)),includeAudio:format==='video'||format.endsWith('-audio'),visual:Object.freeze({...state.visual})});
}
export function shareFrame(request,profile,elapsed=0){
 const count=Math.max(1,Math.ceil(request.duration*profile.fps)),index=Math.max(0,Math.min(count-1,Math.round(finite(elapsed)*profile.fps))),time=index/profile.fps;
 const sourceTime=request.start+time*request.speed;
 return {index,elapsed:time,sourceTime,line:request.lines.findLast(l=>l.time<=sourceTime)||null};
}
export function shareMetadata(request,profile,{mime,duration,frames=1,measuredFPS=null}={}){
 return {schemaVersion:1,title:request.title,artist:request.artist,presetID:request.visual.experience||'original',materialID:request.visual.materialLayer||request.visual.theme,
  sourceStart:request.start,speed:request.speed,includeAudio:request.format==='image'?false:request.includeAudio,duration,width:profile.width,height:profile.height,
  fpsLimit:profile.fps,measuredRenderFPS:measuredFPS,renderedFrames:frames,codec:mime?.split('codecs=')[1]|| (mime?.includes('mp4')?'browser-default':mime?.includes('webm')?'webm':'png'),mime,quality:profile.quality,aspectRatio:profile.aspect,cropPolicy:profile.crop,
  thumbnailFrameIndex:0,thumbnailElapsed:0,exportedAt:new Date().toISOString()};
}
