import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const errs=[],warnings=[];page.on('pageerror',x=>errs.push(x.message));page.on('console',x=>{if(x.type()==='warning'||x.type()==='error')warnings.push(x.text())});
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('#omnibox-toggle');

// The compact lyrics HUD must never translate the player when a new line
// renders. iOS lyric typography must wrap, not ellipsize/clamp the stanza.
const compactKaraoke=await page.evaluate(async()=>{
 const hud=document.querySelector('#floating-lyrics');
 const line=document.querySelector('#floating-line');
 const slot=document.querySelector('#compact-karaoke-slot');
 const player=document.querySelector('#player-section');
 const {fitCompactLyricContent}=await import('./lib/compact-karaoke-layout.js');
 const y=()=>player.getBoundingClientRect().top;
 const initial=y(),reserved=slot.getBoundingClientRect().height;
 hud.hidden=false;
 line.textContent='We are the real rockstars';
 fitCompactLyricContent(hud,line);
 const short=y();
 line.textContent='I want your body, I want your eyes, I want you to hold me all night long, until the sunrise and the colours are changing';
 const fit=fitCompactLyricContent(hud,line);
 const medium=y(),lineRect=line.getBoundingClientRect();
 const readable=line.scrollHeight<=line.clientHeight+2;
 line.textContent='This is an extremely long multi-line karaoke stanza with countless different words which should never vanish merely because the line extends beyond the natural karaoke view. '.repeat(9);
 const extreme=fitCompactLyricContent(hud,line);
 const long=y(),computed=getComputedStyle(line);
 const scrollRange=line.scrollHeight-line.clientHeight;
 line.scrollTop=scrollRange;
 const canReadEnd=scrollRange>0&&line.scrollTop>0;
 // Measure the visible stanza BEFORE hiding the synthetic no-song HUD.
 const metrics={chars:line.textContent.length,scrollHeight:line.scrollHeight,
  clientHeight:line.clientHeight,rectHeight:line.getBoundingClientRect().height,
  computedFont:computed.fontSize,computedDisplay:computed.display,
  scrollWidth:line.scrollWidth,clientWidth:line.clientWidth,
  lineSample:line.innerText.slice(0,55),hudDisplay:getComputedStyle(hud).display,
  hudHidden:hud.hidden,hiddenAttribute:hud.hasAttribute('hidden')};
 hud.hidden=true;
 const cleared=y();
 return {initial,short,medium,long,cleared,reserved,fit,extreme,readable,
  canReadEnd,lineHeight:lineRect.height,scrollRange,
  ...metrics,whiteSpace:computed.whiteSpace,textOverflow:computed.textOverflow,
  overflowY:computed.overflowY};
});
for(const key of ['short','medium','long','cleared']){
 assert.ok(Math.abs(compactKaraoke[key]-compactKaraoke.initial)<=1.5,
  'Compact lyric '+key+' must not move the player: '+JSON.stringify(compactKaraoke));
}
assert.ok(compactKaraoke.reserved>=90,'Lyric slot reserves a stable height');
assert.ok(compactKaraoke.readable,'Ordinary full stanza must fit without clipping: '+JSON.stringify(compactKaraoke));
assert.equal(compactKaraoke.whiteSpace,'normal');
assert.equal(compactKaraoke.textOverflow,'clip');
assert.equal(compactKaraoke.overflowY,'auto');
assert.ok(compactKaraoke.extreme.scrollable&&compactKaraoke.canReadEnd,
 'Very long lyrics must be independently scrollable instead of lost: '+JSON.stringify(compactKaraoke));

assert.equal(await page.locator('#fullscreen-button').count(),1);
assert.equal(await page.locator('#karaoke-stage-fullscreen').count(),1);
assert.equal(await page.locator('#fullscreen-button').isVisible(),false,'Phone does not need desktop fullscreen shortcut');
assert.equal(await page.locator('#performance-button').isVisible(),false,'DJ remains in More and the module drawer');
assert.equal(await page.locator('#support-button').getAttribute('href'),'https://apoia.se/gnarlyapp');
const headerMetrics=await page.evaluate(()=>{
 const top=document.querySelector('#topbar').getBoundingClientRect(),brand=document.querySelector('#brand-line').getBoundingClientRect();
 const eye=document.querySelector('#search-toggle'),cs=getComputedStyle(eye);
 return {gap:brand.top-top.bottom,touchAction:cs.touchAction,userSelect:cs.webkitUserSelect||cs.userSelect};
});
assert.ok(headerMetrics.gap>=14,'Brand needs breathing space below eye row: '+JSON.stringify(headerMetrics));
assert.equal(headerMetrics.touchAction,'none','Eye must own gestures without Safari scrolling/text selection');
assert.equal(headerMetrics.userSelect,'none','Long-touch native text selection must be disabled');
assert.equal(await page.locator('#app-shell').getAttribute('data-device-layout'),'phone');

