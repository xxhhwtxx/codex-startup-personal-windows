import {open,readFile,writeFile,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bakeMovie,themeKey} from './bake-movie.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url))),lockPath=join(root,'assets/movie-render.lock');
let lock;
try{
  try{lock=await open(lockPath,'wx');}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const owner=Number(await readFile(lockPath,'utf8'));let running=true;try{process.kill(owner,0);}catch{running=false;}
    if(running)process.exit(0);await unlink(lockPath);lock=await open(lockPath,'wx');
  }
  await lock.writeFile(String(process.pid));
  const progress=async line=>{await writeFile(join(root,'assets/movie-render-status.json'),line);};
  for(let pass=0;pass<3;pass++){
    const request=JSON.parse(await readFile(join(root,'assets/movie-render-request.json'),'utf8'));
    let metadata;try{metadata=JSON.parse(await readFile(join(root,'assets/startup-movie.json'),'utf8'));}catch{}
    if(metadata?.themeKey===themeKey(request.images)&&metadata.sourceHash===request.sourceHash)break;
    await bakeMovie(root,{...request,background:true,progress});
  }
}catch(error){await writeFile(join(root,'assets/movie-render-status.json'),JSON.stringify({event:'render-error',message:error.message}));process.exitCode=1;}
finally{if(lock){await lock.close();await unlink(lockPath).catch(()=>{});}}
