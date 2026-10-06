// Runtime-only appearance layer. No writes to the installed application.
export function installRenderer(payload, mount) {
  if(window.top!==window)return {installed:false,reason:'child-frame'};
  if(window.__aemeathExtension?.version===payload.rendererVersion)return {installed:true,alreadyActive:true};
  window.__aemeathExtension?.dispose();
  let frame=null,watchdog=0,finaleTimer=0,observer=null,priorFocus=null,disposed=false;
  let ready=false,completed=false,phase='loading',wallpaperURL=null,lastImage=null,lastMedia=null;
  const root=document.documentElement;
  const before=new Map(['--aemeath-wallpaper','--aemeath-wash'].map(key=>[key,[root.style.getPropertyValue(key),root.style.getPropertyPriority(key)]]));
  const originalAttribute=root.getAttribute('data-aemeath-skin');
  const style=document.createElement('style');style.id='aemeath-extension-style';style.textContent=payload.skin;
  function armWatchdog(){
    clearTimeout(watchdog);
    if(frame&&!document.hidden&&phase!=='settings'&&!payload.renderMode)watchdog=setTimeout(()=>{phase='timeout';removeOverlay();},25000);
  }
  function visibility(){armWatchdog();}
  function removeOverlay(){
    clearTimeout(watchdog);clearTimeout(finaleTimer);observer?.disconnect();observer=null;
    frame?.remove();frame=null;
    if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null;
  }
  function dispose(){
    if(disposed)return;disposed=true;removeOverlay();style.remove();
    if(wallpaperURL)URL.revokeObjectURL(wallpaperURL);wallpaperURL=null;lastImage=null;
    originalAttribute===null?root.removeAttribute('data-aemeath-skin'):root.setAttribute('data-aemeath-skin',originalAttribute);
    for(const [key,[value,priority]] of before)value?root.style.setProperty(key,value,priority):root.style.removeProperty(key);
    window.removeEventListener('message',message);window.removeEventListener('keydown',keyboard,true);document.removeEventListener('visibilitychange',visibility);
    delete window.__aemeathExtension;
  }
  function background(data){
    if(!payload.skin)return;
    if(typeof data.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(data.image))return;
    if(!style.isConnected)document.head.appendChild(style);
    const strength=Number.isFinite(data.strength)?Math.max(0,Math.min(75,data.strength)):42;
    // Large data URLs exceed CSS custom-property token limits in Chromium.
    // A short local Blob URL also avoids copying megabytes into each style value.
    if(strength>0&&data.image!==lastImage){
      const comma=data.image.indexOf(','),mime=data.image.slice(5,data.image.indexOf(';'));
      const binary=atob(data.image.slice(comma+1)),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const previous=wallpaperURL;wallpaperURL=URL.createObjectURL(new Blob([bytes],{type:mime}));lastImage=data.image;
      root.style.setProperty('--aemeath-wallpaper',`url(${JSON.stringify(wallpaperURL)})`);
      if(previous)URL.revokeObjectURL(previous);
    }
    if(strength===0){root.style.removeProperty('--aemeath-wallpaper');if(wallpaperURL)URL.revokeObjectURL(wallpaperURL);wallpaperURL=null;lastImage=null;}
    root.style.setProperty('--aemeath-wash',String(1-strength/100));
    root.toggleAttribute('data-aemeath-skin',strength>0);
  }
  function show(settings=false){
    if(disposed||frame)return;
    ready=false;completed=false;lastMedia=null;
    priorFocus=document.activeElement;phase=settings?'settings':'loading';
    frame=document.createElement('iframe');frame.id='aemeath-extension-overlay';frame.title='启动动画';
    Object.assign(frame.style,{position:'fixed',inset:'0',width:'100%',height:'100%',border:'0',zIndex:'2147483646',background:'transparent',colorScheme:'dark'});
    const current=frame;
    current.addEventListener('load',()=>{
      if(frame!==current||disposed)return;
      try{
        const win=current.contentWindow,doc=win.document;
        // No inline script, eval, network server, or CSP change is needed.
        doc.documentElement.innerHTML=payload.html;
        const css=doc.createElement('style');css.textContent=payload.css;doc.head.appendChild(css);
        win.AEMEATH_EXTERNAL=true;win.AEMEATH_ASSETS=payload.assets;win.AEMEATH_OPEN_SETTINGS=settings;
        win.AEMEATH_RENDER_MODE=payload.renderMode;win.AEMEATH_RENDER_IMAGES=payload.images;win.AEMEATH_MOVIE=payload.movie;
        // The function is compiled in the parent realm. A closure-bound bridge
        // preserves frame identity without weakening postMessage source checks.
        win.AEMEATH_SEND=data=>message({source:win,data});
        mount(win);current.focus();
      }catch(error){phase='failed';console.error('Aemeath extension:',error.message);removeOverlay();}
    },{once:true});
    current.src='about:blank';document.body.appendChild(current);
    armWatchdog();
  }
  function message(event){
    if(!frame||event.source!==frame.contentWindow||event.data?.type!=='aemeath-boot')return;
    const data=event.data;
    if(data.action==='background')background(data);
    if(data.action==='ready'){ready=true;phase=data.preparing?'preparing':'playing';}
    if(data.action==='playing'){phase='playing';}
    if(data.action==='complete'){lastMedia=frame.contentWindow.startupMovie?.status();phase='finishing';finaleTimer=setTimeout(()=>{completed=true;phase='complete';removeOverlay();},data.skipped?0:1200);}
    if(data.action==='assetError'){phase='failed';removeOverlay();}
    if(data.action==='settings-open'){phase='settings';clearTimeout(watchdog);}
    if(data.action==='settings-close'){phase='playing';watchdog=setTimeout(removeOverlay,25000);}
    if(data.action==='restore')dispose();
  }
  function keyboard(event){
    if((event.metaKey||event.ctrlKey)&&event.altKey&&event.code==='KeyB'){event.preventDefault();show(true);}
  }
  window.addEventListener('message',message);window.addEventListener('keydown',keyboard,true);document.addEventListener('visibilitychange',visibility);
  window.__aemeathExtension={version:payload.rendererVersion,dispose,replay:()=>show(),openSettings:()=>show(true),status:()=>({ready,completed,phase,overlay:!!frame,elapsed:frame?.contentWindow?.startupMovie?.status()?.time??frame?.contentDocument?.querySelector('.window')?.dataset.elapsed,media:frame?.contentWindow?.startupMovie?.status()??lastMedia,artworkHash:payload.artworkHash,visibility:document.visibilityState,wallpaper:root.hasAttribute('data-aemeath-skin'),imageBytes:root.style.getPropertyValue('--aemeath-wallpaper').length})};
  if(document.body)show();
  else{observer=new MutationObserver(()=>{if(document.body){observer.disconnect();observer=null;show();}});observer.observe(document,{childList:true,subtree:true});}
  return {installed:true};
}
