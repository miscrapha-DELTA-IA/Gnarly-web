// GNARLY WEB — Cloudflare Workers entrypoint.
// Keep the Pages-compatible handlers as the single source of truth for APIs.
// Requests for real music stay on the existing Render backend; never proxy
// full tracks or GPU stem outputs through the edge.
import {onRequestGet as catalog} from '../functions/api/catalog.js';
import {onRequestGet as omnibox} from '../functions/api/omnibox.js';
import {onRequestPost as stemsTicket} from '../functions/api/stems-ticket.js';
import {onRequestGet as metadata} from '../functions/api/metadata.js';
import {onRequestGet as artwork} from '../functions/api/artwork.js';
import {handleFastAudio} from '../functions/fast-audio/[id].js';
import {onRequestPost as fastPrepare} from '../functions/fast-prepare/[id].js';

const ALLOW=Object.freeze({
  '/api/catalog': {method:'GET', handler:catalog},
  '/api/omnibox': {method:'GET', handler:omnibox},
  '/api/metadata': {method:'GET', handler:metadata},
  '/api/artwork': {method:'GET', handler:artwork},
  '/api/stems-ticket': {method:'POST', handler:stemsTicket}
});
function methodNotAllowed(method) {
  return new Response(JSON.stringify({error:'Método não permitido'}),{
    status:405,headers:{'content-type':'application/json; charset=utf-8','allow':method,'cache-control':'no-store'}
  });
}
export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url);
    // Workers deployments must share Pages' R2-first audio path. Otherwise
    // the browser silently takes the slower direct Render download route.
    const audioId=/^\/fast-audio\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if(audioId)return handleFastAudio({request,env,params:{id:audioId[1]},waitUntil:job=>ctx.waitUntil(job)});
    const prepareId=/^\/fast-prepare\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if(prepareId){
      if(request.method!=='POST')return methodNotAllowed('POST');
      return fastPrepare({request,env,params:{id:prepareId[1]}});
    }
    if(url.pathname.startsWith('/fast-audio/')||url.pathname.startsWith('/fast-prepare/'))
      return new Response('Invalid track ID',{status:400,headers:{'cache-control':'no-store'}});
    const route=ALLOW[url.pathname];
    if(route){
      if(request.method!==route.method) return methodNotAllowed(route.method);
      return route.handler({request, env, waitUntil:p=>ctx.waitUntil(p)});
    }
    if(url.pathname.startsWith('/api/')){
      return new Response(JSON.stringify({error:'Rota de API não encontrada'}),{
        status:404,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
      });
    }
    // Only files staged by scripts/build-pages.mjs are available through ASSETS.
    return env.ASSETS.fetch(request);
  }
};
