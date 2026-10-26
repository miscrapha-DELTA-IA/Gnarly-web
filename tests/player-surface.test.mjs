import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_SURFACE_MODES,normalizePlayerSurfaceMode,renderPlayerSurfaceMenu} from '../ui/player-surface.js';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('player visual mode selection is independent of global background and display',()=>{
 assert.deepEqual(PLAYER_SURFACE_MODES,['turbulent','frosted','sharp','moving']);
 for(const mode of PLAYER_SURFACE_MODES)assert.equal(normalizePlayerSurfaceMode(mode),mode);
 assert.equal(normalizePlayerSurfaceMode('legacy'),'turbulent');
 assert.match(app,/playerSurfaceMode:normalizePlayerSurfaceMode/);
 assert.match(app,/setSetting\('playerSurfaceMode'/);
 assert.match(app,/app\.dataset\.playerSurfaceMode/);
 assert.match(app,/backgroundMode:getSetting/);
});
test('popover has exactly four radio options in reference order with checked state',()=>{
 const output=renderPlayerSurfaceMenu('moving');
 assert.equal((output.match(/role="menuitemradio"/g)||[]).length,4);
 assert.equal((output.match(/aria-checked="true"/g)||[]).length,1);
 assert.ok(output.indexOf('Fosco')<output.indexOf('Nítido'));
 assert.ok(output.indexOf('Nítido')<output.indexOf('Em movimento'));
 assert.ok(output.indexOf('Em movimento')<output.indexOf('Turbulent Displacement'));
 assert.match(output,/data-player-surface="moving" aria-checked="true"/);
});
test('handle is anchored inside player, artwork loop has two equal tiles',()=>{
 assert.match(html,/id="player-surface-button"/);
 assert.match(html,/aria-haspopup="menu"/);
 assert.match(html,/id="player-surface-artwork-repeat"/);
 assert.ok(html.indexOf('id="player-surface"')>html.indexOf('id="player-section"'));
 assert.match(css,/top:50%;left:-17px/);
 assert.match(css,/width:200%;height:100%/);
 assert.match(css,/flex:0 0 50%/);
 assert.match(css,/translate3d\(-50%,0,0\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('track change updates art without restarting playback or touching visuals',()=>{
 assert.match(app,/function updatePlayerSurfaceArtwork/);
 assert.match(app,/updatePlayerSurfaceArtwork\(\);/);
 assert.match(app,/function closePlayerSurfaceMenu/);
 assert.match(app,/function openPlayerSurfaceMenu/);
 assert.match(app,/closePlayerSurfaceMenu\(true\)/);
});

test('sharp and moving surfaces prefer true published 800px Apple artwork',async()=>{
 const {preferHighResolutionArtwork}=await import('../ui/player-surface.js');
 assert.equal(preferHighResolutionArtwork('https://is1-ssl.mzstatic.com/image/thumb/12345/100x100bb.jpg'),'https://is1-ssl.mzstatic.com/image/thumb/12345/800x800bb.jpg');
 assert.equal(preferHighResolutionArtwork('https://i.ytimg.com/vi/abc/hqdefault.jpg'),'https://i.ytimg.com/vi/abc/hqdefault.jpg');
 assert.equal(preferHighResolutionArtwork('blob:https://gnarly.example/123'),'blob:https://gnarly.example/123');
 assert.match(app,/if\(lastSurfaceArtwork!==original\)return/);
 assert.match(app,/probe\.onerror/);
});
