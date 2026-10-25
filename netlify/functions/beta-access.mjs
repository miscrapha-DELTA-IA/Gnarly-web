import {betaEnabled,COOKIE_NAME,signSession,verifySession,equalConstantTime,responseHeaders} from '../lib/beta-auth.mjs';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{...responseHeaders,...headers}});
export default async function handler(request){
  const enabled=betaEnabled();
  if(request.method==='GET')return json({enabled,authenticated:enabled&&verifySession(request,process.env.GNARLY_BETA_SESSION_SECRET)});
  if(request.method!=='POST')return json({error:'Método não permitido'},405);
  if(!enabled)return json({enabled:false,error:'Modo de testes não configurado no Netlify'},503);
  let payload;try{const input=await request.text();if(input.length>512)throw Error('large');payload=JSON.parse(input)}catch{return json({error:'Código inválido'},400)}
  const code=typeof payload?.code==='string'?payload.code:'';
  if(code.length>128 || !equalConstantTime(code,process.env.GNARLY_BETA_ACCESS_CODE))return json({error:'Código de convite incorreto'},401);
  const cookie=`${COOKIE_NAME}=${signSession(process.env.GNARLY_BETA_SESSION_SECRET)}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=604800`;
  return json({enabled:true,authenticated:true},200,{'set-cookie':cookie});
}
export const config={path:'/api/beta-access',method:['GET','POST']};
