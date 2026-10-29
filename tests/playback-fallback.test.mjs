import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPlayerSurfaceMenu} from '../ui/player-surface.js';

test('official fallback appears only in the iPod menu during known origin cooldown',()=>{
 const normal=renderPlayerSurfaceMenu('ipod');
 const restricted=renderPlayerSurfaceMenu('ipod',{upstreamLimited:true});
 assert.doesNotMatch(normal,/data-player-surface-action="official-player"/);
 assert.match(restricted,/data-player-surface-action="official-player"/);
 assert.match(restricted,/Ouvir no YouTube/);
 assert.match(restricted,/data-player-surface-action="customize-ipod"/);
 assert.doesNotMatch(renderPlayerSurfaceMenu('sharp',{upstreamLimited:true}),/official-player/);
});
test('the regular player offers official listening only on confirmed upstream 429',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="playback-official-fallback"[^>]+hidden/);
 assert.match(source,/fallback\.hidden=!\(\/HTTP 429\/\.test\(text\)/);
 assert.match(source,/\$\('#playback-official-fallback'\)\.addEventListener\('click'/);
 assert.match(source,/upstreamLimited:playbackCooldown\.active\(\)/);
 assert.match(source,/action\.dataset\.playerSurfaceAction==='official-player'/);
 assert.match(source,/openYouTubePlayer\(state\.current\)/);
});
