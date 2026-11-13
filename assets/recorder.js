export function createRecorder({video,stage,overlay,button,download,message}) {
  const output=document.createElement('canvas'), context=output.getContext('2d');
  let recorder=null, captured=null, url=null, failed=false;
  let products=null,productsBusy=false,lastProducts=0,generation=0,starting=false;
  const imageCache=new Map();
  async function inlineImage(node){
    if(!imageCache.has(node.src))imageCache.set(node.src,(async()=>{
      const image=new Image();image.src=node.src;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth*3;canvas.height=image.naturalHeight*3;
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL();
    })());
    return imageCache.get(node.src);
  }
  const excluded='video,canvas,#cursor';
  const backgroundCache=new Map();
  async function inlineBackground(value){
    const urls=[...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
    for(const [match,url] of urls){
      if(!backgroundCache.has(url))backgroundCache.set(url,(async()=>{
        const response=await fetch(url);
        if(!response.ok)throw new Error('Asset could not be loaded: '+url);
        const blob=await response.blob();
        return new Promise((resolve,reject)=>{
          const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);
        });
      })());
      value=value.replace(match,`url("${await backgroundCache.get(url)}")`);
    }
    return value;
  }
  async function captureProducts(){
    if(productsBusy)return;
    productsBusy=true;
    const current=generation;
    // Embed CSS images as well as <img> assets: SVG foreignObject cannot fetch them.
    const originals=[...stage.querySelectorAll('*')].filter(node=>!node.closest(excluded));
    const poses=originals.map(node=>{
      const style=getComputedStyle(node);
      return {transform:style.transform,opacity:style.opacity,visibility:style.visibility,
        background:style.backgroundImage,before:getComputedStyle(node,'::before').backgroundImage,
        after:getComputedStyle(node,'::after').backgroundImage};
    });
    const lid=stage.querySelector('.lid');
    const lidFacingFront=!lid||new DOMMatrix(getComputedStyle(lid).transform).m22>=0;
    try{
      const images=[...stage.querySelectorAll('img')];
      const sources=await Promise.all(images.map(inlineImage));
      const backgrounds=await Promise.all(poses.map(async pose=>({
        background:await inlineBackground(pose.background),
        before:await inlineBackground(pose.before),after:await inlineBackground(pose.after)
      })));
      const image=await html2canvas(stage,{
        backgroundColor:null,scale:Math.max(1,Math.min(3,1080/stage.clientWidth)),logging:false,foreignObjectRendering:true,
        ignoreElements:node=>node.matches?.(excluded),
        onclone:doc=>{
          const clone=doc.getElementById(stage.id);
          Object.assign(clone.style,{background:'transparent',position:'fixed',left:'0',top:'0',margin:'0',width:stage.clientWidth+'px',height:stage.clientHeight+'px'});
          [...clone.querySelectorAll('img')].forEach(node=>{
            const i=images.findIndex(original=>original.src===node.src);if(i>=0)node.src=sources[i];
          });
          const rules=[];
          [...clone.querySelectorAll('*')].filter(node=>node.tagName!=='HTML2CANVASPSEUDOELEMENT').forEach((node,i)=>{
            const pose=poses[i],background=backgrounds[i];if(!pose)return;
            node.style.animation='none';node.style.transition='none';
            node.style.transform=pose.transform;node.style.opacity=pose.opacity;node.style.visibility=pose.visibility;
            node.style.backgroundImage=background.background;
            node.setAttribute('data-record-node',i);
            for(const pseudo of ['before','after'])if(background[pseudo]!=='none')rules.push(
              `[data-record-node="${i}"]::${pseudo}{background-image:${background[pseudo]} !important}`
            );
          });
          // html2canvas inserts pseudo-element nodes; exclude them from the pose mapping.
          // SVG rasterization flattens 3D layers; explicitly hide the rear lid face.
          const front=clone.querySelector('.lid-front'),back=clone.querySelector('.lid-mirror');
          const hiddenFace=lidFacingFront?back:front;
          if(hiddenFace)for(const node of [hiddenFace,...hiddenFace.querySelectorAll('*')])node.style.visibility='hidden';
          const style=doc.createElement('style');style.textContent=rules.join('\n');clone.append(style);
        }
      });
      if(current===generation)products=image;
    }finally{productsBusy=false;}
  }
  const logo=new Image();logo.src=new URL('./rhode-logo.svg',import.meta.url).href;
  function drawFrame(){
    if(!captured||video.readyState<2)return;
    const w=output.width,h=output.height;
    // Keep the complete live stage inside the cream Instagram Story card.
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
    if(products)context.drawImage(products,0,0,frameWidth,frameHeight);
    if(!productsBusy&&performance.now()-lastProducts>=100){lastProducts=performance.now();captureProducts().catch(()=>{failed=true;message('Could not capture the product effects. Please record again.');stop();});}
    if(overlay.width&&overlay.height)context.drawImage(overlay,0,0,frameWidth,frameHeight);
    context.restore();
  }
  function stop(){
    generation++;starting=false;
    if(recorder&&recorder.state!=='inactive'){
      button.disabled=true;
      recorder.stop();
    }
  }
  button.addEventListener('click',async()=>{
    if(recorder){stop();return;}
    if(starting)return;
    if(!globalThis.MediaRecorder||!output.captureStream){message('Recording is not supported in this browser. Please try another browser.');return;}
    if(video.readyState<2){message('Please wait for the camera, then try again.');return;}
    try{
      starting=true;button.disabled=true;
      const startGeneration=++generation;products=null;
      await captureProducts();
      if(!products&&startGeneration===generation)await captureProducts();
      if(startGeneration!==generation||video.readyState<2){button.disabled=false;return;}
      starting=false;button.disabled=false;
      output.width=1080;
      output.height=1920;
      captured=output.captureStream(30);drawFrame();
      const mimeType=['video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const current=new MediaRecorder(captured,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:8_000_000});
      const chunks=[];recorder=current;failed=false;
      current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      current.onerror=()=>{failed=true;message('Recording failed. Please try again.');stop();};
      current.onstop=()=>{
        captured?.getTracks().forEach(t=>t.stop());captured=null;recorder=null;
        button.disabled=false;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Start recording');
        if(!failed&&chunks.length){
          if(url)URL.revokeObjectURL(url);
          const type=current.mimeType||chunks[0].type||'video/webm';
          url=URL.createObjectURL(new Blob(chunks,{type}));
          download.href=url;download.download=`rhode-story-${Date.now()}.${type.includes('mp4')?'mp4':'webm'}`;
          download.textContent=`Save video · ${output.width} × ${output.height}`;download.hidden=false;
          message('Recording complete. Select Save video below to download.');
        }else if(!failed)message('No video was captured. Please record again.');
      };
      current.start(1000);button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Stop recording');
      message('Recording · Press again to stop');
    }catch(e){
      starting=false;
      captured?.getTracks().forEach(t=>t.stop());captured=null;recorder=null;
      button.disabled=false;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Start recording');
      message('Could not start recording. Please try another browser.');
    }
  });
  return {draw:drawFrame,stop};
}
