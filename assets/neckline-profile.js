// A softly bowed opening with a slightly offset wrap point, shared by both masks.
export function necklineBounds(t,direction=1){
 const a=Math.max(0,(t-.14)/.86),b=Math.max(0,(t-.10)/.90);
 const left=-.33-.07*Math.sin(Math.PI*a**1.05)+.405*a**3.8;
 const right=.27+.16*Math.sin(Math.PI*b**1.10)-.195*b**2.4;
 return direction<0?{left:-right,right:-left}:{left,right};
}
export function traceNeckline(ctx,{chin,rx,ry,dx,dy,width,height,length}){
 const points=[],top={x:chin.x-dx*height*.1,y:chin.y-dy*height*.1},depth=length+height*.1;
 const world=(t,x)=>({x:top.x+dx*depth*t+rx*width*x,y:top.y+dy*depth*t+ry*width*x});
 const direction=rx<0?-1:1;
 for(let i=0;i<=48;i++){const t=i/48;points.push(world(t,necklineBounds(t,direction).left));}
 for(let i=48;i>=0;i--){const t=i/48;points.push(world(t,necklineBounds(t,direction).right));}
 const first=points[0],last=points[points.length-1];ctx.beginPath();ctx.moveTo((first.x+last.x)/2,(first.y+last.y)/2);
 points.forEach((p,i)=>{const next=points[(i+1)%points.length];ctx.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);});ctx.closePath();
}

export function necklineDepth({chin,center,span,width,height,dx,dy}){
 const base=(center.x-chin.x)*dx+(center.y-chin.y)*dy+span*.05;
 return Math.max(width*.50,Math.min(height*.65,base));
}
