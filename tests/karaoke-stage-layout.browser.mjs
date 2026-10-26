import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const viewport of [{width:1649,height:895},{width:390,height:844},{width:844,height:390}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width===390,hasTouch:viewport.width===390});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#floating-lyrics').evaluate(el=>{el.hidden=false});
  await page.evaluate(()=>window.scrollTo(0,550));
  await page.locator('#karaoke-expand-button').click();
  assert.equal(await page.locator('#karaoke-stage').isVisible(),true);
  const geometry=await page.evaluate(()=>{
   const selectors={stage:'#karaoke-stage',header:'.karaoke-stage-header',play:'#karaoke-stage-play',full:'#karaoke-stage-fullscreen',
    close:'#karaoke-stage-close',mic:'#karaoke-voice-toggle',caption:'#karaoke-caption-settings',score:'.karaoke-score-card',
    reader:'#karaoke-reader',footer:'.karaoke-stage-footer'};
   return Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
    const el=document.querySelector(selector),r=el.getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return [name,{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,
      clickable:el.contains(hit)||el===hit}];
   }));
  });
  const detail=JSON.stringify({viewport,geometry});
  assert.ok(geometry.header.y>=0&&geometry.header.bottom<=viewport.height/2,'Header visible '+detail);
  for(const name of ['play','full','close','mic','caption','footer']){
   const item=geometry[name];
   assert.ok(item.y>=0&&item.bottom<=viewport.height,name+' accessible and not clipped: '+detail);
  }
  for(const name of ['play','full','close','mic','caption']){
   assert.ok(geometry[name].clickable,name+' accepts pointer events: '+detail);
  }
  assert.ok(geometry.reader.height>=40,'Reader scroll area: '+detail);
  assert.ok(geometry.score.bottom<=viewport.height,'Score fits: '+detail);
  await page.locator('#karaoke-stage-fullscreen').click();
  assert.equal(await page.locator('#karaoke-stage-fullscreen').getAttribute('aria-pressed'),'true');
  await page.locator('#karaoke-stage-fullscreen').click();
  assert.equal(await page.locator('#karaoke-stage-fullscreen').getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{
   if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{
    configurable:true,value:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});
  });
  await page.locator('#karaoke-voice-toggle').click();
  await page.waitForFunction(()=>!document.querySelector('#karaoke-stage-feedback').hidden);
  assert.match(await page.locator('#karaoke-stage-feedback').innerText(),/microfone|permissão/i);
  await page.locator('#karaoke-caption-settings').click();
  assert.equal(await page.locator('#karaoke-stage-font-menu').isVisible(),true);
  await page.locator('[data-stage-font="neon"]').click();
  assert.equal(await page.locator('#karaoke-stage').getAttribute('data-lyric-style'),'neon');
  const isolated=await page.evaluate(async()=>{
   const reader=document.querySelector('#karaoke-reader'),holder=document.querySelector('#karaoke-reader-lines');
   reader.style.flex='0 0 140px';reader.style.height='140px';
   const big=document.createElement('div');big.style.height='1400px';holder.append(big);
   const line=document.createElement('div');line.style.height='65px';line.textContent='Verso de teste';holder.append(line);
   const {KaraokeStage}=await import('./ui/karaoke-stage.js');
   const obj=Object.create(KaraokeStage.prototype);obj.root=document.getElementById('karaoke-stage');obj.reducedMotion=true;
   const initial=window.scrollY;obj.centerActiveLine(line);
   return {initial,final:window.scrollY,inside:reader.scrollTop};
  });
  assert.equal(isolated.final,isolated.initial,'Autofollow cannot scroll document: '+JSON.stringify(isolated));
  assert.ok(isolated.inside>300,'Autofollow must scroll reader: '+JSON.stringify(isolated));
  await page.locator('#karaoke-stage-close').click();
  assert.equal(await page.locator('#karaoke-stage').isVisible(),false);
  assert.deepEqual(errors,[],viewport.width+'x'+viewport.height+' runtime errors');
  await page.close();
 }
 console.log('GNARLY karaoke controls visible and clickable on desktop, mobile portrait and landscape.');
}finally{await browser.close()}
