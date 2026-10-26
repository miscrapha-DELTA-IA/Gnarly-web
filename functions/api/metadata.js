import {serveMetadata} from '../../lib/metadata-service.js';
export async function onRequestGet({request}){return serveMetadata(request)}