async function assertAppearanceControlFits(label){
 const [seek,button,player]=await Promise.all([
  page.locator('#seek-slider').boundingBox(),
  page.locator('#player-surface-button').boundingBox(),
  page.locator('#player-section').boundingBox()
 ]);
 assert.ok(seek&&button&&player,`${label}: progress control should be visible`);
 assert.ok(button.y>=seek.y+seek.height-1,`${label}: button overlaps the seek slider`);
 assert.ok(button.x>=player.x+4,`${label}: button escapes player on the left`);
 assert.ok(button.x+button.width<=player.x+player.width-4,`${label}: button escapes player on the right`);
 assert.ok(button.y+button.height<=player.y+player.height-4,`${label}: button escapes player at the bottom`);
 assert.ok(button.height<=36,`${label}: button is oversized at ${button.height}px`);
 assert.ok(button.width<=165,`${label}: button is too wide at ${button.width}px`);
}
await assertAppearanceControlFits('compact 390px');
assert.equal(await page.locator('.player .preset-chip').count(),0);
assert.equal(await page.locator('.omnibox-shell').count(),1);
assert.equal(await page.locator('#player-section').count(),1);
await page.waitForTimeout(900);
const nativeGPU=await page.evaluate(()=>{
 const canvas=document.querySelector('#fluid-canvas');
 const gl=canvas.getContext('webgl2');
 if(!gl)return {available:false,freshCanvas:!!document.createElement('canvas').getContext('webgl2')};
 const program=gl.getParameter(gl.CURRENT_PROGRAM);
 return {available:!!gl,compiled:!!program,error:gl.getError()};
});
assert.ok(nativeGPU.available&&nativeGPU.compiled,'Metal shader port must compile in WebGL2, never silently use Canvas fallback: '+JSON.stringify(nativeGPU)+'; warnings: '+warnings.slice(0,5).join(' | '));

const firstTime=await page.evaluate(()=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 const p=gl.getParameter(gl.CURRENT_PROGRAM);
 return gl.getUniform(p,gl.getUniformLocation(p,'u_time'));
});
await page.waitForTimeout(220);
const secondTime=await page.evaluate(()=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 const p=gl.getParameter(gl.CURRENT_PROGRAM);
 return {time:gl.getUniform(p,gl.getUniformLocation(p,'u_time')),error:gl.getError()};
});
assert.ok(secondTime.time>firstTime+.08,'Native high-res material must move smoothly WITHOUT any track playing');
assert.equal(secondTime.error,0,'Pixel finishing cannot introduce WebGL errors');

async function openCreativeLayer(button){
 if(await page.locator('#bottom-sheet').isVisible())await page.locator('#close-sheet').click();
 await page.locator(button).click({button:'right'});
}
await page.locator('#theme-button').click({button:'right'});
await page.locator('[data-theme="PRISM CARMINE"]').click();
await page.waitForFunction(({name,want})=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 if(!gl)return false;const p=gl.getParameter(gl.CURRENT_PROGRAM);
 if(!p)return false;const loc=gl.getUniformLocation(p,name);
 return !!loc&&Math.abs(gl.getUniform(p,loc)-want)<0.01;
},{name:'u_look',want:2},{timeout:15000});
const prism=await page.evaluate(()=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 const program=gl.getParameter(gl.CURRENT_PROGRAM);
 const loc=gl.getUniformLocation(program,'u_look');
 return {look:loc?gl.getUniform(program,loc):null,error:gl.getError(),
  uniforms:Array.from({length:gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS)},(_,i)=>gl.getActiveUniform(program,i)?.name),
  theme:document.querySelector('.build-badge')?.textContent,
  selected:document.querySelector('.visual-choice.active[data-theme]')?.dataset.theme};
});
assert.equal(prism.look,2,'Prism must render native diamond lattice instead of generic Cyber Night: '+JSON.stringify(prism));
assert.equal(prism.error,0);
await openCreativeLayer('#theme-button');
await page.locator('[data-theme="ACID"]').click();
await openCreativeLayer('#experience-button');
await page.locator('[data-experience="gnarly-exp-vector-drift-2000"]').click();
await page.waitForFunction(({name,want})=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 if(!gl)return false;const p=gl.getParameter(gl.CURRENT_PROGRAM);
 if(!p)return false;const loc=gl.getUniformLocation(p,name);
 return !!loc&&Math.abs(gl.getUniform(p,loc)-want)<0.01;
},{name:'u_look',want:10},{timeout:15000});
const vector=await page.evaluate(()=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 const program=gl.getParameter(gl.CURRENT_PROGRAM);
 return gl.getUniform(program,gl.getUniformLocation(program,'u_look'));
});
assert.equal(vector,10,'Vector Drift must use the native cylindrical tunnel shader');
await page.locator('[data-experience="chrome-night"]').click();
await page.waitForFunction(({name,want})=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 if(!gl)return false;const p=gl.getParameter(gl.CURRENT_PROGRAM);
 if(!p)return false;const loc=gl.getUniformLocation(p,name);
 return !!loc&&Math.abs(gl.getUniform(p,loc)-want)<0.01;
},{name:'u_material',want:1},{timeout:15000});
const chrome=await page.evaluate(()=>{
 const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
 const program=gl.getParameter(gl.CURRENT_PROGRAM);
 return {kind:gl.getUniform(program,gl.getUniformLocation(program,'u_material')),material:gl.getUniform(program,gl.getUniformLocation(program,'u_textureC'))};
});
assert.equal(chrome.kind,1,'Chrome Night uses a separate procedural Metal material, not CreativeUniverse');
assert.equal(chrome.material[0],2);

/* Visual identity regression: one theme, four material geometries.
 * Read the actual GPU output, not just UI labels or fragment source text.
 */
