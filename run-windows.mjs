import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {buildInjection} from './extension/payload.mjs';
import {connect,pageTarget,localSocket} from './extension/cdp.mjs';
import {themeKey} from './extension/bake-movie.mjs';
const root=dirname(fileURLToPath(import.meta.url)),run=promisify(execFile),statePath=join(root,'runtime-state.json');
const log=async value=>appendFile(join(root,'startup-events.jsonl'),JSON.stringify({time:new Date().toISOString(),...value})+'\n');
async function native(action,extra=[]){
  const ps=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const {stdout}=await run(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'native-info.ps1'),'-Action',action,...extra],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  return JSON.parse(stdout.trim().replace(/^\uFEFF/,''));
}
async function freePort(){return new Promise((done,fail)=>{const server=createServer();server.once('error',fail);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?fail(error):done(port));});});}
async function openExisting(){
  // Use the packaged app's normal Windows shell activation, including minimized windows.
  await native('activate');
}
async function verifiedState(state){
  if(!Number.isInteger(state?.port)||state.port<1024||state.port>65535||!Number.isInteger(state?.pid)||state.pid<1)return null;
  try{const owner=await native('listener',['-Port',String(state.port)]);return owner.pid===state.pid?owner:null;}catch{return null;}
}
async function liveState(){
  try{const state=JSON.parse(await readFile(statePath,'utf8'));if(!Number.isInteger(state.port)||!Number.isInteger(state.pid))return null;
    return verifiedState(state);
  }catch{return null;}
}
async function updateCacheIfChanged(client,source){
  const sourceHash=source.match(/"sourceHash":"([a-f0-9]+)"/)?.[1];
  if(!sourceHash)return;
  const response=await client.call('Runtime.evaluate',{expression:"document.getElementById('aemeath-extension-overlay')?.contentWindow?.startupExport?.settings()",returnByValue:true});
  const images=response.result?.value;if(!images)return;
  let metadata;try{metadata=JSON.parse(await readFile(join(root,'assets/startup-movie.json'),'utf8'));}catch{}
  if(metadata?.sourceHash===sourceHash&&metadata.themeKey===themeKey(images))return;
  await writeFile(join(root,'assets/movie-render-request.json'),JSON.stringify({images,sourceHash,width:1096,height:766,scale:1.5,fps:150}));
  const updater=spawn(process.execPath,[join(root,'extension/refresh-cache.mjs')],{detached:true,windowsHide:true,stdio:'ignore'});updater.unref();
  await log({event:'animation-cache-refresh-requested'});
}
async function attach(port,source,{record=true,smoke=false,expectedPid=null}={}){
  const deadline=Date.now()+60000;let lastError='等待官方主窗口';
  while(Date.now()<deadline){let client;
    try{
      const owner=await native('listener',['-Port',String(port)]);
      if(expectedPid&&owner.pid!==expectedPid)throw Error('Codex debugging process changed.');
      const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1500),redirect:'error'});
      const targets=await response.json(),target=targets.find(pageTarget);if(!target)throw Error('尚未找到官方 Codex 主窗口');
      client=await connect(localSocket(target.webSocketDebuggerUrl,port));
      const injection=await client.call('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true},15000);
      if(injection.exceptionDetails||injection.result?.value?.installed!==true)throw Error('启动覆盖层安装失败');
      if(injection.result.value.alreadyActive)await client.call('Runtime.evaluate',{expression:'globalThis.__aemeathExtension.replay()',returnByValue:true});
      if(record)await writeFile(statePath,JSON.stringify(owner,null,2));
      let observed=false,capturedIntro=false,capturedFinale=false;
      for(let attempt=0;attempt<(smoke?240:60);attempt++){
        const status=await client.call('Runtime.evaluate',{expression:'globalThis.__aemeathExtension?.status()',returnByValue:true});
        const state=status.result?.value;
        if(state?.phase==='failed'||state?.phase==='timeout')throw Error('启动动画素材加载失败');
        if(state?.ready&&!observed){observed=true;await log({event:state.phase==='playing'?'animation-started':'animation-prepared',pid:owner.pid,...state});if(!smoke){await updateCacheIfChanged(client,source).catch(error=>log({event:'animation-cache-refresh-error',message:error.message}));return state;}}
        const visiblePlayback=['playing','finishing'].includes(state?.phase);
        if(smoke&&visiblePlayback&&state?.overlay&&Number(state.elapsed)>=2.7&&!capturedIntro){const capture=await client.call('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(join(root,'../Codex窗口_开场.png'),Buffer.from(capture.data,'base64'));capturedIntro=true;}
        if(smoke&&visiblePlayback&&state?.overlay&&Number(state.elapsed)>=12&&!capturedFinale){const capture=await client.call('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(join(root,'../Codex窗口_收尾.png'),Buffer.from(capture.data,'base64'));capturedFinale=true;}
        if(smoke&&state?.completed){await log({event:'smoke-complete',...state});await client.call('Browser.close').catch(()=>{});return state;}
        await delay(100);
      }
      throw Error('动画确认超时');
    }catch(error){
      lastError=error.message;
      if(expectedPid){
        let running=true;try{process.kill(expectedPid,0);}catch(failure){if(failure.code==='ESRCH')running=false;}
        if(!running)throw Error('The Codex process exited before startup animation could attach.');
      }
    }
    finally{client?.close();}
    await delay(250);
  }
  throw Error(lastError);
}
async function main(){
  const testIndex=process.argv.indexOf('--test-profile'),testProfile=testIndex>=0?resolve(process.argv[testIndex+1]||''):null;
  const waitIndex=process.argv.indexOf('--delay'),wait=waitIndex>=0?Number(process.argv[waitIndex+1]):0;
  if(wait>0&&wait<60000)await delay(wait);
  if(testProfile){const scratch=resolve(root,'.cache'),within=relative(scratch,testProfile);if(!within||within.startsWith('..')||resolve(scratch,within)!==testProfile)throw Error('Test profile must remain inside .cache/');await mkdir(testProfile,{recursive:true});}
  const info=await native('resolve'),source=await buildInjection(root);
  let state=testProfile?null:await liveState();
  if(state){await openExisting();await log({event:'replay-existing',pid:state.pid});return attach(state.port,source);}
  if(!testProfile){
    const existing=await native('existing');
    // Recover an app that started before the state file was written, without restarting it.
    for(const process of existing.processes){
      const recovered=await verifiedState(process);
      if(recovered){await openExisting();await log({event:'recovered-existing',pid:recovered.pid,port:recovered.port});return attach(recovered.port,source,{expectedPid:recovered.pid});}
    }
    for(const process of existing.processes){await log({event:'restart-for-animation',pid:process.pid});await native('restart',['-ProcessId',String(process.pid)]);}
    if(existing.processes.length)await delay(750);
  }
  const port=await freePort(),args=['--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`];
  const env={...process.env};if(testProfile){env.CODEX_ELECTRON_USER_DATA_PATH=testProfile;args.push(`--user-data-dir=${testProfile}`);}
  const app=spawn(info.executable,args,{detached:true,windowsHide:false,stdio:'ignore',env});
  await new Promise((done,fail)=>{app.once('spawn',done);app.once('error',fail);});app.unref();
  await log({event:'official-app-opened',pid:app.pid,port,test:!!testProfile});
  try{return await attach(port,source,{record:!testProfile,smoke:!!testProfile,expectedPid:app.pid});}
  finally{if(testProfile)app.kill();}
}
main().then(state=>{console.log(JSON.stringify(state));}).catch(async error=>{await log({event:'startup-error',message:error.message});console.error(error.message);process.exitCode=1;});
