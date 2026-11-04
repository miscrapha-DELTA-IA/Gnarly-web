import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {midstreamStallConfirmed,midstreamResumeAt} from '../lib/midstream-recovery.js';

test('confirmed midtrack stall requires a rebuffer with no native clock progress',()=>{
 const basis={phase:'rebuffer',startedAt:65,position:65.1,duration:190};
 assert.equal(midstreamStallConfirmed(basis),true);
 assert.equal(midstreamStallConfirmed({...basis,position:69}),false);
 assert.equal(midstreamStallConfirmed({...basis,phase:'startup'}),false);
 assert.equal(midstreamStallConfirmed({...basis,paused:true}),false);
 assert.equal(midstreamStallConfirmed({...basis,ended:true}),false);
 assert.equal(midstreamStallConfirmed({...basis,seeking:true}),false);
 assert.equal(midstreamStallConfirmed({...basis,position:189}),false);
 assert.equal(midstreamStallConfirmed({...basis,startedAt:0,position:1}),false);
 assert.equal(midstreamStallConfirmed({...basis,position:NaN}),false);
});
test('recovery seek never leaps past an actual decoded stream',()=>{
 assert.equal(midstreamResumeAt(100,200),99.75);
 assert.equal(midstreamResumeAt(100,99),0);
 assert.equal(midstreamResumeAt(100,101),0);
 assert.equal(midstreamResumeAt(4,200),0);
 assert.equal(midstreamResumeAt(NaN,200),0);
 assert.equal(midstreamResumeAt(100,Infinity),0);
});
test('GNARLY rebuffer rescue is selection-bound, preserves playback position and never bypasses cache limits',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/midstreamStallConfirmed\(\{/);
 assert.match(app,/async function resumeStalledRecording\(track,selection,position\)/);
 assert.match(app,/trackAudioURL\(track,\{attempt:1\}\)/);
 assert.match(app,/midstreamResumeAt\(position,audio\.duration\)/);
 assert.match(app,/midstreamRescueSelection===selection/);
 assert.match(app,/state\.userPaused\|\|playbackIntentEpoch!==epoch/);
 assert.match(app,/void resumeStalledRecording\(track,selection,audio\.currentTime\)/);
 assert.match(app,/if\(!document\.hidden&&engine\.ctx\?\.state==='suspended'/);
});
