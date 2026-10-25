/** HTDemucs via existing Stage72 signed, free-only ZeroGPU contract.
 * Never silently route a Demucs request to another model. Audio is uploaded
 * to the named Hugging Face Space only after the user explicitly requests it.
 */
import {mapStemFiles} from './stem-mixer.js';
const BACKEND='https://nightcorelab.onrender.com';
const MAX_FILE=35*1024*1024;
export async function demucsStatus(fetcher=fetch){
 const res=await fetcher(BACKEND+'/v1/stems/cloud',{cache:'no-store'});
 if(!res.ok)throw new Error('Estado do servidor Stems indisponível.');
 const s=await res.json();
 return {...s,demucsReady:s.enabled===true&&s.provider==='owned_htdemucs'&&s.model==='htdemucs'};
}
function trustedSpace(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||!/^[-a-z0-9]+\.hf\.space$/.test(u.hostname)||u.username||u.password||u.search||u.hash)throw new Error('Origem de GPU inválida.');
 return u.origin;
}
function secureFileUrl(space,value){
 const url=new URL(typeof value==='string'?value:value?.url||value?.path||'',space);
 if(url.protocol!=='https:'||url.origin!==space||!url.pathname.startsWith('/gradio_api/file='))throw Error('Arquivo de saída fora da origem do Space.');
 return url.href;
}
export async function prepareDemucsAudio(track,player,{fetcher=fetch}={}){
 const source=track?.source==='local'?track?.url:player?.currentSrc||player?.src;
 if(!source)throw Error('Selecione uma música para separar.');
 const response=await fetcher(source);
 if(!response.ok)throw Error('Não foi possível acessar o áudio original para separação.');
 const size=Number(response.headers.get('content-length'));
 if(size>MAX_FILE)throw Error('Arquivo excede 35 MB: o processamento gratuito não suporta esta faixa.');
 const blob=await response.blob();
 if(blob.size>MAX_FILE)throw Error('O áudio excede o limite gratuito de 35 MB.');
 const seconds=Number(player?.duration||track?.duration);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>=600)throw Error('Duração deve ser conhecida e inferior a 10 minutos.');
 return {blob,seconds};
}
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function separateWithDemucs({blob,seconds,signal,onStatus=()=>{},fetcher=fetch}){
 if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
 const status=await demucsStatus(fetcher);
 if(!status.demucsReady)throw Error('HTDemucs GPU ainda não está habilitado no servidor. Configure um Space próprio ZeroGPU e ative o provedor owned_htdemucs.');
 if(status.requires_beta_code)throw Error('HTDemucs exige autorização de beta do servidor. Nenhuma credencial será solicitada ou exposta no navegador.');
 // The admission ticket supplies the exact approved Space origin.
 onStatus('Calculando integridade do áudio…');
 const data=await blob.arrayBuffer();
 const sha256=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',data)));
 onStatus('Solicitando vaga na GPU gratuita…');
 const ticketResp=await fetcher('/api/stems-ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sha256,bytes:blob.size,seconds}),signal});
 const ticket=await ticketResp.json().catch(()=>({}));
 if(!ticketResp.ok)throw Error(ticket.detail||ticket.error||'GPU não autorizou este pedido.');
 if(ticket.provider!=='owned_htdemucs'||ticket.model!=='htdemucs')throw Error('Modelo diferente de HTDemucs. Operação bloqueada.');
 const space=trustedSpace(ticket.space_url);
 onStatus('Enviando áudio à GPU; o arquivo não passa pelo Netlify…');
 const form=new FormData();form.append('files',new File([data],'gnarly-source.m4a',{type:'audio/mp4'}));
 const upload=await fetcher(space+'/gradio_api/upload',{method:'POST',body:form,signal});
 if(!upload.ok)throw Error('O Space não aceitou o upload de áudio.');
 const uploaded=await upload.json();
 const path=Array.isArray(uploaded)?uploaded[0]:null;
 if(typeof path!=='string'||!path)throw Error('Resposta inválida da GPU no upload.');
 onStatus('Executando HTDemucs · 4 fontes…');
 const start=await fetcher(space+'/gradio_api/call/separate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:[{path,meta:{_type:'gradio.FileData'}},ticket.ticket]}),signal});
 if(!start.ok)throw Error('O processamento Demucs não iniciou.');
 const {event_id}=await start.json();
 if(!/^[\w-]{5,160}$/.test(event_id||''))throw Error('Identificador de job inválido.');
 const events=await fetcher(space+'/gradio_api/call/separate/'+encodeURIComponent(event_id),{signal,headers:{Accept:'text/event-stream'}});
 if(!events.ok||!events.body)throw Error('Fila da GPU indisponível.');
 const reader=events.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;let eventName='';
 for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(line.startsWith('event:'))eventName=line.slice(6).trim();else if(line.startsWith('data:')){let payload;try{payload=JSON.parse(line.slice(5))}catch{continue}if(eventName==='error')throw Error('A GPU não conseguiu separar a faixa.');if(eventName==='complete'){result=payload;break}}}if(result)break;}
 if(!Array.isArray(result)||result.length<5)throw Error('HTDemucs não retornou as quatro fontes.');
 onStatus('Baixando fontes separadas…');
 const names=['vocals','other','drums','bass'];const files=[];
 for(let i=0;i<4;i++){const src=secureFileUrl(space,result[i]);const r=await fetcher(src,{signal});if(!r.ok)throw Error('Falha no download do stem '+names[i]);const b=await r.blob();if(b.size>155*1024*1024)throw Error('Stem excede limite de memória para o navegador.');files.push(new File([b],names[i]+'.wav',{type:'audio/wav'}));}
 mapStemFiles(files);
 return files;
}
