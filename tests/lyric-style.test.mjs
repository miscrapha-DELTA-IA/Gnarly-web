import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allLyricStyles,resolveLyricStyle,applyLyricStyle,registerLyricStyle,DEFAULT_LYRIC_STYLE,LYRIC_FONT_FAMILIES} from '../lib/lyric-style.js';
import {renderLyricStylePanel} from '../ui/lyric-style-panel.js';
test('six system presets plus 34 curated, lazily-loaded Google Fonts are offered',()=>{
 assert.deepEqual(allLyricStyles().slice(0,6).map(x=>x.id),['original','neon','editorial','mono','kinetic','minimal']);
 assert.equal(allLyricStyles().length,40);
 assert.equal(DEFAULT_LYRIC_STYLE,'original');
 for(const style of allLyricStyles())assert.ok(Object.hasOwn(LYRIC_FONT_FAMILIES,style.family));
 assert.equal(resolveLyricStyle('invalid').id,'original');
});
test('applying Aa typography changes only display properties, not music and lyric data',()=>{
 const properties={};
 const target={dataset:{},style:{setProperty(k,v){properties[k]=v}}};
 const track={title:'A Song',artist:'An Artist',videoId:'abcdefghijk',duration:185};
 const before=structuredClone(track);
 const current=applyLyricStyle(target,'editorial');
 assert.equal(target.dataset.lyricStyle,'editorial');
 assert.equal(target.dataset.lyricTreatment,'editorial');
 assert.match(properties['--gnarly-lyric-font'],/Georgia/);
 assert.equal(properties['--gnarly-lyric-scale'],String(current.size));
 assert.deepEqual(track,before);
 applyLyricStyle(target,'neon');
 assert.equal(target.dataset.lyricStyle,'neon');
});
test('future dataset manifests accept only safe supported aliases and typed bounds',()=>{
 assert.equal(registerLyricStyle({id:'not safe!',family:'system'}),false);
 assert.equal(registerLyricStyle({id:'remote',family:'https://evil.example/style.css'}),false);
 assert.equal(registerLyricStyle({id:'future-serif',name:'Nova Revista',family:'editorial',size:18,weight:1200,tracking:.7}),true);
 const registered=resolveLyricStyle('future-serif');
 assert.equal(registered.size,1.27);
 assert.equal(registered.weight,900);
 assert.equal(registered.tracking,.1);
 assert.equal(registerLyricStyle({id:'future-serif',family:'system'}),false);
});
test('Aa panel safely offers all registered presets and selected aria state',()=>{
 const html=renderLyricStylePanel('neon');
 assert.match(html,/data-lyric-style="neon"/);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/40 COMPOSIÇÕES GNARLY/);
 assert.equal(html.includes('<script'),false);
});
test('palette, lightning and Aa are independent accessible controls',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 for(const id of ['theme-button','experience-button','lyric-style-button'])assert.match(html,new RegExp('id="'+id+'"[^>]*aria-controls="bottom-sheet"'));
 assert.match(html,/<use href="#i-palette"/);
 assert.match(html,/<use href="#i-bolt"/);
 assert.match(app,/\$\('#experience-button'\)\.addEventListener\('click',\(\)=>openSheet\('experience'\)\)/);
 assert.match(app,/\$\('#theme-button'\)\.addEventListener\('click',\(\)=>openSheet\('theme'\)\)/);
 assert.match(app,/\$\('#lyric-style-button'\)\.addEventListener\('click',\(\)=>openSheet\('lyric-style'\)\)/);
 assert.match(app,/case 'experience':/);
 assert.match(app,/case 'lyric-style':/);
 assert.match(app,/applyLyricStyle\(app,state.lyricStyle\)/);
 assert.match(app,/case 'reset-theme-only':state.theme='ACID'/);
 assert.match(app,/case 'reset-experience-only':state.experience='original'/);
 assert.match(app,/case 'reset-reaction-only':state.reaction='FLUIDO'/);
});
