/** Search recovery and playback continuity under real native fixture audio. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const out=process.env.RELIABILITY_ARTIFACT_DIR||'/tmp/gnarly-reliability-search';
await mkdir(out,{recursive:true});
const origin='https://gnarly.test';
const count=new Map(),cases=[],errors=[],mediaRequests=[];
let failedRecovered=false,emptyRecovered=false,releaseOld=null,releaseSubmit=null,oldStartedResolve,submitStartedResolve;
const oldStarted=new Promise(resolve=>oldStartedResolve=resolve);
const submitStarted=new Promise(resolve=>submitStartedResolve=resolve);
let releasePagingApple,releasePagingNative;
const pagingApple=new Promise(resolve=>releasePagingApple=resolve);
const pagingNative=new Promise(resolve=>releasePagingNative=resolve);
const nativePage=(start,size)=>Array.from({length:size},(_,i)=>{
 const index=start+i,videoId='NN'+String(index).padStart(9,'0');
 return{id:'youtube:'+videoId,videoId,source:'youtube',artist:'GNARLY Reliability',duration:30,
  title:index<20?'Native paging first '+index:'Retained native page two '+index};
});
const previewPage=(start,size)=>Array.from({length:size},(_,i)=>{
 const index=start+i;return{trackId:7000+index,artistName:'GNARLY Reliability',
  trackName:index<22?'Preview paging first '+index:'Retained preview page two '+index,
  previewUrl:origin+'/fixture-preview.wav',trackTimeMillis:180000};
});
const track=(suffix,title)=>({id:'youtube:'+('Q'.repeat(10)+suffix),videoId:'Q'.repeat(10)+suffix,
 title,artist:'GNARLY Reliability',source:'youtube',duration:30,album:'Original browser fixtures'});
const preview={trackId:6001,trackName:'Authorized preview fixture',artistName:'GNARLY Reliability',
 previewUrl:origin+'/fixture-preview.wav',trackTimeMillis:180000};
function originalWave(){
 const rate=16000,frames=rate*30,bytes=Buffer.alloc(44+frames*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
 bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(4500*Math.sin(i*2*Math.PI*330/rate)),44+i*2);
 return bytes;
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
 args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),term=url.searchParams.get('term')||'',native=url.pathname==='/api/omnibox',catalog=url.pathname==='/api/catalog'||url.hostname==='itunes.apple.com';
  if(/^\/(?:fast-audio|download|stream)(?:\/|$)/.test(url.pathname))mediaRequests.push(url.href);
  if(native||catalog){
   const key=(native?'native:':'catalog:')+term;count.set(key,(count.get(key)||0)+1);
   // Mock catalogue records must actually match the typed query. The real
   // official-song filter rejects unrelated records, even when the ID is valid.
   // Preserve fixture titles for pagination and source-continuity assertions.
   const json=(data,status=200)=>{
    const relevant=Array.isArray(data?.results)?{...data,results:data.results.map(item=>
     native?{...item,artist:term+' · '+(item.artist||'GNARLY Reliability')}:
     {...item,artistName:term+' · '+(item.artistName||'GNARLY Reliability')})}:data;
    return route.fulfill({status,contentType:'application/json',
     headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(relevant)}).catch(()=>{});
   };
   if(term==='retry failure test'){
    if(!failedRecovered)return json({error:'Temporary provider failure'},503);
    return json({results:native?[track('A','Recovered full song')]:[]});
   }
   if(term==='retry empty test')return json({results:native&&emptyRecovered?[track('B','Recovered empty search')]:[]});
   if(term==='old delayed test'&&native){oldStartedResolve();await new Promise(resolve=>releaseOld=resolve);return json({results:[track('C','Obsolete old search')]})}
   if(term==='latest search test')return json({results:native?[track('D','Latest full song')]:[]});
   if(term==='submit once test'){if(native){submitStartedResolve();await new Promise(resolve=>releaseSubmit=resolve)}return json({results:native?[track('E','Single submitted song')]:[]})}
   if(term==='native paging delayed apple'){
    if(!native){await pagingApple;return json({results:[]})}
    return json({results:Number(url.searchParams.get('offset'))===20?nativePage(20,3):nativePage(0,20)});
   }
   if(term==='vsprunique782'){
    if(native){await pagingNative;return json({results:[]})}
    return json({results:Number(url.searchParams.get('offset'))===22?previewPage(22,3):previewPage(0,22)});
   }
   if(term==='preview fallback test')return native?json({error:'Native search temporarily unavailable'},503):json({results:[preview]});
   return json({results:[]});
  }
  if(url.pathname==='/fixture-preview.wav')return route.fulfill({contentType:'audio/wav',body:originalWave()});
  if(url.origin!==origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/fast-'))return route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});
  try{
   const file=url.pathname==='/'?'index.html':url.pathname.slice(1),ext=path.extname(file);let body=await readFile(path.join(root,file));
   // Negative regression probe: reproduce only the former pagination merge.
   if(file==='app.js'&&process.env.RELIABILITY_OMIT_PAGING_STATE==='1')body=Buffer.from(body.toString().replace('p.native.push(...songs);','').replace('p.previews.push(...previews);',''));
   if(file==='app.js')body=Buffer.from(body+"\nglobalThis.__reliabilityQA={state,audio,offlineLibrary,get offlineLoaded(){return offlineLoaded},get search(){return searchPaging},freeze(){visual.stopLoop();visual.renderFrame(8);smartMode='off'}};");
   return route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[ext]||'application/octet-stream',body});
  }catch{return route.fulfill({status:404,body:''})}
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__reliabilityQA);
 await page.evaluate(()=>{__reliabilityQA.freeze();__reliabilityQA.audio.muted=true});
 await page.locator('#audio-import').setInputFiles({name:'Original continuity fixture.wav',mimeType:'audio/wav',buffer:originalWave()});
 await page.waitForFunction(()=>!!__reliabilityQA.state.current&&!__reliabilityQA.audio.paused&&Number.isFinite(__reliabilityQA.audio.duration)&&__reliabilityQA.audio.currentTime>.05);
 const before=await page.evaluate(()=>{
  globalThis.searchPauseEvents=0;__reliabilityQA.audio.addEventListener('pause',()=>searchPauseEvents++);
  const a=__reliabilityQA.audio;return{src:a.currentSrc,time:a.currentTime,at:performance.now(),rate:a.playbackRate};
 });
 await page.locator('#omnibox-toggle').click();
 const submit=async term=>{await page.locator('#search-term').fill(term);await page.locator('#search-form').evaluate(form=>form.requestSubmit())};
 const settled=()=>page.waitForFunction(()=>{const p=__reliabilityQA.search;return !!p?.started&&p.nativeFinished&&p.previewFinished});
 const rows=()=>page.locator('#search-results .media-item');
 // Genuine total provider failure must expose a useful status and permit a
 // same-query explicit retry. Neither provider failure becomes an empty success.
 await submit('retry failure test');await settled();
 const failedStatus=await page.locator('#search-state').innerText();assert.match(failedStatus,/não foi possível|indisponível|tente novamente/i);
 const failedCount=count.get('native:retry failure test')||0;failedRecovered=true;
 await page.locator('#search-form button[type="submit"]').click();
 await page.waitForFunction(()=>__reliabilityQA.state.searchResults.some(t=>t.title==='Recovered full song'));
 assert.equal((count.get('native:retry failure test')||0)-failedCount,1,'one explicit retry after temporary provider failure');
 assert.ok((await rows().allTextContents()).some(text=>text.includes('Recovered full song')));
 cases.push({name:'same-query retry after provider failure',status:failedStatus,requests:count.get('native:retry failure test')});
 // A legitimately empty catalogue is not a permanent state either.
 await submit('retry empty test');await settled();assert.equal(await rows().count(),0);
 const emptyCount=count.get('native:retry empty test')||0;emptyRecovered=true;
 await page.locator('#search-form button[type="submit"]').click();
 await page.waitForFunction(()=>__reliabilityQA.state.searchResults.some(t=>t.title==='Recovered empty search'));
 assert.equal((count.get('native:retry empty test')||0)-emptyCount,1);
 cases.push({name:'same-query retry after empty response',requests:count.get('native:retry empty test')});
 // Canceled old responses cannot overwrite newer visible search results.
 await submit('old delayed test');await oldStarted;
 await submit('latest search test');await page.waitForFunction(()=>__reliabilityQA.state.searchResults.some(t=>t.title==='Latest full song'));
 releaseOld();await page.waitForTimeout(100);
 assert.ok((await rows().allTextContents()).some(text=>text.includes('Latest full song')));
 assert.equal(await page.getByText('Obsolete old search',{exact:true}).count(),0);
 cases.push({name:'obsolete response after newer query',passed:true});
 // Submitting an input whose debounce has not fired starts one request. Pressing
 // Enter during an in-flight successful query must not add another lookup.
 await submit('submit once test');await submitStarted;
 await page.locator('#search-form').evaluate(form=>form.requestSubmit());
 assert.equal(count.get('native:submit once test'),1,'in-flight query reuses its request');
 releaseSubmit();await settled();await page.waitForTimeout(260);
 assert.equal(count.get('native:submit once test'),1,'submitting live/in-flight query is deduplicated');
 cases.push({name:'submit-before-debounce deduplication',requests:count.get('native:submit once test')});
 // A native outage must still display genuine preview results with their source
 // intact, rather than promoting them to full-length recordings.
 await submit('preview fallback test');await settled();
 assert.ok((await rows().allTextContents()).some(text=>text.includes('Authorized preview fixture')));
 assert.equal(await page.evaluate(()=>__reliabilityQA.state.searchResults.find(t=>t.title==='Authorized preview fixture')?.source),'preview');
 cases.push({name:'preview fallback remains a preview',passed:true});
 const after=await page.evaluate(()=>{const a=__reliabilityQA.audio;return{src:a.currentSrc,time:a.currentTime,at:performance.now(),paused:a.paused,pauseEvents:searchPauseEvents}});
 assert.equal(after.src,before.src);assert.equal(after.paused,false);assert.equal(after.pauseEvents,0,'search recovery never pauses native playback');
 assert.ok(Math.abs((after.time-before.time)-(after.at-before.at)/1000*before.rate)<.6,'search does not reset or seek native source clock');
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'mobile-recovered-search.png'),animations:'disabled'});
 // Initial provider responses may finish after another provider has already
 // fetched later pages. Rebuilding a merged list must preserve those pages.
 // Keep these timing cases outside the native playback clock measurement.
 await submit('native paging delayed apple');
 await page.waitForFunction(()=>{const p=__reliabilityQA.search;return p?.query==='native paging delayed apple'&&p.nativeOffset===20&&!p.previewFinished});
 await page.locator('#search-more').evaluate(button=>button.click());
 await page.waitForFunction(()=>__reliabilityQA.state.searchResults.some(t=>t.title==='Retained native page two 22'));
 assert.equal(await rows().count(),23);
 releasePagingApple();await settled();
 assert.equal(await rows().count(),23,'late Apple initial response retains native page two');
 assert.ok((await rows().allTextContents()).some(text=>text.includes('Retained native page two 22')));
 cases.push({name:'native paginated rows survive delayed Apple initial response',rows:23});
 await submit('vsprunique782');
 await page.waitForFunction(()=>{const p=__reliabilityQA.search;return p?.query==='vsprunique782'&&p.previewOffset===22&&!p.nativeFinished});
 // While native YT Music is pending, never briefly populate the primary
 // search list with Apple's short previews. Only expose these after the
 // native catalogue settles without full songs.
 assert.equal(await rows().count(),0,'official preview fallback must not flash before YT Music finishes');
 releasePagingNative();await settled();
 await page.waitForFunction(()=>__reliabilityQA.state.searchResults.some(t=>t.title==='Preview paging first 0'));
 assert.equal(await rows().count(),22);
 await page.locator('#search-more').evaluate(button=>button.click());
 await page.waitForFunction(()=>__reliabilityQA.state.searchResults.some(t=>t.title==='Retained preview page two 24'));
 assert.equal(await rows().count(),25);
 assert.ok((await rows().allTextContents()).some(text=>text.includes('Retained preview page two 24')));
 assert.equal(await page.evaluate(()=>__reliabilityQA.state.searchResults.filter(t=>t.title.startsWith('Retained preview page two')).every(t=>t.source==='preview')),true);
 cases.push({name:'preview pagination begins only after native provider settles',rows:25});
 // Empty MIME files are valid when their extension identifies supported audio.
 // Verify durable storage and a fresh app load, then select the restored song
 // through the real library while the browser reports no network connection.
 await page.locator('#audio-import').evaluate(el=>el.addEventListener('change',event=>globalThis.importedEmptyMIME=event.target.files[0]?.type,{capture:true,once:true}));
 // Playwright's file picker infers MIME from the extension when the value is
 // empty, so create the actual browser File with an explicitly empty type.
 await page.locator('#audio-import').evaluate((el,base64)=>{
  const file=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'Empty MIME persisted.wav',{type:''});
  const files=new DataTransfer();files.items.add(file);el.files=files.files;el.dispatchEvent(new Event('change',{bubbles:true}));
 },originalWave().toString('base64'));
 assert.equal(await page.evaluate(()=>globalThis.importedEmptyMIME),'');
 await page.waitForFunction(()=>__reliabilityQA.state.tracks.some(t=>t.title==='Empty MIME persisted'));
 const persisted=await page.evaluate(async()=>{const records=await __reliabilityQA.offlineLibrary.list();const record=records.find(t=>t.track.title==='Empty MIME persisted');return record&&{id:record.track.id,bytes:record.bytes}});
 assert.ok(persisted?.bytes>1024,'empty-MIME file reaches durable IndexedDB');
 await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__reliabilityQA?.offlineLoaded&&__reliabilityQA.state.tracks.some(t=>t.title==='Empty MIME persisted'));
 await page.evaluate(()=>{__reliabilityQA.freeze();__reliabilityQA.audio.muted=true});
 await page.locator('#more-button').click();await page.locator('[data-command="go-library"]').click();
 await page.getByRole('button',{name:'Reproduzir Empty MIME persisted',exact:true}).click();
 await page.waitForFunction(()=>__reliabilityQA.state.current?.title==='Empty MIME persisted'&&!__reliabilityQA.audio.paused&&__reliabilityQA.audio.currentTime>.05);
 const offline=await page.evaluate(()=>({id:__reliabilityQA.state.current.id,src:__reliabilityQA.audio.currentSrc,online:navigator.onLine,duration:__reliabilityQA.audio.duration}));
 assert.equal(offline.id,persisted.id);assert.equal(offline.online,false);assert.ok(offline.src.startsWith('blob:'));assert.ok(Number.isFinite(offline.duration));assert.deepEqual(mediaRequests,[]);
 cases.push({name:'empty-MIME import survives reload and plays offline',persisted,restored:offline});
 assert.deepEqual(errors,[]);
 const report={cases,audio:{before,after},requests:Object.fromEntries(count),mediaRequests,errors,scope:'Routed app shell/provider responses and original finite PCM audio; IndexedDB restoration with offline browser; no provider audio/extraction requests; not service-worker or physical Safari validation'};
 await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{releaseOld?.();releaseSubmit?.();releasePagingApple();releasePagingNative();await browser.close()}
