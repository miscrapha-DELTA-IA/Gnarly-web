import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!=='https://lyrics.test'||u.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"results":[]}'});
  try{
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1);let body=await readFile(path.join(root,name));
   if(name==='app.js')body=Buffer.from(body+"\nglobalThis.lyricQA={state,audio,syncLyrics,selectTrack};visual.stopLoop();");
   await route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(name)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:''})}
 });
 await page.goto('https://lyrics.test');await page.waitForFunction(()=>globalThis.lyricQA);
 const b=Buffer.alloc(44+16000*12*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 for(let i=44;i<b.length;i+=2)b.writeInt16LE(Math.round(4000*Math.sin((i-44)/2*2*Math.PI*330/16000)),i);
 await page.evaluate(()=>lyricQA.audio.muted=true);
 await page.locator('#audio-import').setInputFiles({name:'Original lyric fixture.wav',mimeType:'audio/wav',buffer:b});
 await page.waitForFunction(()=>lyricQA.state.current&&!lyricQA.audio.paused);
 await page.locator('#lrc-import').setInputFiles({name:'fixture.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]First phrase\n[00:01.50]Second phrase\n[00:04.00]Third phrase')});
 await page.waitForFunction(()=>document.querySelector('#floating-line').textContent.includes('First phrase'));
 await page.waitForFunction(()=>document.querySelector('#floating-line').textContent.includes('Second phrase'),null,{timeout:5000});
 await page.evaluate(()=>lyricQA.audio.currentTime=5);
 await page.waitForFunction(()=>document.querySelector('#floating-line').textContent.includes('Third phrase'));
 await page.evaluate(()=>lyricQA.audio.currentTime=.2);
 await page.waitForFunction(()=>document.querySelector('#floating-line').textContent.includes('First phrase'));
 await page.locator('#play-button').click();const at=await page.evaluate(()=>lyricQA.audio.currentTime);
 await page.waitForTimeout(150);assert.ok(Math.abs(await page.evaluate(()=>lyricQA.audio.currentTime)-at)<.05);
 await page.evaluate(()=>{lyricQA.state.lyrics=[{time:0,text:'Replacement same index'}];lyricQA.syncLyrics()});
 assert.match(await page.locator('#floating-line').textContent(),/Replacement same index/);
 await page.evaluate(()=>{lyricQA.state.lyrics=[];lyricQA.state.lyricsSynced=false;lyricQA.state.lyricsLoading=false;lyricQA.state.plainLyrics=['Unsynced first','Unsynced second'];lyricQA.syncLyrics()});
 assert.match(await page.locator('#floating-line').textContent(),/sem sincronização/);
 assert.doesNotMatch(await page.locator('#floating-line').textContent(),/Unsynced first/);
 await page.evaluate(()=>{
  const file=new File(['delayed'],'late.lrc',{type:'text/plain'});
  globalThis.releaseLateLRC=null;
  file.text=()=>new Promise(resolve=>releaseLateLRC=resolve);
  const input=document.querySelector('#lrc-import'),transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
  lyricQA.selectTrack({...lyricQA.state.current,id:'local:next-fixture'},false);
  releaseLateLRC('[00:00.00]Obsolete imported lyrics');
 });
 await page.waitForTimeout(100);
 assert.doesNotMatch(await page.locator('#floating-line').textContent(),/Obsolete imported lyrics/);
 assert.deepEqual(errors,[]);
 console.log('PASS native lyric progression, forward/back seek, pause, same-index replacement, unsynchronized status and stale import cancellation');
}finally{await browser.close()}
