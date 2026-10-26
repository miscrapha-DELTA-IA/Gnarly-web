import {serveAlbumArtwork} from '../../lib/official-album-art.js';
export default async function handler(request){return serveAlbumArtwork(request)}
export const config={path:'/api/artwork',method:['GET']};
