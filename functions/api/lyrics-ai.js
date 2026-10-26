import {transcribeLyrics} from '../../lib/lyrics-ai-service.js';
export async function onRequestPost({request,env}){return transcribeLyrics(request,env)}
