import {createNeckMask} from './neck-mask.js';
import {traceNeckline,necklineDepth} from './neckline-profile.js';

// The approved complete PNG is the only garment rendered by the web fitting.
export function createRobe(){
 const garment=new Image();garment.decoding='async';
 garment.src=new URL('./robe-full-preview-v1.png',import.meta.url).href;
 const neckMask=createNeckMask();
 const anchors=[[.31,.12],[.69,.12]];
 let fitted=null,lastDraw=0,lastSeen=0;
 function reset(){fitted=null;lastDraw=0;lastSeen=0;neckMask.reset();}
 function draw(ctx,pose,hands,face=[],video,stage){
  const now=performance.now(),dt=lastDraw?Math.min(.1,Math.max(0,(now-lastDraw)/1000)):1/60;lastDraw=now;
  let measurement=null;
  if(pose.length>12&&pose[11].visibility>=.5&&pose[12].visibility>=.5){
   let left=pose[11],right=pose[12];if(left.x>right.x)[left,right]=[right,left];
   const span=Math.hypot(right.x-left.x,right.y-left.y);
   if(span>=25&&[left.x,left.y,right.x,right.y,span].every(Number.isFinite)){
    measurement={x:(left.x+right.x)/2,y:(left.y+right.y)/2,span,angle:Math.atan2(right.y-left.y,right.x-left.x)};
   }
  }
  if(measurement){
   lastSeen=now;
   if(!fitted)fitted=measurement;
   else{
    const weight=1-Math.exp(-dt/.08),difference=Math.atan2(Math.sin(measurement.angle-fitted.angle),Math.cos(measurement.angle-fitted.angle));
    fitted={x:fitted.x+(measurement.x-fitted.x)*weight,y:fitted.y+(measurement.y-fitted.y)*weight,span:Math.exp(Math.log(fitted.span)+Math.log(measurement.span/fitted.span)*weight),angle:fitted.angle+difference*weight};
   }
  }
  const age=now-lastSeen;
  if(!fitted||age>=300){if(fitted)reset();return;}
  if(!garment.complete||!garment.naturalWidth)return;
  const opacity=measurement||age<=150?1:Math.max(0,1-(age-150)/150);
  const center={x:fitted.x,y:fitted.y},span=fitted.span;
  const source=anchors.map(([x,y])=>({x:x*(garment.naturalWidth-1),y:y*(garment.naturalHeight-1)}));
  const sourceSpan=Math.hypot(source[1].x-source[0].x,source[1].y-source[0].y),scale=span/sourceSpan*1.05;
  const sourceAngle=Math.atan2(source[1].y-source[0].y,source[1].x-source[0].x);
  ctx.save();ctx.globalAlpha=opacity;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.translate(center.x,center.y);ctx.rotate(fitted.angle-sourceAngle);ctx.translate(0,-span*.11);ctx.scale(scale,scale);
  ctx.drawImage(garment,-(source[0].x+source[1].x)/2,-(source[0].y+source[1].y)/2);ctx.restore();

  // Preserve existing face/neck and foreground-arm layering on the new PNG.
  if(face.length>454){
   const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.shadowColor='#000';ctx.shadowBlur=1.5;
   const first=face[oval[0]],last=face[oval[oval.length-1]];ctx.beginPath();ctx.moveTo((first.x+last.x)/2,(first.y+last.y)/2);
   oval.forEach((index,i)=>{const p=face[index],next=face[oval[(i+1)%oval.length]];ctx.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);});ctx.closePath();ctx.fill();ctx.stroke();
   if(!neckMask.erase(ctx,video,stage,face,center,span,pose,hands)){
    const chin=face[152],forehead=face[10],left=face[234],right=face[454],width=Math.hypot(right.x-left.x,right.y-left.y)||1,height=Math.hypot(chin.x-forehead.x,chin.y-forehead.y)||1;
    const rx=(right.x-left.x)/width,ry=(right.y-left.y)/width;let dx=-ry,dy=rx;
    if(dx*(center.x-chin.x)+dy*(center.y-chin.y)<0){dx=-dx;dy=-dy;}
    const length=necklineDepth({chin,center,span,width,height,dx,dy});traceNeckline(ctx,{chin,rx,ry,dx,dy,width,height,length});ctx.fill();ctx.stroke();
   }
   ctx.restore();
  }
  if(!neckMask.eraseArms(ctx,pose,hands,center,span))for(const hand of hands){
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.shadowColor='#000';ctx.shadowBlur=.5;ctx.beginPath();
   [0,1,2,5,9,13,17].forEach((i,n)=>{const p=hand[i];n?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();
   const palmSize=Math.hypot(hand[0].x-hand[9].x,hand[0].y-hand[9].y);
   for(const finger of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]])for(let j=0;j<3;j++){
    const a=hand[finger[j]],b=hand[finger[j+1]],r=palmSize*(.085-j*.015),length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length*r,ny=(b.x-a.x)/length*r;
    ctx.moveTo(a.x+nx,a.y+ny);ctx.lineTo(b.x+nx,b.y+ny);ctx.lineTo(b.x-nx,b.y-ny);ctx.lineTo(a.x-nx,a.y-ny);ctx.closePath();ctx.moveTo(b.x+r,b.y);ctx.arc(b.x,b.y,r,0,Math.PI*2);
   }
   ctx.fill();ctx.restore();
  }
 }
 return{draw,reset,captureFrame:neckMask.capture};
}
