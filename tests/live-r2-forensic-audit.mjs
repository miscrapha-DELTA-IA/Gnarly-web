import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const ids=['1iv6dA8BLfI','67vr-3kpX3Q','6f8gDL-wPN8','6ywIjjj3YuA','Dn2NxL_R2_c','DrCs-n6pB4c','EAclluQlIK0','JEWOfLf682Q','McGFOMYTu-Q','O_YVhp0hvlc','UihtU4NYf0A','X-XxB1OI_vU','fhWuCiAVH9A','sCouxN-G06g'];
const sites=['https://gnarly-web-pages.pages.dev','https://gnarly-web-stage72.pages.dev'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const dir=mkdtempSync(join(tmpdir(),'gnarly-audit-'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({serviceWorkers:'block'});
const page=await context.newPage();
await page.route('https://diagnostic.invalid/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Audio diagnostic</title>'}));
await page.goto('https://diagnostic.invalid/');
async function request(url,opts={}){return fetch(url,{...opts,cache:'no-store',signal:AbortSignal.timeout(20000)});}
let records=[];
try{
 for(const id of ids){
  const record={id,sites:[]};records.push(record);
  for(const site of sites){
   const result={site};record.sites.push(result);
   try{
    const url=site+'/fast-audio/'+id+'?cached-only=1';
    const head=await request(url,{method:'HEAD'});
    const size=Number(head.headers.get('content-length'));
    result.head={status:head.status,size,source:head.headers.get('x-gnarly-playback-source')};
    if(head.status!==200||result.head.source!=='r2-edge'||size<1024||size>16*1024*1024)throw Error('not a verified R2 hit');
    const full=await request(url);
    if(full.status!==200||full.headers.get('x-gnarly-playback-source')!=='r2-edge')throw Error('full response not R2 hit');
    const bytes=Buffer.from(await full.arrayBuffer());result.size=bytes.length;result.sha256=hash(bytes);
    result.lengthMatch=bytes.length===size;
    result.ranges=[];
    for(const [lo,hi] of [[0,1023],[Math.floor(size/2),Math.floor(size/2)+1023],[size-1024,size-1]]){
      const res=await request(url,{headers:{Range:'bytes='+lo+'-'+hi}});
      const part=Buffer.from(await res.arrayBuffer());
      result.ranges.push({status:res.status,range:res.headers.get('content-range'),ok:res.status===206&&res.headers.get('content-range')==='bytes '+lo+'-'+hi+'/'+size&&Number(res.headers.get('content-length'))===hi-lo+1&&part.equals(bytes.subarray(lo,hi+1))});
    }
    if(site===sites[0]){
      const file=join(dir,id+'.m4a');writeFileSync(file,bytes,{mode:0o600});
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate','-of','json',file],{encoding:'utf8',timeout:20000});
      result.probe=probe.status===0?JSON.parse(probe.stdout):{error:probe.status};
      const pcm=spawnSync('ffmpeg',['-nostdin','-v','error','-xerror','-i',file,'-map','0:a:0','-vn','-ac','1','-ar','16000','-f','s16le','pipe:1'],{timeout:30000,maxBuffer:25*1024*1024});
      result.pcm={status:pcm.status,seconds:pcm.stdout?.length/32000};
      if(pcm.status===0&&pcm.stdout){let last=0;const b=pcm.stdout;for(let n=0;n+1<b.length;n+=2)if(Math.abs(b.readInt16LE(n))>18)last=n/32000;result.pcm.tailSeconds=Math.max(0,result.pcm.seconds-last)}
      rmSync(file,{force:true});
    }
    result.browser=await page.evaluate(async url=>{
     const a=new Audio();a.crossOrigin='anonymous';a.preload='metadata';
     const event=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('metadata timeout')),10000);a.onloadedmetadata=()=>{clearTimeout(timer);resolve()};a.onerror=()=>{clearTimeout(timer);reject(Error('media '+a.error?.code))}});
     try{const ready=event();a.src=url;await ready;const duration=a.duration;a.muted=true;await a.play();const transitions=[];for(const rate of [1.25,.8,1]){a.preservesPitch=false;a.playbackRate=rate;const before=a.currentTime;await new Promise(r=>setTimeout(r,350));transitions.push({rate,actual:a.playbackRate,advance:a.currentTime-before,paused:a.paused,error:a.error?.code||0})}return {duration,transitions}}
     finally{a.pause();a.removeAttribute('src');a.load()}
    },url);
   }catch(e){result.error=String(e.message||e).slice(0,250)}
  }
  console.log('AUDIT '+JSON.stringify(record));
 }
 console.log('AUDIT_TOTAL '+JSON.stringify({records:records.length,results:records.map(r=>({id:r.id,sameBytes:r.sites.length===2&&!!r.sites[0].sha256&&r.sites[0].sha256===r.sites[1].sha256,sites:r.sites.map(s=>({site:s.site,errors:s.error||null,rangeOK:s.ranges?.every(x=>x.ok)??false,duration:s.browser?.duration??null,pcm:s.pcm??null}))}))}));
}finally{await browser.close();rmSync(dir,{recursive:true,force:true})}