await openCreativeLayer('#theme-button');
await page.locator('[data-theme="CRIMSON"]').click();
await openCreativeLayer('#experience-button');
const materials=[
 ['gnarly-texture-organic-web',1],
 ['gnarly-texture-fractured-cells',2],
 ['gnarly-texture-plasma-lava',3],
 ['gnarly-texture-topographic-moire',4]
];
const signatures=[],palettes=[];
for(const [id,family] of materials){
 await page.locator('[data-experience="'+id+'"]').click();
 await page.waitForFunction(want=>{
  const gl=document.querySelector('#fluid-canvas').getContext('webgl2');
  if(!gl)return false;const p=gl.getParameter(gl.CURRENT_PROGRAM);
  if(!p)return false;const loc=gl.getUniformLocation(p,'u_family');
  return !!loc&&Math.abs(gl.getUniform(p,loc)-want)<.01;
 },family,{timeout:15000});
 const sample=await page.evaluate(()=>{
  const canvas=document.querySelector('#fluid-canvas'),gl=canvas.getContext('webgl2');
  const p=gl.getParameter(gl.CURRENT_PROGRAM);
  const palette=['dark','body','glow'].map(name=>Array.from(gl.getUniform(p,gl.getUniformLocation(p,'u_'+name))).map(x=>Math.round(x*1000)/1000));
  gl.drawArrays(gl.TRIANGLES,0,3);
  const width=Math.min(128,canvas.width),height=Math.min(128,canvas.height);
  const rgba=new Uint8Array(width*height*4);
  gl.readPixels(Math.floor((canvas.width-width)/2),Math.floor((canvas.height-height)/2),width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  let hash=2166136261,black=0,bright=0;
  for(let i=0;i<rgba.length;i+=4){
   const v=rgba[i]+rgba[i+1]+rgba[i+2];
   black+=v<75?1:0;bright+=v>180?1:0;
   hash=Math.imul(hash^v,16777619)>>>0;
  }
  return {palette,hash,black,bright,error:gl.getError()};
 });
 assert.equal(sample.error,0,id+' GPU draw must have no error');
 signatures.push(sample.hash);
 palettes.push(JSON.stringify(sample.palette));
}
assert.equal(new Set(signatures).size,4,'Four textures must produce four different actual GPU pixel patterns: '+signatures.join(','));
assert.equal(new Set(palettes).size,1,'Changing experience must preserve Crimson palette colors');

// Aa is a separate selector; changing lyric typography may not change the visual state.
const currentTheme=await page.locator('.build-badge').innerText();
await openCreativeLayer('#lyric-style-button');
assert.equal(await page.locator('#sheet-title').innerText(),'Aa · Estilo de legenda');
assert.equal(await page.locator('button[data-lyric-style="art-magazine-cutout"]').isVisible(),true);
assert.equal(await page.locator('button[data-lyric-style="font-inter"]').isVisible(),false);
await page.locator('[data-font-group="all"]').click();
await page.locator('button[data-lyric-style="editorial"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-lyric-style'),'editorial');
assert.equal(await page.locator('.build-badge').innerText(),currentTheme);
assert.equal(await page.locator('button[data-lyric-style="editorial"]').getAttribute('aria-pressed'),'true');
// Stage Aa catalogue: 40 styles, instant application, search and manual scope.
assert.equal(await page.locator('#sheet-content [data-lyric-style]').count(),80);
await page.locator('[data-font-group="art"]').click();
await page.locator('button[data-lyric-style="art-magazine-cutout"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-lyric-style'),'art-magazine-cutout');
assert.match(await page.locator('#lyric-live-specimen').innerHTML(),/gnarly-word/);
await page.locator('[data-font-group="studio"]').click();
await page.locator('button[data-lyric-style="studio-velvet-noir"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-lyric-art'),'studio-velvet-noir');
await page.locator('[data-font-group="poster"]').click();
assert.equal(await page.locator('[data-lyric-style="font-inter"]').isVisible(),false);
await page.locator('#lyric-font-search').fill('bebas');
await page.locator('[data-lyric-style="font-bebas-neue"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-lyric-style'),'font-bebas-neue');
assert.equal(await page.locator('button[data-lyric-style="font-bebas-neue"]').getAttribute('aria-pressed'),'true');
assert.match(await page.locator('#app-shell').evaluate(el=>el.style.getPropertyValue('--gnarly-lyric-font')),/Bebas Neue/);
await page.locator('[data-lyric-scope="global"]').click();
assert.equal(await page.locator('[data-lyric-scope="global"]').getAttribute('aria-pressed'),'true');
await page.locator('[data-lyric-next]').click();
assert.equal(await page.locator('.build-badge').innerText(),currentTheme);
await page.locator('#close-sheet').click();
assert.equal(await page.locator('#reaction-button').count(),0);
assert.equal(await page.locator('.progress-foot #player-surface-button').count(),1);
await page.locator('#play-button').click();
assert.equal(await page.locator('#sheet-title').innerText(),'Busca');
await page.locator('#close-sheet').click();
assert.equal(await page.locator('#create-button, #edit-button').count(),0);
assert.equal(await page.locator('.module-drawer').count(),3);
const omniboxBottom=await page.locator('#omnibox-shell').evaluate(el=>el.getBoundingClientRect().bottom);
const musicTop=await page.locator('#module-controls').evaluate(el=>el.getBoundingClientRect().top);
assert.ok(musicTop>omniboxBottom,'Inline music window stays below the Omnibox');
await page.locator('#more-button').click();
await page.locator('[data-command="go-controls"]').click();
assert.equal(await page.locator('#bottom-sheet').isVisible(),false);
assert.equal(await page.locator('#module-controls-body').isVisible(),true);
assert.ok(await page.locator('#module-controls-body [data-preset="NIGHTCORE"]').count()>0);
await page.locator('#module-controls-body [data-preset="NIGHTCORE"]').click();
await page.locator('#module-controls-body [data-command="go-stems"]').click();
assert.ok(await page.locator('#module-controls-body [data-stem-level="vocal"]').count()>0);
await page.locator('#module-controls-body [data-command="go-speed-pitch"]').click();
assert.ok(await page.locator('#module-controls-body #speed').count()>0);
await page.locator('#module-controls-body [data-reaction="REATIVO"]').click();
assert.equal(await page.locator('#module-controls-body [data-reaction="REATIVO"]').getAttribute('aria-pressed'),'true');
await page.locator('[data-module-toggle="controls"]').click();
assert.equal(await page.locator('#module-controls-body').isVisible(),false);
await page.locator('#module-performance [data-module-toggle="performance"]').click();
assert.equal(await page.locator('#module-performance-body').isVisible(),true);
assert.equal(await page.locator('#module-performance-body [data-dj-pad]').count(),16);
await page.locator('#module-performance [data-module-toggle="performance"]').click();
assert.equal(await page.locator('#module-performance-body').isVisible(),false);
await page.locator('#search-toggle').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-icons-collapsed'),'true');
assert.equal(await page.locator('#theme-button').isVisible(),false);
await page.locator('#search-toggle').evaluate(el=>{
 const init={bubbles:true,cancelable:true,pointerId:9,pointerType:'touch',button:0,clientX:25};
 el.dispatchEvent(new PointerEvent('pointerdown',{...init,clientY:18}));
 el.dispatchEvent(new PointerEvent('pointermove',{...init,clientY:69}));
 el.dispatchEvent(new PointerEvent('pointerup',{...init,clientY:75}));
});
assert.equal(await page.locator('#sheet-title').innerText(),'Exibição');
assert.equal(await page.locator('#app-shell').getAttribute('data-player-size'),'compact');
assert.equal(await page.locator('#app-shell').getAttribute('data-player-material'),'clear');
const initialWidth=await page.locator('#player-section').evaluate(el=>el.getBoundingClientRect().width);
await page.locator('[data-player-size="minimal"]').click();
await page.waitForTimeout(450);
const minimalWidth=await page.locator('#player-section').evaluate(el=>el.getBoundingClientRect().width);
assert.ok(minimalWidth<initialWidth,`Minimal must be narrower than compact: ${minimalWidth} vs ${initialWidth}`);
await assertAppearanceControlFits('minimal 390px');
await page.locator('button[data-player-size="compact"]').click();
await page.locator('[data-command="close-display"]').click();
await page.locator('#search-toggle').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-icons-collapsed'),'false');
await page.locator('#player-surface-button').click();
assert.equal(await page.locator('#player-surface-menu').isVisible(),true);
await page.locator('[data-player-surface="frosted"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-player-surface-mode'),'frosted');
assert.equal(await page.locator('#player-surface-label').innerText(),'FOSCO');
await page.locator('#player-surface-button').click();
await page.locator('[data-player-surface="sharp"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-player-surface-mode'),'sharp');
await page.locator('#player-surface-button').click();
await page.locator('[data-player-surface="moving"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-player-surface-mode'),'moving');
assert.equal(await page.locator('#player-surface-artwork-repeat').count(),1);
await page.locator('#player-surface-button').click();
await page.keyboard.press('Escape');
assert.equal(await page.locator('#player-surface-menu').isVisible(),false);
await page.locator('#player-surface-button').click();
await page.locator('[data-player-surface="turbulent"]').click();
assert.equal(await page.locator('#app-shell').getAttribute('data-player-surface-mode'),'turbulent');
await page.locator('#search-toggle').evaluate(el=>{
 const init={bubbles:true,cancelable:true,pointerId:9,pointerType:'touch',button:0,clientX:25};
 el.dispatchEvent(new PointerEvent('pointerdown',{...init,clientY:18}));
 el.dispatchEvent(new PointerEvent('pointermove',{...init,clientY:69}));
 el.dispatchEvent(new PointerEvent('pointerup',{...init,clientY:75}));
});
await page.locator('button[data-player-size="compact"]').click();
await page.locator('[data-layout="listening"]').click();
assert.equal(await page.locator('#brand-line').isVisible(),false);
await page.locator('[data-layout="all"]').click();
assert.equal(await page.locator('#brand-line').isVisible(),true);
assert.equal(await page.locator('#app-shell').getAttribute('data-player-material'),'clear');
await page.locator('[data-command="close-display"]').click();
await page.locator('#background-button').click();
assert.ok(await page.locator('[data-command="adjust-photo"]').count()>0);
await page.locator('#close-sheet').click();
await page.setViewportSize({width:320,height:640});
await assertAppearanceControlFits('compact 320px');
await page.setViewportSize({width:430,height:844});
await assertAppearanceControlFits('compact 430px');
await page.setViewportSize({width:390,height:844});
await page.locator('#more-button').click();
await page.locator('[data-command="go-install"]').click();
assert.equal(await page.locator('#sheet-title').innerText(),'Instalar GNARLY');
assert.ok(await page.locator('.install-app-panel').isVisible());
assert.match(await page.locator('.install-app-panel').innerText(),/GNARLY como aplicativo/);
await page.locator('#close-sheet').click();
await page.locator('#share-button').click();
assert.equal(await page.locator('#bottom-sheet').isVisible(),false);
assert.equal(await page.locator('#module-export-body').isVisible(),true);
assert.ok(await page.locator('#module-export-body [data-export-format="image"]').count()>0);
await page.locator('[data-module-toggle="export"]').click();
assert.equal(await page.locator('#module-export-body').isVisible(),false);
await page.screenshot({path:'stage72-ui-mobile.png',fullPage:true});
assert.deepEqual(errs,[]);
console.log('Stage72 mobile UI and panels validated; screenshot saved.');

