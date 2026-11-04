import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio,verifiedMP4Bytes} from '../functions/fast-audio/[id].js';

const id='ABCDEFGHIJK';
function body({invalid=false}={}){
 const bytes=new Uint8Array(4096);
 bytes.set([0,0,0,24,102,116,121,112,77,52,65,32],0);
 const view=new DataView(bytes.buffer);
 const atom=(offset,size,type)=>{
  view.setUint32(offset,size);
  bytes.set([...type].map(c=>c.charCodeAt(0)),offset+4);
 };
 if(!invalid){
  atom(24,32,'moov');
  atom(56,4096-56,'mdat');
 }
 return bytes;
}
async function load({attested=false,invalid=false,status=200,range=null}={}){
 const writes=[],pending=[],bytes=body({invalid});
 const bucket={get:async()=>null,head:async()=>null,
  async put(key,stream,metadata){writes.push({key,metadata,bytes:new Uint8Array(stream)})}};
 const request=new Request('https://gnarly-web-pages.pages.dev/fast-audio/'+id+
  '?cached-only=1',{headers:range?{Range:range}:{}});
 const response=await handleFastAudio({
  request,params:{id},env:{GNARLY_AUDIO_R2:bucket},waitUntil:p=>pending.push(p)
 },async()=>new Response(bytes,{status,headers:{
  'Content-Length':String(bytes.length),'Content-Type':'audio/mp4',
  ...(attested?{'X-Gnarly-Integrity':'decoded-v1'}:{})
 }}));
 await response.arrayBuffer();
 await Promise.all(pending);
 return {response,writes};
}

test('MP4 admission checks complete ftyp/moov/mdat boundaries',()=>{
 assert.equal(verifiedMP4Bytes(body()),true);
 assert.equal(verifiedMP4Bytes(body({invalid:true})),false);
 assert.equal(verifiedMP4Bytes(new Uint8Array(100)),false);
 const truncated=body().subarray(0,3500);
 assert.equal(verifiedMP4Bytes(truncated),false);
});

test('old unverified, possibly silent M4A remains streamable but never enters R2',async()=>{
 const data=await load();
 assert.equal(data.response.status,200);
 assert.equal(data.writes.length,0);
});

test('attested complete media is promoted with integrity metadata',async()=>{
 const data=await load({attested:true});
 assert.equal(data.response.status,200);
 assert.equal(data.writes.length,1);
 assert.equal(data.writes[0].key,id+'/audio.m4a');
 assert.equal(data.writes[0].metadata.customMetadata.integrity,'decoded-v1');
});

test('a forged integrity claim is insufficient for a malformed container',async()=>{
 const data=await load({attested:true,invalid:true});
 assert.equal(data.response.status,200);
 assert.equal(data.writes.length,0);
});
