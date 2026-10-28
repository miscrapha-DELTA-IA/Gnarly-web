/** Add the measured recording duration to MediaRecorder's unindexed WebM header.
 * Only the small Info header is copied; encoded clusters stay Blob slices.
 * Never insert before indexes/known-length segments whose offsets would change.
 */
function vint(bytes,at,id=false){
 const first=bytes[at];if(!first)throw Error('Cabeçalho WebM inválido.');let length=1;
 while(length<=8&&!(first&(1<<(8-length))))length++;
 if(length>8||at+length>bytes.length)throw Error('Cabeçalho WebM incompleto.');
 let value=id?first:first&((1<<(8-length))-1),unknown=!id&&value===((1<<(8-length))-1);
 for(let i=1;i<length;i++){value=value*256+bytes[at+i];unknown=unknown&&bytes[at+i]===255}
 return {length,value,unknown};
}
function element(bytes,at){const tag=vint(bytes,at,true),size=vint(bytes,at+tag.length);return {id:tag.value,start:at,data:at+tag.length+size.length,end:at+tag.length+size.length+size.value,size}}
function sizeBytes(value){let length=1;while(value>=2**(7*length)-1)length++;const result=new Uint8Array(length);let n=value;for(let i=length-1;i>=0;i--){result[i]=n%256;n=Math.floor(n/256)}result[0]|=1<<(8-length);return result}
export async function finalizeWebM(blob,seconds){
 if(!blob.type.includes('webm'))return blob;
 if(!Number.isFinite(seconds)||seconds<=0||seconds>20)throw Error('Duração de captura inválida.');
 const bytes=new Uint8Array(await blob.slice(0,65536).arrayBuffer());let at=0,segment;
 while(at<bytes.length){const item=element(bytes,at);if(item.id===0x18538067){segment=item;break}if(item.size.unknown)break;at=item.end}
 if(!segment)throw Error('O navegador gerou um WebM sem segmento de vídeo.');
 let info,hasIndex=false;at=segment.data;
 while(at<bytes.length){const item=element(bytes,at);if(item.id===0x114d9b74||item.id===0x1c53bb6b)hasIndex=true;if(item.id===0x1549a966)info=item;if(item.id===0x1f43b675||item.size.unknown)break;at=item.end}
 if(!info||info.end>bytes.length)throw Error('O navegador gerou um cabeçalho WebM incompatível.');
 let scale=1000000,existing;at=info.data;
 while(at<info.end){const item=element(bytes,at);if(item.end>info.end||item.size.unknown)throw Error('Metadados WebM inválidos.');if(item.id===0x2ad7b1){scale=0;for(let i=item.data;i<item.end;i++)scale=scale*256+bytes[i]}if(item.id===0x4489)existing=item;at=item.end}
 if(!(scale>0))throw Error('Relógio WebM inválido.');
 const units=seconds*1e9/scale;
 if(existing){if(![4,8].includes(existing.size.value))throw Error('Duração WebM incompatível.');const view=new DataView(bytes.buffer);existing.size.value===4?view.setFloat32(existing.data,units):view.setFloat64(existing.data,units);return new Blob([bytes,blob.slice(bytes.length)],{type:blob.type})}
 if(hasIndex||!segment.size.unknown)throw Error('Este WebM requer um finalizador com suporte a índices.');
 const duration=new Uint8Array(11);duration.set([0x44,0x89,0x88]);new DataView(duration.buffer).setFloat64(3,units);
 const header=new Uint8Array(4);new DataView(header.buffer).setUint32(0,0x1549a966);
 return new Blob([blob.slice(0,info.start),header,sizeBytes(info.size.value+duration.length),blob.slice(info.data,info.end),duration,blob.slice(info.end)],{type:blob.type});
}