// Desktop should paint the entire browser viewport at physically appropriate
// resolution, not a centered iPhone-sized canvas stretched to a PC window.
const desktop=await browser.newPage({viewport:{width:1440,height:900},isMobile:false,hasTouch:false,deviceScaleFactor:2});
const desktopErrors=[];desktop.on('pageerror',e=>desktopErrors.push(e.message));
await desktop.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await desktop.waitForSelector('#player-section');
await desktop.waitForTimeout(500);
async function inspectDesktop(expectedWidth,expectedHeight){
 return desktop.evaluate(([width,height])=>{
  const shell=document.querySelector('#app-shell'),canvas=document.querySelector('#fluid-canvas'),player=document.querySelector('#player-section');
  const root=shell.getBoundingClientRect(),box=canvas.getBoundingClientRect(),panel=player.getBoundingClientRect();
  const gl=canvas.getContext('webgl2');
  const maxTexture=gl?.getParameter(gl.MAX_RENDERBUFFER_SIZE)||0;
  return {root:{x:root.x,width:root.width,height:root.height},canvas:{x:box.x,width:box.width,height:box.height,backingWidth:canvas.width,backingHeight:canvas.height},
   player:{x:panel.x,width:panel.width,right:panel.right},gpu:!!gl,maxTexture,
   desktop:matchMedia('(min-width:900px) and (pointer:fine)').matches,
   viewport:{width,height},scrollWidth:document.documentElement.scrollWidth};
 },[expectedWidth,expectedHeight]);
}
const desk1=await inspectDesktop(1440,900);
assert.ok(desk1.desktop,'Desktop media query should detect a full-size browser with fine pointer');
assert.ok(Math.abs(desk1.root.width-1440)<2&&desk1.root.height>=900,'PC shell must span full width AND accommodate content past the viewport: '+JSON.stringify(desk1));
assert.ok(Math.abs(desk1.canvas.width-1440)<2&&Math.abs(desk1.canvas.height-900)<2,'PC GPU canvas should cover viewport');
assert.ok(desk1.gpu,'Desktop background must retain WebGL2');
assert.ok(desk1.canvas.backingWidth>=2700&&desk1.canvas.backingHeight>=1600,'Retina 1440px desktop must not render a blurry 2.1MP texture: '+JSON.stringify(desk1));
assert.ok(desk1.player.x>=0&&desk1.player.right<=1440,'Desktop player should fit inside viewport');
assert.ok(desk1.scrollWidth<=1441,'PC layout should not cause horizontal page scrolling');
await desktop.setViewportSize({width:1920,height:1080});
await desktop.waitForFunction(()=>{
 const c=document.querySelector('#fluid-canvas'),shell=document.querySelector('#app-shell');
 const r=c.getBoundingClientRect(),root=shell.getBoundingClientRect();
 return Math.abs(r.width-1920)<2&&Math.abs(r.height-1080)<2&&
  Math.abs(root.width-1920)<2&&root.height>=1080&&
  c.width>=1800&&c.height>=1000;
},null,{timeout:15000});
const desk2=await inspectDesktop(1920,1080);
assert.ok(Math.abs(desk2.root.width-1920)<2&&desk2.root.height>=1080&&Math.abs(desk2.canvas.width-1920)<2&&Math.abs(desk2.canvas.height-1080)<2,'Viewport canvas must fill 1920 × 1080 while scrollable shell may extend beyond viewport: '+JSON.stringify(desk2));
assert.ok(desk2.canvas.backingWidth>=1800&&desk2.canvas.backingHeight>=1000,'Full HD frame must retain crisp backing');
assert.ok(desk2.player.x>=0&&desk2.player.right<=1920,'Desktop content should fit screen');
await desktop.screenshot({path:'stage78-ui-desktop.png',fullPage:false});

