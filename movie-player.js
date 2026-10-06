/* Pre-rendered presentation; editing continues to use the original live renderer. */
(function(){
  const movie=window.AEMEATH_MOVIE;
  if(!movie)return;
  const themeKey=images=>JSON.stringify({avatar:images.avatar||null,artwork:images.artwork||null,contours:images.contours||null,introTitle:typeof images.introTitle==='string'?images.introTitle:'欢迎回来',introCaption:typeof images.introCaption==='string'?images.introCaption:'',artworkSubtitle:typeof images.artworkSubtitle==='string'?images.artworkSubtitle:'哈哈，我们又见面了呢，现在又想干嘛呢？',showText:images.showText!==false});
  let video=null,url=null,active=false,failed=false;
  const send=(action,details={})=>window.AEMEATH_SEND?.({type:'aemeath-boot',action,...details});
  function stop(){active=false;video?.pause();video?.remove();video=null;if(url)URL.revokeObjectURL(url);url=null;}
  async function play(images){
    if(failed||themeKey(images)!==movie.themeKey)return false;
    stop();
    try{
      // Small chunks avoid a second full-size temporary binary string.
      const chunks=[];
      for(let at=0;at<movie.data.length;at+=262144){const binary=atob(movie.data.slice(at,at+262144)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);chunks.push(bytes);}
      url=URL.createObjectURL(new Blob(chunks,{type:'video/mp4'}));
      video=document.createElement('video');video.id='startup-movie';video.muted=true;video.playsInline=true;video.preload='auto';video.disablePictureInPicture=true;
      Object.assign(video.style,{position:'absolute',inset:'0',width:'100%',height:'100%',objectFit:'contain',background:'#0c0912',zIndex:'9',pointerEvents:'none'});
      document.querySelector('.window').appendChild(video);video.src=url;active=true;
      video.addEventListener('ended',()=>{if(active)send('complete');},{once:true});
      video.addEventListener('error',()=>{if(active){failed=true;stop();document.querySelector('#replay').click();}},{once:true});
      send('ready',{preparing:true});await video.play();send('playing');return true;
    }catch(error){failed=true;stop();return false;}
  }
  window.startupMovie={play,stop,status(){if(!video)return null;const quality=video.getVideoPlaybackQuality();return {mode:'cached-video',fps:movie.fps,time:video.currentTime,frames:quality.totalVideoFrames,dropped:quality.droppedVideoFrames,paused:video.paused,ended:video.ended,width:video.videoWidth,height:video.videoHeight};}};
})();
