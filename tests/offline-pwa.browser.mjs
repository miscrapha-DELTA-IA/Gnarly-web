/** Real Chromium air-plane-mode acceptance, using built Cloudflare Pages dist.
 * No real music, provider access, account, secrets or private audio.
 * This suite runs only after the Stage72 workflow starts its local server.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base='http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu']});
try{
 const context=await browser.newContext({serviceWorkers:'allow',
  viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 await page.goto(base+'/',{waitUntil:'load'});
 await page.waitForSelector('#omnibox-toggle');
 await page.waitForFunction(async()=>{
  if(!navigator.serviceWorker?.controller)return false;
  const shell=(await caches.keys()).filter(key=>key.startsWith('gnarly-web-shell-'));
  if(!shell.length)return false;
  const cache=await caches.open(shell[0]);
  const urls=['/index.html','/app.js','/gnarly-ui.css','/assets/gnarly-icon.png'];
  return (await Promise.all(urls.map(p=>cache.match(p)))).every(Boolean);
 },null,{timeout:30000});

 // Save a metadata track with a harmless mock media blob in the real IndexedDB,
 // using the shipped library. No external album or audio fetches are made.
 const saved=await page.evaluate(async()=>{
  const {createOfflineLibrary}=await import('/lib/offline-library.js');
  const track={id:'local:offline-acceptance',source:'local',
   title:'GNARLY OFFLINE SMOKE',artist:'Teste local',album:'Sem internet',
   artwork:'/assets/gnarly-icon.png',duration:10};
  const lib=createOfflineLibrary();
  await lib.save(track,new Blob([new Uint8Array(4096)],{type:'audio/mp4'}));
  return (await lib.list()).some(t=>t.track.id===track.id);
 });
 assert.equal(saved,true);

 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('#omnibox-toggle',{timeout:12000});
 await page.evaluate(()=>document.querySelector('#library-button').click());
 await page.getByText('GNARLY OFFLINE SMOKE').first().waitFor({timeout:12000});
 const image=page.locator('img[data-original-art="/assets/gnarly-icon.png"]').first();
 await image.waitFor({timeout:5000});
 assert.ok(await image.evaluate(el=>el.complete&&el.naturalWidth>0),
  'Saved cover thumbnail must decode without internet');
 const overview=await page.locator('#sheet-content').innerText();
 assert.match(overview,/GNARLY OFFLINE SMOKE/);
 assert.match(overview,/Áudio offline/);

 // A non-api internal navigation must also fall back to the cached shell.
 await page.goto(base+'/my-offline-library',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#omnibox-toggle',{timeout:12000});
 console.log('GNARLY offline PWA browser acceptance passed');
}finally{await browser.close()}