await desktop.locator('#music-toggle-button').click();
await desktop.locator('#share-button').click();
await desktop.locator('#performance-button').click();
const beforeDesktopScroll=await desktop.evaluate(()=>{
 const p=document.querySelector('#player-section').getBoundingClientRect();
 return {top:p.top+scrollY,center:p.left+p.width/2};
});
await desktop.evaluate(()=>scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'}));
await desktop.waitForTimeout(250);
const afterDesktopScroll=await desktop.evaluate(()=>{
 const p=document.querySelector('#player-section').getBoundingClientRect(),c=document.querySelector('#fluid-canvas').getBoundingClientRect();
 return {scrollY,top:p.top+scrollY,center:p.left+p.width/2,canvasTop:c.top,canvasW:c.width,canvasH:c.height,
  height:document.scrollingElement.scrollHeight};
});
assert.ok(afterDesktopScroll.scrollY>150,'Desktop document must be scrollable when drawers expand');
assert.ok(Math.abs(afterDesktopScroll.top-beforeDesktopScroll.top)<2,'Player cannot shift when desktop drawers expand');
assert.ok(Math.abs(afterDesktopScroll.center-960)<2,'Player must remain horizontally centered');
assert.ok(Math.abs(afterDesktopScroll.canvasTop)<2&&Math.abs(afterDesktopScroll.canvasW-1920)<2,
 'Desktop visual background must cover viewport during scroll: '+JSON.stringify(afterDesktopScroll));
await desktop.screenshot({path:'stage80-long-page-desktop.png',fullPage:false});

await desktop.close();
assert.deepEqual(desktopErrors,[],'No uncaught desktop rendering exceptions');

const tablet=await browser.newPage({viewport:{width:768,height:1024},isMobile:true,hasTouch:true,deviceScaleFactor:2});
await tablet.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
const tabletViewport=await tablet.locator('#app-shell').boundingBox();
assert.ok(tabletViewport.width<=768,'Mobile/tablet must retain its normal layout');
await tablet.close();

// Stage79: auto-bind pads from local song into RETRACTABLE performance module.
// A deterministic local PCM WAV avoids cross-origin catalogs in CI.
const djPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const djErrors=[];djPage.on('pageerror',err=>djErrors.push(err.message));
await djPage.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
const rate=8000,seconds=4,samples=rate*seconds,wav=Buffer.alloc(44+samples*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++){
 const gate=(i%rate)<rate/3?1:.22;
 const value=Math.sin(2*Math.PI*(120+(i%rate)*.005)*i/rate)*gate;
 wav.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(value*22000))),44+i*2);
}
await djPage.locator('#audio-import').setInputFiles({name:'GNARLY - Local Test.wav',mimeType:'audio/wav',buffer:wav});
await djPage.locator('#module-performance [data-module-toggle="performance"]').click();
await djPage.locator('#module-performance-body [data-dj-state="ready"]').waitFor({timeout:20000});
assert.equal(await djPage.locator('#module-performance-body .dj-pad').count(),16);
assert.equal(await djPage.locator('#module-performance-body .dj-advanced:not([open])').count(),1);
assert.match(await djPage.locator('#module-performance-body #dj-song-status').innerText(),/16 trechos reais/);
assert.ok(await djPage.locator('#module-performance-body [data-dj-pad="0"]').innerText().then(x=>x.includes('0:')),'Pad labels show track-relative timestamps');
const flashed=await djPage.locator('#module-performance-body [data-dj-pad="0"]').evaluate(el=>{
 el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,composed:true,pointerType:'touch',button:0}));
 return el.classList.contains('is-hit');
});
assert.ok(flashed,'Real audio pad should flash synchronously on pointerdown');
await djPage.screenshot({path:'stage79-dj-mobile.png',fullPage:true});
assert.deepEqual(djErrors,[],'DJ must not crash Web Audio or GPU');
await djPage.close();

