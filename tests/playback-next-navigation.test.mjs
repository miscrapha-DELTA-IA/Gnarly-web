import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commitPlaying} from '../lib/smart-queue.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const song=id=>({id:'youtube:'+id,videoId:id,source:'youtube',title:id,artist:'Test'});

test('rapid consecutive Next choices must use distinct queued songs while buffering',()=>{
 const first=song('AAAAAAAAAAA'),second=song('BBBBBBBBBBB'),third=song('CCCCCCCCCCC');
 let pending=[first,second,third],current=null;
 current=pending[0];pending=commitPlaying(pending,current.id);
 assert.equal(current.id,first.id);
 assert.deepEqual(pending.map(x=>x.id),[second.id,third.id]);
 // First playback is intentionally still loading (no playing event).
 current=pending[0];pending=commitPlaying(pending,current.id);
 assert.equal(current.id,second.id);
 assert.deepEqual(pending.map(x=>x.id),[third.id]);
 assert.match(app,/if\(fromQueue\)\{\s*state\.queue=commitPlaying\(state\.queue,track\.id\)/);
 assert.doesNotMatch(app,/pendingQueueId/);
});
test('stale interrupted play promise never recovers an obsolete recording',()=>{
 const block=app.slice(app.indexOf('async function play(){'),app.indexOf('function pause(){'));
 assert.match(block,/const track=state\.current,selection=playbackSelection/);
 assert.match(block,/const stillSelected=\(\)=>state\.current===track&&playbackSelection===selection&&!state\.userPaused/);
 assert.match(block,/catch\(e\)\{[\s\S]*?if\(!stillSelected\(\)\)return/);
 assert.match(block,/if\(e\?\.name==='AbortError'\)/);
 assert.match(block,/await audio\.play\(\)/);
 assert.match(block,/if\(track\.source==='youtube'&&!isOffline\(track\.id\)\)\{await recoverNativeAudio/);
});
test('Next looks up an eligible smart queue candidate without stopping the current audio',()=>{
 const block=app.slice(app.indexOf('async function next(){'),app.indexOf('function prefetchNextLyrics()'));
 assert.match(block,/await maybeFillSmartQueue\(\{force:true\}\)/);
 assert.match(block,/if\(state\.current!==startingTrack\|\|playbackSelection!==selection\|\|navigationRevision!==revision\)return/,
  'Pending Next must stop after track changes, same-track reselection, pause or Previous');
 assert.match(block,/else toast\('Fila vazia\. Adicione outra música para avançar\.'\)/);
 assert.match(app,/nexttrack:\(\)=>\{void next\(\)\}/);
 assert.match(app,/e\.key==='MediaTrackNext'\)void next\(\)/);
});
