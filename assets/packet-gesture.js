// Accept a hand held near the seal, or a pinch-and-pull that starts outside it.
export function createPacketGesture(){
 let contactSince=null,start=null;
 function reset(){contactSince=null;start=null;}
 function update({hand,pinch,now,bounds,blocked=false}){
  if(blocked||!hand?.length){reset();return false;}
  const middle={x:(hand[4].x+hand[8].x)/2,y:(hand[4].y+hand[8].y)/2};
  const padding=Math.max(24,Math.min(48,bounds.width*.3));
  const near=[hand[4],hand[8],hand[9],middle].some(p=>
   p.x>=bounds.left-padding&&p.x<=bounds.right+padding&&
   p.y>=bounds.top-padding&&p.y<=bounds.top+bounds.height*.4+padding
  );
  if(near){
   if(contactSince===null)contactSince=now;
   if(pinch&&!start)start={...middle};
   if(now-contactSince>=300){reset();return true;}
  }else contactSince=null;
  if(pinch&&start&&Math.hypot(middle.x-start.x,middle.y-start.y)>=Math.max(12,bounds.width*.08)){
   reset();return true;
  }
  if(!pinch)start=null;
  return false;
 }
 return{update,reset};
}