// Stage80: open a long real DJ drawer, then scroll BELOW the original viewport.
// Backdrop stays viewport-fixed, not a clipped/solid-green shell wallpaper.
// The player's DOCUMENT position must not change as panels expand below it.
const stage80=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const stage80Errors=[];stage80.on('pageerror',e=>stage80Errors.push(e.message));
await stage80.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await stage80.waitForSelector('#player-section');
const snapshot=()=>stage80.evaluate(()=>{
 const player=document.querySelector('#player-section').getBoundingClientRect();
 const canvas=document.querySelector('#fluid-canvas').getBoundingClientRect();
 const bg=document.querySelector('#gnarly-background').getBoundingClientRect();
 return {playerTop:player.top+scrollY,playerX:player.x,playerW:player.width,
  bgTop:bg.top,bgWidth:bg.width,bgHeight:bg.height,
  canvasTop:canvas.top,canvasHeight:canvas.height,backingWidth:document.querySelector('#fluid-canvas').width,
  pageHeight:document.scrollingElement.scrollHeight,scrollY,
  bgPosition:getComputedStyle(document.querySelector('#gnarly-background')).position,
  shellBackground:getComputedStyle(document.querySelector('#app-shell')).backgroundImage,
  bgColor:getComputedStyle(document.body).backgroundColor};
});
const beforeExpand=await snapshot();
assert.ok(Math.abs(beforeExpand.playerX+(beforeExpand.playerW/2)-195)<2,'Player should be centered before opening drawers');
await stage80.locator('#music-toggle-button').click();
await stage80.locator('#share-button').click();
await stage80.locator('#module-performance [data-module-toggle="performance"]').click();
await stage80.locator('#module-performance-body [data-dj-pad]').first().waitFor();
await stage80.waitForTimeout(400);
const expanded=await snapshot();
assert.ok(Math.abs(expanded.playerTop-beforeExpand.playerTop)<2,
 'Opening modules must NOT shift the player in document coordinates: '+JSON.stringify({beforeExpand,expanded}));
