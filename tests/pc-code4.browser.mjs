/** Integration: HTTP 503 while the owner's PC is preparing causes a *temporary*
 * HTMLMediaError 4, but must automatically resume the same recording after the
 * PC reports ready. Real Chromium HTMLAudioElement, local WAV and stub APIs.
 * No YouTube fetch or provider account access.
 */
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),base='https://gnarly-web-pages.pages.dev';
const tone=()=>{
 const rate=16000,frames=rate*6,buffer=Buffer.alloc(44+frames*2);
 buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
 buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
 buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
 buffer.write('data',36);buffer.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)buffer.writeInt16LE(Math.round(7000*Math.sin(i*2*Math.PI*330/rate)),44+i*2);
 return buffer;
};
const media=tone();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,
 args:['--no-sandbox','--autoplay-policy=no-user-gesture-required',
 '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:860}});
const events={mediaErrors:0,pcStatus:0,pcPrepare:0,edgeFailures:0,renderMedia:0};
try{
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p==='/fast-audio/AAAAAAAAAAA'){
   if(route.request().method()==='HEAD')
    return route.fulfill({status:404,body:''});
   events.edgeFailures++;
   return route.fulfill({status:503,contentType:'text/plain',body:'PC is preparing',
    headers:{'X-Gnarly-Playback-Source':'pc-node-preparing','Retry-After':'3'}});
  }
  if(p==='/pc-node/prepare/AAAAAAAAAAA'){
   events.pcPrepare++;
   return route.fulfill({status:200,contentType:'application/json',body:'{"state":"pending"}'});
  }
  if(p==='/pc-node/status/AAAAAAAAAAA'){
   events.pcStatus++;
   const status=events.pcStatus<3?'pending':'ready';
   return route.fulfill({contentType:'application/json',
    body:JSON.stringify({state:status,node_online:true})});
  }
  if(p==='/download'&&url.hostname==='nightcorelab.onrender.com'){
   events.renderMedia++;
   return route.fulfill({status:200,contentType:'audio/wav',body:media,
    headers:{'Content-Length':String(media.length),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'}});
  }
  if(p==='/playback-status'&&url.hostname==='nightcorelab.onrender.com')
   return route.fulfill({contentType:'application/json',body:'{"status":"ready","youtube_retry_after":0,"retry_after":0,"pc_node_online":true}',
    headers:{'Access-Control-Allow-Origin':'*'}});
  if(url.hostname!=='gnarly-web-pages.pages.dev'||p.startsWith('/api/')||p.startsWith('/fast-prepare/'))
   return route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}',
    headers:{'Access-Control-Allow-Origin':'*'}});
  try{
   const name=p==='/'?'index.html':p.slice(1),ext=path.extname(name);
   let body=await readFile(path.join(root,'dist',name));
   if(name==='app.js')
    body=Buffer.from(body.toString()+
     '\nglobalThis.__pcRecoveryQA={audio,state,selectTrack,visual};audio.muted=true;'+
     'audio.addEventListener("error",()=>{globalThis.__mediaErrorCount=(globalThis.__mediaErrorCount||0)+1;});');
   return route.fulfill({contentType:({
    '.js':'text/javascript','.css':'text/css','.html':'text/html',
    '.json':'application/json','.png':'image/png','.svg':'image/svg+xml',
    '.woff2':'font/woff2'})[ext]||'application/octet-stream',body});
  }catch{return route.fulfill({status:404,body:''})}
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(String(err.message).slice(0,500)));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
 await page.waitForFunction(()=>!!globalThis.__pcRecoveryQA,{timeout:10000});
 await page.evaluate(()=>{
  __pcRecoveryQA.visual.stopLoop();
  __pcRecoveryQA.audio.muted=true;
  __pcRecoveryQA.selectTrack({
   id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA',source:'youtube',
   title:'PC Recovery Fixture',artist:'Synthetic Audio',duration:6,
   artwork:'/assets/gnarly-icon.png',playbackAvailability:'r2'
  });
 });
 await page.waitForFunction(()=>{
  const q=globalThis.__pcRecoveryQA;
  return !!q&&q.state.current?.videoId==='AAAAAAAAAAA'&&!q.audio.paused&&
   q.audio.currentTime>.12&&q.state.audioState==='playing'&&q.state.playbackError==='';
 },null,{timeout:17000});
 const result=await page.evaluate(()=>({
  track:__pcRecoveryQA.state.current?.id,source:__pcRecoveryQA.audio.currentSrc,
  duration:__pcRecoveryQA.audio.duration,currentTime:__pcRecoveryQA.audio.currentTime,
  playing:__pcRecoveryQA.state.playing,mediaErrors:__mediaErrorCount||0,
  message:document.querySelector('#player-status')?.textContent||'',
  playbackError:__pcRecoveryQA.state.playbackError
 }));
 assert.ok(events.edgeFailures>=1,'fixture must exercise initial 503/code4 media source');
 assert.ok(events.pcPrepare>=1,'recovery must prepare exact PC recording');
 assert.ok(events.pcStatus>=3,'recovery must poll until ready');
 assert.ok(events.renderMedia>=1,'PC ready must deliver actual media to native audio element');
 assert.equal(result.track,'youtube:AAAAAAAAAAA');
 assert.equal(result.playbackError,'');
 assert.equal(result.playing,true);
 assert.ok(result.currentTime>.12,'actual media clock advances after recovery');
 assert.deepEqual(errors,[],'browser has no uncaught errors');
 console.log('MediaError4 PC preparation → same-track playable recovery:',JSON.stringify({result,events}));
}finally{await context.close();await browser.close()}
