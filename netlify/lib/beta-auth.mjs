import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'gnarly_beta_session';
const WEEK = 7 * 24 * 60 * 60;
export const betaEnabled = (env=process.env) => env.GNARLY_ENABLE_TEST_AUDIO === 'true' &&
  typeof env.GNARLY_BETA_ACCESS_CODE === 'string' && env.GNARLY_BETA_ACCESS_CODE.length >= 12 &&
  typeof env.GNARLY_BETA_SESSION_SECRET === 'string' && env.GNARLY_BETA_SESSION_SECRET.length >= 32;
export const responseHeaders = {'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const hash = (s,secret) => createHmac('sha256',secret).update(s).digest('hex');
export function equalConstantTime(a,b){const x=Buffer.from(hash(String(a),'gnarly-code-comparison'));const y=Buffer.from(hash(String(b),'gnarly-code-comparison'));return timingSafeEqual(x,y)}
export function signSession(secret, now=Date.now()){
  const expires=Math.floor(now/1000)+WEEK;
  const body='v1.'+expires;
  return body+'.'+hash(body,secret);
}
export function verifySession(request,secret,now=Date.now()){
  if(!secret || typeof secret!=='string')return false;
  const matches=String(request.headers.get('cookie')||'').split(';').map(x=>x.trim());
  const cookie=matches.find(x=>x.startsWith(COOKIE_NAME+'='));
  if(!cookie)return false;
  const token=cookie.slice(COOKIE_NAME.length+1);
  const match=/^(v1\.([0-9]{10}))\.([a-f0-9]{64})$/.exec(token);
  if(!match)return false;
  const expiry=Number(match[2]);
  if(expiry <= Math.floor(now/1000)||expiry>Math.floor(now/1000)+WEEK)return false;
  const expected=hash(match[1],secret);
  return timingSafeEqual(Buffer.from(match[3],'hex'),Buffer.from(expected,'hex'));
}
export function trustedBackend(env=process.env){
  try{const raw=env.GNARLY_BACKEND_URL||'https://nightcorelab.onrender.com'; const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
    return url;
  }catch{return null}
}
