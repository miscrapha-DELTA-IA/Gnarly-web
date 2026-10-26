// GNARLY WEB — Cloudflare Workers entrypoint.
// Keep the Pages-compatible handlers as the single source of truth for APIs.
// Requests for real music stay on the existing Render backend; never proxy
// full tracks or GPU stem outputs through the edge.
import {onRequestGet as catalog} from '../functions/api/catalog.js';
import {onRequestGet as omnibox} from '../functions/api/omnibox.js';
import {onRequestPost as stemsTicket} from '../functions/api/stems-ticket.js';
import {onRequestGet as metadata} from '../functions/api/metadata.js';

const ALLOW=Object.freeze({
  '/api/catalog': {method:'GET', handler:catalog},
  '/api/omnibox': {method:'GET', handler:omnibox},
  '/api/metadata': {method:'GET', handler:metadata},
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
