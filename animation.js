(() => {
  'use strict';
  const nodes = new Map();
  const $ = selector => { if(!nodes.has(selector))nodes.set(selector,document.querySelector(selector));return nodes.get(selector); };
  const duration = 12000;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const native = !window.AEMEATH_EXTERNAL && Boolean(window.webkit?.messageHandlers?.launcher);
  const embedded = window.parent!==window && (window.AEMEATH_EXTERNAL || new URLSearchParams(location.search).has('embedded'));
  const assets=window.AEMEATH_ASSETS||{artwork:'assets/artwork.webp',avatar:'assets/avatar.webp'};
  if(embedded)document.body.classList.add('embedded');
  const root = $('.window'), art = $('.artwork'), scene = $('.scene');
  const hud = $('.hud'), intro = $('.intro'), sweep = $('.light-sweep');
  const slider = $('#timeline'), pause = $('#pause'), subtitle = $('.subtitle');
  slider.max=String(duration/1000);
  const presentation=document.body.classList.contains('presentation');
  let playing = false, elapsed = 0, origin = 0, frame = 0, lastUI = -Infinity, clockPending=false;
  let completed = false, hiddenPause = false, mode = 'preview', loaded = false, revealed = false;
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const t = clamp(n); return t*t*(3-2*t); };
  const send = (action, details={}) => {
    window.personalRuntime?.send(action,details);
    if(native)window.webkit.messageHandlers.launcher.postMessage(action);
    if(embedded){const data={type:'aemeath-boot',action,...details};if(window.AEMEATH_EXTERNAL)window.AEMEATH_SEND(data);else window.parent.postMessage(data,'*');}
  };
  const particles = Array.from({length: reduced ? 0 : 14}, (_, i) => {
    const node = document.createElement('i'); node.className = 'particle';
    const size = i % 4 === 0 ? 3 : 1.5;
    Object.assign(node.style, {width:`${size}px`,height:`${size}px`,left:`${(i*37+7)%100}%`,top:`${(i*23+17)%100}%`});
    $('.particles').appendChild(node); return node;
  });
  const milestones = [[0,0],[.12,.06],[.35,.41],[.56,.76],[.66,.924],[.72,.97],[.77,1],[1,1]];
  function progress(t) {
    const p = t / duration;
    for (let i=1;i<milestones.length;i++) {
      if (p <= milestones[i][0]) {
        const [a,x] = milestones[i-1], [b,y] = milestones[i];
        return x+(y-x)*smooth((p-a)/(b-a));
      }
    }
    return 1;
  }
  // Split the selected image's own contours once; no particles are allocated per frame.
  const canvas = $('.line-art'), ctx = canvas.getContext('2d');
  // Keep subpixel contour detail while removing redundant points before playback.
  function simplifyPoints(points){
    if(points.length<3)return points;
    const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
    const stack=[[0,points.length-1]],tolerance=.6*.6;
    while(stack.length){
      const [start,end]=stack.pop(),a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      let farthest=-1,distance=tolerance;
      for(let i=start+1;i<end;i++){
        const p=points[i],ratio=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
        const ex=p[0]-a[0]-ratio*dx,ey=p[1]-a[1]-ratio*dy,d=ex*ex+ey*ey;
        if(d>distance){distance=d;farthest=i;}
      }
      if(farthest>=0){keep[farthest]=1;stack.push([start,farthest],[farthest,end]);}
    }
    return points.filter((_,i)=>keep[i]);
  }
  function preparePaths(raw) { return raw.map(simplifyPoints).map(points => {
    let total=0;
    for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    const full=new Path2D();points.forEach((point,i)=>i?full.lineTo(...point):full.moveTo(...point));
    return {points,total,full};
  }); }
  function prepareFragments(paths){
    const result=[],span=Math.max(18,paths.reduce((sum,path)=>sum+path.total,0)/1400);
    const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
    function add(points){
      if(points.length<2)return;
      const first=points[0],last=points[points.length-1],x=(first[0]+last[0])/2,y=(first[1]+last[1])/2;
      const seed=result.length+1;
      result.push({x,y,points:points.map(point=>[point[0]-x,point[1]-y]),
        sx:(x+(noise(seed)-.5)*440+1536)%1536,sy:(y+(noise(seed+271)-.5)*300+864)%864,
        angle:(noise(seed+563)-.5)*Math.PI*2,seed:noise(seed+811)*Math.PI*2});
    }
    for(const path of paths){
      if(path.points.length<2)continue;
      let chunk=[path.points[0]],used=0;
      for(let i=1;i<path.points.length;i++){
        let a=path.points[i-1];const b=path.points[i];
        let length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        while(length>0&&used+length>=span){
          const ratio=(span-used)/length,cut=[a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio];
          chunk.push(cut);add(chunk);chunk=[cut];a=cut;used=0;
          length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        }
        if(length>0){chunk.push(b);used+=length;}
      }
      add(chunk);
    }
    return result;
  }
  let paths=[],fragments=[],lineRenderer=null;
  let identityTexture=null,identityPieces=[];
  function releaseIdentityTexture(){
    if(identityTexture)identityTexture.width=identityTexture.height=0;
    identityTexture=null;identityPieces=[];
  }
  function prepareIdentityTexture(){
    releaseIdentityTexture();
    const bounds=canvas.getBoundingClientRect(),scale=Math.max(bounds.width/1536,bounds.height/864);
    if(!scale)return;
    const ox=bounds.left+(bounds.width-1536*scale)/2,oy=bounds.top+(bounds.height-864*scale)/2;
    const rect=node=>{const r=node.getBoundingClientRect();return {x:(r.left-ox)/scale,y:(r.top-oy)/scale,w:r.width/scale,h:r.height/scale};};
    const texture=document.createElement('canvas');texture.width=1536;texture.height=864;
    const ink=texture.getContext('2d');ink.imageSmoothingEnabled=true;
    const avatar=rect($('.avatar')),radar=rect($('.radar')),border=rect($('.avatar-frame'));
    const cx=radar.x+radar.w/2,cy=radar.y+radar.h/2;
    ink.strokeStyle='#a397a0';ink.lineWidth=1.3;
    ink.beginPath();ink.arc(cx,cy,radar.w*.4425,0,Math.PI*2);ink.stroke();
    ink.setLineDash([9,12]);ink.globalAlpha=.4;
    ink.beginPath();ink.arc(cx,cy,radar.w*.3775,0,Math.PI*2);ink.stroke();ink.setLineDash([]);ink.globalAlpha=.8;
    for(let i=0;i<60;i++){
      const a=i*Math.PI/30,r0=radar.w*(i%5===0?.4525:.46),r1=radar.w*(i%5===0?.4975:.48);
      ink.beginPath();ink.moveTo(cx+Math.sin(a)*r0,cy-Math.cos(a)*r0);ink.lineTo(cx+Math.sin(a)*r1,cy-Math.cos(a)*r1);ink.stroke();
    }
    ink.globalAlpha=1;
    ink.beginPath();ink.arc(border.x+border.w/2,border.y+border.h/2,border.w/2,0,Math.PI*2);ink.stroke();
    ink.save();ink.beginPath();ink.arc(avatar.x+avatar.w/2,avatar.y+avatar.h/2,avatar.w/2,0,Math.PI*2);ink.clip();
    const portrait=$('.avatar'),crop=Math.min(portrait.naturalWidth,portrait.naturalHeight);
    ink.drawImage(portrait,(portrait.naturalWidth-crop)/2,(portrait.naturalHeight-crop)*.49,crop,crop,avatar.x,avatar.y,avatar.w,avatar.h);
    // Neutralize the bitmap once, not with an expensive live blur/filter on every frame.
    ink.globalCompositeOperation='saturation';ink.fillStyle='#999';
    ink.fillRect(avatar.x,avatar.y,avatar.w,avatar.h);ink.globalCompositeOperation='source-over';ink.restore();
    const textBounds=[];
    for(const selector of ['.boot-title','.boot-caption']){
      const node=$(selector),r=rect(node),style=window.getComputedStyle(node);
      if(node.textContent)textBounds.push(r);
      ink.font=`${style.fontWeight} ${parseFloat(style.fontSize)/scale}px ${style.fontFamily}`;
      ink.textAlign='center';ink.textBaseline='middle';ink.fillStyle=style.color;
      ink.globalAlpha=selector==='.boot-caption'?.5:1;
      ink.letterSpacing=`${(parseFloat(style.letterSpacing)||0)/scale}px`;
      ink.fillText(node.textContent,r.x+r.w/2,r.y+r.h/2,r.w);
    }
    ink.globalAlpha=1;
    ink.globalCompositeOperation='source-atop';ink.globalAlpha=.24;ink.fillStyle='#9b9099';
    ink.fillRect(0,0,1536,864);ink.globalAlpha=1;ink.globalCompositeOperation='source-over';
    // Geometric tile selection works for file:// images too, without reading protected pixels.
    const tile=36,boxes=[avatar,border,...textBounds];
    const overlaps=(x,y,r)=>x<r.x+r.w&&x+tile>r.x&&y<r.y+r.h&&y+tile>r.y;
    for(let y=0;y<864;y+=tile)for(let x=0;x<1536;x+=tile){
      const w=Math.min(tile,1536-x),h=Math.min(tile,864-y);
      const distance=Math.hypot(x+w/2-cx,y+h/2-cy);
      const onRing=[.3775,.4425,.48].some(radius=>Math.abs(distance-radar.w*radius)<tile);
      if(onRing||boxes.some(box=>overlaps(x,y,box)))identityPieces.push({x,y,w,h,target:fragments[(identityPieces.length*37)%fragments.length]});
    }
    identityTexture=texture;
    canvas.dataset.identityPieces=String(identityPieces.length);
    fragments.forEach((fragment,i)=>{
      const tile=identityPieces[i%identityPieces.length];
      fragment.ix=tile?tile.x+tile.w/2:cx;fragment.iy=tile?tile.y+tile.h/2:cy;
    });
    for(const tile of identityPieces){tile.target.ix=tile.x+tile.w/2;tile.target.iy=tile.y+tile.h/2;}
  }
  function drawIdentityPieces(spread){
    if(!identityTexture||spread>=1)return;
    const fade=1-smooth((spread-.03)/.43),size=1-.9*spread;
    if(fade<=0)return;
    ctx.globalAlpha=fade;ctx.imageSmoothingEnabled=false;
    for(const tile of identityPieces){
      const target=tile.target;
      const x=(tile.x+tile.w/2)*(1-spread)+target.sx*spread,y=(tile.y+tile.h/2)*(1-spread)+target.sy*spread;
      const angle=target.angle*spread,cs=Math.cos(angle)*size,sn=Math.sin(angle)*size;
      ctx.setTransform(cs,sn,-sn,cs,x,y);
      ctx.drawImage(identityTexture,tile.x,tile.y,tile.w,tile.h,-tile.w/2,-tile.h/2,tile.w,tile.h);
    }
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
  }
  let lastTrace=-1;
  function trace(p,drift=0,spread=1) {
    const stamp=p===1?1:p+drift*.00001;
    if(stamp===lastTrace)return;lastTrace=stamp;
    ctx.clearRect(0,0,1536,864);
    ctx.strokeStyle='#c8c0cd';ctx.lineWidth=1.25;ctx.lineCap='round';ctx.lineJoin='round';
    if(p===1){
      lineRenderer?.hide();
      ctx.globalAlpha=1;paths.forEach(path=>ctx.stroke(path.full));
    }else{
      drawIdentityPieces(spread);
      if(spread>.04){
      ctx.globalAlpha=.82*smooth((spread-.04)/.36);
      if(lineRenderer?.draw(p,drift,spread,ctx.globalAlpha)){ctx.globalAlpha=1;canvas.dataset.progress=p.toFixed(3);return;}
      if(lineRenderer){lineRenderer.dispose();lineRenderer=null;canvas.dataset.renderer='2d';}ctx.beginPath();
      // Arrival time follows target X, so the left edge resolves before the face and right edge.
      const front=p*1.5-.25;
      for(const fragment of fragments){
        const arrival=smooth((front-fragment.x/1536+.16)/.32),loose=1-arrival;
        const angle=fragment.angle*loose,cs=Math.cos(angle),sn=Math.sin(angle);
        const sx=(fragment.ix??fragment.sx)*(1-spread)+fragment.sx*spread;
        const sy=(fragment.iy??fragment.sy)*(1-spread)+fragment.sy*spread;
        const x=sx*loose+fragment.x*arrival+Math.sin(drift*.8+fragment.seed)*7*loose*spread;
        const y=sy*loose+fragment.y*arrival+Math.cos(drift*.6+fragment.seed)*7*loose*spread;
        const size=.16+.84*arrival;
        fragment.points.forEach((point,i)=>{
          const px=x+(point[0]*cs-point[1]*sn)*size,py=y+(point[0]*sn+point[1]*cs)*size;
          if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
        });
      }
      ctx.stroke();ctx.globalAlpha=1;
      }
    }
    canvas.dataset.progress=p.toFixed(3);canvas.dataset.fragments=String(fragments.length);
  }
  for(let i=0;i<60;i++){
    const tick=document.createElementNS('http://www.w3.org/2000/svg','line');
    const angle=i*Math.PI/30,inner=i%5===0?181:184;
    tick.setAttribute('x1',200+Math.sin(angle)*inner);tick.setAttribute('y1',200-Math.cos(angle)*inner);
    tick.setAttribute('x2',200+Math.sin(angle)*(i%5===0?199:192));tick.setAttribute('y2',200-Math.cos(angle)*(i%5===0?199:192));
    tick.style.opacity=i%5===0?'.9':'.55';$('.ticks').appendChild(tick);
  }
  const pulseRings=Array.from(document.querySelectorAll('.pulse i'));
  const bootLogs=Array.from(document.querySelectorAll('.boot-logs div'));
  function render(t) {
    const s=t/1000, p=progress(t), color=smooth((s-7.18)/.24), collapse=smooth((s-11)/.3);
    const dissolve=smooth((s-4.18)/.56);
    const closing=s>=11;
    const finale=smooth((s-11.42)/.58),finaleText=smooth((s-11.72)/.28);
    root.style.setProperty('--finale-reveal',String(finale));
    root.style.setProperty('--finale-text',String(finaleText));
    $('.finale-emblem').style.transform=`translateY(${(1-finale)*12}px) scale(${.76+.24*finale})`;
    $('.crest-bloom').style.transform=`rotate(${(1-finale)*-36}deg)`;
    $('.crest-orbit').style.transform=`rotate(${(1-finale)*52}deg)`;
    root.classList.toggle('closing',closing);document.body.classList.toggle('closing',closing);
    scene.style.opacity=collapse>=1?'0':'1';
    scene.style.transform=`scaleY(${Math.max(.001,1-collapse)})`;
    scene.style.filter=closing?`brightness(${1+collapse*3})`:'none';
    $('.transition-flash').style.opacity=String(reduced?0:smooth((s-7.18)/.035)*(1-smooth((s-7.22)/.2))*.8);
    const line=$('.shutter-line');
    line.style.opacity=String(smooth((s-11.15)/.15)*(1-smooth((s-11.4)/.28)));
    line.style.transform=`scaleX(${1-smooth((s-11.33)/.35)})`;
    if(closing&&!revealed){revealed=true;send('reveal');}

    intro.style.opacity=String(reduced?1-smooth((s-4.18)/.56):s<4.18?1:0);
    $('.identity').style.opacity=String(smooth((s-1.05)/.65));
    $('.identity').style.transform=`translate(-50%,-43%) scale(${.94+.06*smooth((s-1.05)/.65)})`;
    const beat=reduced?0:Math.pow((1-Math.cos(Math.max(0,s-1.05)*Math.PI*2/1.08))/2,2);
    $('.avatar-frame').style.transform=`translateY(${-4*beat}px) scale(${1+.025*beat})`;
    $('.pulse').style.opacity=String(1-smooth((s-1.15)/.5));
    pulseRings.forEach((ring,i)=>{
      const phase=(s*.75+i*.5)%1;
      ring.style.transform=`scale(${.25+phase*.9})`;ring.style.opacity=String((1-phase)*.8);
    });
    $('.dashed').style.transformOrigin='200px 200px';$('.dashed').style.transform=`rotate(${reduced?0:s*16}deg)`;
    $('.boot-title').style.clipPath=`inset(0 ${(1-clamp((s-1.9)/.7))*100}% 0 0)`;
    $('.boot-caption').style.opacity=String(smooth((s-2.5)/.35)*.5);
    $('.memory-art').style.opacity=String(.085*smooth((s-.25)/1.1)*(1-color));
    $('.memory-art').style.transform=reduced?'none':`scale(${1.035-.035*smooth(s/7.2)})`;
    window.personalEffects?.render(s,reduced);
    $('.wave').style.transform=`scaleY(${reduced?1:.6+Math.sin(s*6)*.4})`;
    $('.boot-grid').style.opacity=String(smooth((s-.8)/.6)*(1-color));
    $('.boot-corners').style.opacity=String(smooth((s-.8)/.6)*(1-color));
    $('.boot-logs').style.opacity=String((1-color)*.55);
    if(!presentation)bootLogs.forEach((line,i)=>line.style.opacity=String(smooth((s-.15-i*.38)/.3)));
    const assembling=clamp((s-5.08)/2.02);
    if(s>=4.18&&s<7.43)trace(reduced?1:assembling,s-4.18,reduced?1:dissolve);
    if(s>=4.74&&identityTexture)releaseIdentityTexture();
    const lineOpacity=String((reduced?smooth((s-4.18)/.56):s>=4.18?1:0)*(1-color));
    canvas.style.opacity=lineOpacity;
    if(lineRenderer)lineRenderer.canvas.style.opacity=assembling>=1?'0':lineOpacity;
    canvas.dataset.dissolve=dissolve.toFixed(3);
    art.style.opacity=String(color);
    // The art stays registered to the contours until the color transition finishes.
    art.style.transform=reduced?'none':`scale(${1+.012*smooth((s-7.42)/3.58)})`;
    $('.shade').style.opacity=String(color);
    hud.style.opacity=String(smooth((s-7.24)/.45));
    $('.sync-fill').style.transform=`scaleX(${p})`;
    sweep.style.opacity=reduced?'0':String(Math.sin(clamp((s-7.18)/.8)*Math.PI)*.1);
    sweep.style.transform=`translateX(${(-60+clamp((s-7.18)/.8)*120)}%)`;
    particles.forEach((node,i)=>{
      node.style.opacity=String(color*(.12+.28*(.5+.5*Math.sin(s*.9+i))));
      node.style.transform=`translate(${Math.sin(s*.4+i)*8}px,${-s*(2+i%3)}px)`;
    });
    subtitle.style.opacity=String(smooth((s-7.6)/.4)*(1-smooth((s-10.65)/.25)));
    if(Math.abs(t-lastUI)>60 || t===0 || t>=duration) {
      lastUI=t;
      if(!presentation){
      $('#ratio').textContent=`${(p*100).toFixed(2).padStart(5,'0')}%`;
      $('.sync-phase').textContent=s<6.5?'INITIALIZING':p<1?'SYNCHRONIZING':'SYNC COMPLETE';
      $('#timecode').textContent=`00:${String(Math.floor(s)).padStart(2,'0')}:${String(Math.floor(s%1*30)).padStart(2,'0')}`;
      slider.value=String(s);
      $('#elapsed').innerHTML=`${s.toFixed(1).padStart(4,'0')} <span>/ 12.0s</span>`;
      }
      root.dataset.elapsed=s.toFixed(2);
      root.dataset.stage=s>=11?'shutter':s<1.15?'pulse':s<4.18?'identity':s<4.74?'dispersing':s<5.08?'scattered':s<7.18?'drawing':s<7.43?'colorize':'portrait';
    }
  }
  function updateButton() { pause.textContent=playing?'暂停':'继续'; root.dataset.playing=String(playing); }
  function stop() { playing=false; cancelAnimationFrame(frame); frame=0; updateButton(); }
  function finish(skipped=false) {
    stop(); elapsed=duration; render(elapsed); completed=true;
    releaseIdentityTexture();lineRenderer?.dispose();lineRenderer=null;
    root.classList.add('finished'); root.dataset.completed='true';
    pause.textContent='已结束'; pause.disabled=true;
    $('.end-description').textContent=mode==='launch'?'正在显示 Codex…':textValue(savedImages,textFields[2]);
    send('complete',{skipped});
  }
  function tick(now) {
    if(!playing)return;
    if(clockPending){origin=now-elapsed;clockPending=false;send('playing');}
    elapsed=Math.min(duration,now-origin); render(elapsed);
    if(elapsed>=duration){finish();return;}
    frame=requestAnimationFrame(tick);
  }
  function warmIdentityTexture(){
    if(reduced||identityTexture||elapsed>=4740)return;
    const restoreTime=elapsed;
    // Prepare the final avatar layout before starting the playback clock, never in tick().
    render(4179);prepareIdentityTexture();drawIdentityPieces(0);
    lineRenderer?.dispose();lineRenderer=window.createContourRenderer?.(canvas,fragments)||null;
    ctx.clearRect(0,0,1536,864);lastTrace=-1;render(restoreTime);
  }
  function play() {
    if(!loaded)return;
    if(elapsed>=duration)elapsed=0;
    if(document.hidden&&!native&&!new URLSearchParams(location.search).has('session')){hiddenPause=true;stop();return;}
    warmIdentityTexture();
    completed=false; root.classList.remove('finished'); root.dataset.completed='false';
    pause.disabled=false;clockPending=true;playing=true;updateButton();
    cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);
  }
  async function replay(){revealed=false;hiddenPause=false;stop();elapsed=0;lastUI=-Infinity;if(await window.startupMovie?.play(savedImages))return;render(0);play();}
  $('#replay').addEventListener('click',replay);$('.replay-end').addEventListener('click',replay);
  pause.addEventListener('click',()=>{hiddenPause=false;if(playing){elapsed=Math.min(duration,performance.now()-origin);stop();render(elapsed);}else play();});
  $('.skip').addEventListener('click',()=>finish(true));
  slider.addEventListener('input',()=>{hiddenPause=false;stop();elapsed=Number(slider.value)*1000;warmIdentityTexture();if(elapsed>=duration){finish();return;}lastUI=-Infinity;completed=false;root.classList.remove('finished');root.dataset.completed='false';pause.disabled=false;render(elapsed);});
  window.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.altKey&&event.code==='KeyB'){
      event.preventDefault();if(!$('#settings-dialog').open)openSettings();return;
    }
    if($('#settings-dialog').open)return;
    if(event.key==='Escape'){event.preventDefault();finish(true);}
    if(event.code==='Space'&&event.target.tagName!=='INPUT'&&event.target.tagName!=='BUTTON'){event.preventDefault();pause.click();}
  });
  document.addEventListener('visibilitychange',()=>{
    if(native||new URLSearchParams(location.search).has('session'))return;
    if(document.hidden&&playing){elapsed=Math.min(duration,performance.now()-origin);hiddenPause=true;stop();}
    else if(!document.hidden&&hiddenPause&&!completed){hiddenPause=false;play();}
  });
  // Narrow native bridge: the host may select launch mode or report its own launch error.
  window.launcherUI={
    openSettings,
    beginLaunch(){mode='launch';document.body.classList.add('launch-mode');replay();},
    error(message){stop();scene.style.opacity='0';root.dataset.showText='true';root.classList.add('finished');root.style.setProperty('--finale-reveal','1');root.style.setProperty('--finale-text','1');$('.end-description').textContent=message;$('.end-screen h1').textContent='暂时无法打开 Codex';},
    waiting(){ $('.end-description').textContent='正在等待 Codex 打开…'; }
  };
  // Deterministic export uses this same customized renderer, without a realtime clock.
  window.startupExport={seek(t){stop();elapsed=t;lastUI=-Infinity;render(t);},settings:()=>savedImages};
  if(native){
    document.body.classList.add('native');
  }
  async function warmPresentation(){
    root.classList.add('warming');
    try{
      // Paint each compositor effect once beneath the dark startup cover.
      // This compiles the actual GPU paths before the visible animation clock starts.
      for(const t of [1700,3000,4500,6000,7500,11180,11560,12000]){
        if(completed||settings.open)return;
        render(t);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }
      render(4179);prepareIdentityTexture();lastTrace=-1;lastUI=-Infinity;revealed=false;render(0);
    }finally{root.classList.remove('warming');}
  }
  async function ready(){
    if(loaded)return;loaded=true;render(0);
    if(window.AEMEATH_RENDER_MODE){await document.fonts.ready;warmIdentityTexture();send('ready');return;}
    if(window.AEMEATH_OPEN_SETTINGS||new URLSearchParams(location.search).has('settings')){send('ready');openSettings();return;}
    if(await window.startupMovie?.play(savedImages))return;
    // The launcher may exit after assets load even if this window is in the background.
    // The visible playback still waits for preparation and its first RAF timestamp.
    send('ready',{preparing:true});
    await document.fonts.ready;warmIdentityTexture();
    if(embedded&&window.AEMEATH_EXTERNAL)await warmPresentation();
    // A fresh Windows host still loads its UI after the page becomes attachable.
    // Keep those startup stalls outside the playback clock.
    if(embedded&&window.AEMEATH_EXTERNAL&&window.parent.performance.now()<8000){
      await new Promise(resolve=>{
        let began=null,last=null,quiet=null;
        function settle(now){
          if(completed||settings.open){resolve();return;}
          if(began===null){began=quiet=now;}
          if(last!==null&&now-last>20)quiet=now;
          last=now;
          if((now-began>=650&&now-quiet>=200)||now-began>=1800){resolve();return;}
          requestAnimationFrame(settle);
        }
        requestAnimationFrame(settle);
      });
    }
    if(completed||settings.open)return;send('ready');play();
  }
  function failed(){stop();$('#asset-error').hidden=false;send('assetError');}
  let savedImages={},pendingImages={},busy=false;
  const settings=$('#settings-dialog'),status=$('#settings-status');
  const textFields=[
    {key:'introTitle',input:'#intro-title',target:'.boot-title',fallback:'欢迎回来',limit:16},
    {key:'introCaption',input:'#intro-caption',target:'.boot-caption',fallback:'',limit:48},
    {key:'artworkSubtitle',input:'#artwork-subtitle',target:'#subtitle',fallback:'哈哈，我们又见面了呢，现在又想干嘛呢？',limit:60}
  ];
  const textValue=(images,field)=>typeof images[field.key]==='string'?images[field.key].slice(0,field.limit):field.fallback;
  function thumbnails(){
    $('#avatar-preview').src=pendingImages.avatar||assets.avatar;
    $('#artwork-preview').src=pendingImages.artwork||assets.artwork;
    $('#wallpaper-strength').value=String(pendingImages.wallpaperStrength??42);
    $('#wallpaper-value').textContent=$('#wallpaper-strength').value+'%';
    for(const field of textFields)$(field.input).value=textValue(pendingImages,field);
    $('#show-text').checked=pendingImages.showText!==false;
  }
  function openSettings(){
    if(mode==='launch'||settings.open)return;
    window.startupMovie?.stop();hiddenPause=false;stop();pendingImages={...savedImages};thumbnails();
    status.textContent='图片与文字保存在本机。修改后点击「保存并预览」；关闭则放弃本次修改。';
    settings.returnValue='';settings.showModal();send('settings-open');
  }
  function setBusy(value){
    busy=value;
    settings.querySelectorAll('input,button').forEach(node=>node.disabled=value);
  }
  async function applyImages(images){
    releaseIdentityTexture();
    lineRenderer?.dispose();lineRenderer=null;
    art.src=images.artwork||assets.artwork;$('.memory-art').src=art.src;$('.finale-art').src=art.src;$('.avatar').src=images.avatar||assets.avatar;
    await Promise.all([art,$('.avatar')].map(img=>img.decode()));
    paths=preparePaths(images.contours||window.CONTOUR_PATHS||[]);fragments=prepareFragments(paths);lastTrace=-1;
    if(!paths.length)throw new Error('图片轮廓数据缺失');
    for(const field of textFields)$(field.target).textContent=textValue(images,field);
    root.dataset.showText=String(images.showText!==false);
    $('.end-description').textContent=textValue(images,textFields[2]);
    $('.boot-title').classList.toggle('long-title',Array.from(textValue(images,textFields[0])).length>6);
    send('background',{image:art.src,strength:images.wallpaperStrength??42});
  }
  for(const field of textFields)$(field.input).addEventListener('input',event=>{
    pendingImages[field.key]=event.target.value.slice(0,field.limit);
  });
  $('#wallpaper-strength').addEventListener('input',event=>{
    // Reserved for future wallpaper integration.
    pendingImages.wallpaperStrength=Number(event.target.value);
    $('#wallpaper-value').textContent=event.target.value+'%';
  });
  $('#image-settings').addEventListener('click',openSettings);
  $('#show-text').addEventListener('change',event=>{pendingImages.showText=event.target.checked;});
  if(window.AEMEATH_EXTERNAL){$('#restore-appearance').hidden=false;$('#restore-appearance').addEventListener('click',()=>send('restore'));}
  settings.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  settings.addEventListener('close',()=>{
    if(!loaded)return;
    if(settings.returnValue==='preview'){send('settings-close');replay();}
    else finish(true);
  });
  for(const kind of ['avatar','artwork'])$('#'+kind+'-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    setBusy(true);status.textContent=kind==='artwork'?'正在为新背景生成线稿…':'正在准备头像…';
    // Let the progress text paint before the one-time contour computation.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    try{
      pendingImages={...pendingImages,...await window.imageSettings.importImage(file,kind)};thumbnails();
      status.textContent='图片已准备好，点击「保存并预览」应用。';
    }catch(error){status.textContent=error.message;}
    finally{setBusy(false);event.target.value='';}
  });
  $('#reset-images').addEventListener('click',()=>{pendingImages={};thumbnails();status.textContent='已选用默认图片、文字和背景显现程度，点击「保存并预览」应用。';});
  $('#preview-images').addEventListener('click',async()=>{
    setBusy(true);status.textContent='正在保存…';
    try{
      await applyImages(pendingImages);await window.imageSettings.save(pendingImages);savedImages={...pendingImages};settings.close('preview');
    }catch(error){await applyImages(savedImages);status.textContent='保存失败，原设置已保留：'+error.message;}
    finally{setBusy(false);}
  });
  window.imageSettings.load().catch(()=>({})).then(async images=>{
    savedImages=images;
    try{await applyImages(images);}catch{savedImages={};await applyImages({});}
    await ready();
  }).catch(failed);
})();
