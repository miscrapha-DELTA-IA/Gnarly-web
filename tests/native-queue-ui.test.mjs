import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSmartQueuePanel} from '../ui/smart-queue-panel.js';
const track={id:'youtube:AAAAAAAAAAA',title:'PENDULUM',artist:'Lancey Foux',source:'youtube',videoId:'AAAAAAAAAAA'};

test('native queue exposes exactly three actions with smart recommendations on',()=>{
 const html=renderSmartQueuePanel({queueCount:7,anchor:track,status:'',busy:false,playing:false});
 assert.equal((html.match(/<button[^>]*class="native-queue-action(?: primary)?"/g)||[]).length,3,html);
 for(const cmd of ['queue-play','queue-shuffle','smart-refresh'])
  assert.match(html,new RegExp('data-command="'+cmd+'"'));
 assert.match(html,/Mix inteligente/);
 assert.match(html,/A seguir/);
 assert.doesNotMatch(html,/data-smart-mode|smart-chip|smart-queue-explain|smart-taste-insight/);
 assert.doesNotMatch(html,/smart-playlist|playlist-create|Reiniciar aprendizado/);
 assert.doesNotMatch(html,/data-command="clear-queue"/);
});
test('queue without an active track guides discovery without phantom actions',()=>{
 const html=renderSmartQueuePanel({queueCount:0,anchor:null,status:''});
 for(const command of ['queue-play','queue-shuffle','smart-refresh']){
  const regex=new RegExp('data-command="'+command+'"[^>]*disabled');
  assert.match(html,regex);
 }
 assert.match(html,/Escolha uma música em Busca/);
 assert.doesNotMatch(html,/undefined|NaN/);
});
test('queue HTML safely escapes network/provider status content',()=>{
 const html=renderSmartQueuePanel({queueCount:2,anchor:track,
  status:'Sem novas <script>alert("x")</script> sugestões'});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
test('automatic queue keeps manual songs and uses the exact audio source, without presenting mode controls',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../module-dock.css',import.meta.url),'utf8');
 assert.match(app,/let smartMode='mix'/);
 assert.match(app,/function maybeFillSmartQueue\(/);
 assert.match(app,/state\.queue=appendUnique\(state\.queue,newTracks,anchor\.id\)/);
 assert.match(app,/state\.queue=retainManualQueue\(state\.queue\)/);
 assert.match(app,/case 'queue-shuffle'/);
 assert.match(app,/shuffleUpcoming\(state\.queue\)/);
 assert.match(app,/case 'queue-play'/);
 assert.match(app,/case 'smart-refresh'/);
 assert.match(app,/class="native-queue-track"/);
 assert.match(app,/data-original-art/);
 assert.doesNotMatch(app,/mediaList\(playlistStore\.tracks\(selectedPlaylist\),'playlist'\)\+/);
 assert.match(css,/\.native-queue-actions\{[\s\S]*?grid-template-columns:repeat\(3/);
 assert.match(css,/\.native-queue-row\{/);
});
