// Camera pixels are sampled asynchronously; only the finished mask is drawn here.
export function createNeckMask(){
 let worker=null,busy=false,disabled=false,lastTime=-Infinity,lastFrame=-1,mask=null;
 function clear(){mask?.image.close();mask=null;}
 function reset(){worker?.terminate();worker=null;busy=false;disabled=false;lastTime=-Infinity;lastFrame=-1;clear();}
 function erase(ctx,video,stage,face,center,span){
  const vw=video?.videoWidth||video?.width,vh=video?.videoHeight||video?.height;
  const sw=stage?.clientWidth||stage?.width,sh=stage?.clientHeight||stage?.height;
  if(!vw||!vh||!sw||!sh||(video.readyState??4)<2||disabled||!globalThis.Worker||!globalThis.OffscreenCanvas||!globalThis.createImageBitmap)return false;
  if(!worker){
   const current=new Worker(new URL('./neck-mask-worker.js',import.meta.url),{type:'module'});worker=current;
   current.onmessage=({data})=>{if(worker!==current){data.mask?.image.close();return;}busy=false;clear();mask=data.mask;};
   current.onerror=()=>{if(worker!==current)return;current.terminate();worker=null;busy=false;disabled=true;clear();};
  }
  const now=performance.now(),frame=video.currentTime??now;
  if(!busy&&now-lastTime>=125&&frame!==lastFrame){
   busy=true;lastTime=now;lastFrame=frame;
   const current=worker,points=face.map(p=>({x:p.x,y:p.y})),anchor={x:face[152].x,y:face[152].y,width:Math.hypot(face[454].x-face[234].x,face[454].y-face[234].y),angle:Math.atan2(face[454].y-face[234].y,face[454].x-face[234].x)};
   const dimensions={width:sw,height:sh,fit:getComputedStyle(video).objectFit};
   createImageBitmap(video,{resizeWidth:240,resizeHeight:Math.max(1,Math.round(vh*240/vw))}).then(image=>{
    if(worker!==current){image.close();return;}
    current.postMessage({image,stage:dimensions,face:points,center:{...center},span,anchor},[image]);
   }).catch(()=>{if(worker===current)busy=false;});
  }
  if(mask){
   const chin=face[152],width=Math.hypot(face[454].x-face[234].x,face[454].y-face[234].y),scale=width/Math.max(1,mask.anchor.width);
   const angle=Math.atan2(face[454].y-face[234].y,face[454].x-face[234].x);
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.shadowColor='transparent';ctx.filter='blur(1.8px)';
   ctx.translate(chin.x,chin.y);ctx.rotate(angle-mask.anchor.angle);ctx.scale(scale,scale);
   ctx.drawImage(mask.image,mask.x-mask.anchor.x,mask.y-mask.anchor.y,mask.width,mask.height);ctx.restore();
  }
  return true;
 }
 return{erase,reset};
}
