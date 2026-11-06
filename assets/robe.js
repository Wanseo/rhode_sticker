export function createRobe(){
 // A photographed looped-pile material is loaded once and reused in every frame.
 const tile=document.createElement('canvas');tile.width=tile.height=512;const t=tile.getContext('2d');
 t.fillStyle='#efefeb';t.fillRect(0,0,512,512);
 const fabric=new Image();fabric.decoding='async';
 fabric.onload=()=>{t.drawImage(fabric,0,0,512,512);};
 fabric.src=new URL('./robe-terry-v1.png',import.meta.url).href;
 const torso=new Image();torso.decoding='async';torso.src=new URL('./robe-body-v1.png',import.meta.url).href;
 let smooth=[];
 function reset(){smooth=[];}
 function draw(ctx,pose,hands){
  if(!pose.length||pose[11].visibility<.5||pose[12].visibility<.5){reset();return;}
  smooth=pose.map((p,i)=>smooth[i]?{...p,x:smooth[i].x*.35+p.x*.65,y:smooth[i].y*.35+p.y*.65}:p);
  let l=smooth[11],r=smooth[12];if(l.x>r.x)[l,r]=[r,l];
  const span=Math.hypot(r.x-l.x,r.y-l.y);if(span<25)return;
  const center={x:(l.x+r.x)/2,y:(l.y+r.y)/2},angle=Math.atan2(r.y-l.y,r.x-l.x);
  const co=Math.cos(angle),si=Math.sin(angle);
  const point=p=>({x:((p.x-center.x)*co+(p.y-center.y)*si)/span,y:(-(p.x-center.x)*si+(p.y-center.y)*co)/span});
  const hips=[smooth[23],smooth[24]].filter(p=>p.visibility>.45).map(point);
  const waist=hips.length?Math.max(.65,Math.min(1.65,hips.reduce((sum,p)=>sum+p.y,0)/hips.length*.77)):1.05;
  const bottom=Math.max(1.65,...hips.map(p=>p.y+.75));
  ctx.save();ctx.translate(center.x,center.y);ctx.rotate(angle);ctx.scale(span,span);ctx.translate(0,-.19);
  const texture=ctx.createPattern(tile,'repeat');texture.setTransform(new DOMMatrix().scale(.0011));
  function cloth(path,light=false){
   ctx.save();ctx.shadowColor='rgba(59,56,45,.25)';ctx.shadowBlur=4;ctx.shadowOffsetY=2;
   ctx.fillStyle=texture;ctx.fill(path);ctx.shadowColor='transparent';
   ctx.save();ctx.clip(path);
   const g=ctx.createLinearGradient(-.65,-.1,.65,.4);
   g.addColorStop(0,'rgba(118,115,98,.22)');g.addColorStop(.2,'rgba(255,255,249,.15)');
   g.addColorStop(.48,light?'rgba(255,255,249,.18)':'rgba(255,255,250,.02)');
   g.addColorStop(.76,'rgba(126,122,106,.16)');g.addColorStop(1,'rgba(92,89,76,.30)');
   ctx.fillStyle=g;ctx.fillRect(-3,-3,6,6);ctx.restore();
   ctx.strokeStyle='rgba(255,255,246,.3)';ctx.lineWidth=.003;ctx.stroke(path);ctx.restore();
  }
  function piping(path){ctx.save();ctx.strokeStyle='rgba(168,165,149,.24)';ctx.lineWidth=.004;ctx.lineJoin=ctx.lineCap='round';ctx.stroke(path);ctx.restore();}
  // Tapered folds use broad shaded surfaces rather than drawn contour lines.
  function drape(path,folds){
   ctx.save();ctx.clip(path);
   for(const [x1,y1,x2,y2,width,strength=.24] of folds){
    const length=Math.hypot(x2-x1,y2-y1);
    ctx.save();ctx.translate(x1,y1);ctx.rotate(Math.atan2(y2-y1,x2-x1)-Math.PI/2);
    const shade=ctx.createLinearGradient(-width,0,width,0);
    shade.addColorStop(0,'rgba(82,77,59,0)');shade.addColorStop(.37,`rgba(82,77,59,${strength})`);
    shade.addColorStop(.53,'rgba(154,149,131,.04)');shade.addColorStop(.72,'rgba(255,255,247,.27)');shade.addColorStop(1,'rgba(255,255,247,0)');
    ctx.fillStyle=shade;ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(-width,length*.2,-width*.7,length*.7,-width*.1,length);
    ctx.bezierCurveTo(width*.8,length*.7,width,length*.3,0,0);ctx.fill();ctx.restore();
   }
   ctx.restore();
  }
  // Oversized sleeves follow the shoulder, elbow and wrist, leaving the hand free.
  function sleeve(shoulder,elbow,wrist){
   if(elbow.visibility<.45||wrist.visibility<.45)return;
   const a=point(shoulder),b=point(elbow),c=point(wrist);a.y+=.1;
   const unit=(p,q)=>{const d=Math.hypot(q.x-p.x,q.y-p.y)||1;return{x:-(q.y-p.y)/d,y:(q.x-p.x)/d};};
   const u=unit(a,b),v=unit(b,c),end={x:c.x+(b.x-c.x)*.13,y:c.y+(b.y-c.y)*.13};
   const path=new Path2D();
   path.moveTo(a.x+u.x*.16,a.y+u.y*.16);
   path.quadraticCurveTo(b.x+u.x*.20,b.y+u.y*.20,end.x+v.x*.15,end.y+v.y*.15);
   path.lineTo(end.x-v.x*.15,end.y-v.y*.15);
   path.quadraticCurveTo(b.x-u.x*.20,b.y-u.y*.20,a.x-u.x*.16,a.y-u.y*.16);
   const armLength=Math.hypot(b.x-a.x,b.y-a.y)||1,dx=(b.x-a.x)/armLength,dy=(b.y-a.y)/armLength;
   path.bezierCurveTo(a.x-u.x*.16-dx*.18,a.y-u.y*.16-dy*.18,a.x+u.x*.16-dx*.18,a.y+u.y*.16-dy*.18,a.x+u.x*.16,a.y+u.y*.16);path.closePath();cloth(path);
   drape(path,[[a.x,a.y,b.x,b.y,.10,.22],[b.x,b.y,end.x,end.y,.07,.27]]);
   ctx.strokeStyle='rgba(156,151,132,.15)';ctx.lineWidth=.012;ctx.lineCap='round';
   ctx.beginPath();ctx.moveTo(b.x+v.x*.12,b.y+v.y*.12);ctx.lineTo(end.x+v.x*.12,end.y+v.y*.12);ctx.stroke();
   const cuff=new Path2D();
   cuff.moveTo(end.x+v.x*.16,end.y+v.y*.2);cuff.lineTo(end.x-v.x*.16,end.y-v.y*.2);
   cuff.lineTo(end.x-v.x*.16+(b.x-c.x)*.09,end.y-v.y*.16+(b.y-c.y)*.09);
   cuff.lineTo(end.x+v.x*.16+(b.x-c.x)*.09,end.y+v.y*.16+(b.y-c.y)*.09);cuff.closePath();cloth(cuff,true);piping(cuff);drape(cuff,[[end.x+v.x*.16,end.y+v.y*.16,end.x-v.x*.16,end.y-v.y*.16,.035,.22]]);
  }
  sleeve(smooth[11],smooth[13],smooth[15]);sleeve(smooth[12],smooth[14],smooth[16]);
  if(torso.complete&&torso.naturalWidth){
   // Split at the tied waist so the photographic folds stay fitted to the body.
   const cropX=torso.naturalWidth*.125,cropWidth=torso.naturalWidth*.75;
   const tieY=torso.naturalHeight*(700/1536),top=-.14;
   ctx.drawImage(torso,cropX,0,cropWidth,tieY,-.64,top,1.28,waist-top);
   ctx.drawImage(torso,cropX,tieY,cropWidth,torso.naturalHeight-tieY,-.64,waist,1.28,bottom-waist);
  }else{
  const body=new Path2D();body.moveTo(-.58,.05);body.quadraticCurveTo(-.52,-.04,-.2,-.08);body.lineTo(0,.43);body.lineTo(.2,-.08);body.quadraticCurveTo(.52,-.04,.58,.05);body.quadraticCurveTo(.54,waist*.7,.47,waist);body.quadraticCurveTo(.58,waist+.35,.68,bottom);body.lineTo(-.68,bottom);body.quadraticCurveTo(-.58,waist+.35,-.47,waist);body.quadraticCurveTo(-.54,waist*.7,-.58,.05);body.closePath();cloth(body);
  drape(body,[[-.48,.1,-.3,waist,.105,.28],[-.27,.12,-.14,waist,.075,.19],[.47,.06,.27,waist,.12,.27],[.27,.14,.16,waist,.075,.18],[-.3,waist+.07,-.48,bottom,.095,.26],[-.1,waist+.06,-.04,bottom,.08,.2],[.25,waist+.1,.46,bottom,.11,.29],[.08,waist+.08,.16,bottom,.075,.18]]);
  for(const side of [-1,1]){const lapel=new Path2D();lapel.moveTo(side*.2,-.09);lapel.quadraticCurveTo(side*.4,-.09,side*.36,.09);lapel.quadraticCurveTo(side*.18,waist*.5,-side*.09,waist+.03);lapel.lineTo(-side*.23,waist-.03);lapel.quadraticCurveTo(side*.08,.42,side*.11,.04);lapel.closePath();cloth(lapel,true);drape(lapel,[[side*.27,.02,-side*.13,waist,.055,.29]]);piping(lapel);}
  // Patch pockets, a wrapped terry belt, and two hanging belt ends.
  for(const side of [-1,1]){
   const pocket=new Path2D();const x=side<0?-.53:.27,y=waist+.28;
   pocket.moveTo(x,y);pocket.quadraticCurveTo(x+.12,y+.035,x+.24,y);pocket.lineTo(x+.23,y+.25);pocket.quadraticCurveTo(x+.12,y+.32,x+.01,y+.25);pocket.closePath();cloth(pocket);drape(pocket,[[x+.03,y,x+.035,y+.24,.025,.21]]);piping(pocket);
  }
  const belt=new Path2D();belt.moveTo(-.49,waist-.055);belt.quadraticCurveTo(0,waist+.025,.49,waist-.055);belt.lineTo(.49,waist+.075);belt.quadraticCurveTo(0,waist+.15,-.49,waist+.075);belt.closePath();cloth(belt,true);drape(belt,[[-.46,waist+.02,.46,waist+.02,.025,.28]]);
  for(const side of [-1,1]){
   const tail=new Path2D();tail.moveTo(side*.025,waist+.04);tail.bezierCurveTo(side*.16,waist+.2,side*.13,waist+.45,side*.21,waist+.66);tail.lineTo(side*.1,waist+.7);tail.bezierCurveTo(side*.04,waist+.42,side*.03,waist+.23,-side*.05,waist+.08);tail.closePath();cloth(tail,true);drape(tail,[[side*.03,waist+.1,side*.15,waist+.66,.035,.24]]);piping(tail);
  }
  for(const side of [-1,1]){
   const loop=new Path2D();loop.moveTo(0,waist+.05);loop.bezierCurveTo(side*.24,waist-.11,side*.24,waist+.2,side*.04,waist+.1);loop.quadraticCurveTo(side*.18,waist+.1,side*.12,waist+.04);loop.closePath();cloth(loop,true);
  }
  const knot=new Path2D();knot.ellipse(0,waist+.065,.095,.065,-.25,0,Math.PI*2);cloth(knot,true);
  }
  for(const [shoulder,elbow,wrist] of [[11,13,15],[12,14,16]]){
   const w=point(smooth[wrist]);
   if(w.y>.15&&Math.abs(w.x)<.55)sleeve(smooth[shoulder],smooth[elbow],smooth[wrist]);
  }
  ctx.restore();
  // Cut the garment away from hands so the live video remains untouched.
  for(const hand of hands){
   ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.shadowColor='#000';ctx.shadowBlur=2;ctx.beginPath();
   const palm=[0,1,2,5,9,13,17];
   palm.forEach((i,n)=>{const p=hand[i];n?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();
   const palmSize=Math.hypot(hand[0].x-hand[9].x,hand[0].y-hand[9].y);
   for(const finger of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]){
    for(let j=0;j<3;j++){
     const a=hand[finger[j]],b=hand[finger[j+1]],r=palmSize*(.085-j*.015);
     const length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length*r,ny=(b.x-a.x)/length*r;
     ctx.moveTo(a.x+nx,a.y+ny);ctx.lineTo(b.x+nx,b.y+ny);ctx.lineTo(b.x-nx,b.y-ny);ctx.lineTo(a.x-nx,a.y-ny);ctx.closePath();
     ctx.moveTo(b.x+r,b.y);ctx.arc(b.x,b.y,r,0,Math.PI*2);
    }
   }
   ctx.fill();ctx.restore();
  }
 }
 return{draw,reset};
}
