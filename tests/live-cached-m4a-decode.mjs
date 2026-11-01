/**
 * Read-only verification of the EXACT previously reported GNARLY recording.
 * Only Cloudflare R2 edge cache is accepted, never origin extraction. The
 * downloaded temp file is deleted; no music/audio artifacts are uploaded.
 */
import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const id=process.env.GNARLY_VERIFY_VIDEO_ID||'kb8UsWvW5Hw';
assert.match(id,/^[A-Za-z0-9_-]{11}$/);
const origin=process.env.GNARLY_PROBE_URL||'https://gnarly-web-pages.pages.dev';
const endpoint=new URL('/fast-audio/'+id+'?cached-only=1',origin);
const headers=await fetch(endpoint,{method:'HEAD',cache:'no-store',
 signal:AbortSignal.timeout(12000)});
console.log('R2 DECODE HEAD',JSON.stringify({id,status:headers.status,
  source:headers.headers.get('x-gnarly-playback-source'),
  mime:headers.headers.get('content-type'),
  length:headers.headers.get('content-length')}));
assert.equal(headers.status,200,'the selected recording is missing from this R2 bucket');
assert.equal(headers.headers.get('x-gnarly-playback-source'),'r2-edge');
const length=Number(headers.headers.get('content-length'));
assert.ok(Number.isSafeInteger(length)&&length>=1024&&length<=16*1024*1024,
 'cached file size invalid or unsafe for diagnostic');
const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(25000)});
assert.equal(response.status,200);
assert.equal(response.headers.get('x-gnarly-playback-source'),'r2-edge');
assert.match(response.headers.get('content-type')||'',/audio\/mp4/i);
const bytes=new Uint8Array(await response.arrayBuffer());
assert.equal(bytes.byteLength,length);
assert.equal(String.fromCharCode(...bytes.slice(4,8)),'ftyp');
const filepath='/tmp/gnarly-r2-decoder-check.m4a';
try{
 await writeFile(filepath,bytes,{mode:0o600});
 const probe=spawnSync('ffprobe',['-v','error','-show_entries',
  'format=format_name,duration:stream=codec_name,codec_type',
  '-of','json',filepath],{encoding:'utf8',timeout:12000});
 console.log('R2 FFPROBE',JSON.stringify({status:probe.status,stderr:(probe.stderr||'').slice(0,800),
  result:(probe.stdout||'').slice(0,1200)}));
 assert.equal(probe.status,0,'R2 file cannot be parsed by FFprobe');
 const info=JSON.parse(probe.stdout||'{}');
 assert.ok(info.streams?.some(s=>s.codec_type==='audio'&&s.codec_name),'R2 M4A contains no decodable audio');
 assert.ok(Number(info.format?.duration)>5,'invalid or implausibly short cached duration');
 const decoded=spawnSync('ffmpeg',['-v','error','-i',filepath,
  '-map','0:a:0','-t','2','-f','null','-'],{encoding:'utf8',timeout:16000});
 console.log('R2 AUDIO DECODE',JSON.stringify({status:decoded.status,
  stderr:(decoded.stderr||'').slice(0,850),duration:info.format?.duration,
  bytes:bytes.length}));
 assert.equal(decoded.status,0,'R2 audio fails real AAC decoding');
}finally{await rm(filepath,{force:true})}
