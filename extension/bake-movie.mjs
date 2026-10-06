import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {buildInjection} from './payload.mjs';
import {connect,pageTarget,localSocket} from './cdp.mjs';

export const themeKey=images=>JSON.stringify({avatar:images.avatar||null,artwork:images.artwork||null,contours:images.contours||null,introTitle:typeof images.introTitle==='string'?images.introTitle:'欢迎回来',introCaption:typeof images.introCaption==='string'?images.introCaption:'',artworkSubtitle:typeof images.artworkSubtitle==='string'?images.artworkSubtitle:'哈哈，我们又见面了呢，现在又想干嘛呢？',showText:images.showText!==false});
async function findFfmpeg(root){
  const candidates=[process.env.CODEX_STARTUP_FFMPEG,join(root,'tools/ffmpeg.exe'),'ffmpeg'].filter(Boolean);
  for(const executable of candidates){try{await promisify(execFile)(executable,['-version'],{windowsHide:true,timeout:5000});return executable;}catch{}}
  throw Error('Install FFmpeg on PATH, put ffmpeg.exe in tools/, or set CODEX_STARTUP_FFMPEG to rebuild the animation cache.');
}
export async function bakeMovie(root,{images={},fps=150,width=1096,height=766,scale=1.5,probe=false,background=false,progress=console.log}={}){
  const ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  async function native(action,extra=[]){const {stdout}=await promisify(execFile)(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'native-info.ps1'),'-Action',action,...extra],{windowsHide:true,timeout:15000});return JSON.parse(stdout.trim());}
  const ffmpeg=await findFfmpeg(root);
  let gpuEncoding=true;
  try{await promisify(execFile)(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=32x32:d=0.1','-frames:v','1','-c:v','h264_nvenc','-f','null','-'],{windowsHide:true,timeout:15000});}catch{gpuEncoding=false;}
  const info=await native(background?'render-browser':'resolve'),profile=join(root,background?'.cache/movie-headless-profile':'.cache/movie-render-profile');await mkdir(profile,{recursive:true});
  const source=await buildInjection(root,{renderMode:true,images}),sourceHash=source.match(/"sourceHash":"([a-f0-9]+)"/)[1];
  const port=await new Promise((done,fail)=>{const server=createServer();server.once('error',fail);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>done(port));});});
  const args=['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`];
  if(background)args.push('--headless=new','--no-first-run','--no-default-browser-check','about:blank');
  const app=spawn(info.executable,args,{detached:true,windowsHide:true,stdio:'ignore',env:background?process.env:{...process.env,CODEX_ELECTRON_USER_DATA_PATH:profile}});app.unref();
  let client,owned=false,encoder;const started=Date.now();
  try{
    for(let i=0;i<100;i++){
      try{const owner=await native(background?'browser-listener':'listener',['-Port',String(port)]);assert.equal(owner.pid,app.pid);owned=true;const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1500)})).json(),target=targets.find(background?t=>t.type==='page'&&t.url==='about:blank':pageTarget);if(target){client=await connect(localSocket(target.webSocketDebuggerUrl,port));break;}}catch{}
      await delay(100);
    }
    assert.ok(client,'Export window unavailable');
    await client.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
    const result=await client.call('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true},20000);assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
    for(let i=0;i<100;i++){const status=(await client.call('Runtime.evaluate',{expression:'globalThis.__aemeathExtension?.status()',returnByValue:true})).result?.value;if(status?.ready)break;await delay(100);}
    assert.equal((await client.call('Runtime.evaluate',{expression:'globalThis.__aemeathExtension.status().ready',returnByValue:true})).result.value,true);
    const output=resolve(root,probe?'.cache/movie-probe.mp4':'assets/startup-movie.pending.mp4');
    const encoding=gpuEncoding?['-c:v','h264_nvenc','-preset','p6','-tune','hq','-rc','vbr','-cq','25','-b:v','12M','-maxrate','16M','-bufsize','32M','-bf','3','-spatial_aq','1','-temporal_aq','1','-rc-lookahead','32']:['-c:v','libx264','-preset','veryfast','-crf','20','-maxrate','16M','-bufsize','32M'];
    encoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2',...encoding,'-profile:v','high','-level:v',fps>150?'6.0':'5.2','-pix_fmt','yuv420p','-movflags','+faststart',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
    let encoderError='';encoder.stderr.on('data',data=>encoderError+=data);encoder.stdin.on('error',()=>{});
    const exited=new Promise((done,fail)=>{encoder.once('error',fail);encoder.once('close',code=>code===0?done():fail(Error(encoderError||`Encoder exit ${code}`)));});exited.catch(()=>{});
    const count=probe?30:fps*12+1;
    for(let i=0;i<count;i++){
      await client.call('Runtime.evaluate',{expression:`document.getElementById('aemeath-extension-overlay').contentWindow.startupExport.seek(${i*1000/fps})`},20000);
      const shot=await client.call('Page.captureScreenshot',{format:'jpeg',quality:95,fromSurface:true,captureBeyondViewport:false},20000);
      if(!encoder.stdin.write(Buffer.from(shot.data,'base64')))await once(encoder.stdin,'drain');
      if(i%300===0)await progress(JSON.stringify({event:'render-progress',frame:i,total:count,seconds:(Date.now()-started)/1000}));
    }
    encoder.stdin.end();await exited;
    if(!probe){
      await rename(output,join(root,'assets/startup-movie.mp4'));
      const metadata={sourceHash,themeKey:themeKey(images),fps,duration:count/fps,width:Math.ceil(width*scale/2)*2,height:Math.ceil(height*scale/2)*2,bytes:(await readFile(join(root,'assets/startup-movie.mp4'))).length};
      await writeFile(join(root,'assets/startup-movie.json'),JSON.stringify(metadata,null,2));
      await progress(JSON.stringify({event:'render-complete',...metadata,themeKey:undefined,seconds:(Date.now()-started)/1000}));
    }else progress(JSON.stringify({event:'probe-complete',output,seconds:(Date.now()-started)/1000}));
    return output;
  }finally{
    encoder?.kill();
    if(client){await client.call('Browser.close').catch(()=>{});client.close();}
    if(owned)app.kill();
  }
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
  const root=dirname(dirname(fileURLToPath(import.meta.url)));
  let images={};const settingsAt=process.argv.indexOf('--settings');if(settingsAt>=0)images=JSON.parse(await readFile(process.argv[settingsAt+1],'utf8'));
  await bakeMovie(root,{images,probe:process.argv.includes('--probe'),background:process.argv.includes('--background')});
}
