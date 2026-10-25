import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStemStatus,separateWithBestModel,prepareDemucsAudio} from '../lib/demucs-cloud.js';

test('GNARLY four-source flow: signed admission, community Gradio queue and validated WAV downloads',async()=>{
 const model=evaluateStemStatus({enabled:true,free_only:true,provider:'community_bs_roformer',provider_available:true,model:'bs-roformer-musdb18hq',requires_beta_code:false});
 const space='https://d-r-e-audio-separator.hf.space',calls=[];
 const bytes=new TextEncoder().encode('RIFFxxxxWAVEfmt - synthetic model test');
 const audio=new Blob([bytes],{type:'audio/wav'});
 const names=['01_vocals.wav','02_drums.wav','03_bass.wav','04_other.wav'];
 const list=names.map(name=>({orig_name:name,url:space+'/gradio_api/file=/tmp/model/'+name}));
 const payload=['Ready',list,null,'done'];
 const fetcher=async (url,options={})=>{
  url=String(url);calls.push({url,options});
  if(url==='/api/stems-ticket'){
   const req=JSON.parse(options.body);
   assert.match(req.sha256,/^[0-9a-f]{64}$/);
   assert.equal(req.bytes,audio.size);
   return Response.json({provider:'community_bs_roformer',model:'bs-roformer-musdb18hq',space_url:space,ticket:'mock-admission'});
  }
  if(url.endsWith('/gradio_api/upload')){
   assert.equal(options.method,'POST');
   return Response.json(['/tmp/gradio/mock-source.wav']);
  }
  if(url.endsWith('/gradio_api/call/separate')&&options.method==='POST'){
   const req=JSON.parse(options.body);
   assert.equal(req.data[1],'Core instruments — 4 tracks');
   assert.equal(req.data[0].meta._type,'gradio.FileData');
   return Response.json({event_id:'1234abcd0000'});
  }
  if(url.endsWith('/gradio_api/call/separate/1234abcd0000')){
   return new Response('event: generating\ndata: null\n\nevent: complete\ndata: '+JSON.stringify(payload)+'\n\n',{headers:{'content-type':'text/event-stream'}});
  }
  if(url.includes('/gradio_api/file='))return new Response(bytes,{headers:{'content-type':'audio/wav'}});
  throw Error('Unexpected request '+url);
 };
 const result=await separateWithBestModel({blob:audio,seconds:3,status:model,fetcher});
 assert.equal(result.model,'BS-RoFormer');
 assert.equal(result.files.length,4);
 assert.deepEqual(result.files.map(f=>f.name),['vocals.wav','drums.wav','bass.wav','other.wav']);
 assert.equal(calls.filter(c=>c.url.includes('/gradio_api/file=')).length,4);
 assert.equal(calls.filter(c=>c.url==='/api/stems-ticket').length,1);
});
test('invalid model configuration cannot trigger an upload or admission',async()=>{
 const blob=new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'});
 const fetcher=async()=>{throw Error('Should not be called')};
 await assert.rejects(()=>separateWithBestModel({blob,seconds:3,status:evaluateStemStatus({enabled:true,free_only:true,provider:'unknown',model:'htdemucs'}),fetcher}),/GPU de separação indisponível/);
});
test('source extraction observes maximum size and duration before audio processing',async()=>{
 const blob=new Blob([new Uint8Array([1])],{type:'audio/wav'});
 await assert.rejects(()=>prepareDemucsAudio({source:'local',url:'blob:hello',duration:900},{duration:900},{fetcher:async()=>{throw Error('must not fetch')}}),/menor que 10 minutos/);
 const ready=await prepareDemucsAudio({source:'local',url:'blob:own'},{duration:3},{fetcher:async()=>new Response(blob)});
 assert.equal(ready.seconds,3);assert.equal(ready.blob.size,1);
});
