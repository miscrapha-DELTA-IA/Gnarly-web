/** Optional isolated paint probe. No app shader, audio, provider or pass threshold. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=process.env.IPOD_ARTIFACT_DIR||'/tmp/gnarly-ipod-hardware';
const samples=Math.min(60,Math.max(6,Number(process.env.IPOD_PAINT_SAMPLES)||20));
const html=await readFile(path.join(root,'index.html'),'utf8'),start=html.indexOf('<div id="ipod-device"');
const device=html.slice(start,html.indexOf('<div id="player-surface-menu"',start)).replace(' hidden>','>');
const css=await readFile(path.join(root,'ipod-mode.css'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={samples,note:'Isolated 330px shell. Update to next rAF includes software-GPU scheduling; not audio latency or real-device FPS. Variant order and environment can affect results.',variants:{}};
try{
 for(const [label,promotion] of [['unpromoted','auto'],['cachedLight','opacity']]){
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.setContent('<style>'+css+' .gnarly-ipod{display:block!important;position:relative!important;width:330px!important;height:541px!important} .ipod-light{will-change:'+promotion+'!important} body{background:#243029}</style>'+device);
  report.variants[label]=await page.evaluate(async count=>{
   const node=document.getElementById('ipod-device'),idle=[],updates=[];
   for(let i=0;i<count;i++){const start=performance.now();await new Promise(resolve=>requestAnimationFrame(resolve));idle.push(performance.now()-start)}
   for(let i=0;i<count;i++){const start=performance.now();node.style.setProperty('--ipod-base',i%2?'#bbedcb':'#c3cdcf');await new Promise(resolve=>requestAnimationFrame(resolve));updates.push(performance.now()-start)}
   const stats=values=>{values.sort((a,b)=>a-b);return {p50:values[Math.ceil(count*.5)-1],p95:values[Math.ceil(count*.95)-1]}};
   return {idleMs:stats(idle),updateMs:stats(updates)};
  },samples);
  await page.close();
 }
 await mkdir(out,{recursive:true});await writeFile(path.join(out,'paint-probe.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
