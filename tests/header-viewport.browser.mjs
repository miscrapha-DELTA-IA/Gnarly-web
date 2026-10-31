import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Dedicated browser acceptance: the previous UI test only checked the support
// heart against its parent, missing the separate eight-button top toolbar,
// the edge halo and fine-pointer responsive browser windows.
const browser=await chromium.launch({
 headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle',
 '--use-angle=swiftshader','--enable-unsafe-swiftshader']
});
try{
 for(const variant of [
  {name:'phone/touch',isMobile:true,hasTouch:true,widths:[280,320,344,360,375,390,414,430,600,650,768]},
  {name:'desktop/pointer',isMobile:false,hasTouch:false,widths:[320,390,600,650,768,820,899,900,1024,1440]}
 ]){
  const page=await browser.newPage({viewport:{width:variant.widths[0],height:844},
   isMobile:variant.isMobile,hasTouch:variant.hasTouch,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#omnibox-toggle');
  // An old bug: source tests passed because they served repo root while
  // Cloudflare Pages dist silently omitted the new Search/heart stylesheet.
  const cssResponse=await page.request.get('http://127.0.0.1:8765/search-hierarchy.css');
  assert.equal(cssResponse.status(),200,'Published Pages build must serve search CSS');
  assert.match(cssResponse.headers()['content-type']||'',/text\/css/,
   'Published search stylesheet must not silently be an HTML fallback');
  const publishedCss=await cssResponse.text();
  assert.match(publishedCss,/\.app-shell \.quick-actions #omnibox-shell\{/);
  assert.match(publishedCss,/grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
  const browserStyles=await page.evaluate(()=>{
   const topbar=document.querySelector('#topbar');
   const shell=document.querySelector('#omnibox-shell');
   const button=document.querySelector('#omnibox-toggle');
   return {layout:getComputedStyle(topbar).display,shellWidth:shell.getBoundingClientRect().width,
    buttonWidth:button.getBoundingClientRect().width,buttonRadius:getComputedStyle(button).borderRadius};
  });
  if(variant.widths[0]<=650)assert.equal(browserStyles.layout,'grid',
   'Responsive grid CSS must actually load in deployed site: '+JSON.stringify(browserStyles));
  assert.ok(browserStyles.shellWidth<=43&&browserStyles.buttonWidth<=43,
   'Search launcher must actually be compact in the built site: '+JSON.stringify(browserStyles));
  for(const width of variant.widths){
   await page.setViewportSize({width,height:844});
   await page.waitForTimeout(65);
   const bounds=await page.evaluate(()=>{
    const rect=el=>{
     const r=el.getBoundingClientRect();
     return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
      width:r.width,height:r.height};
    };
    const visible=el=>el&&!el.hidden&&getComputedStyle(el).display!=='none';
    const topbar=document.querySelector('#topbar');
    const brand=document.querySelector('#brand-line');
    const headerButtons=[...topbar.children].filter(visible).map(el=>({id:el.id,...rect(el)}));
    const actionButtons=[...document.querySelector('.quick-actions').children]
     .filter(el=>el.id!=='library-button'&&visible(el)&&el.tagName!=='DIV'||el.id==='omnibox-shell')
     .filter(visible).map(el=>({id:el.id,...rect(el)}));
    return {
     viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     deviceLayout:document.querySelector('#app-shell').dataset.deviceLayout,
     topbar:rect(topbar),brand:rect(brand),headerButtons,actionButtons,
     loupe:rect(document.querySelector('#omnibox-toggle')),
     heart:rect(document.querySelector('#support-button')),
     brandIdentity:rect(document.querySelector('.brand-identity'))
    };
   });
   const label=variant.name+' '+width+'px '+JSON.stringify(bounds);
   assert.ok(bounds.scrollWidth<=width+1,'Horizontal scrolling: '+label);
   assert.equal(bounds.headerButtons.length,8,'Topbar should retain eight controls: '+label);
   for(const b of bounds.headerButtons){
    assert.ok(b.left>=Math.max(0,bounds.topbar.left)+10,
     'Topbar icon clips left (including 6px focus ring): '+b.id+' '+label);
    assert.ok(b.right<=Math.min(width,bounds.topbar.right)-10,
     'Topbar icon clips right (including halo): '+b.id+' '+label);
   }
   for(const b of bounds.actionButtons){
    assert.ok(b.left>=bounds.brand.left-1,'Action escapes brand left: '+b.id+' '+label);
    assert.ok(b.right<=bounds.brand.right-11,'Action escapes right with no halo inset: '+b.id+' '+label);
   }
   assert.ok(bounds.heart.left>=bounds.loupe.right-1,'Search and heart overlap: '+label);
   assert.ok(bounds.brandIdentity.right<=bounds.loupe.left+1,'Brand and search overlap: '+label);
   console.log('HEADER SAFE',variant.name,width,
    'toolbar',bounds.headerButtons.length,'actions',bounds.actionButtons.length,
    'heartRight',Math.round(bounds.heart.right),
    'brandRight',Math.round(bounds.brand.right));
  }
  await page.close();
 }
 console.log('GNARLY header safe across mobile and desktop, including topbar and search/heart/more.');
}finally{await browser.close();}
