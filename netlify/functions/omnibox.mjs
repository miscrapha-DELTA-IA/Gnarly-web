import {isGenericArtist} from '../../lib/metadata-intelligence.js';
// Backend search contract from NightcoreLab/backend/main.py: GET /search?query=...
// returns NDJSON of YouTube Music song METADATA (not downloadable media).
// Supports the Stage 72 Omnibox while avoiding exposure of backend secrets in the client.
const allowedBackend=(value)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u:null}catch{return null}};
const validVideo=/^[a-zA-Z0-9_-]{11}$/;
const clean=(x)=>String(x??'').trim().slice(0,180);
export function parseBackendNDJSON(text,maxResults=15){const output=[],seen=new Set();for(const line of String(text).split(/\r?\n/).slice(0,40)){if(!line.trim())continue;let item;try{item=JSON.parse(line)}catch{continue}if(!validVideo.test(item?.id||'')||seen.has(item.id)||item.is_live===true)continue;seen.add(item.id);const thumbnail=typeof item.thumbnail==='string'&&item.thumbnail.startsWith('https://')?item.thumbnail:`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;output.push({id:'youtube:'+item.id,videoId:item.id,title:clean(item.title),artist:isGenericArtist(item.artist)?'Artista não identificado':clean(item.artist),album:clean(item.album||''),artwork:thumbnail,duration:Number(item.duration)||0,source:'youtube',playableMode:'youtube-embed'});if(output.length===maxResults)break}return output.filter(x=>x.title)}
export default async function handler(request){const q=new URL(request.url).searchParams.get('term')?.trim().slice(0,140)||'';if(q.length<1)return Response.json({error:'Termo muito curto'},{status:400});
 const backend=allowedBackend(process.env.GNARLY_BACKEND_URL||'https://nightcorelab.onrender.com');
 if(!backend)return Response.json({results:[],status:'backend_not_configured'});
 const params=new URL(request.url).searchParams;
 const offset=Math.min(80,Math.max(0,Number.parseInt(params.get('offset')||'0',10)||0));
 const limit=Math.min(20,Math.max(1,Number.parseInt(params.get('limit')||'15',10)||15));
 const api=new URL('/search',backend);api.searchParams.set('query',q);
 api.searchParams.set('offset',String(offset));api.searchParams.set('limit',String(limit));
 try{const r=await fetch(api,{headers:{accept:'application/x-ndjson'},signal:AbortSignal.timeout(11500)});if(!r.ok)return Response.json({results:[],status:'backend_unavailable'},{status:200,headers:{'cache-control':'no-store'}});
 const text=await r.text();if(text.length>100000)throw Error('oversized');return Response.json({results:parseBackendNDJSON(text,limit),status:'ok'},{headers:{'cache-control':'public,max-age=120','x-content-type-options':'nosniff'}})}catch{return Response.json({results:[],status:'backend_unavailable'},{status:200,headers:{'cache-control':'no-store'}})}
}
export const config={path:'/api/omnibox',method:['GET']};
