/** Native-device UI / rendering acceptance with original synthetic media.
 * No provider traffic. CHROMIUM_PATH must point to an AAC-capable browser.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.IPOD_ARTIFACT_DIR||'/tmp/gnarly-ipod-wheel';
await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'gnarly-hardware-'));
execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=330:duration=600','-c:a','aac','-b:a','64k','-movflags','+faststart',path.join(temp,'original.m4a')]);
const media=await readFile(path.join(temp,'original.m4a'));
const server=createServer(async(req,res)=>{
 try{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(file==='app.js'){
   res.setHeader('Content-Type','text/javascript');
   res.end(await readFile(path.join(root,file),'utf8')+'\nglobalThis.__ipodQA={audio,state,selectTrack,applyPlayerSurfaceMode,ensureIPodHardware,karaokeStage,syncLyrics,transport:()=>ipodTransport,freezeVisual:()=>{visual.paused=true;visual.setPaused=()=>{}},setMode:value=>smartMode=value};');return;
  }
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(path.join(root,file)));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const art=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#b8d9b1"/><stop offset="1" stop-color="#224c51"/></linearGradient><radialGradient id="h"><stop stop-color="#f3e9bb"/><stop offset="1" stop-color="#aabd7f"/></radialGradient></defs><path fill="url(#g)" d="M0 0h1600v1600H0z"/><circle cx="1040" cy="550" r="540" fill="url(#h)"/><path fill="#172f34" d="M-100 400L1600 1300v500H-100Z"/><path fill="none" stroke="#f0ecce" stroke-width="5" d="M80 100h1440v1400H80z"/><text x="125" y="240" font-family="sans-serif" font-size="72" fill="#183c36" letter-spacing="14">GNARLY SESSIONS</text><text x="120" y="1410" font-family="sans-serif" font-size="120" fill="#d6e3bb" letter-spacing="-6">NIGHT DRIVE / 072</text></svg>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={media:'Original synthetic AAC, no provider requests; shader frozen in QA for deterministic software-GPU captures',viewports:[],screenshots:[],errors:[],checks:{}};
try{
 const context=await browser.newContext({viewport:{width:1200,height:1000},hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.hostname==='art.test')return route.fulfill({contentType:'image/svg+xml',body:art});
  if(u.origin!==base||u.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__ipodQA);
 await page.evaluate(data=>{
  __ipodQA.freezeVisual();__ipodQA.setMode('off');__ipodQA.applyPlayerSurfaceMode('ipod');
  globalThis.toneURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'audio/mp4'}));
  const track=id=>({id,source:'local',url:toneURL,title:'WHEEL SESSION '+id,artist:'GNARLY',artwork:'https://art.test/cover.svg',duration:600});
  globalThis.qaTracks=[track('A'),track('B'),track('C')];__ipodQA.state.queue=qaTracks.slice(1);__ipodQA.selectTrack(qaTracks[0]);
  globalThis.sourceLoads=0;__ipodQA.audio.addEventListener('loadstart',()=>sourceLoads++);
 },media.toString('base64'));
 await page.waitForFunction(()=>!__ipodQA.audio.paused&&__ipodQA.audio.seekable.length>0);
 await page.locator('#ipod-device').scrollIntoViewIfNeeded();
 const src=await page.evaluate(()=>__ipodQA.audio.src),loads=await page.evaluate(()=>sourceLoads);
 const center=page.locator('#ipod-center-button'),slider=page.locator('#ipod-seek-slider');
 async function position(){return page.evaluate(()=>__ipodQA.audio.currentTime)}
 async function active(want=true){await page.waitForFunction(want=>__ipodQA.transport().active()===want,want)}
 async function hold(want=true){const r=await center.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.waitForTimeout(570);await page.mouse.up();await active(want)}
 async function rotate(from,to,steps=12){
  const r=await page.locator('#ipod-device .ipod-wheel').boundingBox(),p=a=>({x:r.x+r.width/2+Math.cos(a*Math.PI/180)*r.width*.4,y:r.y+r.height/2+Math.sin(a*Math.PI/180)*r.height*.4});
  let xy=p(from);await page.mouse.move(xy.x,xy.y);await page.mouse.down();
  for(let i=1;i<=steps;i++){xy=p(from+(to-from)*i/steps);await page.mouse.move(xy.x,xy.y)}await page.mouse.up();
 }
 console.error('Native audio ready');
 // Short press keeps native play/pause; long press never toggles playback.
 await center.click();assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);
 await hold();assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);
 await page.waitForTimeout(550);await rotate(-40,40);const forward=await position();assert.ok(forward>5&&forward<40,forward);
 await rotate(40,10);assert.ok(await position()<forward);assert.equal(await page.evaluate(()=>__ipodQA.state.current.id),'A');
 // Seam crossing and fine changes do not jump by almost a full revolution.
 await page.evaluate(()=>{__ipodQA.audio.currentTime=100});await rotate(-5,5,8);const seam=await position();assert.ok(seam>100&&seam<106,seam);
 await rotate(5,1,4);assert.ok(await position()<seam);
 // Burst movement is bounded to <=3 actual media writes, including release.
 const writes=await page.evaluate(()=>{
  const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime'),a=__ipodQA.audio;let writes=0;
  Object.defineProperty(a,'currentTime',{configurable:true,get(){return descriptor.get.call(a)},set(value){writes++;descriptor.set.call(a,value)}});
  const el=document.querySelector('.ipod-wheel'),r=el.getBoundingClientRect();
  const emit=(type,angle)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:77,button:0,isPrimary:true,clientX:r.x+r.width/2+Math.cos(angle)*r.width*.4,clientY:r.y+r.height/2+Math.sin(angle)*r.height*.4}));
  emit('pointerdown',0);for(let i=1;i<=60;i++)emit('pointermove',i*.045);emit('pointerup',2.7);
  delete a.currentTime;return writes;
 });assert.ok(writes<=3&&writes>0,writes);report.seekWritesPer60Moves=writes;
 // Pointer cancellation discards uncommitted movement and leaves the mode usable.
 await page.evaluate(()=>{
  const el=document.querySelector('.ipod-wheel'),r=el.getBoundingClientRect(),emit=(type,a)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:78,button:0,isPrimary:true,clientX:r.x+r.width/2+Math.cos(a)*r.width*.4,clientY:r.y+r.height/2+Math.sin(a)*r.height*.4}));
  emit('pointerdown',0);emit('pointermove',.1);emit('pointermove',.2);emit('pointercancel',.2);
 });assert.equal(await page.evaluate(()=>__ipodQA.transport().active()),true);
 // A captured G tap confirms; it must not pause/play or select another track.
 await page.waitForTimeout(550);await center.click();await active(false);assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);
 // A fresh press immediately after confirmation must not be swallowed.
 await center.click();assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),false);await center.click();assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);
 // Native range keys and timeline pointer drag, preserving paused state.
 await slider.focus();await page.keyboard.press('End');await page.waitForFunction(()=>__ipodQA.audio.currentTime>599);
 await page.keyboard.press('Home');await page.waitForFunction(()=>__ipodQA.audio.currentTime<1);
 const rail=await slider.boundingBox();await page.mouse.click(rail.x+rail.width*.25,rail.y+rail.height/2);
 assert.ok(Math.abs(await position()-150)<12);
 await page.mouse.move(rail.x+rail.width*.25,rail.y+rail.height/2);await page.mouse.down();await page.mouse.move(rail.x+rail.width*.6,rail.y+rail.height/2,{steps:20});await page.mouse.up();
 await page.waitForFunction(()=>Math.abs(__ipodQA.audio.currentTime-360)<12);
 await page.locator('#ipod-screen-duration').click();assert.match(await page.locator('#ipod-screen-duration').innerText(),/^−/);
 await page.locator('#ipod-screen-duration').click();assert.equal(await page.locator('#ipod-screen-duration').innerText(),'10:00');
 await page.locator('#ipod-screen-duration').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);await page.keyboard.press('Space');
 // Immediate LRC + expanded karaoke update on the same clock, even paused.
 await page.evaluate(()=>{__ipodQA.state.lyrics=[{time:0,text:'OPENING'},{time:10,text:'VERSE'},{time:20,text:'CHORUS'}];__ipodQA.state.lastLyric=-2;__ipodQA.state.lyricsSynced=true;__ipodQA.karaokeStage.open()});
 // Programmatic native input mirrors the range accessibility action under the overlay.
 await slider.evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
 assert.equal(await page.evaluate(()=>__ipodQA.state.lastLyric),1);
 assert.match(await page.locator('#floating-line').innerText(),/VERSE/);
 assert.match(await page.locator('#karaoke-stage .is-live').innerText(),/VERSE/);
 await page.evaluate(()=>__ipodQA.karaokeStage.close());
 console.error('Timeline, LRC and karaoke passed');
 // Keyboard long press, precise arrows, Escape, MENU and inactivity exit.
 await center.focus();await page.keyboard.down('Space');await page.waitForTimeout(570);await page.keyboard.up('Space');await active();
 await page.keyboard.press('Shift+ArrowRight');assert.ok(Math.abs(await position()-13)<.4);
 await page.keyboard.press('Escape');await active(false);assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);
 await page.waitForTimeout(550);await hold();await page.waitForTimeout(550);await page.locator('#ipod-menu-button').click();await active(false);assert.equal(await page.locator('#player-surface-menu').isVisible(),false);
 await page.waitForTimeout(550);await hold();await page.waitForTimeout(8250);await active(false);
 console.error('Keyboard and inactivity passed');
 // Playback continues during wheel seek, including offline Blob media.
 await context.setOffline(true);await page.waitForTimeout(550);await center.click();await page.waitForFunction(()=>!__ipodQA.audio.paused);
 await hold();const before=await position();await rotate(0,90);assert.ok(await position()>before+8);assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),false);
 assert.equal(await page.evaluate(()=>sourceLoads),loads);
 await page.screenshot({path:path.join(out,'desktop-wheel-active.png')});
 // Track and surface changes cancel pending seeks; original transports recover.
 await page.evaluate(()=>{const slider=document.querySelector('#ipod-seek-slider');for(const value of [200,400]){slider.value=value;slider.dispatchEvent(new Event('input',{bubbles:true}))}__ipodQA.selectTrack(qaTracks[1],true,{fromQueue:true})});await active(false);await page.waitForFunction(()=>__ipodQA.state.audioState==='playing');assert.ok(await position()<3);
 await page.waitForTimeout(550);await page.locator('#ipod-next-button').click();await page.waitForFunction(()=>__ipodQA.state.current.id==='C'&&__ipodQA.state.audioState==='playing');
 await page.evaluate(()=>{__ipodQA.audio.currentTime=0});await page.locator('#ipod-previous-button').click();await page.waitForFunction(()=>__ipodQA.state.current.id==='B'&&__ipodQA.state.audioState==='playing');
 await hold();await page.evaluate(()=>__ipodQA.applyPlayerSurfaceMode('frosted'));await active(false);
 assert.equal(await page.locator('audio').count(),1);
 await context.setOffline(false);await page.evaluate(()=>__ipodQA.applyPlayerSurfaceMode('ipod'));
 // No reset, source reload or request is introduced by navigation itself.
 assert.equal(src,await page.evaluate(()=>__ipodQA.audio.src));
 console.error('Transport and source continuity passed');
 // Actual touch pointers at phone density; no normal-mode page scroll lock.
 await page.setViewportSize({width:390,height:844});await page.locator('#ipod-device').scrollIntoViewIfNeeded();
 const client=await context.newCDPSession(page);
 async function touch(type,x,y){await client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,radiusX:1,radiusY:1,force:1}]})}
 const cr=await center.boundingBox();await touch('touchStart',cr.x+cr.width/2,cr.y+cr.height/2);await page.waitForTimeout(570);await touch('touchEnd');await active();
 const wr=await page.locator('#ipod-device .ipod-wheel').boundingBox(),xy=a=>({x:wr.x+wr.width/2+Math.cos(a*Math.PI/180)*wr.width*.4,y:wr.y+wr.height/2+Math.sin(a*Math.PI/180)*wr.height*.4});
 let p=xy(-90);const touchBefore=await position();await touch('touchStart',p.x,p.y);
 for(let a=-80;a<=0;a+=10){p=xy(a);await touch('touchMove',p.x,p.y)}await touch('touchEnd');assert.ok(await position()>touchBefore+5);
 await page.screenshot({path:path.join(out,'mobile-wheel-active.png')});
 await page.waitForTimeout(550);await center.tap();await active(false);
 assert.notEqual(await page.locator('.ipod-wheel').evaluate(el=>getComputedStyle(el).touchAction),'none');
 // No seekable range / indefinite media: graceful disabled timeline and hold.
 await page.evaluate(()=>{__ipodQA.audio.pause();Object.defineProperty(__ipodQA.audio,'duration',{configurable:true,value:Infinity});__ipodQA.transport().sync()});
 assert.equal(await slider.isDisabled(),true);const pausedBefore=await page.evaluate(()=>__ipodQA.audio.paused);await hold(false);assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),pausedBefore);
 assert.equal(await page.evaluate(()=>__ipodQA.transport().active()),false);
 await page.evaluate(()=>{delete __ipodQA.audio.duration;Object.defineProperty(__ipodQA.audio,'seekable',{configurable:true,value:{length:0}});__ipodQA.transport().sync()});assert.equal(await slider.isDisabled(),true);
 await page.evaluate(()=>{delete __ipodQA.audio.seekable;__ipodQA.transport().sync()});
 assert.equal(await slider.isDisabled(),false);
 assert.deepEqual(report.errors,[]);
 report.checks={shortPress:true,longPress:true,clockwise:true,counterclockwise:true,seam:true,fineSeek:true,confirmation:true,menuExit:true,escape:true,idleExit:true,trackChange:true,surfaceExit:true,timelineTapDrag:true,rangeKeyboard:true,lyrics:true,expandedKaraoke:true,pausedAndPlaying:true,pointerCancel:true,restrictedStream:true,offline:true,touch:true,indefinite:true,singleAudio:true};
 report.screenshots=['desktop-wheel-active.png','mobile-wheel-active.png'];
 await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true})}
