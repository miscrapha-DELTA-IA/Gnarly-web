/** Real native-media integration with deterministic local edge/origin fixtures.
 * No provider traffic. Run BASELINE_REF=<git-ref> for a comparable older build.
 * Timings describe click-to-playing, NOT acoustic/device output latency.
 */
import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const baseline=process.env.BASELINE_REF;
const read=async file=>baseline&&['app.js','lib/playback-source.js','lib/queue-audio-warmup.js','lib/offline-library.js'].includes(file)
 ?execFileSync('git',['show',`${baseline}:${file}`],{cwd:root}).toString():readFile(path.join(root,file),'utf8');
const edgeCode=baseline?execFileSync('git',['show',`${baseline}:functions/fast-audio/[id].js`],{cwd:root}).toString():await read('functions/fast-audio/[id].js');
const {handleFastAudio}=await import('data:text/javascript;base64,'+Buffer.from(edgeCode).toString('base64'));
const temporary=await mkdtemp(path.join(tmpdir(),'gnarly-playback-'));
execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=12','-c:a','aac','-b:a','96k','-movflags','+faststart',path.join(temporary,'tone.m4a')]);
const bytes=await readFile(path.join(temporary,'tone.m4a'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=createServer(async(req,res)=>{
 try{
  let file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(file==='app.js'){
   const app=await read(file);
   res.setHeader('Content-Type','text/javascript');
   res.end(app+`\nglobalThis.__playerTest={selectTrack,next,previous,play,pause,handleCommand,addToQueue,fillSmartQueue:options=>maybeFillSmartQueue(options),updatePlayer,resetNavigation:()=>{playbackBackstack.length=0},setStartupTimeout:value=>playbackStartTimeoutMs=value,state,audio,engine,queueAudioWarmup,offlineURLs,openSheet,closeSheet,prepareUpcomingAudio,recoverNativeAudio,syncSystemPlayback,setDiscovery:fn=>{const old=maybeFillSmartQueue;maybeFillSmartQueue=fn;return old},setMode:value=>smartMode=value};`);return;
  }
  if(file==='lib/playback-source.js'){
   res.setHeader('Content-Type','text/javascript');
   res.end((await read(file)).replaceAll('isGnarlyPagesHost(globalThis.location?.hostname)','true'));return;
  }
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.end(await readFile(path.join(root,file)));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browserType=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true,...(process.env.CHROMIUM_PATH&&browserType===chromium?{executablePath:process.env.CHROMIUM_PATH}:{}),args:browserType===chromium?['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const report={baseline:baseline||null,browser:browserType.name(),fixture:'synthetic AAC; simulated edge/origin latency; no provider',scenarios:{}};
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addInitScript(()=>{
  globalThis.__mediaActions={};
  if(navigator.mediaSession){
   const set=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
   navigator.mediaSession.setActionHandler=(name,handler)=>{__mediaActions[name]=handler;set(name,handler)};
  }
 });
 let scenario='r2-hit',requests=0,originRequests=0,recommendationGate=null,recommendationRequests=0;
 const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base&&url.pathname==='/api/omnibox'&&recommendationGate){
   recommendationRequests++;const gate=recommendationGate;await gate.promise;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:gate.results})});return;
  }
  if(url.hostname==='nightcorelab.onrender.com'&&url.pathname==='/download'){
   requests++;originRequests++;
   await route.fulfill({status:200,contentType:'audio/mp4',body:bytes});return;
  }
  if(url.pathname.startsWith('/fast-audio/')){
   requests++;
   const range=route.request().headers()['range'];
   const bucket={async get(key,options){
    if(!['r2-hit','prepared-next','resume'].includes(scenario))return null;
    await delay(15);
    const match=/bytes=(\d+)-(\d*)/.exec(range||'');
    const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
    return {size:bytes.length,httpEtag:'"fixture"',body:new Blob([bytes.subarray(start,end+1)]).stream(),...(range?{range:{offset:start,length:end-start+1}}:{})};
   }};
   const result=await handleFastAudio({request:new Request(url,{headers:range?{Range:range}:{}}),env:{GNARLY_AUDIO_R2:bucket},params:{id:url.pathname.split('/').pop()}},async origin=>{
    originRequests++;
    if(scenario==='stalled-source')await delay(1200);
    if(scenario==='network-recovery')throw Error('synthetic network interruption');
    if(scenario==='low-bandwidth')await delay(bytes.length/65536*1000);
    await delay(scenario==='high-latency'?250:scenario==='cold-fallback'?120:90);
    if(origin.includes('/stream')&&scenario==='cold-fallback')return new Response('Unavailable',{status:415});
    return new Response(bytes,{headers:{'Content-Type':'audio/mp4','Content-Length':String(bytes.length)}});
   });
   await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});return;
  }
  if(url.pathname.startsWith('/fast-prepare/')){await route.fulfill({status:200,contentType:'application/json',body:'{"status":"cached"}'});return}
  if(url.origin!==base||url.pathname.startsWith('/api/')){
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[],lines:[],plainLines:[]})});return;
  }
  await route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>!!globalThis.__playerTest);
 await page.evaluate(data=>{
  __playerTest.setMode('off');globalThis.__testAudioBlob=new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'audio/mp4'});
 },bytes.toString('base64'));
 const song=id=>({source:'youtube',id:'youtube:'+id,videoId:id,title:'Fixture '+id,artist:'Fixture',duration:12,metadataConfidence:100,album:'Fixture',artwork:'/assets/gnarly-icon.png'});
 async function start(track,action='select'){
  return page.evaluate(async({track,action})=>{
   const api=__playerTest,a=api.audio;
   const started=performance.now();
   const playing=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{a.removeEventListener('playing',ready);reject(Error('Playback deadline '+JSON.stringify({src:a.currentSrc,error:a.error?.code,paused:a.paused,ready:a.readyState,state:api.state.audioState,status:api.state.playbackError})))},10000);
    function ready(){clearTimeout(timer);resolve(performance.now()-started)}
    a.addEventListener('playing',ready,{once:true});
   });
   if(action==='next')void api.next();else if(action==='resume')void api.play();else api.selectTrack(track);
   const ms=await playing;
   const entry=performance.getEntriesByName(a.currentSrc).at(-1);
   return {playingMs:ms,firstByteMs:entry?.responseStart>=started?entry.responseStart-started:null};
  },{track,action});
 }
 for(const [scenarioIndex,name] of ['offline','r2-hit','prepared-next','cold-progressive','cold-fallback','high-latency','resume'].entries()){
  console.error('Scenario',name);scenario=name;requests=0;originRequests=0;const samples=[];
  const iterations=Number(process.env.SAMPLES)||20;
  for(let i=0;i<iterations;i++){
   const track=song(String(scenarioIndex).padStart(2,'S')+String(i).padStart(9,'A'));
   if(name==='offline')await page.evaluate(track=>{
    __playerTest.offlineURLs.set(track.id,URL.createObjectURL(__testAudioBlob));
   },track);
   if(name==='prepared-next')await page.evaluate(track=>{__playerTest.state.queue=[track]},track);
   if(name==='resume'){
    await start(track);await page.evaluate(()=>__playerTest.pause());
   }
   samples.push(await start(track,name==='prepared-next'?'next':name==='resume'?'resume':'select'));
   await page.evaluate(()=>__playerTest.pause());
  }
  if(name==='offline')assert.equal(requests,0);else assert.ok(requests>=iterations,'Each scenario must exercise its actual media path');
  if(name.startsWith('cold-')||name==='high-latency')assert.ok(originRequests>=iterations);
  const times=samples.map(x=>x.playingMs).sort((a,b)=>a-b);
  const pct=p=>Math.round(times[Math.ceil(times.length*p)-1]*10)/10;
  report.scenarios[name]={samples:samples.length,p50:pct(.5),p95:pct(.95),p99:pct(.99),mediaRequests:requests,originRequests,firstByteSamples:samples.filter(x=>x.firstByteMs!==null).length,firstByteP50:(values=>values.length?Math.round(values.sort((a,b)=>a-b)[Math.ceil(values.length*.5)-1]*10)/10:null)(samples.map(x=>x.firstByteMs).filter(x=>x!==null))};
 }
 // Rapid Next before earlier play promises resolve, with Karaoke visible.
 scenario='cold-progressive';
 await page.evaluate(tracks=>{
  const api=__playerTest;api.state.queue=tracks.slice(1);api.openSheet('karaoke');
  api.selectTrack(tracks[0]);void api.next();void api.next();void api.next();
 },['BBBBBBBBBBB','CCCCCCCCCCC','DDDDDDDDDDD','EEEEEEEEEEE','FFFFFFFFFFF'].map(song));
 await page.waitForFunction(()=>__playerTest.state.audioState==='playing');
 assert.equal(await page.evaluate(()=>__playerTest.state.current.videoId),'EEEEEEEEEEE');
 assert.deepEqual(await page.evaluate(()=>__playerTest.state.queue.map(x=>x.videoId)),['FFFFFFFFFFF']);
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 // Resume must preserve the attached source and buffered resource.
 scenario='r2-hit';await start(song('GGGGGGGGGGG'));await page.evaluate(()=>__playerTest.pause());
 const before=requests;await start(null,'resume');
 if(!baseline)assert.equal(requests,before,'Resume must not reload the relative edge URL');
 // Headphone keyboard transport uses the same queue transaction as Next.
 await page.evaluate(track=>{__playerTest.state.queue=[track]},song('HHHHHHHHHHH'));
 await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'MediaTrackNext',bubbles:true})));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='HHHHHHHHHHH'&&__playerTest.state.audioState==='playing');
 // Exercise the handlers registered with the real MediaSession API.
 await page.evaluate(track=>{
  __playerTest.state.queue=[track];__playerTest.syncSystemPlayback(true);
  if(typeof __mediaActions.nexttrack!=='function')throw Error('MediaSession next handler missing');
  __mediaActions.nexttrack();
 },song('OOOOOOOOOOO'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='OOOOOOOOOOO'&&__playerTest.state.audioState==='playing');
 // Ended transition stays native; seeking near end exercises real Range handling.
 await page.evaluate(track=>{__playerTest.state.queue=[track];__playerTest.audio.currentTime=11.85},song('IIIIIIIIIII'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='IIIIIIIIIII'&&__playerTest.state.audioState==='playing');
 // A failed initial media request recovers the same ID via the native fallback.
 scenario='network-recovery';await start(song('PPPPPPPPPPP'));
 assert.equal(await page.evaluate(()=>__playerTest.state.current.videoId),'PPPPPPPPPPP');
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 // Low-bandwidth fixture: impose a 64KiB/s-equivalent complete-body transfer cost.
 // This verifies a slow startup survives; it is not sustained streaming throughput.
 scenario='low-bandwidth';await start(song('QQQQQQQQQQQ'));
 assert.equal(await page.evaluate(()=>__playerTest.state.audioState),'playing');
 // Pending smart discovery consumes every Next intent in order.
 await page.evaluate(async({tracks,baseline})=>{
  const api=__playerTest;api.setMode('mix');api.state.queue=[];api.syncSystemPlayback(true);
  let done;const waiting=new Promise(resolve=>done=resolve);
  const original=api.setDiscovery(()=>waiting);
  const a=baseline?api.next():__mediaActions.nexttrack(),b=api.next(),c=api.next();
  api.state.queue=tracks;done();await Promise.all([a,b,c]);
  api.setDiscovery(original);api.setMode('off');
 },{tracks:['KKKKKKKKKKK','LLLLLLLLLLL','MMMMMMMMMMM'].map(song),baseline:!!baseline});
 await page.waitForFunction(()=>__playerTest.state.audioState==='playing');
 if(!baseline)assert.equal(await page.evaluate(()=>__playerTest.state.current.videoId),'MMMMMMMMMMM');
 // Recovery for an old selection may not restart the new recording.
 await page.evaluate(track=>{
  const api=__playerTest;void api.recoverNativeAudio(api.state.current,new DOMException('fixture','NotSupportedError'));
  api.selectTrack(track);
 },song('NNNNNNNNNNN'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='NNNNNNNNNNN'&&__playerTest.state.audioState==='playing');
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 // Late errors whose MediaError was cleared by a source swap are stale.
 if(!baseline){
  await page.evaluate(()=>__playerTest.audio.dispatchEvent(new Event('error')));
  assert.equal(await page.evaluate(()=>__playerTest.state.playing),true);
 }
 // Previous restores the interrupted recording as the immediate next song.
 scenario='r2-hit';
 await page.evaluate(()=>{__playerTest.closeSheet();__playerTest.resetNavigation();__playerTest.state.queue=[]});
 await start(song('NAVAAAAAAAA'));
 await page.evaluate(tracks=>{__playerTest.state.queue=tracks;void __playerTest.next()},[song('NAVBBBBBBBB'),song('NAVCCCCCCCC')]);
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='NAVBBBBBBBB'&&__playerTest.state.audioState==='playing');
 await page.evaluate(()=>{__playerTest.audio.currentTime=0});
 await page.click('#previous-button',{force:true});
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='NAVAAAAAAAA'&&__playerTest.state.audioState==='playing');
 assert.deepEqual(await page.evaluate(()=>__playerTest.state.queue.map(x=>x.videoId)),['NAVBBBBBBBB','NAVCCCCCCCC']);
 await page.click('#next-button',{force:true});
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='NAVBBBBBBBB'&&__playerTest.state.audioState==='playing');
 // Rapid alternating transport commands while the old media is still loading.
 scenario='high-latency';
 await page.evaluate(tracks=>{
  const api=__playerTest;api.resetNavigation();api.state.queue=tracks.slice(1);api.selectTrack(tracks[0]);
  for(const id of ['next-button','ipod-next-button','previous-button','next-button','ipod-previous-button'])document.getElementById(id).click();
 },['RAPAAAAAAAA','RAPBBBBBBBB','RAPCCCCCCCC','RAPDDDDDDDD'].map(song));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='RAPBBBBBBBB'&&__playerTest.state.audioState==='playing');
 assert.deepEqual(await page.evaluate(()=>__playerTest.state.queue.map(x=>x.videoId)),['RAPCCCCCCCC','RAPDDDDDDDD']);
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 // Play/Pause in the queue controls this recording; it never consumes Next.
 await page.evaluate(()=>__playerTest.openSheet('queue'));
 const selected=await page.evaluate(()=>__playerTest.state.current.videoId);
 await page.locator('[data-command="queue-play"]').click();
 assert.equal(await page.evaluate(()=>__playerTest.audio.paused),true);
 await page.locator('[data-command="queue-play"]').click();
 await page.waitForFunction(()=>!__playerTest.audio.paused&&__playerTest.state.audioState==='playing');
 assert.equal(await page.evaluate(()=>__playerTest.state.current.videoId),selected);
 assert.equal(await page.locator('#toast').count(),0);
 const feedback=page.locator('#action-feedback');
 await page.evaluate(()=>__playerTest.handleCommand('queue-shuffle'));
 assert.equal(await feedback.evaluate(el=>getComputedStyle(el).clipPath),'inset(50%)');
 await page.locator('#close-sheet').click();
 // Search selection removes an already queued copy, and explicit choices
 // go before suggestions rather than disappearing behind the automatic tail.
 await page.evaluate(tracks=>{
  const api=__playerTest;api.state.queue=[tracks[0],tracks[1]];api.selectTrack(tracks[0]);
 },['DUPAAAAAAAA','DUPBBBBBBBB'].map(song));
 await page.waitForFunction(()=>__playerTest.state.audioState==='playing');
 assert.deepEqual(await page.evaluate(()=>__playerTest.state.queue.map(x=>x.videoId)),['DUPBBBBBBBB']);
 await page.evaluate(tracks=>{
  const api=__playerTest;api.state.queue=tracks.slice(0,2).map(x=>({...x,_gnarlyAutoMode:'mix'}));
  api.addToQueue(tracks[2]);api.addToQueue(tracks[1]);
 },['MANAAAAAAAA','MANBBBBBBBB','MANCCCCCCCC'].map(song));
 assert.deepEqual(await page.evaluate(()=>__playerTest.state.queue.map(x=>x.videoId)),['MANCCCCCCCC','MANBBBBBBBB','MANAAAAAAAA']);
 await page.evaluate(()=>{__playerTest.setMode('mix');__playerTest.state.queue=[];__playerTest.updatePlayer()});
 assert.equal(await page.locator('#next-button').isDisabled(),false);
 assert.equal(await page.locator('#ipod-next-button').isDisabled(),false);
 await page.evaluate(()=>__playerTest.setMode('off'));
 // Old same-track play failures after Pause/Play cannot restart the resumed source.
 scenario='r2-hit';
 await page.evaluate(track=>{
  const api=__playerTest,original=api.audio.play.bind(api.audio);let first=true;
  globalThis.__restoreNativePlay=()=>{api.audio.play=original};
  api.audio.play=()=>{
   const playing=original();
   if(!first)return playing;
   first=false;playing?.catch(()=>{});
   return new Promise((_,reject)=>globalThis.__rejectOldPlay=reject);
  };
  api.selectTrack(track);api.pause();void api.play();
 },song('SAMESONGAAA'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='SAMESONGAAA'&&__playerTest.state.audioState==='playing');
 const beforeStaleFailure=requests;
 await page.evaluate(()=>{__rejectOldPlay(new DOMException('Obsolete source','NotSupportedError'));__restoreNativePlay()});
 await delay(700);
 assert.equal(requests,beforeStaleFailure);
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 // A silent hanging initial request falls back within a bounded startup wait.
 scenario='stalled-source';
 await page.evaluate(()=>__playerTest.setStartupTimeout(400));
 await start(song('TIMEOUTAAAA'));
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 await page.evaluate(()=>__playerTest.setStartupTimeout(30000));
 // Empty-queue Next reuses the real recommendation operation already running.
 scenario='r2-hit';let release;
 recommendationGate={promise:new Promise(resolve=>release=resolve),results:['RECBBBBBBBB','RECCCCCCCCC','RECDDDDDDDD'].map(song)};
 recommendationRequests=0;
 const discoveryStart=await page.evaluate(()=>__playerTest.state.current.id);
 await page.evaluate(()=>{
  const api=__playerTest;api.setMode('mix');api.state.queue=[];
  void api.fillSmartQueue({force:true});void api.next();
 });
 await page.waitForFunction(()=>document.querySelector('#player-status').textContent.includes('Buscando'));
 await delay(100);assert.equal(recommendationRequests,1);
 release();
 await page.waitForFunction(id=>__playerTest.state.current.id!==id&&__playerTest.state.audioState==='playing',discoveryStart);
 assert.equal(recommendationRequests,1);
 recommendationGate=null;await page.evaluate(()=>__playerTest.setMode('off'));
 // Pause/Resume cancels an old discovery intent even on the same recording.
 const resumedId=await page.evaluate(async track=>{
  const api=__playerTest,selected=api.state.current.id;api.setMode('mix');api.state.queue=[];
  let release;const waiting=new Promise(resolve=>release=resolve);
  const original=api.setDiscovery(()=>waiting),next=api.next();
  api.pause();void api.play();api.state.queue=[track];release();await next;
  api.setDiscovery(original);api.setMode('off');return selected;
 },song('PAUSEAAAAAA'));
 await page.waitForFunction(()=>__playerTest.state.audioState==='playing');
 assert.equal(await page.evaluate(()=>__playerTest.state.current.id),resumedId);
 // Offline playback with every network request rejected.
 await page.evaluate(track=>{
  __playerTest.offlineURLs.set(track.id,URL.createObjectURL(__testAudioBlob));
 },song('JJJJJJJJJJJ'));
 await context.setOffline(true);await start(song('JJJJJJJJJJJ'));await context.setOffline(false);
 assert.deepEqual(errors,[]);
 report.regressions={rapidNext:true,karaoke:true,headphoneTransport:true,mediaSessionHandler:true,networkRecovery:true,lowBandwidthStartup:true,automaticEnd:true,offlineWithoutNetwork:true,resumeKeepsSource:!baseline,backForward:true,rapidAlternatingNavigation:true,queuePlayPause:true,noBalloons:true,sameTrackCancellation:true,startupWatchdog:true,sharedQueueDiscovery:true,discoveryPauseCancellation:true,uncaughtErrors:errors.length};
 await context.close();
 console.log(JSON.stringify(report,null,2));
 if(process.env.REPORT_PATH)await writeFile(process.env.REPORT_PATH,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true})}
