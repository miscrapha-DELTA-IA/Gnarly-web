import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDisplayStore,renderDisplayPanel} from '../ui/display-panel.js';
const selectedLayouts=store=>[...renderDisplayPanel(store).matchAll(/data-layout="([a-z]+)" aria-pressed="(true|false)"/g)].filter(match=>match[2]==='true').map(match=>match[1]);
test('layout indicators reflect complete display state, custom choices and Zen',()=>{
 const store=createDisplayStore();assert.deepEqual(selectedLayouts(store),['all']);
 store.apply('essential');assert.deepEqual(selectedLayouts(store),['essential']);
 store.set('lyrics',false);assert.deepEqual(selectedLayouts(store),[]);
 store.apply('listening');assert.deepEqual(selectedLayouts(store),['listening']);
 store.setZen(true);assert.deepEqual(selectedLayouts(store),[]);store.setZen(false);assert.deepEqual(selectedLayouts(store),['listening']);
});
test('Everything and Nothing describe the current audio-panel selection without mutating it',()=>{
 const store=createDisplayStore();
 assert.match(renderDisplayPanel(store),/data-layout-group="all" aria-pressed="true"/);
 store.set('presets',false);let markup=renderDisplayPanel(store);assert.match(markup,/data-layout-group="all" aria-pressed="false"/);assert.match(markup,/data-layout-group="none" aria-pressed="false"/);
 store.set('controls',false);const before=store.visible;markup=renderDisplayPanel(store);assert.match(markup,/data-layout-group="none" aria-pressed="true"/);assert.deepEqual(store.visible,before);
 assert.match(markup,/data-panel-toggle="lyrics"[^>]*aria-label="Legendas"/);assert.match(markup,/display-menu-icon" width="20" height="20"/);
});
