import {serveAlbumArtwork} from '../../lib/official-album-art.js';
export const onRequestGet=({request})=>serveAlbumArtwork(request);
