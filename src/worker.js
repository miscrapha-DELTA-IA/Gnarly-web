// GNARLY WEB — Cloudflare Workers entrypoint.
// Keep the Pages-compatible handlers as the single source of truth for APIs.
// Requests for real music stay on the existing Render backend; never proxy
// full tracks or GPU stem outputs through the edge.
import {ROOM_PATTERN} from '../lib/karaoke-relay-protocol.js';
export {KaraokeRoom} from './karaoke-relay.js';
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
    // Pairing uses the standalone Cloudflare Worker, not the Pages HTML origin.
    // Only short voice-analysis frames and playback clock are relayed.
    const karaoke=/^\/karaoke-relay\/([^/]+)$/.exec(url.pathname);
    if(karaoke){
      if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
        return new Response('WebSocket required',{status:426});
      if(!ROOM_PATTERN.test(karaoke[1]))return new Response('Invalid room',{status:400});
      const origin=request.headers.get('Origin')||'';
      let trusted=false;
      try{
        const o=new URL(origin);
        trusted=o.protocol==='https:'&&(
          /^(?:[a-z0-9-]+\.)?(?:gnarly-web-pages|gnarly-web-stage72)\.pages\.dev$/i.test(o.hostname)||
          o.hostname==='gnarly-web.miscrapha.workers.dev')||
          o.protocol==='http:'&&['localhost','127.0.0.1'].includes(o.hostname);
      }catch{}
      if(!trusted)return new Response('Origin not allowed',{status:403});
      if(!env.KARAOKE_ROOMS)return new Response('Pairing not deployed',{status:503});
      const stub=env.KARAOKE_ROOMS.get(env.KARAOKE_ROOMS.idFromName(karaoke[1]));
      return stub.fetch(request);
    }
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
