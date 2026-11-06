export function createLip({stage,face: getFace,message}){
 const tube=document.querySelector('#lip'),cap=document.querySelector('#lip-cap');
 let opened=false,readyAt=0,held=false,pointer=null,previous=null,rub=0,gloss=false,lastTouch=null,heldPoint=null,extrusion=0,drawTime=0;
 const gel=document.createElement('span');gel.className='lip-gel';gel.setAttribute('aria-hidden','true');tube.append(gel);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function local(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
 function open(){if(opened)return;opened=true;readyAt=performance.now()+850;tube.classList.add('open');tube.setAttribute('aria-expanded','true');tube.setAttribute('aria-label','립 튜브 집어 입술에 바르기');message('열린 튜브를 집어 왼쪽 끝으로 입술을 문지른 뒤 놓아주세요');}
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
  if(!cancel&&f.length&&rub>width*.25&&lastTouch!==null&&performance.now()-lastTouch<800){gloss=true;message('입술에 광택이 더해졌어요');}
  else if(!cancel)message('튜브의 왼쪽 끝으로 입술을 좌우로 문지른 뒤 놓아주세요');
  held=false;heldPoint=null;extrusion=0;tube.style.setProperty('--gel-amount','0');previous=null;lastTouch=null;tube.classList.remove('held');tube.style.left='';tube.style.top='';
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
  let touching=false;
  if(held&&heldPoint&&f.length){
   const tip={x:heldPoint.x-tube.offsetWidth*.49,y:heldPoint.y};
   const width=distance(f[61],f[291]);
   let nearest=Infinity;
   for(let i=0;i<outer.length;i++){
    const a=f[outer[i]],b=f[outer[(i+1)%outer.length]],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((tip.x-a.x)*dx+(tip.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    nearest=Math.min(nearest,distance(tip,{x:a.x+t*dx,y:a.y+t*dy}));
   }
   touching=nearest<width*.6;
  }
  // A viscous bead grows directly out of the applicator and settles when lifted.
  const target=touching?1:0;
  extrusion+=(target-extrusion)*(1-Math.exp(-dt/(touching?180:120)));
  if(extrusion<.005)extrusion=0;
  tube.style.setProperty('--gel-amount',extrusion.toFixed(3));
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
  close(){release(true);gloss=false;opened=false;pointer=null;tube.classList.remove('open');tube.setAttribute('aria-expanded','false');tube.setAttribute('aria-label','립 트리트먼트 뚜껑 열기');}
 };
}
