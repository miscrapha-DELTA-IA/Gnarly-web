import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCoverCharge,COVER_CHARGE_PHASES} from '../lib/cover-charge.js';

function harness(){
 const callbacks=new Map(),removed=[],dataset={},target={
  dataset,removeAttribute(key){removed.push(key);delete dataset.audioCharge}
 };
 let id=0;
 const charge=createCoverCharge({target,delay:170,
  schedule:callback=>{const next=++id;callbacks.set(next,callback);return next},
  cancel:key=>callbacks.delete(key)
 });
 return {charge,target,callbacks,removed,
  flush(){for(const [id,callback] of [...callbacks]){callbacks.delete(id);callback()}}
 };
}
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('fast cached tracks do not flash loading effect',()=>{
 const h=harness();
 h.charge.show('loading');
 assert.equal(h.target.dataset.audioCharge,undefined);
 h.charge.hide();h.flush();
 assert.equal(h.charge.visible,'');
 assert.equal(h.target.dataset.audioCharge,undefined);
 assert.equal(h.callbacks.size,0);
});
test('loading becomes visible only after deferred start, then changes phase immediately',()=>{
 const h=harness();
 h.charge.show('loading');h.flush();
 assert.equal(h.charge.visible,'loading');
 h.charge.show('buffering');
 assert.equal(h.charge.visible,'buffering');
 assert.equal(h.callbacks.size,0);
 h.charge.show('recovering');
 assert.equal(h.target.dataset.audioCharge,'recovering');
 h.charge.hide();
 assert.equal(h.charge.visible,'');
 assert.equal('audioCharge' in h.target.dataset,false);
 assert.deepEqual(h.removed,['data-audio-charge']);
});
test('stale loading phases cannot revive animation after another request or cancellation',()=>{
 const h=harness();
 h.charge.show('loading');
 const stale=[...h.callbacks.values()][0];
 h.charge.show('recovering');
 stale();
 assert.equal(h.charge.visible,'');
 h.flush();
 assert.equal(h.charge.visible,'recovering');
 h.charge.destroy();
 assert.equal(h.target.dataset.audioCharge,undefined);
});
test('unsupported phases never show fake progress or leave timers',()=>{
 const h=harness();
 h.charge.show('55%');
 h.charge.show('done');
 assert.equal(h.callbacks.size,0);
 assert.deepEqual(COVER_CHARGE_PHASES,['loading','buffering','recovering']);
});
test('visual layers fill the real artwork in both main cover and iPod display',()=>{
 const html=source('index.html'),css=source('cover-charge.css');
 const matches=html.match(/class="gnarly-cover-charge" aria-hidden="true"/g)||[];
 assert.equal(matches.length,2);
 assert.match(html,/id="ipod-cover-image"[^>]*>[\s\S]*?gnarly-cover-charge/);
 assert.match(html,/id="cover-image"[^>]*>[\s\S]*?gnarly-cover-charge/);
 assert.match(css,/--acid/);
 assert.match(css,/gnarly-charge-fill/);
 assert.match(css,/gnarly-charge-sweep/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/data-audio-charge="buffering"/);
 assert.doesNotMatch(css,/backdrop-filter|filter:\s*blur\(|canvas|requestAnimationFrame/);
 const iPod=source('ipod-mode.css');
 assert.match(iPod,/\.gnarly-ipod \.ipod-screen>img/);
 assert.match(iPod,/object-fit:cover/);
});
test('music loading indicator follows actual playback events and is cancelled on pause/error',()=>{
 const app=source('app.js');
 for(const value of ["coverCharge.show('loading')","coverCharge.show('buffering')","coverCharge.show('recovering')"])
  assert.ok(app.includes(value),value);
 assert.match(app,/audio\.addEventListener\('playing',\(\)=>\{if\(!state\.current\|\|state\.userPaused\|\|audio\.paused\|\|audio\.ended\)return;hideOptionalOfficialSource\(\);coverCharge\.hide\(\)/, 'Stale playing events cannot clear a newer loading cue or resume paused queue work');
 assert.match(app,/function pause\(\)\{coverCharge\.hide\(\)/);
 assert.match(app,/function reportAudioError\(text\)\{\s*coverCharge\.hide\(\)/);
 assert.match(app,/playbackSelection\+\+;navigationRevision\+\+;nextDiscovery=null;invalidateSmartFill\(\);coverCharge\.hide\(\)/,
  'Selection cancels stale transport/discovery work before hiding its loading cue');
 assert.match(app,/function pause\(\)\{coverCharge\.hide\(\);clearNextDiscoveryStatus\(\);navigationRevision\+\+;nextDiscovery=null;invalidateSmartFill\(\)/,
  'Pause hides the cue and cancels pending automatic navigation');
 assert.match(app,/audio\.addEventListener\('stalled'/);
 assert.match(app,/window\.addEventListener\('beforeunload',\(\)=>\{coverCharge\.destroy\(\)/);
 // The only HTMLAudioElement remains the existing player; no fetch or fake percentage.
 assert.equal((source('index.html').match(/<audio\b/g)||[]).length,1);
 assert.doesNotMatch(source('lib/cover-charge.js'),/fetch\(|setInterval\(|AudioContext|\.play\(|Math\.random/);
});
test('Cloudflare Pages and offline PWA ship the stylesheet',()=>{
 assert.match(source('scripts/build-pages.mjs'),/cover-charge\.css/);
 assert.match(source('sw.js'),/cover-charge\.css/);
 assert.match(source('index.html'),/href="\.\/cover-charge\.css"/);
});
