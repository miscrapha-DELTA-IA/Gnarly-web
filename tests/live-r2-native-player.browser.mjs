/** Read-only production browser acceptance of a preverified R2 recording.
 * Does not search/extract any new YouTube media or change production sources.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const id=process.env.GNARLY_VERIFY_VIDEO_ID||'kb8UsWvW5Hw';
assert.match(id,/^[A-Za-z0-9_-]{11}$/);
const origin=process.env.GNARLY_PROBE_URL||'https://gnarly-web-pages.pages.dev';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,
 args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1160,height:880}});
 const network=[],errors=[];
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,200)));
 page.on('response',r=>{
  if(new URL(r.url()).pathname==='/fast-audio/'+id)
   network.push({status:r.status(),source:r.headers()['x-gnarly-playback-source'],type:r.headers()['content-type']});
 });
 await page.route('**/app.js',async route=>{
  const source=await route.fetch(),body=await source.text();
  await route.fulfill({response:source,body:body+'\nglobalThis.__r2LiveQA={audio,state,selectTrack};'});
 });
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:22000});
 await page.waitForFunction(()=>!!globalThis.__r2LiveQA,{timeout:18000});
 await page.evaluate(videoId=>{
  const q=globalThis.__r2LiveQA;q.audio.muted=true;
  q.selectTrack({id:'youtube:'+videoId,videoId,source:'youtube',
   title:'Cached original recording',artist:'Cached R2',duration:134.869,
   playbackAvailability:'r2',artwork:'/assets/gnarly-icon.png'},false);
 },id);
 await page.locator('#play-button').click({force:true,timeout:10000});
 await page.waitForFunction(()=>{const q=__r2LiveQA;
  return q.audio.currentTime>1&&!q.audio.paused&&q.audio.readyState>=3&&
   q.state.audioState==='playing'&&q.state.playbackError==='';
 },null,{timeout:18000});
 const data=await page.evaluate(()=>({
  time:__r2LiveQA.audio.currentTime,
  duration:__r2LiveQA.audio.duration,
  readyState:__r2LiveQA.audio.readyState,
  error:__r2LiveQA.audio.error?.code||0,
  source:__r2LiveQA.audio.currentSrc,
  playing:__r2LiveQA.state.playing,
  status:document.querySelector('#player-status')?.textContent||'',
  id:__r2LiveQA.state.current?.videoId
 }));
 assert.equal(data.id,id);
 assert.equal(data.error,0);
 assert.equal(data.playing,true);
 assert.ok(data.time>1&&data.duration>100);
 assert.ok(network.length>0&&network.every(r=>[200,206].includes(r.status)&&r.source==='r2-edge'));
 assert.deepEqual(errors,[],'No uncaught JS errors');
 console.log('REAL GNARLY R2 PLAYER OK',JSON.stringify({data,network}));
 await context.close();
}finally{await browser.close()}
