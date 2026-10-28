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
const root=path.resolve(import.meta.dirname,'..'),out=process.env.IPOD_ARTIFACT_DIR||'/tmp/gnarly-ipod-hardware';
await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'gnarly-hardware-'));
execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=330:duration=300','-c:a','aac','-b:a','64k','-movflags','+faststart',path.join(temp,'original.m4a')]);
const media=await readFile(path.join(temp,'original.m4a'));
const server=createServer(async(req,res)=>{
 try{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(file==='app.js'){
   res.setHeader('Content-Type','text/javascript');
   res.end(await readFile(path.join(root,file),'utf8')+'\nglobalThis.__ipodQA={audio,state,selectTrack,applyPlayerSurfaceMode,ensureIPodHardware,freezeVisual:()=>{visual.paused=true;visual.setPaused=()=>{}},setMode:value=>smartMode=value};');return;
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
 const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='art.test'){await route.fulfill({contentType:'image/svg+xml',body:art,headers:{'access-control-allow-origin':'*'}});return}
  if(url.origin!==base||url.pathname.startsWith('/api/')){await route.fulfill({status:200,contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});return}
  await route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!globalThis.__ipodQA);
 await page.evaluate(data=>{
  __ipodQA.setMode('off');__ipodQA.applyPlayerSurfaceMode('ipod');
  const blob=new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'audio/mp4'});
  globalThis.__originalTone=URL.createObjectURL(blob);
  const track=id=>({id,source:'local',url:__originalTone,title:'NIGHT DRIVE '+id,artist:'GNARLY SESSIONS',artwork:'https://art.test/original.svg',duration:120});
  globalThis.__tracks=[track('A'),track('B'),track('C')];
  __ipodQA.state.queue=__tracks.slice(1);__ipodQA.selectTrack(__tracks[0]);
  globalThis.__sourceLoads=0;__ipodQA.audio.addEventListener('loadstart',()=>__sourceLoads++);
 },media.toString('base64'));
 await page.waitForFunction(()=>__ipodQA.state.playing&&!__ipodQA.audio.paused);
 await page.waitForFunction(()=>document.querySelector('#ipod-cover-image').naturalWidth===1600);
 await page.evaluate(()=>{__ipodQA.freezeVisual();return __ipodQA.ensureIPodHardware()});
 async function open(){
  await page.locator('#ipod-menu-button').click({force:true});
  await page.locator('[data-player-surface-action="customize-ipod"]').click();
  await page.waitForSelector('#ipod-hardware-studio[open]');
 }
 async function twoFrames(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
 await page.locator('#ipod-device').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,'desktop-player.png'),fullPage:true});report.screenshots.push('desktop-player.png');
 const before=await page.evaluate(()=>({src:__ipodQA.audio.src,time:__ipodQA.audio.currentTime,loads:__sourceLoads,theme:__ipodQA.state.theme,background:__ipodQA.state.backgroundMode}));
 await open();console.error('Editor opened');await page.screenshot({path:path.join(out,'desktop-studio-initial.png')});
 assert.equal(await page.locator('#ipod-device').count(),1);assert.equal(await page.locator('audio').count(),1);
 assert.equal(await page.locator('.ipod-studio-preview #ipod-device').count(),1);
 const {DEVICE_PRESETS,MATERIALS,PATTERNS}=await import('../lib/ipod-appearance.js');
 const updateLatency=await page.evaluate(async()=>{
  const {DEVICE_PRESETS}=await import('./lib/ipod-appearance.js'),studio=await __ipodQA.ensureIPodHardware(),values=[];
  for(const preset of DEVICE_PRESETS){const start=performance.now();studio.store.apply(preset.config);await new Promise(resolve=>requestAnimationFrame(resolve));values.push(performance.now()-start)}
  values.sort((a,b)=>a-b);return {p50:values[10],p95:values[20],note:'Store update to scheduled paint, without automation clicks; software-rendered Chromium.'};
 });report.appearanceUpdateMs=updateLatency;
 const durations=[];
 console.error('Applying all presets');
 for(const preset of DEVICE_PRESETS){
  console.error('Preset',preset.id);
  await page.locator(`[data-design="${preset.id}"]`).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const started=Date.now();await page.locator(`[data-design="${preset.id}"]`).click();await twoFrames();
  assert.equal(await page.locator('#ipod-device').getAttribute('data-ipod-material'),preset.config.material);
  durations.push(Date.now()-started);
 }
 await page.locator('[data-design="silver"]').click();await twoFrames();
 await page.locator('[data-design="silver"]').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>document.activeElement.dataset.design),'silver');assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),false);
 await page.screenshot({path:path.join(out,'desktop-studio-silver.png')});report.screenshots.push('desktop-studio-silver.png');
 for(const id of ['woodland','ice','carbon','pearl']){
  await page.locator(`[data-design="${id}"]`).click();await twoFrames();
  await page.screenshot({path:path.join(out,`desktop-studio-${id}.png`)});report.screenshots.push(`desktop-studio-${id}.png`);
 }
 await page.locator('[data-editor-mode="advanced"]').click();await page.locator('[data-studio-tab="finish"]').click();
 for(const material of MATERIALS){await page.locator('[data-setting="material"]').selectOption(material.id);await twoFrames();assert.equal(await page.locator('#ipod-device').getAttribute('data-ipod-material'),material.id)}
 await page.locator('[data-setting="baseMode"]').selectOption('trio');
 await page.locator('input[type="text"][data-color="body"]').fill('#28a381');await twoFrames();
 await page.locator('[data-studio-tab="print"]').click();
 for(const print of PATTERNS){
  if(print.id!=='none')await page.locator('[data-studio-collection]').selectOption(print.group);
  await page.locator(`[data-pattern="${print.id}"]`).click();await twoFrames();
  const image=await page.locator('#ipod-device .ipod-print').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.equal(image==='none',print.id==='none',print.id);
 }
 console.error('Materials and patterns applied');
 const valid=await page.evaluate(async()=>{
  const {PATTERNS}=await import('./lib/ipod-appearance.js'),{patternSVG}=await import('./lib/ipod-materials.js');
  return PATTERNS.every(print=>!new DOMParser().parseFromString(patternSVG({pattern:print.id}),'image/svg+xml').querySelector('parsererror'));
 });assert.equal(valid,true);
 await page.locator('[data-setting="scale"]').fill('1.7');await page.locator('[data-setting="rotation"]').fill('37');
 await page.locator('[data-setting="seed"]').fill('7242');await twoFrames();
 assert.equal(await page.locator('#ipod-device').evaluate(el=>el.style.getPropertyValue('--ipod-rotation')),'37deg');
 await page.locator('[data-studio-tab="parts"]').click();
 for(const [key,value] of Object.entries({frame:'#bbb07c',bezel:'#18272a',wheel:'#26372d',center:'#12251a',labels:'#ffffff',brand:'#121d18'}))await page.locator(`input[type="text"][data-color="${key}"]`).fill(value);
 await page.locator('[data-studio-tab="saved"]').click();await page.locator('#ipod-design-name').fill('My 072');await page.locator('[data-save-design] button').click();
 await page.locator('[data-user-rename]').click();await page.locator('#ipod-design-name').fill('Night Archive');await page.locator('[data-save-design] button').click();
 assert.match(await page.locator('.ipod-user-design').innerText(),/Night Archive/);
 const savedConfig=await page.evaluate(async()=>JSON.stringify((await __ipodQA.ensureIPodHardware()).store.snapshot().config));
 const after=await page.evaluate(()=>({src:__ipodQA.audio.src,time:__ipodQA.audio.currentTime,loads:__sourceLoads,paused:__ipodQA.audio.paused,theme:__ipodQA.state.theme,background:__ipodQA.state.backgroundMode}));
 assert.equal(after.src,before.src);assert.equal(after.loads,before.loads);assert.equal(after.paused,false);assert.ok(after.time>before.time);
 assert.equal(after.theme,before.theme);assert.equal(after.background,before.background);
 // Existing native controls remain real, including inside the editor.
 await page.locator('#ipod-next-button').click({force:true});await page.waitForFunction(()=>__ipodQA.state.current.id==='B'&&__ipodQA.state.audioState==='playing'&&!__ipodQA.audio.paused);
 await page.evaluate(()=>{__ipodQA.audio.currentTime=0});await page.locator('#ipod-previous-button').click({force:true});await page.waitForFunction(()=>__ipodQA.state.current.id==='A'&&__ipodQA.state.audioState==='playing'&&!__ipodQA.audio.paused);
 await page.locator('#ipod-center-button').click({force:true});assert.equal(await page.evaluate(()=>__ipodQA.audio.paused),true);
 await page.locator('#ipod-play-button').click({force:true});await page.waitForFunction(()=>!__ipodQA.audio.paused);
 await page.locator('[data-studio-action="close"]').click();await page.waitForFunction(()=>document.querySelector('#ipod-device').parentElement.id==='player-section');
 const reloaded=await page.evaluate(async()=>JSON.stringify((await __ipodQA.ensureIPodHardware()).store.snapshot().config));assert.equal(reloaded,savedConfig);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!globalThis.__ipodQA);await page.evaluate(()=>{__ipodQA.freezeVisual();return __ipodQA.ensureIPodHardware()});
 assert.equal(await page.evaluate(async()=>JSON.stringify((await __ipodQA.ensureIPodHardware()).store.snapshot().config)),savedConfig);
 await open();await page.locator('[data-studio-tab="saved"]').click();assert.match(await page.locator('.ipod-user-design').innerText(),/Night Archive/);
 // The small JSON download contains the same versioned appearance record.
 const downloaded=page.waitForEvent('download');await page.locator('[data-studio-action="export"]').click();
 const download=await downloaded;assert.equal(download.suggestedFilename(),'gnarly-ipod-design.json');
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.kind,'gnarly-ipod-appearance');assert.equal(exported.version,1);
 // JSON import is bounded data, not CSS or image injection.
 await page.locator('[data-import-design]').setInputFiles({name:'own.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'gnarly-ipod-appearance',version:1,appearance:{material:'anodized',colors:{body:'#2b5bba'}}}))});await twoFrames();
 assert.equal(await page.locator('#ipod-device').getAttribute('data-ipod-material'),'anodized');
 await page.locator('[data-user-delete]').click();assert.equal(await page.locator('.ipod-user-design').count(),0);
 await page.locator('[data-studio-action="reset"]').click();await twoFrames();assert.equal(await page.locator('#ipod-device').getAttribute('data-ipod-material'),'brushed');
 await page.locator('[data-studio-action="close"]').click();await twoFrames();
 const metrics=[];
 for(const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
  await page.setViewportSize(size);await twoFrames();await page.locator('#ipod-device').scrollIntoViewIfNeeded();
  const rect=await page.locator('#ipod-device').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=size.width+1);assert.ok(Math.abs(rect.width/rect.height-.61)<.005);
  for(const id of ['ipod-menu-button','ipod-previous-button','ipod-next-button','ipod-play-button','ipod-center-button']){
   const button=await page.locator('#'+id).boundingBox();assert.ok(button.width>=43.5&&button.height>=43.5,id);
  }
  metrics.push({...size,deviceWidth:rect.width,deviceHeight:rect.height});
 }
 report.viewports=metrics;
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(data=>{
  const blob=new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'audio/mp4'});
  __ipodQA.setMode('off');__ipodQA.selectTrack({id:'mobile-original',source:'local',url:URL.createObjectURL(blob),title:'NIGHT DRIVE / 072',artist:'GNARLY SESSIONS',artwork:'https://art.test/original.svg',duration:300});
 },media.toString('base64'));
 await page.waitForFunction(()=>__ipodQA.state.audioState==='playing');await open();
 await page.locator('[data-studio-tab="designs"]').click();await page.locator('[data-design="woodland"]').click();await twoFrames();
 await page.locator('[data-studio-tab="finish"]').click();await page.locator('[data-setting="material"]').scrollIntoViewIfNeeded();await twoFrames();
 assert.equal(await page.locator('.ipod-studio-mini').getAttribute('data-ipod-material'),await page.locator('#ipod-device').getAttribute('data-ipod-material'));
 await page.screenshot({path:path.join(out,'mobile-live-controls.png')});report.screenshots.push('mobile-live-controls.png');
 await page.locator('.ipod-studio-main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'mobile-studio-woodland.png')});report.screenshots.push('mobile-studio-woodland.png');
 await page.locator('[data-studio-action="close"]').click();await twoFrames();
 await page.locator('#ipod-device').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'mobile-player-woodland.png')});report.screenshots.push('mobile-player-woodland.png');
 // Legacy image data remains local and does not hide wheel icons.
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=1000;const ctx=canvas.getContext('2d');
  for(let i=0;i<200;i++){ctx.fillStyle=`hsl(${i*17%360} 40% 45%)`;ctx.fillRect(i*11%640,i*23%1000,55,76)}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const {createIPodSkinStore}=await import('./ui/ipod-mode.js');await createIPodSkinStore().save(blob);
  const {APPEARANCE_KEY}=await import('./lib/ipod-appearance.js');localStorage.removeItem(APPEARANCE_KEY);
 });
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#ipod-device').classList.contains('has-skin'));await page.evaluate(()=>__ipodQA.freezeVisual());
 assert.notEqual(await page.locator('#ipod-shell-image').evaluate(el=>getComputedStyle(el).display),'none');
 assert.equal(await page.locator('#ipod-next-button .icon').evaluate(el=>getComputedStyle(el).opacity),'1');
 await open();await page.locator('[data-design="acid"]').click();await twoFrames();assert.equal(await page.locator('#ipod-shell-image').evaluate(el=>getComputedStyle(el).display),'none');
 await page.locator('[data-studio-action="legacy"]').click();await twoFrames();assert.notEqual(await page.locator('#ipod-shell-image').evaluate(el=>getComputedStyle(el).display),'none');
 await page.locator('[data-studio-action="close"]').click();await twoFrames();
 await page.evaluate(()=>__ipodQA.applyPlayerSurfaceMode('frosted'));assert.equal(await page.locator('#ipod-device').isVisible(),false);
 assert.equal(await page.locator('#ipod-hardware-studio[open]').count(),0);
 assert.equal(await page.locator('[data-player-surface-action="import-ipod-skin"]').count(),0);
 report.checks={presets:DEVICE_PRESETS.length,materials:MATERIALS.length,patterns:PATTERNS.length-1,validSVG:valid,singleAudio:true,transportDuringCustomization:true,noAudioReload:true,persistence:true,userPresetCRUD:true,jsonImport:true,legacy:true,otherModes:true,noCanva:true};
 durations.sort((a,b)=>a-b);report.presetClickToTwoFramesMs={p50:durations[Math.ceil(durations.length*.5)-1],p95:durations[Math.ceil(durations.length*.95)-1],note:'Headless wall time includes automation, GPU rendering and two frames; not audio latency.'};
 // Sharpness and reduced-motion / fallback dialog acceptance at high density.
 const dense=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,reducedMotion:'reduce',serviceWorkers:'block'});
 await dense.route('**/*',async route=>{if(new URL(route.request().url()).origin!==base){await route.fulfill({contentType:'application/json',body:'{"results":[]}'});return}await route.continue()});
 await dense.addInitScript(()=>{HTMLDialogElement.prototype.showModal=undefined});
 const phone=await dense.newPage();phone.on('pageerror',e=>report.errors.push(e.message));await phone.goto(base,{waitUntil:'domcontentloaded'});await phone.waitForFunction(()=>!!globalThis.__ipodQA);
 await phone.evaluate(()=>{__ipodQA.freezeVisual();__ipodQA.applyPlayerSurfaceMode('ipod')});await phone.locator('#ipod-menu-button').click({force:true});await phone.locator('[data-player-surface-action="customize-ipod"]').click();await phone.waitForSelector('#ipod-hardware-studio[open]');
 assert.equal(await phone.locator('#ipod-hardware-studio').getAttribute('data-fallback'),'true');
 await phone.locator('[data-design="pearl"]').click();await phone.screenshot({path:path.join(out,'mobile-retina-pearl.png')});report.screenshots.push('mobile-retina-pearl.png');
 await phone.waitForFunction(()=>document.querySelector('#ipod-cover-image').complete);
 // main cfbf5c7/284d856 intentionally replaced the old DPR pixel cap with
 // full-bleed artwork. Verify actual screen coverage, not the removed cap.
 const artSize=await phone.locator('#ipod-cover-image').evaluate(el=>{
  const r=el.getBoundingClientRect(),screen=el.parentElement,glass=screen.getBoundingClientRect();
  return {width:r.width,height:r.height,natural:el.naturalWidth,dpr:devicePixelRatio,fit:getComputedStyle(el).objectFit,
   screenWidth:screen.clientWidth,screenHeight:screen.clientHeight,x:r.x-glass.x-screen.clientLeft,y:r.y-glass.y-screen.clientTop};
 });
 assert.equal(artSize.dpr,3);assert.ok(artSize.natural>0);assert.equal(artSize.fit,'cover');
 assert.ok(Math.abs(artSize.width-artSize.screenWidth)<=1&&Math.abs(artSize.height-artSize.screenHeight)<=1,JSON.stringify(artSize));
 assert.ok(Math.abs(artSize.x)<=1&&Math.abs(artSize.y)<=1,JSON.stringify(artSize));
 assert.equal(await phone.locator('#ipod-center-button').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 await phone.locator('[data-studio-action="close"]').click();await phone.waitForFunction(()=>document.querySelector('#ipod-device').parentElement.id==='player-section');
 report.checks.retina=true;report.checks.reducedMotion=true;report.checks.dialogFallback=true;
 await dense.close();await context.close();assert.deepEqual(report.errors,[]);
 await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true})}