assert.ok(Math.abs(expanded.playerX+expanded.playerW/2-195)<2,'Player remains horizontally centered');
assert.ok(expanded.pageHeight>844+400,'Modules must genuinely extend scrollable document: '+JSON.stringify(expanded));
assert.equal(expanded.bgPosition,'fixed','Animated background should be independent of document scrolling');
assert.equal(expanded.shellBackground,'none','Scrollable shell must not draw a flat/solid background');
await stage80.evaluate(()=>window.scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'}));
await stage80.waitForTimeout(250);
const afterScroll=await snapshot();
assert.ok(afterScroll.scrollY>250,'Expanded content should be reachable by scrolling');
assert.ok(Math.abs(afterScroll.canvasTop)<2&&Math.abs(afterScroll.bgTop)<2,
 'Viewport shader must remain pinned to 0 when document scrolls: '+JSON.stringify(afterScroll));
assert.ok(Math.abs(afterScroll.canvasHeight-844)<2&&Math.abs(afterScroll.bgHeight-844)<2,'Shader stays fullscreen');
assert.equal(afterScroll.backingWidth,expanded.backingWidth,
 'Opening drawers and scrolling must not cause unnecessary GPU canvas reallocation');
assert.deepEqual(stage80Errors,[]);
await stage80.screenshot({path:'stage80-long-page-mobile.png',fullPage:false});
await stage80.close();

// Karaoke expansion: operates on the existing page/player and never asks for mic
// permission by simply opening the native-inspired lyric interface.
const karaokePage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const karaokeErrors=[];karaokePage.on('pageerror',e=>karaokeErrors.push(e.message));
await karaokePage.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await karaokePage.locator('#karaoke-expand-button').waitFor({state:'attached'});
await karaokePage.locator('#floating-lyrics').evaluate(el=>{el.hidden=false});
await karaokePage.locator('#karaoke-expand-button').click();
assert.equal(await karaokePage.locator('#karaoke-stage').isVisible(),true);
// Regression: no header/play/pause clipping after expanding stage while
// the body is scrolled or browser fullscreen is active.
const stageGeometry=await karaokePage.evaluate(()=>{
 const rect=selector=>{const {top,bottom,left,right}=document.querySelector(selector).getBoundingClientRect();return {top,bottom,left,right}};
 return {header:rect('.karaoke-stage-header'),play:rect('#karaoke-stage-play'),close:rect('#karaoke-stage-close'),reader:rect('#karaoke-reader'),footer:rect('.karaoke-stage-footer'),height:innerHeight};
});
assert.ok(stageGeometry.header.top>=0&&stageGeometry.header.bottom<stageGeometry.height/3,
 'Karaoke header must remain fully visible: '+JSON.stringify(stageGeometry));
for(const id of ['play','close','footer'])assert.ok(stageGeometry[id].top>=0&&stageGeometry[id].bottom<=stageGeometry.height,
 'Karaoke '+id+' must remain within the viewport: '+JSON.stringify(stageGeometry));
assert.ok(stageGeometry.reader.bottom>stageGeometry.reader.top+50,'Karaoke lyric reader must have positive height');
await karaokePage.locator('#karaoke-stage-fullscreen').click();
assert.equal(await karaokePage.locator('#karaoke-stage-fullscreen').getAttribute('aria-pressed'),'true');
await karaokePage.locator('#karaoke-stage-fullscreen').click();
assert.equal(await karaokePage.locator('#karaoke-stage-fullscreen').getAttribute('aria-pressed'),'false');
assert.equal(await karaokePage.locator('#karaoke-voice-toggle').getAttribute('aria-pressed'),'false');
assert.equal(await karaokePage.locator('#karaoke-voice-record').isDisabled(),true);
assert.equal(await karaokePage.locator('audio').count(),1,'Expanded karaoke must reuse the one and only audio element');
await karaokePage.locator('#karaoke-caption-settings').click();
assert.equal(await karaokePage.locator('#karaoke-stage-font-menu').isVisible(),true);
await karaokePage.locator('[data-stage-font="neon"]').click();
assert.equal(await karaokePage.locator('#karaoke-stage').getAttribute('data-lyric-style'),'neon');
assert.equal(await karaokePage.locator('#karaoke-stage').isVisible(),true);
await karaokePage.locator('#karaoke-follow-live').click();
// Microphone permission errors must be displayed INSIDE the expanded stage,
// rather than behind its overlay in GNARLY's global toast layer.
await karaokePage.evaluate(()=>{
 if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});
});
await karaokePage.locator('#karaoke-voice-toggle').click();
await karaokePage.waitForFunction(()=>!document.getElementById('karaoke-stage-feedback').hidden);
assert.match(await karaokePage.locator('#karaoke-stage-feedback').innerText(),/microfone|permissão/i);
// Follow must ONLY scroll the lyric reader; never the whole document.
const isolatedScroll=await karaokePage.evaluate(async()=>{
 const reader=document.getElementById('karaoke-reader'),holder=document.getElementById('karaoke-reader-lines');
 const before=window.scrollY;reader.style.height='200px';reader.style.flex='0 0 200px';
 const anchor=document.createElement('div');anchor.style.height='1600px';holder.append(anchor);
 const line=document.createElement('div');line.style.height='70px';line.textContent='Verso distante';holder.append(line);
 const {KaraokeStage}=await import('./ui/karaoke-stage.js');
 const prototype=Object.create(KaraokeStage.prototype);prototype.root=document.getElementById('karaoke-stage');prototype.reducedMotion=true;
 prototype.centerActiveLine(line);
 return {documentBefore:before,documentAfter:window.scrollY,readerTop:reader.scrollTop};
});
assert.equal(isolatedScroll.documentAfter,isolatedScroll.documentBefore,'Autofollow must never scroll outer page');
assert.ok(isolatedScroll.readerTop>300,'Autofollow must scroll its own reader only: '+JSON.stringify(isolatedScroll));
await karaokePage.screenshot({path:'karaoke-expanded-web-mobile.png',fullPage:false});
await karaokePage.locator('#karaoke-stage-close').click();
assert.equal(await karaokePage.locator('#karaoke-stage').isVisible(),false);
assert.equal(await karaokePage.locator('#player-section').count(),1);
assert.deepEqual(karaokeErrors,[],'Karaoke expanded overlay must not throw runtime errors');
await karaokePage.close();

// GNARLY quick creative actions: a tap applies immediately without opening a sheet;
// sustained press opens a complete selector, without triggering a second selection.
const quick=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const quickErrors=[];quick.on('pageerror',e=>quickErrors.push(e.message));
await quick.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await quick.locator('#theme-button').click();
assert.match(await quick.locator('.build-badge').innerText(),/CYBER NIGHT/,'Palette tap cycles immediately');
assert.equal(await quick.locator('#bottom-sheet').isVisible(),false);
const selectedTheme=await quick.locator('.build-badge').innerText();
await quick.locator('#experience-button').click();
assert.equal(await quick.locator('.build-badge').innerText(),selectedTheme,'Experience tap preserves theme');
assert.equal(await quick.evaluate(()=>localStorage.getItem('gnarly.web.experience')),'cyber-night');
assert.equal(await quick.locator('#bottom-sheet').isVisible(),false);
await quick.locator('#lyric-style-button').click();
assert.equal(await quick.locator('#app-shell').getAttribute('data-lyric-style'),'art-magazine-cutout');
assert.equal(await quick.locator('#bottom-sheet').isVisible(),false);
await quick.locator('#lyric-style-button').dispatchEvent('pointerdown',{button:0,pointerType:'touch'});
await quick.waitForTimeout(550);
assert.equal(await quick.locator('#bottom-sheet').isVisible(),true,'Holding Aa opens manual font catalog');
assert.equal(await quick.locator('#sheet-title').innerText(),'Aa · Estilo de legenda');
await quick.locator('#lyric-style-button').dispatchEvent('pointerup',{button:0,pointerType:'touch'});
await quick.locator('#close-sheet').click();
assert.deepEqual(quickErrors,[]);
await quick.close();

