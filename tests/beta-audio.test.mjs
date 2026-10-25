import test from 'node:test';
import assert from 'node:assert/strict';
import {betaEnabled, signSession,verifySession,trustedBackend,COOKIE_NAME} from '../netlify/lib/beta-auth.mjs';
import accessHandler from '../netlify/functions/beta-access.mjs';
import audioHandler,{validVideoId,MAX_AUDIO_BYTES} from '../netlify/functions/beta-audio.mjs';
const env={GNARLY_ENABLE_TEST_AUDIO:'true',GNARLY_BETA_ACCESS_CODE:'friends-beta-key-12345',GNARLY_BETA_SESSION_SECRET:'a_secure_beta_signature_secret_of_32_plus_chars',GNARLY_BACKEND_URL:'https://nightcorelab.onrender.com'};
const original={...process.env};
function withEnv(){Object.assign(process.env,env)}
function req(url,opts={}){return new Request(url,opts)}
const token=()=>`${COOKIE_NAME}=${signSession(env.GNARLY_BETA_SESSION_SECRET)}`;
test.after(()=>{for(const name of Object.keys(env)){if(Object.hasOwn(original,name))process.env[name]=original[name];else delete process.env[name]}});
test('Gate is disabled by default; rejects short secrets and unsafe backends',()=>{
 assert.equal(betaEnabled({}),false);
 assert.equal(betaEnabled({...env,GNARLY_BETA_ACCESS_CODE:'123'}),false);
 assert.equal(betaEnabled(env),true);
 assert.equal(trustedBackend({...env,GNARLY_BACKEND_URL:'http://evil.invalid'}),null);
 assert.equal(validVideoId('aaa-bbb_cc1'),true);
 assert.equal(validVideoId('https://evil'),false);
});
test('Signed cookie authenticates and expires',()=>{
 const stamp=Date.UTC(2026,9,25);
 const c=`${COOKIE_NAME}=${signSession(env.GNARLY_BETA_SESSION_SECRET,stamp)}`;
 assert.equal(verifySession(req('https://gnarlyweb.netlify.app/api/beta-audio',{headers:{cookie:c}}),env.GNARLY_BETA_SESSION_SECRET,stamp),true);
 assert.equal(verifySession(req('https://gnarlyweb.netlify.app/api/beta-audio',{headers:{cookie:c}}),'wrongsecret',stamp),false);
 assert.equal(verifySession(req('https://gnarlyweb.netlify.app/api/beta-audio',{headers:{cookie:c}}),env.GNARLY_BETA_SESSION_SECRET,stamp+8*86400*1000),false);
});
test('Authentication endpoint never exposes PIN and uses secure cookie',async()=>{
 withEnv();
 let response=await accessHandler(req('https://gnarlyweb.netlify.app/api/beta-access'));
 assert.deepEqual(await response.json(),{enabled:true,authenticated:false});
 response=await accessHandler(req('https://gnarlyweb.netlify.app/api/beta-access',{method:'POST',body:JSON.stringify({code:'wrong'})}));
 assert.equal(response.status,401);
 response=await accessHandler(req('https://gnarlyweb.netlify.app/api/beta-access',{method:'POST',body:JSON.stringify({code:env.GNARLY_BETA_ACCESS_CODE})}));
 assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax; Path=\/api/);
 assert.equal((await response.text()).includes(env.GNARLY_BETA_ACCESS_CODE),false);
});
test('Audio endpoint rejects unauthenticated and invalid IDs without calling backend',async()=>{
 withEnv();
 let response=await audioHandler(req('https://gnarlyweb.netlify.app/api/beta-audio?id=aaa-bbb_cc1'));
 assert.equal(response.status,401);
 response=await audioHandler(req('https://gnarlyweb.netlify.app/api/beta-audio?id=javascript:alert(1)',{headers:{cookie:token()}}));
 assert.equal(response.status,400);
});
test('Authorized requests use fixed YouTube URL, forward range, and stream audio',async()=>{
 withEnv(); const actualFetch=globalThis.fetch;let captured;
 globalThis.fetch=async(url,opts)=>{captured={url:String(url),opts};return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'content-type':'audio/mp4','content-length':'4','content-range':'bytes 0-3/4','accept-ranges':'bytes'}})};
 try{const response=await audioHandler(req('https://gnarlyweb.netlify.app/api/beta-audio?id=aaa-bbb_cc1',{headers:{cookie:token(),range:'bytes=0-3'}}));
 assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-3/4');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(captured.url,/^https:\/\/nightcorelab.onrender.com\/download\?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Daaa-bbb_cc1$/);
 assert.equal(captured.opts.headers.range,'bytes=0-3');
 assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())),[1,2,3,4]);
 }finally{globalThis.fetch=actualFetch}
});
test('Blocks files over provider response limit',async()=>{
 withEnv();const actualFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response('not a real 20MB body',{headers:{'content-type':'audio/mp4','content-length':String(MAX_AUDIO_BYTES+1)}});
 try{const response=await audioHandler(req('https://gnarlyweb.netlify.app/api/beta-audio?id=aaa-bbb_cc1',{headers:{cookie:token()}}));assert.equal(response.status,413)}finally{globalThis.fetch=actualFetch}
});
