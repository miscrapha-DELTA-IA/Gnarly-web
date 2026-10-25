import {test} from 'node:test';import assert from 'node:assert/strict';import {evaluateStemStatus,classifyCloudFiles,assignCloudStems} from '../lib/demucs-cloud.js';
test('model identity is explicit, free-only, no silent fallback',()=>{
 const quality=evaluateStemStatus({enabled:true,free_only:true,provider_available:true,provider:'community_bs_roformer',model:'bs-roformer-musdb18hq',requires_beta_code:false});
 assert.equal(quality.ready,true);assert.equal(quality.providerName,'BS-RoFormer');assert.equal(quality.demucsReady,false);
 const owned=evaluateStemStatus({...quality,provider:'owned_htdemucs',model:'htdemucs'});
 assert.equal(owned.ready,true);assert.equal(owned.demucsReady,true);
 for(const p of ['unknown','community_bs_roformer']){
  const s=evaluateStemStatus({...quality,provider:p,model:'htdemucs'});
  assert.equal(s.ready,false);
 }
 assert.equal(evaluateStemStatus({...quality,free_only:false}).ready,false);
 assert.equal(evaluateStemStatus({...quality,provider_available:false}).ready,false);
});
test('community Gradio 4-stem endpoint shape is correctly mapped by names',()=>{
 const arr=[{url:'https://d-r-e-audio-separator.hf.space/gradio_api/file=/tmp/x/Other.wav',orig_name:'Other.wav'},{url:'https://d-r-e-audio-separator.hf.space/gradio_api/file=/tmp/x/Vocals.wav',orig_name:'Vocals.wav'},{url:'https://d-r-e-audio-separator.hf.space/gradio_api/file=/tmp/x/Drums.wav',orig_name:'Drums.wav'},{url:'https://d-r-e-audio-separator.hf.space/gradio_api/file=/tmp/x/Bass.wav',orig_name:'Bass.wav'}];
 const files=assignCloudStems(classifyCloudFiles(['Ready',arr,null,'ok'],'community_bs_roformer'));
 assert.match(files.vocal.orig_name,/Vocals/);assert.match(files.drums.orig_name,/Drums/);
 assert.throws(()=>assignCloudStems([...arr,arr[0]]));
 assert.throws(()=>assignCloudStems(arr.slice(1)));
});
test('owned HTDemucs contract is 5-tuple and rejects wrong model',()=>{
 const good=classifyCloudFiles([{url:'https://foo.hf.space/gradio_api/file=/tmp/v'}, {url:'https://foo.hf.space/gradio_api/file=/tmp/o'}, {url:'https://foo.hf.space/gradio_api/file=/tmp/d'}, {url:'https://foo.hf.space/gradio_api/file=/tmp/b'}, {model:'htdemucs'}],'owned_htdemucs');
 assert.equal(assignCloudStems(good).other.orig_name,'other.wav');
 assert.throws(()=>classifyCloudFiles([{}, {},{},{},{model:'bs-roformer'}],'owned_htdemucs'));
});
