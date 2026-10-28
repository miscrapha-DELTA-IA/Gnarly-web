import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMusicPanel} from '../ui/music-panel.js';
test('concise music controls keep compatibility disclosures available and effects enabled',()=>{
 const html=renderMusicPanel({backgroundAudioSupported:true,backgroundAudioEnabled:true});
 assert.match(html,/Velocidade e tom/);assert.match(html,/<details class="music-footnote"><summary>Efeitos e compatibilidade<\/summary>/);
 assert.match(html,/no iPhone, isso pode interromper o áudio ao bloquear a tela/);
 for(const id of ['speed','bass','reverb'])assert.doesNotMatch(html.match(new RegExp('<input[^>]+id="'+id+'"[^>]*>'))?.[0]||'missing',/disabled|missing/);
 const stems=renderMusicPanel({tab:'stems'});assert.match(stems,/<summary>Motor de separação<\/summary>/);
 assert.match(stems,/áudio só é enviado à GPU após confirmação/);assert.match(stems,/gratuita tem cotas/);
});
