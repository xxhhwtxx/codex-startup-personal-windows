import {readFile,readdir} from 'node:fs/promises';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
import {buildInjection} from '../extension/payload.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const names=['index.html','style.css','cinematic.css','image-settings.js','assets/contours.js','contour-renderer.js','effects.js','animation.js','assets/avatar.webp','assets/artwork.webp'];
const sourceHash=createHash('sha256').update(Buffer.concat(await Promise.all(names.map(name=>readFile(join(root,name)))))).digest('hex');
const cache=JSON.parse(await readFile(join(root,'assets/startup-movie.json'),'utf8'));
assert.equal(cache.sourceHash,sourceHash,'Cached video does not match frontend source');
assert.equal(cache.bytes,(await readFile(join(root,'assets/startup-movie.mp4'))).length,'Cached video size does not match metadata');
assert.ok(cache.fps>0&&cache.duration>=12);
let checked=0;
for(const directory of ['', 'extension','tools']){
  for(const entry of await readdir(join(root,directory))){
    if(!/\.(m?js)$/.test(entry))continue;
    const file=join(root,directory,entry),result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr||file);checked++;
  }
}
// Parse the exact function sent to the official window without executing it.
new Script(await buildInjection(root));
if(process.platform==='win32'){
  for(const name of ['launch.ps1','native-info.ps1','安装.ps1','卸载.ps1']){
    const path=join(root,name).replace(/'/g,"''"),command=`$taskTokens=$null;$taskErrors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${path}',[ref]$taskTokens,[ref]$taskErrors);if($taskErrors.Count){Write-Error ($taskErrors|Out-String);exit 1}`;
    const result=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr||name);
  }
}
console.log(JSON.stringify({check:'passed',javascriptFiles:checked,cachedVideo:{fps:cache.fps,seconds:cache.duration,bytes:cache.bytes},sourceHash}));
