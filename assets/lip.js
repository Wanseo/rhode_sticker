export function createLip({stage,face: getFace,message}){
 const tube=document.querySelector('#lip'),cap=document.querySelector('#lip-cap');
 let opened=false,readyAt=0,held=false,pointer=null,previous=null,rub=0,gloss=false,lastTouch=null,heldPoint=null,extrusion=0,drawTime=0;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function local(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
 function open(){if(opened)return;opened=true;readyAt=performance.now()+850;tube.classList.add('open');tube.setAttribute('aria-expanded','true');tube.setAttribute('aria-label','Pick up the tube and apply to your lips');message('Pick up the open tube, rub its left tip over your lips, then release.');}
 function contains(p){const r=tube.getBoundingClientRect(),s=stage.getBoundingClientRect();return p.x>=r.left-s.left-12&&p.x<=r.right-s.left+12&&p.y>=r.top-s.top-15&&p.y<=r.bottom-s.top+15;}
 function grab(p){if(!opened||performance.now()<readyAt)return false;held=true;previous=null;lastTouch=null;rub=0;tube.classList.add('held');move(p);return true;}
 function move(p){
  heldPoint={...p};
  tube.style.left=p.x+'px';tube.style.top=p.y+'px';
  const f=getFace();if(!f.length){previous=null;lastTouch=null;return;}
  const tip={x:p.x-tube.offsetWidth*.49,y:p.y};
  const width=distance(f[61],f[291]),center={x:(f[13].x+f[14].x)/2,y:(f[13].y+f[14].y)/2};
  const a=Math.atan2(f[291].y-f[61].y,f[291].x-f[61].x),dx=tip.x-center.x,dy=tip.y-center.y;
  const along=dx*Math.cos(a)+dy*Math.sin(a),across=-dx*Math.sin(a)+dy*Math.cos(a);
  if(Math.abs(along)<width*.65&&Math.abs(across)<Math.max(width*.23,8)){
   if(previous)rub+=Math.min(distance(previous,tip),width*.15);
   previous=tip;lastTouch=performance.now();
  }else previous=null;
 }
 function release(cancel=false){
  if(!held)return;const f=getFace(),width=f.length?distance(f[61],f[291]):Infinity;
  if(!cancel&&f.length&&rub>width*.25&&lastTouch!==null&&performance.now()-lastTouch<800){gloss=true;message('Your lips now have a glossy finish.');}
  else if(!cancel)message('Rub the left tip of the tube across your lips, then release.');
  held=false;heldPoint=null;extrusion=0;previous=null;lastTouch=null;tube.classList.remove('held');tube.style.left='';tube.style.top='';
 }
 tube.addEventListener('click',()=>{if(!opened)open();});
 tube.addEventListener('pointerdown',e=>{if(!opened||held)return;if(grab(local(e))){pointer=e.pointerId;tube.setPointerCapture(e.pointerId);e.preventDefault();}});
 tube.addEventListener('pointermove',e=>{if(pointer===e.pointerId&&held)move(local(e));});
 tube.addEventListener('pointerup',e=>{if(pointer===e.pointerId){release();pointer=null;}});
 tube.addEventListener('pointercancel',()=>{release(true);pointer=null;});
 const outer=[61,40,37,0,267,270,291,321,314,17,84,91],inner=[78,81,13,311,308,402,14,178];
 function outline(ctx,f,indices){ctx.moveTo(f[indices[0]].x,f[indices[0]].y);for(const i of indices.slice(1))ctx.lineTo(f[i].x,f[i].y);ctx.closePath();}
 function drawExtrusion(ctx,now,f){
  const dt=drawTime?Math.min(50,Math.max(0,now-drawTime)):16;drawTime=now;
  if(!held||!heldPoint||!f.length){extrusion=0;return;}
  const tip={x:heldPoint.x-tube.offsetWidth*.49,y:heldPoint.y};
  const width=distance(f[61],f[291]);
  let target=null,nearest=Infinity;
  for(let i=0;i<outer.length;i++){
   const a=f[outer[i]],b=f[outer[(i+1)%outer.length]],dx=b.x-a.x,dy=b.y-a.y;
   const t=Math.max(0,Math.min(1,((tip.x-a.x)*dx+(tip.y-a.y)*dy)/(dx*dx+dy*dy||1)));
   const p={x:a.x+t*dx,y:a.y+t*dy},d=distance(tip,p);
   if(d<nearest){target=p;nearest=d;}
  }
  if(nearest>width*.6||!target){extrusion=0;return;}
  extrusion=Math.min(1,extrusion+dt/650);
  const end={x:tip.x+(target.x-tip.x)*extrusion,y:tip.y+(target.y-tip.y)*extrusion};
  const length=distance(tip,end),radius=Math.max(1.2,width*.025)*(1+.1*Math.sin(now*.006));
  // Transparent gel ribbon with a refracted dark edge and a narrow moving reflection.
  const angle=Math.atan2(end.y-tip.y,end.x-tip.x);
  ctx.save();ctx.translate(tip.x,tip.y);ctx.rotate(angle);
  const sag=Math.min(width*.055,length*.15);
  const gel=ctx.createLinearGradient(0,-radius,0,radius+sag);
  gel.addColorStop(0,'rgba(255,255,255,.65)');gel.addColorStop(.2,'rgba(245,252,255,.15)');gel.addColorStop(.48,'rgba(225,241,246,.04)');gel.addColorStop(.78,'rgba(81,101,111,.25)');gel.addColorStop(1,'rgba(255,255,255,.52)');
  ctx.fillStyle=gel;ctx.beginPath();ctx.moveTo(0,-radius*.55);ctx.bezierCurveTo(length*.3,sag-radius,length*.7,sag-radius*.6,length,-radius*.4);ctx.quadraticCurveTo(length+radius,0,length,radius*.4);ctx.bezierCurveTo(length*.7,sag+radius*.6,length*.3,sag+radius,0,radius*.55);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=Math.max(.6,width*.007);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(length*.12,-radius*.45);ctx.quadraticCurveTo(length*.45,sag-radius*.8,length*.8,-radius*.3+sag*.5);ctx.stroke();
  const bead=ctx.createRadialGradient(length-radius*.3,-radius*.4,0,length,0,radius*1.5);
  bead.addColorStop(0,'rgba(255,255,255,.85)');bead.addColorStop(.3,'rgba(237,249,255,.16)');bead.addColorStop(.8,'rgba(100,120,130,.16)');bead.addColorStop(1,'rgba(255,255,255,.35)');
  ctx.fillStyle=bead;ctx.beginPath();ctx.ellipse(length,0,radius*1.1,radius*1.35,0,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 function draw(ctx,now){
  const f=getFace();drawExtrusion(ctx,now,f);if(!gloss||!f.length)return;
  ctx.save();ctx.beginPath();outline(ctx,f,outer);outline(ctx,f,inner);ctx.clip('evenodd');
  const width=distance(f[61],f[291]);
  const angle=Math.atan2(f[291].y-f[61].y,f[291].x-f[61].x);
  // Only small specular reflections: leave the lip color and texture untouched.
  const reflections=[{edge:84,inner:14,t:.38,phase:0},{edge:17,inner:14,t:.48,phase:1.8},{edge:314,inner:14,t:.42,phase:3.4},{edge:37,inner:13,t:.42,phase:4.5}];
  for(const r of reflections){
   const edge=f[r.edge],inside=f[r.inner];
   const x=edge.x*(1-r.t)+inside.x*r.t,y=edge.y*(1-r.t)+inside.y*r.t;
   const pulse=Math.pow((Math.sin(now*.0025+r.phase)+1)/2,4);
   ctx.save();ctx.translate(x,y);ctx.rotate(angle);
   const rx=Math.max(.9,width*(.021+pulse*.014)),ry=Math.max(.5,width*.007);
   const glow=ctx.createRadialGradient(0,0,0,0,0,rx*2.3);
   glow.addColorStop(0,`rgba(255,255,255,${.12+pulse*.18})`);glow.addColorStop(1,'rgba(255,255,255,0)');
   ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(0,0,rx*2.3,ry*3,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=`rgba(255,255,255,${.25+pulse*.58})`;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();
   if(pulse>.8){
    const length=width*.03*(pulse-.8)/.2;
    ctx.strokeStyle=`rgba(255,255,255,${(pulse-.8)*2})`;ctx.lineWidth=Math.max(.45,width*.004);ctx.beginPath();ctx.moveTo(-length,0);ctx.lineTo(length,0);ctx.moveTo(0,-length);ctx.lineTo(0,length);ctx.stroke();
   }
   ctx.restore();
  }
  ctx.restore();
 }
 return{
  gesture(p,pinch,wasPinch,blocked){if(pointer!==null)return true;if(!held&&blocked)return false;if(!held&&pinch&&!wasPinch&&contains(p)){if(!opened)open();else grab(p);return true;}if(held){if(pinch)move(p);else release();return true;}return false;},
  cancel(){release(true);},draw,
  reset(){release(true);gloss=false;},
  close(){release(true);gloss=false;opened=false;pointer=null;tube.classList.remove('open');tube.setAttribute('aria-expanded','false');tube.setAttribute('aria-label','Open the lip treatment cap');}
 };
}
