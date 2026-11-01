import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Actual Chromium media playback with an entirely local generated WAV, not
// YouTube/backend. Proves combined effects retain rate, media clock and route.
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--autoplay-policy=no-user-gesture-required',
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader'
]});
try{
 for(const scenario of ['desktop','iOS Studio opt-in']){
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async scenario=>{
   const {WebAudioEngine}=await import('./lib/audio-engine.js');
   // 8s low-frequency wave, enough to expose bass boost and reverb.
   const rate=22050,frames=rate*8,b=new ArrayBuffer(44+frames*2),v=new DataView(b);
   const put=(offset,text)=>{for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i))};
   put(0,'RIFF');v.setUint32(4,b.byteLength-8,true);put(8,'WAVE');
   put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
   v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
   v.setUint16(32,2,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,frames*2,true);
   for(let i=0;i<frames;i++)v.setInt16(44+i*2,Math.round(16000*Math.sin(2*Math.PI*180*i/rate)),true);
   const url=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
   const audio=document.createElement('audio');document.body.append(audio);
   audio.src=url;audio.loop=true;
   const device=scenario==='desktop'?{userAgent:'Desktop',platform:'Win32'}:
    {userAgent:'iPhone',platform:'iPhone'};
   const engine=new WebAudioEngine(audio,{device,backgroundPriority:true});
   try{
    engine.setSpeed(.8,false);engine.setBass(9);engine.setReverb(.4);
    if(engine.nativeTransport)await engine.enableStudioEffects();
    else await engine.resume();
    const originalCtx=engine.ctx,originalSrc=engine.mediaSource;
    await audio.play();
    await new Promise(resolve=>setTimeout(resolve,250));
    const begin=audio.currentTime;
    for(let i=0;i<18;i++){
     engine.setSpeed(.73+(i%5)*.02,false,{persistDefault:false});
     engine.setBass((i*3)%12);
     engine.setReverb((i%7)/10);
     await new Promise(resolve=>setTimeout(resolve,20));
    }
    engine.setSpeed(.8,false);engine.setBass(10);engine.setReverb(.45);
    await new Promise(resolve=>setTimeout(resolve,250));
    return {paused:audio.paused,playbackRate:audio.playbackRate,
     defaultRate:audio.defaultPlaybackRate,preservesPitch:audio.preservesPitch,
     elapsed:audio.currentTime-begin,ctxState:engine.ctx.state,
     oneGraph:engine.ctx===originalCtx,oneMediaSource:engine.mediaSource===originalSrc,
     bassGain:engine.bassNode.gain.value,reverb:engine.reverb,
     audioError:audio.error?.code||0};
   }finally{audio.pause();URL.revokeObjectURL(url);audio.remove()}
  },scenario);
  assert.equal(result.audioError,0,scenario+' '+JSON.stringify(result));
  assert.equal(result.paused,false,scenario+' media must keep playing');
  assert.equal(result.ctxState,'running',scenario+' Web Audio must keep running');
  assert.ok(result.elapsed>.18,scenario+' playback clock must progress '+JSON.stringify(result));
  assert.ok(Math.abs(result.playbackRate-.8)<.01,scenario+' preserve Slowed speed '+JSON.stringify(result));
  assert.equal(result.preservesPitch,false,scenario+' pitch must stay in Slowed tape mode');
  assert.equal(result.oneGraph,true,scenario+' no DSP graph rebuild');
  assert.equal(result.oneMediaSource,true,scenario+' media element must not be reattached');
  assert.equal(result.bassGain,10,scenario+' bass stays enabled after reverb adjustment');
  assert.equal(result.reverb,.45,scenario+' reverb stays enabled after speed adjustment');
  console.log('DSP combined playback OK',scenario,result);
  await page.close();
 }
}finally{await browser.close()}
