/** Real native AAC transport regression. All catalog/media requests are fixtures. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.PAUSE_ARTIFACT_DIR||'/tmp/gnarly-pause-resume';
await mkdir(out,{recursive:true});const temp=await mkdtemp(path.join(tmpdir(),'gnarly-pause-'));
execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=330:duration=180','-c:a','aac','-b:a','64k','-movflags','+faststart',path.join(temp,'tone.m4a')]);
const media=await readFile(path.join(temp,'tone.m4a'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base='https://gnarly-web.miscrapha.workers.dev',results=[],errors=[];let statusStarted=null,releaseStatus;
try{
 const context=await browser.newContext({viewport:{width:1100,height:1000},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/playback-status'&&statusStarted){const started=statusStarted;statusStarted=null;started();await new Promise(resolve=>releaseStatus=resolve);await route.fulfill({contentType:'application/json',body:'{"status":"upstream_rate_limited","retry_after":60}'});return}
  if(u.pathname.startsWith('/fast-audio/')||u.pathname==='/download'){
   await route.fulfill({contentType:'audio/mp4',body:media,headers:{'Content-Length':String(media.length),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'}});return;
  }
  if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/fast-prepare/')){await route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});return}
  try{
   const file=u.pathname==='/'?'index.html':u.pathname.slice(1),ext=path.extname(file);
   let body=await readFile(path.join(root,file));
   if(file==='app.js')body=Buffer.from(body+'\nglobalThis.__pauseQA={audio,state,selectTrack,play,pause,recoverNativeAudio,prepareNativeAudio,audioDelivery,applyPlayerSurfaceMode,engine,offlineURLs,applyPreset,freeze:()=>{visual.paused=true;visual.setPaused=()=>{}},smartOff:()=>smartMode="off"};');
   await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[ext]||'application/octet-stream',body});
  }catch{await route.fulfill({status:404,body:''})}
 });
 await context.addInitScript(()=>{
  const session=navigator.mediaSession;if(!session)return;const original=session.setActionHandler.bind(session);globalThis.mediaActions={};
  session.setActionHandler=(name,handler)=>{mediaActions[name]=handler;original(name,handler)};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__pauseQA);
 await page.evaluate(()=>{
  __pauseQA.freeze();__pauseQA.smartOff();
  globalThis.sourceWrites=0;globalThis.loads=0;
  const a=__pauseQA.audio,descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
  Object.defineProperty(a,'src',{get(){return descriptor.get.call(a)},set(value){sourceWrites++;descriptor.set.call(a,value)},configurable:true});
  a.addEventListener('loadstart',()=>loads++);
  globalThis.qaTrack={id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA',source:'youtube',title:'Original AAC',artist:'GNARLY',duration:180};
  __pauseQA.selectTrack(qaTrack);
 });
 await page.waitForFunction(()=>!__pauseQA.audio.paused&&__pauseQA.state.audioState==='playing');
 const snapshot=()=>page.evaluate(()=>({time:__pauseQA.audio.currentTime,src:__pauseQA.audio.src,paused:__pauseQA.audio.paused,writes:sourceWrites,loads,attempt:__pauseQA.audioDelivery.attempt,track:__pauseQA.state.current.id,rate:__pauseQA.audio.playbackRate}));
 async function cycle(name,selector,keyboard=false){
  await page.evaluate(()=>{__pauseQA.audio.currentTime=43;__pauseQA.engine.setSpeed(1.25,false)});
  await page.waitForFunction(()=>!__pauseQA.audio.seeking);const before=await snapshot();
  if(keyboard==='media')await page.evaluate(()=>mediaActions.pause({}));
  else if(keyboard){await page.locator(selector).focus();await page.keyboard.press('Space')}else await page.locator(selector).click({force:true});
  await page.waitForFunction(()=>__pauseQA.audio.paused);const paused=await snapshot();
  await page.waitForTimeout(120);assert.ok(Math.abs((await snapshot()).time-paused.time)<.08);
  if(keyboard==='media')await page.evaluate(()=>mediaActions.play({}));
  else if(keyboard)await page.keyboard.press('Space');else await page.locator(selector).click({force:true});
  await page.waitForFunction(()=>!__pauseQA.audio.paused&&__pauseQA.state.audioState==='playing');const resumed=await snapshot();
  results.push({name,before,paused,resumed});console.log(JSON.stringify(results.at(-1)));
  assert.ok(paused.time>=before.time-.2&&paused.time<before.time+3,name+' pause must keep position');
  assert.ok(resumed.time>=paused.time-.2&&resumed.time<paused.time+3,name+' resume must keep position');
  assert.equal(resumed.src,before.src,name+' keeps source');assert.equal(resumed.writes,before.writes,name+' never reassigns src');
  assert.equal(resumed.loads,before.loads,name+' never reloads');assert.equal(resumed.attempt,before.attempt,name+' keeps retry identity');assert.equal(resumed.rate,1.25);
 }
 await cycle('cached edge source','#play-button');
 const prepared=await snapshot();await page.evaluate(()=>{__pauseQA.prepareNativeAudio(qaTrack);__pauseQA.prepareNativeAudio(qaTrack)});assert.equal((await snapshot()).writes,prepared.writes,'relative source preparation is idempotent');
 await cycle('MediaSession pause and play',null,'media');
 await cycle('repeated normal pause','#play-button');
 await cycle('keyboard on focused control','#play-button',true);
 await page.evaluate(()=>__pauseQA.applyPlayerSurfaceMode('ipod'));
 await cycle('iPod Play/Pause','#ipod-play-button');
 await cycle('iPod center','#ipod-center-button');
 // Recovered origin source must not be replaced by the initial edge URL on resume.
 await page.evaluate(async()=>{__pauseQA.audio.pause();__pauseQA.audioDelivery.attempt=1;__pauseQA.prepareNativeAudio(qaTrack,1);await __pauseQA.audio.play()});
 await page.waitForFunction(()=>!__pauseQA.audio.paused&&__pauseQA.audio.readyState>=2);
 await cycle('recovered origin retry source','#ipod-play-button');
 // A canceled recovery can finish AFTER a quick Pause/Play. Its late status
 // must not replace the successfully resumed player's state or source.
 const statusRequested=new Promise(resolve=>statusStarted=resolve);
 await page.evaluate(()=>{globalThis.oldRecovery=__pauseQA.recoverNativeAudio(qaTrack,{name:'NotSupportedError'})});await statusRequested;
 const healthy=await snapshot();await page.evaluate(async()=>{__pauseQA.pause();await __pauseQA.play()});releaseStatus();await page.evaluate(()=>oldRecovery);
 assert.equal(await page.evaluate(()=>__pauseQA.state.audioState),'playing');assert.equal((await snapshot()).writes,healthy.writes);assert.equal((await snapshot()).src,healthy.src);
 results.push({name:'stale recovery after quick Pause/Play',passed:true});
 // A new offline copy becomes available while listening. Resume keeps the
 // currently loaded healthy source; the copy is used on the next selection.
 await page.evaluate(data=>{__pauseQA.offlineURLs.set(qaTrack.id,URL.createObjectURL(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'audio/mp4'})))},media.toString('base64'));
 await cycle('offline copy promoted during listening','#ipod-center-button');
 await page.evaluate(()=>{__pauseQA.selectTrack({...qaTrack,id:'local-test',source:'local',url:__pauseQA.offlineURLs.get(qaTrack.id)})});
 await page.waitForFunction(()=>!__pauseQA.audio.paused&&__pauseQA.audio.readyState>=2);
 await context.setOffline(true);await cycle('local offline source','#ipod-play-button');
 assert.equal(await page.locator('audio').count(),1);assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'validation.json'),JSON.stringify({results,errors,scope:'Synthetic media under real canonical URLs; no provider traffic; not real-device Safari validation'},null,2));
}finally{await browser.close();await rm(temp,{recursive:true,force:true})}
