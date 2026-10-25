// Server-only ticket bridge: forwards no music and never stores audio or secrets.
const BACKEND='https://nightcorelab.onrender.com';
export default async (request)=>{
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const body=await request.json();
  if(!/^[a-f0-9]{64}$/.test(body.sha256||'')||!Number.isFinite(body.bytes)||body.bytes<1||body.bytes>35*1024*1024||!Number.isFinite(body.seconds)||body.seconds<=0||body.seconds>=600)return Response.json({error:'Metadados inválidos.'},{status:400});
  const upstream=await fetch(BACKEND+'/v1/stems/cloud/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sha256:body.sha256,bytes:body.bytes,seconds:body.seconds}),signal:AbortSignal.timeout(12000)});
  const json=await upstream.json().catch(()=>({detail:'Servidor Demucs indisponível.'}));
  return Response.json(json,{status:upstream.status,headers:{'cache-control':'no-store'}});
 }catch{return Response.json({error:'Não foi possível consultar a GPU.'},{status:502})}
};
export const config={path:'/api/stems-ticket'};
