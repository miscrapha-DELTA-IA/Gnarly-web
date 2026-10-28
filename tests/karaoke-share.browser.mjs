/** Native browser media/worker/encoder acceptance. Synthetic input only; no provider traffic. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.SHARE_ARTIFACT_DIR||'/tmp/gnarly-karaoke-share';await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'gnarly-share-'));
execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=90','-ar','48000','-ac','1',path.join(temp,'voice.wav')]);
execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=60','-c:a','aac','-b:a','64k','-movflags','+faststart',path.join(temp,'song.m4a')]);
const media=await readFile(path.join(temp,'song.m4a'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+path.join(temp,'voice.wav'),'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base='https://gnarly-web.miscrapha.workers.dev',errors=[],results=[];
try{
 const context=await browser.newContext({viewport:{width:1100,height:1000},permissions:['microphone'],serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/fast-audio/')||u.pathname==='/download'){await route.fulfill({contentType:'audio/mp4',body:media,headers:{'Content-Length':String(media.length),'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes'}});return}
  if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/fast-prepare/')){await route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});return}
  try{
   const file=u.pathname==='/'?'index.html':u.pathname.slice(1),ext=path.extname(file);let body=await readFile(path.join(root,file));
   if(file==='app.js')body=Buffer.from(body+`\nglobalThis.__shareQA={audio,state,visual,engine,karaokeStage,selectTrack,play,pause,openSheet,closeSheet,openShareStudio,studio:()=>shareStudioPromise,smartOff:()=>smartMode='off'};`);
   await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[ext]||'application/octet-stream',body});
  }catch{await route.fulfill({status:404,body:''})}
 });
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__shareQA);
 await page.evaluate(()=>{const q=__shareQA;q.visual.stopLoop();q.smartOff();q.selectTrack({id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA',source:'youtube',title:'Synthetic original',artist:'GNARLY QA',duration:60,artwork:'/assets/gnarly-icon.png'})});
 await page.waitForFunction(()=>!__shareQA.audio.paused&&__shareQA.audio.readyState>=2);
 await page.evaluate(()=>{const q=__shareQA;q.state.lyrics=[{time:0,text:'Sing with GNARLY'},{time:20,text:'Second line'}];q.state.lyricsSynced=true;q.openSheet('karaoke');q.karaokeStage.updateScore()});
 await page.locator('[data-command="karaoke-mic"]').click();
 await page.waitForFunction(()=>__shareQA.karaokeStage.mic.active);
 await page.waitForFunction(()=>__shareQA.karaokeStage.scorer.snapshot().score>10,{},{timeout:15000});
 const mic=await page.evaluate(()=>({score:__shareQA.karaokeStage.scorer.snapshot(),voice:__shareQA.karaokeStage.mic.frameNow(),worker:!!__shareQA.karaokeStage.mic.worker,tracks:__shareQA.karaokeStage.mic.stream.getTracks().length,time:__shareQA.audio.currentTime}));
 assert.ok(mic.worker);assert.ok(mic.voice.voiced);assert.ok(Math.abs(mic.voice.hz-220)<10);results.push({name:'compact tab real capture, worker and score',...mic});
 await page.screenshot({path:path.join(out,'microphone-desktop.png')});
 await page.evaluate(()=>__shareQA.pause());const paused=await page.evaluate(()=>({time:__shareQA.audio.currentTime,score:__shareQA.karaokeStage.scorer.snapshot().score}));await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>__shareQA.karaokeStage.scorer.snapshot().score),paused.score);
 await page.evaluate(()=>__shareQA.play());assert.ok(await page.evaluate(time=>__shareQA.audio.currentTime>=time-.1,paused.time));
 // Moving between tab and expanded view must reuse the same capture track.
 await page.evaluate(()=>globalThis.captureTrack=__shareQA.karaokeStage.mic.stream.getTracks()[0]);
 await page.locator('[data-command="karaoke-expand"]').click();assert.ok(await page.evaluate(()=>__shareQA.karaokeStage.mic.stream.getTracks()[0]===captureTrack));
 const downloadEvent=page.waitForEvent('download');await page.locator('#karaoke-voice-record').click();await page.waitForTimeout(450);await page.locator('#karaoke-voice-record').click();const voice=await downloadEvent;await voice.saveAs(path.join(out,'voice'+(voice.suggestedFilename().endsWith('m4a')?'.m4a':'.webm')));
 await page.locator('#karaoke-stage-close').click();assert.equal(await page.evaluate(()=>captureTrack.readyState),'ended');assert.equal(await page.locator('audio').count(),1);results.push({name:'pause holds score, expand reuses capture, recording and release',passed:true});
 // Permission failure is visible inline and retryable; it cannot stop the song.
 await page.evaluate(()=>{__shareQA.openSheet('karaoke');globalThis.originalGUM=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});
 const playingSource=await page.evaluate(()=>__shareQA.audio.currentSrc);await page.locator('[data-command="karaoke-mic"]').click();await page.waitForFunction(()=>__shareQA.karaokeStage.mic.status==='error');assert.match(await page.locator('[data-karaoke-input-state]').innerText(),/permissões/);assert.equal(await page.evaluate(()=>__shareQA.audio.currentSrc),playingSource);
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=originalGUM;__shareQA.closeSheet()});
 async function exportOne(format,name,{audio=false}={}){
  console.log('EXPORT',name);
  await page.evaluate(async format=>{await __shareQA.openShareStudio(format);globalThis.qaStudio=await __shareQA.studio()},format);await page.waitForFunction(()=>!!qaStudio.renderer);
  await page.locator('[data-share-setting="quality"]').selectOption('economy');await page.waitForFunction(()=>!!qaStudio.renderer);
  await page.locator('[data-share-setting="duration"]').fill('1.2');await page.locator('[data-share-setting="duration"]').blur();await page.waitForFunction(()=>!!qaStudio.renderer);
  const before=await page.evaluate(()=>({time:__shareQA.audio.currentTime,src:__shareQA.audio.currentSrc}));
  console.log('GENERATE',name);await page.locator('[data-share-action="generate"]').click();
  await page.waitForFunction(()=>!!qaStudio.result||(!qaStudio.busy&&document.querySelector('[data-share-status]').textContent!=='Prévia pronta. Toque Gerar arquivo.'),null,{timeout:30000});
  console.log('STATUS',await page.locator('[data-share-status]').innerText());
  assert.ok(await page.evaluate(()=>!!qaStudio.result));
  const result=await page.evaluate(async()=>{const s=await __shareQA.studio(),r=s.result;return {info:r.info,media:await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',').at(-1));f.readAsDataURL(r.media)}),thumbnail:await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',').at(-1));f.readAsDataURL(r.thumbnail)}),metadata:await r.metadata.text(),ext:r.media.name.split('.').at(-1),time:__shareQA.audio.currentTime,src:__shareQA.audio.currentSrc}});
  assert.equal(result.src,before.src);assert.ok(result.time>=before.time-.1,'export never seeks player');
  const file=path.join(out,name+'.'+result.ext);await writeFile(file,Buffer.from(result.media,'base64'));await writeFile(path.join(out,name+'-thumbnail.jpg'),Buffer.from(result.thumbnail,'base64'));await writeFile(path.join(out,name+'-metadata.json'),result.metadata);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,540);assert.equal(video.height,960);
  if(format!=='image'){assert.equal(probe.streams.some(s=>s.codec_type==='audio'),audio);assert.ok(Number(probe.format.duration)>.5&&Number(probe.format.duration)<3);if(audio){const pcm=execFileSync('ffmpeg',['-v','error','-i',file,'-vn','-f','f32le','-ac','1','-ar','16000','pipe:1']);let energy=0;for(let i=0;i<pcm.length;i+=4)energy+=pcm.readFloatLE(i)**2;assert.ok(energy/(pcm.length/4)>.00001,'audio file must contain samples');let first=0;while(first<pcm.length&&Math.abs(pcm.readFloatLE(first))<.01)first+=4;assert.ok(first/4/16000<.25,'export has no silent encoder warm-up prefix')}}
  await page.screenshot({path:path.join(out,name+'-ui.png')});results.push({name,info:result.info,streams:probe.streams.map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height})),beforeTime:before.time,afterTime:result.time});
  await page.evaluate(()=>{globalThis.sharedFiles=null;navigator.canShare=()=>true;navigator.share=async value=>{globalThis.sharedFiles=value.files.map(x=>x.name)}});await page.locator('[data-share-action="share"]').click();assert.equal((await page.evaluate(()=>sharedFiles)).length,3);
  await page.locator('[data-share-action="close"]').click();
 }
 await exportOne('image','player-image');await exportOne('player-noaudio','player-silent');await exportOne('lyrics-audio','lyrics-audio',{audio:true});
 // An explicit cancel must release tracks and leave native playback intact.
 await page.evaluate(()=>__shareQA.openShareStudio('player-audio'));await page.waitForFunction(()=>!!qaStudio.renderer);
 await page.locator('[data-share-action="generate"]').click();await page.locator('[data-share-action="cancel"]').click();await page.waitForFunction(()=>!qaStudio.busy);assert.equal(await page.evaluate(async()=>!!(await __shareQA.studio()).result),false);await page.locator('[data-share-action="close"]').click();
 // Real OfflineAudioContext + worker: keep pitch vs rate-following pitch.
 const pitch=await page.evaluate(async()=>{const {renderClipAudio}=await import('/lib/share-encoder.js'),{analyzeVoice}=await import('/lib/karaoke-live-score.js');const results=[];for(const preserve of [true,false]){const buffer=await renderClipAudio({sourceDuration:60,start:4,duration:1,speed:1.25,pitch:preserve,bass:0,reverb:0},__shareQA.audio.currentSrc);results.push(analyzeVoice(buffer.getChannelData(0).slice(5000,9096),buffer.sampleRate))}return results});assert.ok(Math.abs(pitch[0].hz-440)<5);assert.ok(Math.abs(pitch[1].hz-550)<5);results.push({name:'offline export speed and pitch match player controls',pitch});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>__shareQA.openSheet('karaoke'));await page.screenshot({path:path.join(out,'microphone-mobile.png')});
 await page.evaluate(()=>__shareQA.openShareStudio('image'));await page.waitForFunction(()=>!!qaStudio.renderer);assert.ok(await page.locator('[data-share-action="generate"]').isVisible());await page.screenshot({path:path.join(out,'export-mobile.png')});
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'validation.json'),JSON.stringify({results,errors,scope:'Chromium desktop/mobile viewport, real WebAudio/worker/MediaRecorder, generated original tones. Not physical microphone or Safari validation.'},null,2));console.log(JSON.stringify(results.map(({name,info})=>({name,info})),null,2));
}finally{await browser.close();await rm(temp,{recursive:true,force:true})}
