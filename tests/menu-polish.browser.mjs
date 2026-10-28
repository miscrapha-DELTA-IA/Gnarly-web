/** Focused menu geometry/interaction acceptance; no provider audio or visual redesign. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),phase=process.env.MENU_PHASE||'after',out=process.env.MENU_ARTIFACT_DIR||'/tmp/gnarly-menu-polish/'+phase;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report=[];
try{
 for(const [label,width,height] of [['mobile',390,844],['desktop',1280,1000],['small',320,740]]){
  let keyboard=null;const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'}),errors=[];
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!=='https://gnarly.test'||u.pathname.startsWith('/api/')||u.pathname.startsWith('/fast-'))return route.fulfill({contentType:'application/json',body:'{"results":[],"lines":[],"plainLines":[]}'});
   try{
    const file=u.pathname==='/'?'index.html':u.pathname.slice(1),ext=path.extname(file);let body=phase==='before'?execFileSync('git',['show',(process.env.MENU_BEFORE_REF||'c1ea261')+':'+file],{cwd:root,maxBuffer:8*1024*1024}):await readFile(path.join(root,file));
    if(file==='app.js')body=Buffer.from(body+"\nglobalThis.__menuQA={visual,state,audio,openSheet,closeSheet};visual.stopLoop();visual.renderFrame(12);const frozen=document.createElement('img');frozen.src=visual.canvas.toDataURL();frozen.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none';visual.canvas.style.visibility='hidden';document.querySelector('#gnarly-background').prepend(frozen);");
    await route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[ext]||'application/octet-stream'});
   }catch{await route.fulfill({status:404,body:''})}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://gnarly.test/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!globalThis.__menuQA);
  await page.screenshot({path:path.join(out,label+'-home.png'),animations:'disabled'});
  const eye=await page.locator('.eye-gesture-arrow').evaluate(icon=>{const clone=icon.cloneNode(true),holder=document.createElement('div');holder.style.cssText='position:absolute;left:0;top:0;visibility:hidden';holder.append(clone);document.body.append(holder);const r=clone.getBoundingClientRect(),current=icon.getBoundingClientRect(),result={current:[current.width,current.height],withoutComponentCSS:[r.width,r.height],intrinsic:[icon.getAttribute('width'),icon.getAttribute('height')]};holder.remove();return result});
  const chevrons=await page.locator('.module-chevron,.omnibox-chevron').evaluateAll(icons=>icons.map(icon=>{const r=icon.getBoundingClientRect();return {class:icon.getAttribute('class'),width:r.width,height:r.height,intrinsic:[icon.getAttribute('width'),icon.getAttribute('height')]}}));
  await page.evaluate(()=>__menuQA.openSheet('display'));
  await page.screenshot({path:path.join(out,label+'-display.png'),animations:'disabled'});
  const display=await page.locator('.display-panel').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert.ok(display.scrollWidth<=display.width+1,'Display panel fits');
  await page.locator('button[data-player-size="standard"]').click();assert.equal(await page.locator('button[data-player-size="standard"]').getAttribute('aria-pressed'),'true');
  await page.locator('button[data-player-size="compact"]').click();
  const headerToggle=page.locator('[data-panel-toggle="header"]');const initial=await headerToggle.isChecked();if(phase==='before')await headerToggle.locator('..').click();else await headerToggle.uncheck();assert.equal(await headerToggle.isChecked(),false);if(phase==='before')await headerToggle.locator('..').click();else await headerToggle.check();assert.equal(await headerToggle.isChecked(),true);
  if(!initial)await headerToggle.uncheck();
  if(phase==='after'){
   assert.deepEqual(eye.intrinsic,['10','10']);assert.deepEqual(eye.withoutComponentCSS,[10,10]);
   for(const icon of chevrons){assert.ok(icon.width<=16&&icon.height<=16,JSON.stringify(icon));assert.deepEqual(icon.intrinsic,['16','16'])}
   assert.equal(await page.locator('[data-layout="all"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-layout="essential"]').click();assert.equal(await page.locator('[data-layout="essential"]').getAttribute('aria-pressed'),'true');await page.locator('[data-layout="all"]').click();
   await page.locator('[data-layout-group="none"]').click();assert.equal(await page.locator('[data-layout-group="none"]').getAttribute('aria-pressed'),'true');await page.locator('[data-layout-group="all"]').click();
  }
  await page.locator('[data-command="close-display"]').click();
  await page.locator('[data-module-toggle="controls"]').click();
  await page.locator('[data-module-toggle="controls"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,label+'-music.png'),animations:'disabled'});
  const slider=page.locator('#module-controls-body #speed');await slider.focus();const before=await slider.inputValue();await page.keyboard.press('ArrowRight');assert.ok(Number(await slider.inputValue())>Number(before));
  const geometry=await slider.evaluate(el=>({height:el.getBoundingClientRect().height,value:el.value,min:el.min,max:el.max,focus:getComputedStyle(el).outlineStyle}));
  if(phase==='after'){assert.ok(geometry.height>=44&&geometry.height<=48,JSON.stringify(geometry));assert.notEqual(geometry.focus,'none')}
  await page.locator('[data-module-toggle="controls"]').click();assert.equal(await page.locator('[data-module-toggle="controls"]').getAttribute('aria-expanded'),'false');
  let playingBefore;
  if(phase==='after'){
   const rate=16000,frames=rate*30,wave=Buffer.alloc(44+frames*2);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)wave.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*330/rate)),44+i*2);
   await page.evaluate(()=>__menuQA.audio.muted=true);await page.locator('#audio-import').setInputFiles({name:'GNARLY Menu Fixture.wav',mimeType:'audio/wav',buffer:wave});
   await page.waitForFunction(()=>!!__menuQA.state.current&&!__menuQA.audio.paused&&Number.isFinite(__menuQA.audio.duration)&&__menuQA.audio.currentTime>.05);playingBefore=await page.evaluate(()=>{globalThis.menuPauseEvents=0;__menuQA.audio.addEventListener('pause',()=>menuPauseEvents++);return {time:__menuQA.audio.currentTime,at:performance.now(),src:__menuQA.audio.currentSrc,rate:__menuQA.audio.playbackRate}});
  }
  if(phase==='before')await page.locator('[data-module-toggle="export"]').click();else{await page.locator('[data-module-toggle="export"]').focus();await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');}assert.equal(await page.locator('[data-module-toggle="export"]').getAttribute('aria-expanded'),'true');
  if(phase==='after'){
   await page.locator('#more-button').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#sheet-title').innerText(),'GNARLY');await page.locator('[data-command="go-display"]').click();
   const subtitles=page.locator('[data-panel-toggle="lyrics"]');await subtitles.uncheck();assert.equal(await subtitles.isChecked(),false);await subtitles.check();await page.locator('[data-command="close-display"]').click();
   await page.locator('#omnibox-toggle').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#bottom-sheet').isVisible(),true);await page.locator('[data-omnibox-tab="search"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-omnibox-tab="library"]').getAttribute('aria-selected'),'true');
   await page.keyboard.press('End');assert.equal(await page.locator('[data-omnibox-tab="karaoke"]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');await page.waitForTimeout(120);assert.equal(await page.locator('[data-omnibox-tab="search"]').evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#bottom-sheet').isVisible(),false);
   const playingAfter=await page.evaluate(()=>({time:__menuQA.audio.currentTime,at:performance.now(),paused:__menuQA.audio.paused,src:__menuQA.audio.currentSrc,pauseEvents:menuPauseEvents}));assert.equal(playingAfter.paused,false);assert.equal(playingAfter.pauseEvents,0,'menu keys never emit a pause, including repeated Space');assert.equal(playingAfter.src,playingBefore.src);const expected=(playingAfter.at-playingBefore.at)/1000*playingBefore.rate;assert.ok(Math.abs((playingAfter.time-playingBefore.time)-expected)<.55,'menu keys do not seek or pause the native player: '+JSON.stringify({playingBefore,playingAfter,expected}));keyboard={before:playingBefore,after:playingAfter,expected};
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,'No horizontal page overflow: '+overflow);assert.deepEqual(errors,[]);
  report.push({viewport:label,eye,chevrons,display,keyboard,slider:geometry,overflow,errors});await context.close();
 }
 await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
