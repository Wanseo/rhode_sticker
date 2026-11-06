export function createRobe(){
 // Deterministic looped-pile texture; generated once, never flickers between frames.
 const tile=document.createElement('canvas');tile.width=tile.height=192;const t=tile.getContext('2d');
 t.fillStyle='#eceef0';t.fillRect(0,0,192,192);
 let seed=7;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<14000;i++){
  const x=random()*192,y=random()*192,r=.45+random()*1.15;
  t.strokeStyle=i%3?'rgba(255,255,255,.65)':'rgba(139,149,163,.23)';t.lineWidth=.45+random()*.45;
  t.beginPath();t.ellipse(x,y,r,r*(1.2+random()),random()*Math.PI,0,Math.PI*1.7);t.stroke();
 }
 let smooth=[];
 function reset(){smooth=[];}
 function draw(ctx,pose,hands,video,stage){
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
  ctx.save();ctx.translate(center.x,center.y);ctx.rotate(angle);ctx.scale(span,span);
  const texture=ctx.createPattern(tile,'repeat');texture.setTransform(new DOMMatrix().scale(.0018));
  function cloth(path,light=false){
   ctx.save();ctx.shadowColor='rgba(66,75,91,.2)';ctx.shadowBlur=3;ctx.shadowOffsetY=1;
   ctx.fillStyle=texture;ctx.fill(path);ctx.shadowColor='transparent';
   ctx.save();ctx.clip(path);
   const g=ctx.createLinearGradient(-.65,-.1,.65,.4);
   g.addColorStop(0,'rgba(112,126,147,.24)');g.addColorStop(.2,'rgba(255,255,255,.25)');
   g.addColorStop(.48,light?'rgba(255,255,255,.38)':'rgba(255,255,255,.08)');
   g.addColorStop(.76,'rgba(124,137,157,.14)');g.addColorStop(1,'rgba(102,115,138,.28)');
   ctx.fillStyle=g;ctx.fillRect(-3,-3,6,6);ctx.restore();
   ctx.strokeStyle='rgba(246,248,250,.75)';ctx.lineWidth=.006;ctx.stroke(path);ctx.restore();
  }
  function piping(path){ctx.save();ctx.strokeStyle='rgba(157,163,189,.83)';ctx.lineWidth=.011;ctx.lineJoin=ctx.lineCap='round';ctx.stroke(path);ctx.restore();}
  // Oversized sleeves follow the shoulder, elbow and wrist, leaving the hand free.
  function sleeve(shoulder,elbow,wrist){
   if(elbow.visibility<.45||wrist.visibility<.45)return;
   const a=point(shoulder),b=point(elbow),c=point(wrist);
   const unit=(p,q)=>{const d=Math.hypot(q.x-p.x,q.y-p.y)||1;return{x:-(q.y-p.y)/d,y:(q.x-p.x)/d};};
   const u=unit(a,b),v=unit(b,c),end={x:c.x+(b.x-c.x)*.13,y:c.y+(b.y-c.y)*.13};
   const path=new Path2D();
   path.moveTo(a.x+u.x*.23,a.y+u.y*.23);
   path.quadraticCurveTo(b.x+u.x*.28,b.y+u.y*.28,end.x+v.x*.19,end.y+v.y*.19);
   path.lineTo(end.x-v.x*.19,end.y-v.y*.19);
   path.quadraticCurveTo(b.x-u.x*.28,b.y-u.y*.28,a.x-u.x*.23,a.y-u.y*.23);path.quadraticCurveTo(a.x,a.y-.13,a.x+u.x*.23,a.y+u.y*.23);path.closePath();cloth(path);
   ctx.strokeStyle='rgba(187,184,173,.35)';ctx.lineWidth=.025;ctx.lineCap='round';
   ctx.beginPath();ctx.moveTo(b.x+v.x*.12,b.y+v.y*.12);ctx.lineTo(end.x+v.x*.12,end.y+v.y*.12);ctx.stroke();
   const cuff=new Path2D();
   cuff.moveTo(end.x+v.x*.2,end.y+v.y*.2);cuff.lineTo(end.x-v.x*.2,end.y-v.y*.2);
   cuff.lineTo(end.x-v.x*.2+(b.x-c.x)*.09,end.y-v.y*.2+(b.y-c.y)*.09);
   cuff.lineTo(end.x+v.x*.2+(b.x-c.x)*.09,end.y+v.y*.2+(b.y-c.y)*.09);cuff.closePath();cloth(cuff,true);piping(cuff);
  }
  sleeve(smooth[11],smooth[13],smooth[15]);sleeve(smooth[12],smooth[14],smooth[16]);
  const body=new Path2D();body.moveTo(-.58,.05);body.quadraticCurveTo(-.52,-.04,-.2,-.08);body.lineTo(0,.43);body.lineTo(.2,-.08);body.quadraticCurveTo(.52,-.04,.58,.05);body.quadraticCurveTo(.54,waist*.7,.47,waist);body.quadraticCurveTo(.58,waist+.35,.68,bottom);body.lineTo(-.68,bottom);body.quadraticCurveTo(-.58,waist+.35,-.47,waist);body.quadraticCurveTo(-.54,waist*.7,-.58,.05);body.closePath();cloth(body);
  for(const side of [-1,1]){const lapel=new Path2D();lapel.moveTo(side*.2,-.09);lapel.quadraticCurveTo(side*.34,-.08,side*.35,.06);lapel.quadraticCurveTo(side*.18,waist*.5,-side*.09,waist+.03);lapel.lineTo(-side*.23,waist-.03);lapel.quadraticCurveTo(side*.08,.42,side*.11,.04);lapel.closePath();cloth(lapel,true);piping(lapel);}
  // Subtle vertical fabric folds and a soft belt.
  ctx.strokeStyle='rgba(119,133,155,.12)';ctx.lineWidth=.026;for(const x of [-.44,-.29,.34,.48]){ctx.beginPath();ctx.moveTo(x,.35);ctx.quadraticCurveTo(x-.07,.8,x+.025,bottom);ctx.stroke();}
  // Patch pockets, a wrapped terry belt, and two hanging belt ends.
  for(const side of [-1,1]){
   const pocket=new Path2D();const x=side<0?-.53:.27,y=waist+.28;
   pocket.moveTo(x,y);pocket.lineTo(x+.24,y);pocket.lineTo(x+.23,y+.28);pocket.quadraticCurveTo(x+.12,y+.32,x+.01,y+.28);pocket.closePath();cloth(pocket);piping(pocket);
  }
  const belt=new Path2D();belt.moveTo(-.49,waist-.055);belt.quadraticCurveTo(0,waist+.025,.49,waist-.055);belt.lineTo(.49,waist+.075);belt.quadraticCurveTo(0,waist+.15,-.49,waist+.075);belt.closePath();cloth(belt,true);
  for(const side of [-1,1]){
   const tail=new Path2D();tail.moveTo(side*.025,waist+.04);tail.bezierCurveTo(side*.16,waist+.2,side*.13,waist+.45,side*.21,waist+.66);tail.lineTo(side*.1,waist+.7);tail.bezierCurveTo(side*.04,waist+.42,side*.03,waist+.23,-side*.05,waist+.08);tail.closePath();cloth(tail,true);piping(tail);
  }
  const knot=new Path2D();knot.ellipse(0,waist+.065,.095,.065,-.25,0,Math.PI*2);cloth(knot,true);
  for(const [shoulder,elbow,wrist] of [[11,13,15],[12,14,16]]){
   const w=point(smooth[wrist]);
   if(w.y>.15&&Math.abs(w.x)<.55)sleeve(smooth[shoulder],smooth[elbow],smooth[wrist]);
  }
  ctx.restore();
  // Restore live hands over the cloth when they pass in front of the chest.
  for(const hand of hands){
   ctx.save();ctx.beginPath();
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
   ctx.clip();
   const w=stage.clientWidth,h=stage.clientHeight,fit=getComputedStyle(video).objectFit==='cover'?Math.max:Math.min,scale=fit(w/video.videoWidth,h/video.videoHeight),vw=video.videoWidth*scale,vh=video.videoHeight*scale;
   ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(video,(w-vw)/2,(h-vh)/2,vw,vh);ctx.restore();
  }
 }
 return{draw,reset};
}
