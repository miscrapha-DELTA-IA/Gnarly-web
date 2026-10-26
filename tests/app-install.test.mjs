import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installPlatform,isStandalone,renderAppInstallGuide} from '../lib/app-install.js';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
const build=readFileSync(new URL('../scripts/build-pages.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Safari standalone mode is configured on Cloudflare as on Netlify',()=>{
 assert.match(index,/apple-mobile-web-app-capable" content="yes"/);
 assert.match(index,/apple-mobile-web-app-status-bar-style" content="black-translucent"/);
 assert.match(index,/rel="apple-touch-icon"/);
 assert.match(index,/rel="manifest"/);
 assert.equal(manifest.start_url,'/');
 assert.equal(manifest.scope,'/');
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(i=>i.type==='image/png'));
 assert.match(build,/manifest\.webmanifest/);
});
test('a normal Safari tab can never self-hide the URL bar',()=>{
 assert.equal(isStandalone({standalone:false,displayModeStandalone:false}),false);
 assert.equal(isStandalone({standalone:true}),true);
 assert.equal(isStandalone({displayModeStandalone:true}),true);
 assert.equal(installPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
 assert.equal(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)',5),'ios');
 assert.equal(installPlatform('Mozilla/5.0 (Linux; Android 15)','android');
});
test('the install entry is unobtrusive and instructions appear only on request',()=>{
 assert.match(app,/go-install/);
 assert.match(app,/case 'install':content\.innerHTML=renderAppInstallGuide/);
 const instructions=renderAppInstallGuide({platform:'ios',standalone:false});
 assert.match(instructions,/Adicionar à Tela de Início/);
 assert.match(instructions,/Abrir como App/);
 assert.doesNotMatch(instructions,/auto.?install|requestFullscreen/);
 const active=renderAppInstallGuide({platform:'ios',standalone:true});
 assert.match(active,/já está usando o GNARLY como aplicativo/);
 assert.doesNotMatch(active,/<ol/);
});
