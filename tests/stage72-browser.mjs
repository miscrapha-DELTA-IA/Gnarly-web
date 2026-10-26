import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const errs=[],warnings=[];page.on('pageerror',x=>errs.push(x.message));page.on('console',x=>{if(x.type()==='warning'||x.type()==='error')warnings.push(x.text())});
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('#omnibox-toggle');
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
await page.locator('#theme-button').click();
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
await page.locator('[data-visual-tab="theme"]').click();
await page.locator('[data-theme="ACID"]').click();
await page.locator('[data-visual-tab="experience"]').click();
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
await page.locator('[data-visual-tab="theme"]').click();
await page.locator('[data-theme="CRIMSON"]').click();
await page.locator('[data-visual-tab="experience"]').click();
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
await page.locator('#performance-button').click();
assert.equal(await page.locator('#module-performance-body').isVisible(),true);
assert.equal(await page.locator('#module-performance-body [data-dj-pad]').count(),16);
await page.locator('#performance-button').click();
assert.equal(await page.locator('#module-performance-body').isVisible(),false);
await page.locator('#search-toggle').click();
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
await page.locator('#search-toggle').click();
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
assert.ok(Math.abs(desk1.root.width-1440)<2&&Math.abs(desk1.root.height-900)<2,'PC shell should occupy 1440 × 900: '+JSON.stringify(desk1));
assert.ok(Math.abs(desk1.canvas.width-1440)<2&&Math.abs(desk1.canvas.height-900)<2,'PC GPU canvas should cover viewport');
assert.ok(desk1.gpu,'Desktop background must retain WebGL2');
assert.ok(desk1.canvas.backingWidth>=2700&&desk1.canvas.backingHeight>=1600,'Retina 1440px desktop must not render a blurry 2.1MP texture: '+JSON.stringify(desk1));
assert.ok(desk1.player.x>=0&&desk1.player.right<=1440,'Desktop player should fit inside viewport');
assert.ok(desk1.scrollWidth<=1441,'PC layout should not cause horizontal page scrolling');
await desktop.setViewportSize({width:1920,height:1080});
await desktop.waitForFunction(()=>{const c=document.querySelector('#fluid-canvas');return Math.abs(c.getBoundingClientRect().width-1920)<2&&c.width>=1800;},null,{timeout:12000});
const desk2=await inspectDesktop(1920,1080);
assert.ok(Math.abs(desk2.root.width-1920)<2&&Math.abs(desk2.root.height-1080)<2,'Canvas must resize to fill 1920 × 1080');
assert.ok(desk2.canvas.backingWidth>=1800&&desk2.canvas.backingHeight>=1000,'Full HD frame must retain crisp backing');
assert.ok(desk2.player.x>=0&&desk2.player.right<=1920,'Desktop content should fit screen');
await desktop.screenshot({path:'stage78-ui-desktop.png',fullPage:false});
await desktop.close();
assert.deepEqual(desktopErrors,[],'No uncaught desktop rendering exceptions');

const tablet=await browser.newPage({viewport:{width:768,height:1024},isMobile:true,hasTouch:true,deviceScaleFactor:2});
await tablet.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
const tabletViewport=await tablet.locator('#app-shell').boundingBox();
assert.ok(tabletViewport.width<=768,'Mobile/tablet must retain its normal layout');
await tablet.close();
await browser.close();
