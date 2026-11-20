import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vocalWords,compareSungWords,encodeVoiceWav,transcribeSinging} from '../lib/karaoke-whisper.js';
import worker from '../src/worker.js';

const lines=[
 {time:0,text:'Olá, você chegou ao meu coração'},
 {time:4,text:'Vamos cantar esta linda canção'},
 {time:8,text:'O mundo inteiro vai escutar'}
];
test('Whisper review compares only source-time LRC lines and normalizes accents',()=>{
 assert.deepEqual(vocalWords('Canção, VOCÊ!'),['cancao','voce']);
 const full=compareSungWords({lines,from:4,to:8,transcript:'Vamos cantar esta linda canção'});
 assert.equal(full.similarity,100);
 assert.equal(full.expectedWords,5);
 const repeat=compareSungWords({lines,from:4,to:8,transcript:'vamos vamos vamos'});
 assert.ok(repeat.similarity<40,'repeating one lyric cannot earn full correctness');
 assert.equal(compareSungWords({lines:[],from:4,to:8,transcript:'voz'}),null);
 assert.equal(compareSungWords({lines,from:8,to:8,transcript:'voz'}),null);
});
class FakeAudioContext{
 constructor(){this.state='running'}
 async decodeAudioData(){
  const channel=new Float32Array(8000);
  for(let i=0;i<channel.length;i++)channel[i]=Math.sin(2*Math.PI*220*i/8000)*.25;
  return {duration:1,sampleRate:8000,numberOfChannels:1,length:8000,getChannelData:()=>channel};
 }
 async close(){this.state='closed'}
}
test('Voice export is a 16kHz mono PCM WAV, independent of backing-track audio',async()=>{
 const wav=await encodeVoiceWav(new Blob([new Uint8Array(256)]),{AudioContextClass:FakeAudioContext});
 assert.equal(wav.type,'audio/wav');
 assert.equal(wav.size,32044);
 const buf=await wav.arrayBuffer(),view=new DataView(buf);
 assert.equal(String.fromCharCode(...new Uint8Array(buf,0,4)),'RIFF');
 assert.equal(view.getUint32(24,true),16000);
 assert.equal(view.getUint16(22,true),1);
 assert.notEqual(view.getInt16(46,true),0);
});
test('Voice transcript requires opt-in header and supports request cancellation',async()=>{
 let called=0;
 const fakeFetch=async (url,init)=>{
  called++;
  assert.equal(url,'/api/lyrics-ai');
  assert.equal(init.method,'POST');
  assert.equal(init.headers['x-gnarly-audio-consent'],'yes');
  assert.equal(init.body.type,'audio/wav');
  return Response.json({plainLines:['Vamos cantar esta linda canção']});
 };
 const blob=new Blob([new Uint8Array(256)]);
 const result=await transcribeSinging(blob,{fetchImpl:fakeFetch,AudioContextClass:FakeAudioContext});
 assert.equal(result.transcript,'Vamos cantar esta linda canção');
 assert.equal(called,1);
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(transcribeSinging(blob,{fetchImpl:fakeFetch,AudioContextClass:FakeAudioContext,signal:aborted.signal}));
 assert.equal(called,1,'an abort during WAV creation must prevent network upload');
});
test('Production Cloudflare Worker serves consented Whisper endpoint with AI binding',async()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.deepEqual(config.ai,{binding:'AI'});
 const request=(headers={},env={})=>worker.fetch(new Request('https://gnarly.test/api/lyrics-ai',{
  method:'POST',headers:{'content-type':'audio/wav','origin':'https://gnarly.test',...headers},
  body:new Uint8Array(32044).fill(1)
 }),{ASSETS:{fetch:()=>new Response('asset')},...env},{waitUntil:()=>{}});
 assert.equal((await request()).status,403,'microphone audio cannot be sent without explicit consent');
 assert.equal((await request({'x-gnarly-audio-consent':'yes'})).status,503,'AI unbound is a clear error');
 const illegal=await request({'x-gnarly-audio-consent':'yes','origin':'https://evil.test'},
  {AI:{run:async()=>({text:'x'})}});
 assert.equal(illegal.status,403);
});
test('UI keeps live score local; Whisper is explicit and cancelable',()=>{
 const stage=readFileSync(new URL('../ui/karaoke-stage.js',import.meta.url),'utf8');
 assert.match(stage,/id="karaoke-whisper-record"/);
 assert.match(stage,/this\.mic\.onRecording=blob=>/);
 assert.match(stage,/transcribeSinging\(blob,\{signal:controller.signal\}\)/);
 assert.match(stage,/this\.whisperController\?\.abort\(\)/);
 assert.match(stage,/this\.scorer\.tick\(this\.audio\.currentTime\|\|0/);
 assert.match(stage,/this\.cancelWhisper\(\);this\.mic\.stop\(\)/);
});
