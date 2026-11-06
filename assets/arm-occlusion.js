// Only forearms that overlap the torso can uncover the garment.
export function frontArms(pose,hands,center,span){
 if(pose.length<25)return[];
 let left=pose[11],right=pose[12];if(left.x>right.x)[left,right]=[right,left];
 const angle=Math.atan2(right.y-left.y,right.x-left.x),co=Math.cos(angle),si=Math.sin(angle);
 const inside=p=>{const x=((p.x-center.x)*co+(p.y-center.y)*si)/span,y=(-(p.x-center.x)*si+(p.y-center.y)*co)/span;return Math.abs(x)<.57&&y>-.4&&y<2.2;};
 const result=[];
 for(const [id,e,w,indices] of [[11,13,15,[17,19,21]],[12,14,16,[18,20,22]]]){
  const elbow=pose[e];let wrist=pose[w];if(!elbow||elbow.visibility<.4||!wrist)continue;
  const hand=hands?.filter(h=>Math.hypot(h[0].x-wrist.x,h[0].y-wrist.y)<span*.32).sort((a,b)=>Math.hypot(a[0].x-wrist.x,a[0].y-wrist.y)-Math.hypot(b[0].x-wrist.x,b[0].y-wrist.y))[0];
  if(hand)wrist={...wrist,x:hand[0].x,y:hand[0].y,visibility:1};
  if(wrist.visibility<.4||Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y)<span*.06)continue;
  const shoulderDepth=((left.z??0)+(right.z??0))/2;
  if((elbow.z??0)>shoulderDepth+.18&&(wrist.z??0)>shoulderDepth+.18)continue;
  let crossing=false;
  for(let t=0;t<=1;t+=.1)if(inside({x:elbow.x+(wrist.x-elbow.x)*t,y:elbow.y+(wrist.y-elbow.y)*t})){crossing=true;break;}
  if(!crossing)continue;
  const fingers=hand?hand:indices.map(i=>pose[i]).filter(p=>p&&p.visibility>.4);
  result.push({id,elbow:{x:elbow.x,y:elbow.y},wrist:{x:wrist.x,y:wrist.y},fingers:fingers.map(p=>({x:p.x,y:p.y})),span});
 }
 return result;
}

export function createArmProcessor(){
 const sample=new OffscreenCanvas(1,1),read=sample.getContext('2d',{willReadFrequently:true});
 const output=new OffscreenCanvas(1,1),paint=output.getContext('2d');
 const chroma=(r,g,b)=>({y:.299*r+.587*g+.114*b,cb:128-.168736*r-.331264*g+.5*b,cr:128+.5*r-.418688*g-.081312*b});
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 return{process(video,stage,face,arms){
  if(!arms?.length)return[];
  const vw=video.width,vh=video.height,w=240,h=Math.max(1,Math.round(vh*w/vw));
  if(sample.width!==w||sample.height!==h){sample.width=w;sample.height=h;}
  read.drawImage(video,0,0,w,h);const pixels=read.getImageData(0,0,w,h).data;
  const fit=stage.fit==='cover'?Math.max:Math.min,scale=fit(stage.width/vw,stage.height/vh),ox=(stage.width-vw*scale)/2,oy=(stage.height-vh*scale)/2;
  const color=(x,y)=>{
   const sx=Math.round((vw-(x-ox)/scale)*w/vw),sy=Math.round((y-oy)/scale*h/vh);
   if(sx<0||sx>=w||sy<0||sy>=h)return null;
   const i=(sy*w+sx)*4;return chroma(pixels[i],pixels[i+1],pixels[i+2]);
  };
  const colors=[];
  for(const index of [50,101,205,280,330,425,1,4]){
   const p=face[index];if(!p)continue;
   for(const [a,b] of [[0,0],[-2,0],[2,0],[0,-2],[0,2]]){const c=color(p.x+a,p.y+b);if(c&&c.y>24&&c.cr>126&&c.cb<139&&c.cr-c.cb>6)colors.push(c);}
  }
  if(colors.length<5)return[];
  const skin={cb:median(colors.map(c=>c.cb)),cr:median(colors.map(c=>c.cr)),y:median(colors.map(c=>c.y))},masks=[];
  for(const arm of arms){
   const {elbow,wrist,span}=arm,length=Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y),dx=(wrist.x-elbow.x)/length,dy=(wrist.y-elbow.y)/length,nx=dy,ny=-dx;
   const radius=span*.16,start=-span*.08;
   let end=length+span*.18;
   for(const p of arm.fingers)end=Math.max(end,(p.x-elbow.x)*dx+(p.y-elbow.y)*dy+span*.035);
   end=Math.min(length+span*.4,end);
   const width=radius*2,height=end-start,mw=72,mh=Math.max(40,Math.min(220,Math.round(height/width*mw))),size=mw*mh;
   const candidate=new Uint8Array(size);
   for(let j=0;j<mh;j++)for(let i=0;i<mw;i++){
    const across=(i+.5)/mw*width-radius,along=start+(j+.5)/mh*height;
    if(along<length&&Math.abs(across)>span*(.12-.025*Math.max(0,along/length)))continue;
    const x=elbow.x+dx*along+nx*across,y=elbow.y+dy*along+ny*across,c=color(x,y);if(!c)continue;
    const distance=((c.cb-skin.cb)/19)**2+((c.cr-skin.cr)/22)**2;
    if(distance<1&&c.y>Math.max(15,skin.y*.2))candidate[j*mw+i]=1;
   }
   const expanded=new Uint8Array(size),closed=new Uint8Array(size);
   for(let j=1;j<mh-1;j++)for(let i=1;i<mw-1;i++){const p=j*mw+i;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)expanded[p]|=candidate[p+b*mw+a];}
   for(let j=1;j<mh-1;j++)for(let i=1;i<mw-1;i++){const p=j*mw+i;let value=1;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)value&=expanded[p+b*mw+a];closed[p]=value;}
   // Keep skin attached to the forearm/hand, never matching islands of background.
   let seed=-1,distance=Infinity;const targetRow=(length*.6-start)/height*mh;
   for(let j=0;j<mh;j++)for(let i=0;i<mw;i++)if(closed[j*mw+i]){const d=(i-mw/2)**2+(j-targetRow)**2;if(d<distance){distance=d;seed=j*mw+i;}}
   if(seed<0||distance>(mw*.45)**2)continue;
   const connected=new Uint8Array(size),queue=new Int32Array(size);let head=0,tail=0;connected[seed]=1;queue[tail++]=seed;
   while(head<tail){const p=queue[head++],i=p%mw,j=Math.floor(p/mw);for(const q of [i?p-1:-1,i<mw-1?p+1:-1,j?p-mw:-1,j<mh-1?p+mw:-1])if(q>=0&&closed[q]&&!connected[q]){connected[q]=1;queue[tail++]=q;}}
   if(tail<8)continue;
   output.width=mw;output.height=mh;const image=paint.createImageData(mw,mh);
   for(let i=0;i<size;i++)image.data[i*4+3]=connected[i]*255;
   paint.putImageData(image,0,0);
   masks.push({image:output.transferToImageBitmap(),id:arm.id,elbow,wrist,span,radius,start,width,height});
  }
  return masks;
 }};
}
