export function createRecorder({video,stage,overlay,button,download,message}) {
  const output=document.createElement('canvas'), context=output.getContext('2d');
  let recorder=null, captured=null, url=null, failed=false;
  const logo=new Image();logo.src=new URL('./rhode-logo.svg',import.meta.url).href;
  function drawFrame(){
    if(!captured||video.readyState<2)return;
    const w=output.width,h=output.height;
    // Fit the entire camera stage into a portrait card, preserving effect coordinates.
    const frameScale=Math.min((w-96)/stage.clientWidth,(h-480)/stage.clientHeight);
    const frameWidth=stage.clientWidth*frameScale,frameHeight=stage.clientHeight*frameScale;
    const x=(w-frameWidth)/2,y=(h-frameHeight)/2;
    context.fillStyle='#f1f0ec';context.fillRect(0,0,w,h);
    if(logo.complete&&logo.naturalWidth){
      const logoWidth=280,logoHeight=logoWidth*logo.naturalHeight/logo.naturalWidth;
      context.drawImage(logo,(w-logoWidth)/2,(y-logoHeight)/2,logoWidth,logoHeight);
    }
    context.save();
    context.beginPath();context.roundRect(x,y,frameWidth,frameHeight,36);context.clip();
    context.translate(x,y);
    context.fillStyle='#37352e';context.fillRect(0,0,frameWidth,frameHeight);
    const fit=getComputedStyle(video).objectFit==='cover'?Math.max:Math.min;
    const scale=fit(frameWidth/video.videoWidth,frameHeight/video.videoHeight);
    const vw=video.videoWidth*scale,vh=video.videoHeight*scale;
    context.save();context.translate(frameWidth,0);context.scale(-1,1);
    context.drawImage(video,(frameWidth-vw)/2,(frameHeight-vh)/2,vw,vh);context.restore();
    if(overlay.width&&overlay.height)context.drawImage(overlay,0,0,frameWidth,frameHeight);
    context.restore();
  }
  function stop(){
    if(recorder&&recorder.state!=='inactive'){
      button.disabled=true;
      recorder.stop();
    }
  }
  button.addEventListener('click',()=>{
    if(recorder){stop();return;}
    if(!globalThis.MediaRecorder||!output.captureStream){message('이 브라우저는 영상 녹화를 지원하지 않아요. 다른 브라우저에서 시도해주세요.');return;}
    if(video.readyState<2){message('카메라가 준비되면 다시 눌러주세요.');return;}
    try{
      output.width=1080;
      output.height=1920;
      captured=output.captureStream(30);drawFrame();
      const mimeType=['video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const current=new MediaRecorder(captured,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:8_000_000});
      const chunks=[];recorder=current;failed=false;
      current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      current.onerror=()=>{failed=true;message('녹화 중 오류가 발생했어요. 다시 시도해주세요.');stop();};
      current.onstop=()=>{
        captured?.getTracks().forEach(t=>t.stop());captured=null;recorder=null;
        button.disabled=false;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','영상 녹화 시작');
        if(!failed&&chunks.length){
          if(url)URL.revokeObjectURL(url);
          const type=current.mimeType||chunks[0].type||'video/webm';
          url=URL.createObjectURL(new Blob(chunks,{type}));
          download.href=url;download.download=`rhode-story-${Date.now()}.${type.includes('mp4')?'mp4':'webm'}`;
          download.textContent='영상 저장 · 1080 × 1920';download.hidden=false;
          message('녹화가 끝났어요. 아래 영상 저장을 눌러 저장하세요.');
        }else if(!failed)message('저장할 영상이 없어요. 다시 녹화해주세요.');
      };
      current.start(1000);button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','영상 녹화 중지');
      message('녹화 중 · 버튼을 다시 누르면 종료돼요');
    }catch(e){
      captured?.getTracks().forEach(t=>t.stop());captured=null;recorder=null;
      button.disabled=false;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','영상 녹화 시작');
      message('녹화를 시작하지 못했어요. 다른 브라우저에서 시도해주세요.');
    }
  });
  return {draw:drawFrame,stop};
}
