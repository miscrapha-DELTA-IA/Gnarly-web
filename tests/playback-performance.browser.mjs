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
   res.end(app+`\nglobalThis.__playerTest={selectTrack,next,play,pause,state,audio,engine,queueAudioWarmup,offlineURLs,openSheet,prepareUpcomingAudio,recoverNativeAudio,setDiscovery:fn=>{const old=maybeFillSmartQueue;maybeFillSmartQueue=fn;return old},setMode:value=>smartMode=value};`);return;
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
 let scenario='r2-hit',requests=0,originRequests=0;
 const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
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
 const song=id=>({source:'youtube',id:'youtube:'+id,videoId:id,title:'Fixture',artist:'Fixture',duration:12,metadataConfidence:100,album:'Fixture',artwork:'/assets/gnarly-icon.png'});
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
  __playerTest.state.queue=[track];
  if(typeof __mediaActions.nexttrack!=='function')throw Error('MediaSession next handler missing');
  __mediaActions.nexttrack();
 },song('OOOOOOOOOOO'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='OOOOOOOOOOO'&&__playerTest.state.audioState==='playing');
 // Ended transition stays native; seeking near end exercises real Range handling.
 await page.evaluate(track=>{__playerTest.state.queue=[track];__playerTest.audio.currentTime=11.85},song('IIIIIIIIIII'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='IIIIIIIIIII'&&__playerTest.state.audioState==='playing');
 // Pending smart discovery consumes every Next intent in order.
 await page.evaluate(async tracks=>{
  const api=__playerTest;api.setMode('mix');api.state.queue=[];
  let done;const waiting=new Promise(resolve=>done=resolve);
  const original=api.setDiscovery(()=>waiting);
  const a=api.next(),b=api.next(),c=api.next();
  api.state.queue=tracks;done();await Promise.all([a,b,c]);
  api.setDiscovery(original);api.setMode('off');
 },['KKKKKKKKKKK','LLLLLLLLLLL','MMMMMMMMMMM'].map(song));
 await page.waitForFunction(()=>__playerTest.state.audioState==='playing');
 if(!baseline)assert.equal(await page.evaluate(()=>__playerTest.state.current.videoId),'MMMMMMMMMMM');
 // Recovery for an old selection may not restart the new recording.
 await page.evaluate(track=>{
  const api=__playerTest;void api.recoverNativeAudio(api.state.current,new DOMException('fixture','NotSupportedError'));
  api.selectTrack(track);
 },song('NNNNNNNNNNN'));
 await page.waitForFunction(()=>__playerTest.state.current.videoId==='NNNNNNNNNNN'&&__playerTest.state.audioState==='playing');
 assert.equal(await page.evaluate(()=>__playerTest.state.playbackError),'');
 // Offline playback with every network request rejected.
 await page.evaluate(track=>{
  __playerTest.offlineURLs.set(track.id,URL.createObjectURL(__testAudioBlob));
 },song('JJJJJJJJJJJ'));
 await context.setOffline(true);await start(song('JJJJJJJJJJJ'));await context.setOffline(false);
 assert.deepEqual(errors,[]);
 report.regressions={rapidNext:true,karaoke:true,headphoneTransport:true,mediaSessionHandler:true,automaticEnd:true,offlineWithoutNetwork:true,resumeKeepsSource:!baseline,uncaughtErrors:errors.length};
 await context.close();
 console.log(JSON.stringify(report,null,2));
 if(process.env.REPORT_PATH)await writeFile(process.env.REPORT_PATH,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true})}
