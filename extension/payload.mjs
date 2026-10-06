import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installRenderer} from './renderer.mjs';
export async function buildInjection(root,{renderMode=false,images=null,disableMovie=false}={}){
  const [html,css,cinematic,settings,contours,contourRenderer,effects,animation,avatar,artwork]=await Promise.all([
    'index.html','style.css','cinematic.css','image-settings.js','assets/contours.js','contour-renderer.js','effects.js','animation.js','assets/avatar.webp','assets/artwork.webp'
  ].map(name=>readFile(join(root,name))));
  const sourceHash=createHash('sha256').update(Buffer.concat([html,css,cinematic,settings,contours,contourRenderer,effects,animation,avatar,artwork])).digest('hex');
  let movie=null,movieScript='';
  if(!renderMode&&!disableMovie){
    try{
      const metadata=JSON.parse(await readFile(join(root,'assets/startup-movie.json'),'utf8'));
      if(metadata.sourceHash===sourceHash){
        const bytes=await readFile(join(root,'assets/startup-movie.mp4'));
        movie={...metadata,data:bytes.toString('base64')};
        movieScript=(await readFile(join(root,'movie-player.js'))).toString();
      }
    }catch{}
  }
  const payload={html:html.toString().replace(/<!doctype[^>]*>/ig,'').replace(/<html[^>]*>|<\/html>/ig,'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/ig,'').replace(/<link\b[^>]*>/ig,'')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/ig,'').replace(/src="assets\/[^"]*"/g,'src=""'),
    css:css.toString()+'\n'+cinematic.toString()+'\nbody.embedded .end-screen{visibility:visible}body.embedded.closing{background:#0c0912}',skin:'',
    artworkHash:createHash('sha256').update(await readFile(join(root,'assets/artwork.png'))).digest('hex'),
    sourceHash,renderMode,images,movie,
    rendererVersion:createHash('sha256').update(installRenderer.toString()).update(sourceHash).update(movieScript).update(movie?.themeKey||'').update(String(movie?.bytes||0)).update(String(renderMode)).digest('hex'),
    assets:{avatar:'data:image/webp;base64,'+avatar.toString('base64'),artwork:'data:image/webp;base64,'+artwork.toString('base64')}};
  const mount=`function(window){const document=window.document,location=window.location,performance=window.performance,indexedDB=window.indexedDB,Image=window.Image,Path2D=window.Path2D,URL=window.URL,module=undefined;const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);document.body.classList.add('presentation');\n${settings}\nif(window.AEMEATH_RENDER_MODE&&window.AEMEATH_RENDER_IMAGES)window.imageSettings.load=async()=>window.AEMEATH_RENDER_IMAGES;\n${movieScript}\n${contours}\n${contourRenderer}\n${effects}\n${animation}\n}`;
  return `(${installRenderer.toString()})(${JSON.stringify(payload)},${mount})`;
}
