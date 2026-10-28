import {stretchClip} from './share-stretch.js';
self.onmessage=({data})=>{try{const channels=stretchClip(data.channels.map(x=>new Float32Array(x)),data.rate,data.speed,data.seconds);self.postMessage({channels:channels.map(x=>x.buffer)},channels.map(x=>x.buffer))}catch(error){self.postMessage({error:error.message})}};
