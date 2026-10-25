import {test} from 'node:test';import assert from 'node:assert/strict';import {demucsStatus} from '../lib/demucs-cloud.js';
test('Demucs only enabled for owned HTDemucs provider',async()=>{
 for(const provider of ['community_bs_roformer','disabled']){
  const x=await demucsStatus(async()=>({ok:true,json:async()=>({enabled:true,provider,model:'htdemucs'})}));
  assert.equal(x.demucsReady,false);
 }
 const ready=await demucsStatus(async()=>({ok:true,json:async()=>({enabled:true,provider:'owned_htdemucs',model:'htdemucs'})}));
 assert.equal(ready.demucsReady,true);
});
