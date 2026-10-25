/** GNARLY 4-stem cloud separator, constrained to the audited free GPU contract.
 * Explicit model identity: community BS-RoFormer or owned HTDemucs.
 * No invisible fallback to an unrelated model or paid inference provider.
 */
import {classifyStemFilename,mapStemFiles} from './stem-mixer.js';
const BACKEND='https://nightcorelab.onrender.com';
const MAX_AUDIO=35*1024*1024,MAX_STEM=155*1024*1024;
export const CLOUD_MODELS=Object.freeze({
 community_bs_roformer:{model:'bs-roformer-musdb18hq',name:'BS-RoFormer',mode:'Core instruments — 4 tracks',endpoint:'separate'},
 owned_htdemucs:{model:'htdemucs',name:'HTDemucs',endpoint:'separate'}
});
export function evaluateStemStatus(status){
 const candidate=CLOUD_MODELS[status?.provider];
 const ready=!!(status?.enabled&&status?.free_only&&status?.provider_available!==false&&candidate&&candidate.model===status.model&&!status.requires_beta_code);
 return {...status,ready:!!ready,providerName:candidate?.name||'Indisponível',demucsReady:!!(ready&&status.provider==='owned_htdemucs'),qualityReady:!!(ready&&status.provider==='community_bs_roformer')};
}
export async function demucsStatus(fetcher=fetch){
 const res=await fetcher(BACKEND+'/v1/stems/cloud',{cache:'no-store'});
 if(!res.ok)throw Error('Estado do servidor de Stems indisponível.');
 return evaluateStemStatus(await res.json());
}
function trustedSpace(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||!/^[-a-z0-9]+\.hf\.space$/.test(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('Origem da GPU inválida.');
 return u.origin;
}
function secureFileUrl(space,value){
 const v=typeof value==='string'?value:(value?.url||'');
 const u=new URL(v,space);
 if(u.protocol!=='https:'||u.origin!==space||!u.pathname.startsWith('/gradio_api/file='))throw Error('O Space retornou um arquivo fora da origem autorizada.');
 return u.href;
}
function filenameOf(value){
 if(typeof value==='string')return decodeURIComponent(value.split('/').pop()||'');
 return String(value?.orig_name||value?.name||value?.path||value?.url||'').split('/').pop()||'';
}
export function classifyCloudFiles(payload,provider){
 if(provider==='community_bs_roformer'){
  if(!Array.isArray(payload)||!Array.isArray(payload[1]))throw Error('O BS-RoFormer não retornou arquivos independentes.');
  return payload[1];
 }
 if(provider==='owned_htdemucs'){
  if(!Array.isArray(payload)||payload.length<5||payload[4]?.model!=='htdemucs')throw Error('Resposta HTDemucs inesperada.');
  return ['vocals','other','drums','bass'].map((kind,i)=>({...payload[i],orig_name:kind+'.wav'}));
 }
 throw Error('Provedor de separação não autorizado.');
}
export function assignCloudStems(list){
 const found={};
 for(const entry of list){
  const name=filenameOf(entry);
  const kind=classifyStemFilename(name);
  if(!kind||found[kind])throw Error('A GPU não retornou exatamente quatro arquivos distintos e identificáveis.');
  found[kind]=entry;
 }
 if(['vocal','drums','bass','other'].some(x=>!found[x]))throw Error('A GPU não retornou Voz, Bateria, Baixo e Outros.');
 return found;
}
function outputFilename(blob){
 const type=(blob.type||'').toLowerCase();
 if(type.includes('wav')||type.includes('wave'))return 'gnarly-source.wav';
 if(type.includes('mpeg')||type.includes('mp3'))return 'gnarly-source.mp3';
 if(type.includes('flac'))return 'gnarly-source.flac';
 if(type.includes('ogg'))return 'gnarly-source.ogg';
 return 'gnarly-source.m4a';
}
export async function prepareDemucsAudio(track,player,{fetcher=fetch,signal}={}){
 const source=track?.source==='local'?track?.url:player?.currentSrc||player?.src;
 if(!source)throw Error('Selecione uma música antes de separar.');
 const seconds=Number(player?.duration||track?.duration);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>=600)throw Error('Duração precisa ser conhecida e menor que 10 minutos.');
 const res=await fetcher(source,{signal});
 if(!res.ok)throw Error('Falha ao obter áudio original para separação. HTTP '+res.status+'.');
 const announced=Number(res.headers?.get?.('content-length')||0);
 if(announced>MAX_AUDIO)throw Error('O arquivo excede o limite gratuito de 35 MB.');
 const blob=await res.blob();
 if(!blob.size||blob.size>MAX_AUDIO)throw Error('Arquivo vazio ou maior que 35 MB.');
 return {blob,seconds};
}
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function readSSE(resp,signal,onStatus){
 if(!resp.ok||!resp.body)throw Error('Fila da GPU indisponível.');
 const reader=resp.body.getReader(),decode=new TextDecoder();let buffer='',name='',dataLines=[],result=null;
 const dispatch=()=>{
  if(!dataLines.length)return;
  const data=dataLines.join('\n');dataLines=[];
  if(name==='error')throw Error('A GPU não concluiu a separação; tente novamente após a cota renovar.');
  if(name==='generating')onStatus('Processando quatro fontes na GPU…');
  if(name==='complete'){try{result=JSON.parse(data)}catch{throw Error('Resposta final da GPU inválida.')}}
  name='';
 };
 try{
  while(!result){if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
   const {value,done}=await reader.read();if(done){dispatch();break}
   buffer+=decode.decode(value,{stream:true});
   if(buffer.length>512*1024)throw Error('Resposta de GPU excedeu o limite de protocolo.');
   let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos).replace(/\r$/,'');buffer=buffer.slice(pos+1);
    if(!line){dispatch();if(result)break}
    else if(line.startsWith('event:'))name=line.slice(6).trim();
    else if(line.startsWith('data:'))dataLines.push(line.slice(5).trimStart());
   }
  }
 }finally{try{await reader.cancel()}catch{}}
 if(!result)throw Error('A conexão da GPU terminou antes de entregar os Stems.');
 return result;
}
async function validWave(blob){
 const head=new Uint8Array(await blob.slice(0,16).arrayBuffer());
 const s=(start,len)=>String.fromCharCode(...head.slice(start,start+len));
 return (s(0,4)==='RIFF'&&s(8,4)==='WAVE')||s(0,4)==='fLaC'||s(0,3)==='ID3'||s(4,4)==='ftyp';
}
export async function separateWithBestModel({blob,seconds,status,signal,onStatus=()=>{},fetcher=fetch}){
 if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
 const model=status||await demucsStatus(fetcher);
 const chosen=CLOUD_MODELS[model.provider];
 if(!model.ready||!chosen||chosen.model!==model.model)throw Error('GPU de separação indisponível ou modelo alterado; nenhuma GPU paga será utilizada.');
 onStatus('Calculando SHA-256 do áudio…');
 const data=await blob.arrayBuffer();
 const sha256=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',data)));
 if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
 onStatus('Solicitando autorização de processamento gratuito…');
 const admission=await fetcher('/api/stems-ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sha256,bytes:blob.size,seconds}),signal});
 const ticket=await admission.json().catch(()=>({}));
 if(!admission.ok)throw Error(String(ticket.detail||ticket.error||'O servidor não autorizou a separação.'));
 if(ticket.provider!==model.provider||ticket.model!==chosen.model)throw Error('O modelo de GPU mudou durante a autorização. Operação cancelada.');
 const space=trustedSpace(ticket.space_url);
 onStatus('Enviando áudio ao Space externo, conforme autorizado…');
 const form=new FormData();
 form.append('files',new File([data],outputFilename(blob),{type:blob.type||'audio/mp4'}));
 const uploadedResp=await fetcher(space+'/gradio_api/upload',{method:'POST',body:form,signal});
 if(!uploadedResp.ok)throw Error('A GPU não aceitou o upload. HTTP '+uploadedResp.status+'.');
 const uploaded=await uploadedResp.json();const remotePath=Array.isArray(uploaded)?uploaded[0]:null;
 if(typeof remotePath!=='string'||!remotePath.startsWith('/tmp/'))throw Error('A GPU respondeu com caminho de arquivo inesperado.');
 const params=[{path:remotePath,meta:{_type:'gradio.FileData'}}];
 if(model.provider==='community_bs_roformer')params.push(chosen.mode);
 else params.push(ticket.ticket);
 onStatus(chosen.name+' · aguardando vaga na GPU gratuita…');
 const start=await fetcher(space+'/gradio_api/call/'+chosen.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:params}),signal});
 if(!start.ok)throw Error('A GPU não aceitou a separação.');
 const {event_id}=await start.json();
 if(!/^[\w-]{5,160}$/.test(event_id||''))throw Error('Identificador da fila inválido.');
 const result=await readSSE(await fetcher(space+'/gradio_api/call/'+chosen.endpoint+'/'+encodeURIComponent(event_id),{headers:{accept:'text/event-stream'},signal}),signal,onStatus);
 const mapped=assignCloudStems(classifyCloudFiles(result,model.provider));
 const names={vocal:'vocals',drums:'drums',bass:'bass',other:'other'},files=[];
 let downloaded=0;
 for(const kind of ['vocal','drums','bass','other']){
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
  onStatus('Baixando e verificando '+names[kind]+'…');
  const file=mapped[kind];
  const response=await fetcher(secureFileUrl(space,file),{signal});
  if(!response.ok)throw Error('Falha ao transferir '+names[kind]+'.');
  const size=Number(response.headers?.get?.('content-length')||0);
  if(size>MAX_STEM||downloaded+size>510*1024*1024)throw Error('Saída grande demais para o mixer no navegador. Use arquivos separados no computador.');
  const content=await response.blob();downloaded+=content.size;
  if(!content.size||content.size>MAX_STEM||downloaded>510*1024*1024||!(await validWave(content)))throw Error('O arquivo '+names[kind]+' não contém áudio válido.');
  files.push(new File([content],names[kind]+'.wav',{type:'audio/wav'}));
 }
 mapStemFiles(files);
 onStatus('Quatro fontes verificadas · '+chosen.name+'.');
 return {files,model:chosen.name};
}
export const separateWithDemucs=separateWithBestModel;
