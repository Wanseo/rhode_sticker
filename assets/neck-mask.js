import {frontArms} from './arm-occlusion.js';
// Camera pixels are sampled asynchronously; only the finished mask is drawn here.
export function createNeckMask(){
 let worker=null,busy=false,disabled=false,lastTime=-Infinity,lastFrame=-1,mask=null,arms=[],lastReply=-Infinity,preparedFrame=null,frameSync=false;
 function clear(){mask?.image.close();mask=null;arms.forEach(p=>p.image.close());arms=[];}
 function reset(){worker?.terminate();worker=null;busy=false;disabled=false;lastTime=-Infinity;lastFrame=-1;preparedFrame?.then(image=>image.close()).catch(()=>{});preparedFrame=null;frameSync=false;clear();}
 function capture(video){
  frameSync=true;
  if(!worker||busy||preparedFrame||performance.now()-lastTime<40||video.readyState<2)return;
  const w=Math.min(960,video.videoWidth);
  try{preparedFrame=createImageBitmap(video,{resizeWidth:w,resizeHeight:Math.max(1,Math.round(video.videoHeight*w/video.videoWidth))});preparedFrame.catch(()=>{});}
  catch(e){preparedFrame=null;frameSync=false;}
 }
 function erase(ctx,video,stage,face,center,span,pose=[],hands=[]){
  const vw=video?.videoWidth||video?.width,vh=video?.videoHeight||video?.height;
  const sw=stage?.clientWidth||stage?.width,sh=stage?.clientHeight||stage?.height;
  if(!vw||!vh||!sw||!sh||(video.readyState??4)<2||disabled||!globalThis.Worker||!globalThis.OffscreenCanvas||!globalThis.createImageBitmap)return false;
  if(!worker){
   const current=new Worker(new URL('./neck-mask-worker.js',import.meta.url),{type:'module'});worker=current;
   current.onmessage=({data})=>{if(worker!==current){data.mask?.image.close();data.arms?.forEach(p=>p.image.close());return;}busy=false;clear();mask=data.mask;arms=data.arms||[];lastReply=performance.now();};
   current.onerror=()=>{if(worker!==current)return;current.terminate();worker=null;busy=false;disabled=true;clear();};
  }
  const now=performance.now(),frame=video.currentTime??now;
  if(!busy&&now-lastTime>=65&&frame!==lastFrame&&(!frameSync||preparedFrame)){
   busy=true;lastTime=now;lastFrame=frame;
   const current=worker,points=face.map(p=>({x:p.x,y:p.y})),anchor={x:face[152].x,y:face[152].y,width:Math.hypot(face[454].x-face[234].x,face[454].y-face[234].y),angle:Math.atan2(face[454].y-face[234].y,face[454].x-face[234].x)};
   const dimensions={width:sw,height:sh,fit:getComputedStyle(video).objectFit},foregroundArms=frontArms(pose,hands,center,span);
   const captured=preparedFrame||createImageBitmap(video,{resizeWidth:Math.min(960,vw),resizeHeight:Math.max(1,Math.round(vh*Math.min(960,vw)/vw))});preparedFrame=null;
   captured.then(image=>{
    if(worker!==current){image.close();return;}
    current.postMessage({image,stage:dimensions,face:points,center:{...center},span,anchor,arms:foregroundArms},[image]);
   }).catch(()=>{if(worker===current)busy=false;});
  }
  if(mask){
   const chin=face[152],width=Math.hypot(face[454].x-face[234].x,face[454].y-face[234].y),scale=width/Math.max(1,mask.anchor.width);
   const angle=Math.atan2(face[454].y-face[234].y,face[454].x-face[234].x);
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.shadowColor='transparent';ctx.filter='blur(1px)';
   ctx.translate(chin.x,chin.y);ctx.rotate(angle-mask.anchor.angle);ctx.scale(scale,scale);
   ctx.drawImage(mask.image,mask.x-mask.anchor.x,mask.y-mask.anchor.y,mask.width,mask.height);ctx.restore();
  }
  return true;
 }
 function eraseArms(ctx,pose,hands,center,span){
  if(performance.now()-lastReply>180)return !!worker;
  const current=frontArms(pose,hands,center,span);
  for(const mask of arms){
   const arm=current.find(p=>p.id===mask.id);if(!arm)continue;
   const length=Math.hypot(arm.wrist.x-arm.elbow.x,arm.wrist.y-arm.elbow.y),oldLength=Math.hypot(mask.wrist.x-mask.elbow.x,mask.wrist.y-mask.elbow.y);
   if(length<1||oldLength<1)continue;
   const dx=(arm.wrist.x-arm.elbow.x)/length,dy=(arm.wrist.y-arm.elbow.y)/length,across=arm.handOnly?length/oldLength:span/mask.span,along=length/oldLength;
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.shadowColor='transparent';ctx.filter='blur(.55px)';
   ctx.transform(dy*across,-dx*across,dx*along,dy*along,arm.elbow.x,arm.elbow.y);
   ctx.drawImage(mask.image,-mask.radius,mask.start,mask.width,mask.height);ctx.restore();
  }
  return !!worker;
 }
 return{erase,eraseArms,capture,reset};
}
