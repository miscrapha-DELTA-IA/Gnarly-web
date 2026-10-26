import {serveMetadata} from '../../lib/metadata-service.js';
export default async function handler(request){return serveMetadata(request)}
export const config={path:'/api/metadata',method:['GET']};