// Smart Queue / Omnibox: all four tabs share one taste memory without leaking
// their suggestions or requiring the playback engine to start without a track.
const tastePage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const tasteErrors=[];tastePage.on('pageerror',error=>tasteErrors.push(error.message));
await tastePage.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await tastePage.locator('#omnibox-toggle').click();
await tastePage.locator('[data-omnibox-tab="queue"]').click();
assert.equal(await tastePage.locator('.smart-queue-panel').count(),1);
assert.match(await tastePage.locator('.smart-queue-explain').innerText(),/Cada modo tem sua própria lógica/);
assert.equal(await tastePage.locator('.smart-taste-clear').count(),1);
for(const mode of ['artist','album','mix','playlist']){
 await tastePage.locator('[data-smart-mode="'+mode+'"]').click();
 assert.equal(await tastePage.locator('[data-smart-mode="'+mode+'"]').getAttribute('aria-pressed'),'true');
 assert.equal(await tastePage.locator('[data-smart-mode="'+mode+'"]').count(),1);
}
await tastePage.locator('.smart-taste-clear').click();
assert.match(await tastePage.locator('.smart-taste-insight').innerText(),/0 sinais locais/);
await tastePage.locator('[data-omnibox-tab="search"]').click();
assert.match(await tastePage.locator('.section-head').first().innerText(),/para você/i);
assert.deepEqual(tasteErrors,[],'Queue mode/taste reset and Omnibox must not throw');
await tastePage.close();

// GNARLY 2: manual material/color lock, independent material and experience
// must be accessible without altering the single active player or the last Aa font.
const visualPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const visualErrors=[];visualPage.on('pageerror',e=>visualErrors.push(e.message));
await visualPage.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await visualPage.locator('#theme-button').click({button:'right'});
assert.equal(await visualPage.locator('[data-theme="NEON PULSE COLORS"]').count(),1);
assert.equal(await visualPage.locator('[data-theme="SUBCULTURAL ARCHIVE COLORS"]').count(),1);
await visualPage.locator('[data-theme="GNARLY 2"]').click();
assert.match(await visualPage.locator('.build-badge').innerText(),/GNARLY 2/);
assert.equal(await visualPage.locator('[data-gnarly2-lock="colors"]').count(),1);
await visualPage.locator('[data-gnarly2-lock="colors"]').click();
assert.equal(await visualPage.locator('[data-gnarly2-lock="colors"]').getAttribute('aria-pressed'),'true');
await visualPage.locator('[data-theme="NEON PULSE COLORS"]').click();
assert.match(await visualPage.locator('.build-badge').innerText(),/GNARLY 2/);
assert.equal(await visualPage.evaluate(()=>localStorage.getItem('gnarly.web.previousTheme')),'NEON PULSE COLORS');
await visualPage.locator('[data-gnarly2-material="PRISM CARMINE"]').click();
assert.equal(await visualPage.locator('[data-gnarly2-lock="material"]').getAttribute('aria-pressed'),'true');
await visualPage.locator('#close-sheet').click();
await visualPage.locator('#experience-button').click({button:'right'});
await visualPage.locator('[data-experience="gnarly-exp-vector-drift-2000"]').click();
assert.equal(await visualPage.evaluate(()=>localStorage.getItem('gnarly.web.experience')),'gnarly-exp-vector-drift-2000');
assert.match(await visualPage.locator('.build-badge').innerText(),/GNARLY 2/);
await visualPage.locator('#close-sheet').click();
await visualPage.locator('#theme-button').click({button:'right'});
await visualPage.locator('[data-command="restore-theme"]').click();
assert.match(await visualPage.locator('.build-badge').innerText(),/NEON PULSE COLORS/);
await visualPage.locator('[data-material-layer="XEROX SERPENTINE"]').click();
assert.equal(await visualPage.evaluate(()=>localStorage.getItem('gnarly.web.materialLayer')),'XEROX SERPENTINE');
assert.match(await visualPage.locator('.build-badge').innerText(),/NEON PULSE COLORS/);
await visualPage.locator('[data-material-layer="none"]').click();
assert.equal(await visualPage.evaluate(()=>localStorage.getItem('gnarly.web.materialLayer')),'none');
assert.equal(await visualPage.locator('#player-audio').count(),1);
assert.deepEqual(visualErrors,[],'New visual layers and GNARLY 2 do not throw browser runtime errors');
await visualPage.close();

// Device-size regression: artwork quality is metadata, never a request to
// shrink the approved full-screen album cover into a tiny centred thumbnail.
const bleed=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const bleedErrors=[];bleed.on('pageerror',e=>bleedErrors.push(e.message));
await bleed.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
const artworkSizes=await bleed.evaluate(()=>{
 const stage=document.getElementById('karaoke-stage-wallpaper');
 const photo=document.getElementById('photo-background');
 const player=document.getElementById('player-surface-artwork');
 for(const el of [stage,photo,player])el.dataset.artQuality='low';
 return {photo:getComputedStyle(photo).backgroundSize,
  player:getComputedStyle(player).backgroundSize,
  stage:getComputedStyle(stage).objectFit};
});
assert.equal(artworkSizes.photo,'cover');
assert.ok(artworkSizes.player.split(',').every(size=>size.trim()==='cover'),artworkSizes.player);
assert.equal(artworkSizes.stage,'cover');
assert.deepEqual(bleedErrors,[]);
await bleed.close();

await browser.close();
