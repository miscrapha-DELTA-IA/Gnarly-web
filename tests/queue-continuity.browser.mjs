/** Native transport + Smart Queue integration. Synthetic audio, no provider traffic. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const out=process.env.QUEUE_ARTIFACT_DIR||'/tmp/gnarly-queue-continuity';
const baseline=process.env.QUEUE_BASELINE_REF||'';
await mkdir(out,{recursive:true});
const base='https://gnarly-web.miscrapha.workers.dev';
const tone=(seconds=12)=>{
 const rate=16000,frames=rate*seconds,buffer=Buffer.alloc(44+frames*2);
 buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
 buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);
 buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)buffer.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*330/rate)),44+i*2);
 return buffer;
};
const media=tone();
const song=(letter,artist='Queue Artist Alpha')=>({id:'youtube:'+letter.repeat(11),videoId:letter.repeat(11),source:'youtube',playbackAvailability:'r2',title:'Original fixture '+letter,artist,album:'Queue originals',duration:12,artwork:'/assets/gnarly-icon.png',metadataConfidence:100});
const A=song('A'),B=song('B'),C=song('C'),D=song('D'),E=song('E'),F=song('F'),G=song('G');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[],files=new Map();
async function source(file){
 if(!files.has(file))files.set(file,baseline?execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:8*1024*1024}):await readFile(path.join(root,file)));
 return files.get(file);
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function scenario(name,run){
 if(process.env.QUEUE_SCENARIO&&!name.includes(process.env.QUEUE_SCENARIO))return;
 const context=await browser.newContext({viewport:{width:1100,height:1000},serviceWorkers:'block'});
 const queries=[],requests=[],errors=[],gates=[];
 let search=()=>[],audioGate=null;
 const gate=()=>{const value=deferred();gates.push(value);return value};
 await context.addInitScript(()=>{
  const session=navigator.mediaSession;if(!session)return;
  const original=session.setActionHandler.bind(session);globalThis.mediaActions={};
  session.setActionHandler=(name,handler)=>{mediaActions[name]=handler;original(name,handler)};
 });
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  try{
   if(u.pathname.startsWith('/fast-audio/')||u.pathname==='/download'){
    const id=u.pathname.startsWith('/fast-audio/')?u.pathname.split('/').at(-1):new URL(u.searchParams.get('url')).searchParams.get('v');
    requests.push(id);if(audioGate)await audioGate(id);
    const range=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range||'');
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(media.length-1,Number(range[2])):media.length-1;
    const body=media.subarray(start,end+1),headers={'Content-Length':String(body.length),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'};
    if(range)headers['Content-Range']=`bytes ${start}-${end}/${media.length}`;
    return await route.fulfill({status:range?206:200,contentType:'audio/wav',body,headers});
   }
   if(u.pathname==='/api/omnibox'||u.pathname==='/api/r2-available'){
    // Smart Mix now uses only genuinely cached full audio, not YouTube
    // search metadata. Fixture canonical audio already resolves through
    // /fast-audio and models pre-confirmed edge R2 availability.
    const query=u.searchParams.get('term')||'';queries.push(query);
    const value=await search(query,queries.length);
    const payload=u.pathname==='/api/r2-available'?
     {status:'ok',results:value}:{results:value};
    return await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
   }
   if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/fast-prepare/'))
    return await route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});
   const file=u.pathname==='/'?'index.html':u.pathname.slice(1),ext=path.extname(file);
   let body=await source(file);
   if(file==='app.js')body=Buffer.from(body+`\nglobalThis.__queueQA={audio,state,selectTrack,next,previous,pause,play,maybeFillSmartQueue,setSmartMode,addToQueue,openSheet,closeSheet,handleCommand,updatePlayer,applyPlayerSurfaceMode,engine,externalSeek,listeningMemory,predict:candidates=>recommendTracks({mode:smartMode,anchor:state.current,candidates,existing:state.queue,history:state.history,memory:listeningMemory,max:7,revision:smartRevision}),get mode(){return smartMode},get pending(){return smartFillPending},get status(){return smartStatus}};globalThis.__queueTimings={actions:[],transitions:[]};const markQueueAction=trigger=>__queueTimings.actions.push({trigger,from:state.current?.id,at:performance.now()});document.querySelector('#next-button').addEventListener('click',()=>markQueueAction('next-click'),true);audio.addEventListener('ended',()=>markQueueAction('ended'),true);audio.addEventListener('playing',()=>{const action=__queueTimings.actions.at(-1);if(action&&!action.done&&action.from!==state.current?.id){action.done=true;__queueTimings.transitions.push({trigger:action.trigger,from:action.from,to:state.current?.id,ms:performance.now()-action.at})}},true);visual.stopLoop();visual.setPaused=()=>{};audio.muted=true;setSmartMode('off');`);
   return await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[ext]||'application/octet-stream',body});
  }catch(error){
   // A canceled old source/query is expected during rapid native navigation.
   if(!/closed|canceled|cancelled|already handled|aborted/i.test(error.message))
    await route.fulfill({status:404,body:''}).catch(()=>{});
  }
 });
 const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!globalThis.__queueQA);
  const selected=track=>page.waitForFunction(id=>__queueQA.state.current?.id===id&&!__queueQA.audio.paused&&__queueQA.audio.readyState>=2&&__queueQA.audio.currentTime>0&&__queueQA.state.audioState==='playing',track.id,{timeout:8000});
  const choose=async track=>{await page.evaluate(track=>__queueQA.selectTrack(track),track);await selected(track)};
  const snapshot=()=>page.evaluate(()=>({current:__queueQA.state.current?.id,queue:__queueQA.state.queue.map(t=>t.id),paused:__queueQA.audio.paused,playing:__queueQA.state.playing,time:__queueQA.audio.currentTime,duration:__queueQA.audio.duration,src:__queueQA.audio.currentSrc,error:__queueQA.state.playbackError,status:document.querySelector('#player-status').textContent,state:__queueQA.state.audioState,mode:__queueQA.mode,pending:__queueQA.pending,nextDisabled:document.querySelector('#next-button').disabled,ipodNextDisabled:document.querySelector('#ipod-next-button').disabled,mediaNext:typeof mediaActions.nexttrack}));
  await run({page,gate,queries,requests,choose,selected,snapshot,setSearch:fn=>search=fn,setAudioGate:fn=>audioGate=fn});
  assert.deepEqual(errors,[],'no uncaught browser errors');
  results.push({name,passed:true,queries,requests,snapshot:await snapshot(),timings:await page.evaluate(()=>__queueTimings.transitions)});
 }catch(error){results.push({name,passed:false,error:error.message,queries,requests,errors})}
 finally{for(const value of gates)value.resolve();await context.close()}
 console.log(JSON.stringify(results.at(-1)));
}
try{
 await scenario('empty smart queue retains Next on player, iPod and MediaSession',async({page,gate,setSearch,choose,snapshot})=>{
  const hold=gate();setSearch(async()=>{await hold.promise;return [B,C]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);
  const current=await snapshot();assert.equal(current.queue.length,0);
  assert.equal(current.nextDisabled,false);assert.equal(current.ipodNextDisabled,false);assert.equal(current.mediaNext,'function');
 });
 await scenario('natural completion continues through three smart songs',async({page,setSearch,choose,selected,snapshot})=>{
  setSearch(()=>[A,B,C]);await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);
  await page.waitForFunction(()=>__queueQA.state.queue.length>=2);
  const pending=(await snapshot()).queue;
  const expected=pending.map(id=>[B,C].find(t=>t.id===id));
  assert.ok(expected.every(Boolean));
  for(const next of expected){
   await page.evaluate(()=>{__queueQA.audio.currentTime=__queueQA.audio.duration-.06});
   await selected(next);
  }
  await page.waitForFunction(()=>!__queueQA.pending);
  const current=await snapshot();assert.equal(current.current,expected.at(-1).id);assert.deepEqual(current.queue,[],'the small fixture catalogue is exhausted instead of immediately replaying completed recordings');
 });
 await scenario('three rapid Next presses consume distinct items during initial loading',async({page,gate,setAudioGate,requests,selected,snapshot})=>{
  const hold=gate();setAudioGate(async id=>{if(id===A.videoId)await hold.promise});
  await page.evaluate(({A,B,C,D})=>{__queueQA.state.queue=[B,C,D];__queueQA.selectTrack(A)},{A,B,C,D});
  await page.waitForFunction(()=>__queueQA.state.current?.videoId==='AAAAAAAAAAA'&&__queueQA.state.audioState==='loading');
  await page.evaluate(()=>{const button=document.querySelector('#next-button');button.click();button.click();button.click()});
  hold.resolve();await selected(D);
  const current=await snapshot();assert.deepEqual(current.queue,[]);assert.equal(current.error,'');assert.ok(requests.includes(D.videoId));
 });
 await scenario('Previous preserves the interrupted song for the following Next',async({page,choose,selected,snapshot})=>{
  await choose(A);await page.evaluate(({B,C})=>{__queueQA.addToQueue(B,{quiet:true});__queueQA.addToQueue(C,{quiet:true});void __queueQA.next()},{B,C});await selected(B);
  await page.evaluate(()=>{__queueQA.audio.currentTime=.1;__queueQA.previous()});await selected(A);
  assert.deepEqual((await snapshot()).queue,[B.id,C.id]);
  await page.evaluate(()=>{void __queueQA.next()});await selected(B);assert.deepEqual((await snapshot()).queue,[C.id]);
 });
 await scenario('Pause during smart discovery prevents a late automatic selection',async({page,gate,setSearch,choose,queries,snapshot})=>{
  const hold=gate();setSearch(async()=>{await hold.promise;return [B,C]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);
  await page.waitForFunction(()=>__queueQA.pending);assert.ok(queries.length>=1);
  await page.evaluate(()=>{globalThis.pendingNext=__queueQA.next();__queueQA.pause()});hold.resolve();await page.evaluate(()=>pendingNext);
  const current=await snapshot();assert.equal(current.current,A.id);assert.equal(current.paused,true);assert.equal(queries.filter(q=>q.toLowerCase()==='queue artist alpha').length,1,'Next reuses an in-flight fill instead of issuing another catalogue request');
 });
 await scenario('clearing the queue cancels a pending Next before a fresh manual addition',async({page,gate,setSearch,choose,snapshot})=>{
  const hold=gate();setSearch(async()=>{await hold.promise;return [B,C]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>__queueQA.pending);
  await page.evaluate(track=>{globalThis.pendingNext=__queueQA.next();__queueQA.handleCommand('clear-queue');__queueQA.addToQueue(track,{quiet:true})},D);
  hold.resolve();await page.evaluate(()=>pendingNext);
  const current=await snapshot();assert.equal(current.current,A.id);assert.deepEqual(current.queue,[D.id]);assert.equal(current.error,'');
 });
 await scenario('stale native play, playing and error events cannot alter paused or healthy audio',async({page,choose,snapshot})=>{
  await choose(A);
  await page.evaluate(()=>{__queueQA.pause();__queueQA.audio.dispatchEvent(new Event('play'));__queueQA.audio.dispatchEvent(new Event('playing'))});
  let current=await snapshot();assert.equal(current.paused,true);assert.equal(current.playing,false);
  await choose(B);const before=await snapshot();
  await page.evaluate(()=>{if(__queueQA.audio.error!==null)throw Error('fixture should have no current MediaError');__queueQA.audio.dispatchEvent(new Event('error'))});
  await page.waitForTimeout(100);current=await snapshot();assert.equal(current.current,B.id);assert.equal(current.paused,false);assert.equal(current.playing,true);assert.equal(current.error,'');assert.equal(current.src,before.src);
 });
 await scenario('resume after a canceled refill preserves native source and prepares the next song',async({page,gate,setSearch,choose,selected,snapshot})=>{
  const hold=gate();setSearch(async()=>{await hold.promise;return [B,C]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>__queueQA.pending);
  await page.evaluate(()=>__queueQA.pause());const paused=await snapshot();assert.equal(paused.paused,true);
  setSearch(()=>[B,C]);hold.resolve();await page.evaluate(()=>__queueQA.play());await selected(A);
  await page.waitForFunction(()=>__queueQA.state.queue.length>=2);
  await page.waitForFunction(time=>__queueQA.audio.currentTime>time+.05,paused.time);
  const resumed=await snapshot();assert.equal(resumed.current,A.id);assert.equal(resumed.src,paused.src);assert.equal(resumed.error,'');
 });
 await scenario('a fast eligible affinity result never waits for a stalled primary catalogue',async({page,gate,setSearch,choose,selected,snapshot})=>{
  const primary=gate(),affinity=gate(),other={...B,artist:'Queue Artist Beta'};
  setSearch(async query=>{if(query.toLowerCase()==='queue artist beta'){await primary.promise;return [D]}if(query.toLowerCase()==='queue artist alpha'){await affinity.promise;return [C]}return []});
  await page.evaluate(track=>{__queueQA.listeningMemory.record('like',track);__queueQA.setSmartMode('mix')},A);await choose(other);await page.waitForFunction(()=>__queueQA.pending);
  await page.evaluate(()=>{globalThis.pendingNext=__queueQA.next()});affinity.resolve();
  await page.waitForFunction(id=>__queueQA.state.current?.id===id&&!__queueQA.audio.paused&&__queueQA.state.audioState==='playing',C.id,{timeout:2000});
  await page.evaluate(()=>pendingNext);assert.equal((await snapshot()).current,C.id);primary.resolve();
 });
 await scenario('two Next intents while discovery is pending consume two resolved candidates',async({page,gate,setSearch,choose,queries,selected,snapshot})=>{
  const hold=gate();setSearch(async()=>{await hold.promise;return [B,C,D]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>__queueQA.pending);
  await page.evaluate(()=>{globalThis.firstNext=__queueQA.next();globalThis.secondNext=__queueQA.next()});
  await page.waitForTimeout(80);assert.equal(queries.filter(q=>q.toLowerCase()==='queue artist alpha').length,1,'rapid Next reuses the pending anchor lookup');
  const expected=await page.evaluate(candidates=>__queueQA.predict(candidates).map(t=>t.id),[B,C,D]);assert.equal(expected.length,3);
  hold.resolve();await page.evaluate(()=>Promise.all([firstNext,secondNext]));await selected([B,C,D].find(t=>t.id===expected[1]));
  const current=await snapshot();assert.equal(current.current,expected[1]);assert.deepEqual(current.queue,expected.slice(2));assert.equal(current.error,'');
 });
 await scenario('new selection refills its own queue while an obsolete anchor is pending',async({page,gate,setSearch,choose,snapshot})=>{
  const old=gate(),other={...B,artist:'Queue Artist Beta'},otherNext={...D,artist:'Queue Artist Beta'};
  setSearch(async query=>{if(query==='Queue Artist Alpha'){await old.promise;return [C]}return query.toLowerCase()==='queue artist beta'?[otherNext]:[]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>__queueQA.pending);
  await choose(other);
  await page.waitForFunction(id=>__queueQA.state.queue.some(t=>t.id===id),D.id,{timeout:2000});old.resolve();
  await page.waitForTimeout(80);const current=await snapshot();assert.ok(current.queue.includes(D.id));assert.ok(!current.queue.includes(C.id));
 });
 await scenario('corrected artist metadata replaces a pending lookup on the same selected recording',async({page,gate,setSearch,choose,snapshot})=>{
  const old=gate(),correctNext={...D,artist:'Queue Artist Beta'};
  setSearch(async query=>{if(query==='Queue Artist Alpha'){await old.promise;return [C]}return query.toLowerCase()==='queue artist beta'?[correctNext]:[]});
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>__queueQA.pending);
  await page.evaluate(()=>{__queueQA.state.current.artist='Queue Artist Beta';void __queueQA.maybeFillSmartQueue()});
  await page.waitForFunction(id=>__queueQA.state.queue.some(t=>t.id===id),D.id,{timeout:2000});old.resolve();await page.waitForTimeout(80);
  const current=await snapshot();assert.equal(current.current,A.id);assert.ok(current.queue.includes(D.id));assert.ok(!current.queue.includes(C.id));assert.equal(current.error,'');
 });
 await scenario('temporary empty smart catalogue can be retried explicitly',async({page,setSearch,choose,snapshot})=>{
  let ready=false;setSearch(()=>ready?[B,C]:[]);
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>!__queueQA.pending);
  assert.deepEqual((await snapshot()).queue,[]);ready=true;
  await page.evaluate(()=>__queueQA.maybeFillSmartQueue({force:true}));assert.equal((await snapshot()).queue.length,2);
 });
 await scenario('temporary empty smart catalogue retries after its bounded cooldown',async({page,setSearch,choose,snapshot})=>{
  let ready=false;setSearch(()=>ready?[B,C]:[]);
  await page.evaluate(()=>__queueQA.setSmartMode('mix'));await choose(A);await page.waitForFunction(()=>!__queueQA.pending);
  assert.deepEqual((await snapshot()).queue,[]);ready=true;
  await page.evaluate(async()=>{const original=Date.now;Date.now=()=>original()+16000;try{await __queueQA.maybeFillSmartQueue()}finally{Date.now=original}});
  assert.equal((await snapshot()).queue.length,2);
 });
 await scenario('manual order, karaoke and MediaSession use the same queue transition',async({page,choose,selected,snapshot})=>{
  await choose(A);await page.evaluate(({B,C,D})=>{__queueQA.addToQueue(B,{quiet:true});__queueQA.addToQueue(C,{quiet:true});__queueQA.addToQueue(D,{quiet:true});__queueQA.openSheet('karaoke')},{B,C,D});
  assert.deepEqual((await snapshot()).queue,[B.id,C.id,D.id]);
  await page.evaluate(()=>mediaActions.nexttrack({}));await selected(B);assert.deepEqual((await snapshot()).queue,[C.id,D.id]);assert.equal(await page.evaluate(()=>__queueQA.state.sheet),'karaoke');
  await page.evaluate(()=>{__queueQA.closeSheet();__queueQA.applyPlayerSurfaceMode('ipod')});await page.locator('#ipod-next-button').click({force:true});await selected(C);assert.deepEqual((await snapshot()).queue,[D.id]);
 });
 await scenario('six native transitions provide local click/end latency samples',async({page,choose,selected,snapshot})=>{
  await choose(A);await page.evaluate(tracks=>{for(const track of tracks)__queueQA.addToQueue(track,{quiet:true})},[B,C,D,E,F,G]);
  for(const [index,track] of [B,C,D,E,F,G].entries()){
   if(index%2===0)await page.locator('#next-button').click();
   else await page.evaluate(()=>{__queueQA.audio.currentTime=__queueQA.audio.duration-.06});
   await selected(track);
  }
  assert.deepEqual((await snapshot()).queue,[]);
  const transitions=await page.evaluate(()=>__queueTimings.transitions);assert.equal(transitions.length,6);assert.ok(transitions.every(t=>Number.isFinite(t.ms)&&t.ms>=0));
 });
 const sample=results.find(result=>result.name==='six native transitions provide local click/end latency samples');
 const summarize=values=>{const sorted=values.slice().sort((a,b)=>a-b),quantile=p=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;return {samples:sorted.length,p50_ms:quantile(.5),p95_ms:quantile(.95)}};
 const timings=sample?.timings||[],performance={method:'Nearest-rank percentiles of six sequential actual Next button clicks or native ended events to the next native playing event. Same-origin finite PCM fixtures, no real provider/R2/network latency.',overall:summarize(timings.map(t=>t.ms)),next:summarize(timings.filter(t=>t.trigger==='next-click').map(t=>t.ms)),automatic:summarize(timings.filter(t=>t.trigger==='ended').map(t=>t.ms))};
 await writeFile(path.join(out,'validation.json'),JSON.stringify({baseline,results,performance,scope:'Real finite synthetic PCM through canonical native URLs; no provider requests; physical Safari/headphones not certified.'},null,2));
 if(!baseline)assert.equal(results.filter(result=>!result.passed).length,0,JSON.stringify(results.filter(result=>!result.passed),null,2));
}finally{await browser.close()}
