import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayArtist,isGenericArtist} from '../lib/metadata-intelligence.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const section=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));

test('search messages and result subtitles never surface catalogue-provider names',()=>{
 const status=section('function refreshLiveResults(page','function stopSearchRequests()');
 const rows=section('function mediaList(tracks','const thumbnailObserver=');
 const brand=/\b(?:yt\s*music|youtube\s*music|apple\s*music|itunes)\b/i;
 assert.doesNotMatch(status,brand);
 assert.doesNotMatch(rows,brand);
 assert.doesNotMatch(status,/oficiais da Apple|YouTube Music indisponível/i);
 assert.doesNotMatch(rows,/YouTube ·/i,'music rows should describe availability rather than a catalogue name');
 assert.match(status,/Busca online temporariamente limitada/);
 assert.match(status,/Prévia de até 30 segundos/);
 assert.match(rows,/Catálogo · áudio não verificado/);
});

test('legacy provider-as-artist metadata is never displayed as an artist name',()=>{
 for(const artist of ['YouTube Music','YT Music','youtube music','Apple Music',
 'APPLE MUSIC','iTunes','Artista não identificado']){
  assert.equal(isGenericArtist(artist),true,artist);
  assert.equal(displayArtist({artist}),'Artista não identificado',artist);
 }
 assert.equal(displayArtist({artist:'Nine Vicious'}),'Nine Vicious');
});

test('official embedded player attribution and actual source links remain unchanged',()=>{
 assert.match(app,/YOUTUBE · PLAYER OFICIAL/);
 assert.match(app,/state\.audioState==='official'/);
});
