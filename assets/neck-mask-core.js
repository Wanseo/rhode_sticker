// Pixel processing is isolated from the camera and gesture UI thread.
export function createNeckProcessor(){
 const sample=new OffscreenCanvas(1,1),read=sample.getContext('2d',{willReadFrequently:true});
 const mask=new OffscreenCanvas(1,1),paint=mask.getContext('2d');
 let hasMask=false,skin=null;
 const chroma=(r,g,b)=>({y:.299*r+.587*g+.114*b,cb:128-.168736*r-.331264*g+.5*b,cr:128+.5*r-.418688*g-.081312*b});
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 function reset(){hasMask=false;skin=null;}
 function process(video,stage,face,center,span){
  const vw=video?.videoWidth||video?.width,vh=video?.videoHeight||video?.height;
  const sw=stage?.clientWidth||stage?.width,sh=stage?.clientHeight||stage?.height;
  if(!vw||!vh||!sw||!sh||(video.readyState??4)<2)return null;
  const chin=face[152],forehead=face[10],left=face[234],right=face[454];
  const fw=Math.max(1,Math.hypot(right.x-left.x,right.y-left.y)),fh=Math.max(1,Math.hypot(chin.x-forehead.x,chin.y-forehead.y));
  const rx=(right.x-left.x)/fw,ry=(right.y-left.y)/fw;
  let dx=-ry,dy=rx;if(dx*(center.x-chin.x)+dy*(center.y-chin.y)<0){dx=-dx;dy=-dy;}
  const length=Math.max(fh*.12,Math.min(fh*.45,(center.x-chin.x)*dx+(center.y-chin.y)*dy-span*.06));
  const corners=[[-.12,-.45],[-.12,.45],[length/fh+.24,-.5],[length/fh+.24,.5]].map(([t,w])=>({x:chin.x+dx*fh*t+rx*fw*w,y:chin.y+dy*fh*t+ry*fw*w}));
  const x=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x)))),y=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))));
  const width=Math.min(sw,Math.ceil(Math.max(...corners.map(p=>p.x))))-x,height=Math.min(sh,Math.ceil(Math.max(...corners.map(p=>p.y))))-y;
  if(width<2||height<2)return null;
  {
   try{
    const w=240,h=Math.max(1,Math.round(vh*w/vw));
    if(sample.width!==w||sample.height!==h){sample.width=w;sample.height=h;}
    read.drawImage(video,0,0,w,h);const pixels=read.getImageData(0,0,w,h).data;
    const fit=stage.fit==='cover'?Math.max:Math.min,scale=fit(sw/vw,sh/vh),ox=(sw-vw*scale)/2,oy=(sh-vh*scale)/2;
    const color=(px,py)=>{
     const sx=Math.round((vw-(px-ox)/scale)*w/vw),sy=Math.round((py-oy)/scale*h/vh);
     if(sx<0||sx>=w||sy<0||sy>=h)return null;
     const i=(sy*w+sx)*4;return chroma(pixels[i],pixels[i+1],pixels[i+2]);
    };
    const colors=[];
    for(const index of [50,101,205,280,330,425,1,4]){
     const p=face[index];if(!p)continue;
     for(const [a,b] of [[0,0],[-2,0],[2,0],[0,-2],[0,2]]){
      const c=color(p.x+a,p.y+b);if(c&&c.y>24&&c.cr>126&&c.cb<139&&c.cr-c.cb>6)colors.push(c);
     }
    }
    if(colors.length>=5){
     const current={cb:median(colors.map(c=>c.cb)),cr:median(colors.map(c=>c.cr)),y:median(colors.map(c=>c.y))};
     skin=skin?{cb:skin.cb*.6+current.cb*.4,cr:skin.cr*.6+current.cr*.4,y:current.y}:current;
    }
    const mw=112,mh=Math.max(24,Math.min(192,Math.round(height/width*mw))),size=mw*mh;
    const candidate=new Uint8Array(size);
    if(skin)for(let j=0;j<mh;j++)for(let i=0;i<mw;i++){
     const px=x+(i+.5)*width/mw,py=y+(j+.5)*height/mh;
     const ax=(px-chin.x)*rx+(py-chin.y)*ry,ay=(px-chin.x)*dx+(py-chin.y)*dy;
     const taper=Math.max(0,(ay/length-.55)/.45),halfWidth=fw*.37*Math.sqrt(Math.max(0,1-taper*taper));
     if(ay<-.12*fh||ay>length||Math.abs(ax)>halfWidth)continue;
     const c=color(px,py);if(!c)continue;
     const distance=((c.cb-skin.cb)/16)**2+((c.cr-skin.cr)/19)**2;
     if(distance<1&&c.y>Math.max(15,skin.y*.23))candidate[j*mw+i]=1;
    }
    // Close tiny gaps such as a necklace, then keep only skin connected to the neck.
    const expanded=new Uint8Array(size),closed=new Uint8Array(size);
    for(let j=1;j<mh-1;j++)for(let i=1;i<mw-1;i++){
     const p=j*mw+i;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)expanded[p]|=candidate[p+b*mw+a];
    }
    for(let j=1;j<mh-1;j++)for(let i=1;i<mw-1;i++){
     const p=j*mw+i;let value=1;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)value&=expanded[p+b*mw+a];closed[p]=value;
    }
    let seed=-1,nearest=Infinity;
    const target={x:chin.x+dx*fh*.09,y:chin.y+dy*fh*.09};
    for(let j=0;j<mh;j++)for(let i=0;i<mw;i++)if(closed[j*mw+i]){
     const px=x+(i+.5)*width/mw,py=y+(j+.5)*height/mh,d=(px-target.x)**2+(py-target.y)**2;
     if(d<nearest){nearest=d;seed=j*mw+i;}
    }
    const connected=new Uint8Array(size),queue=new Int32Array(size);let head=0,tail=0;
    if(seed>=0&&nearest<(fw*.22)**2){connected[seed]=1;queue[tail++]=seed;}
    while(head<tail){const p=queue[head++],i=p%mw,j=Math.floor(p/mw);for(const q of [i>0?p-1:-1,i<mw-1?p+1:-1,j>0?p-mw:-1,j<mh-1?p+mw:-1])if(q>=0&&closed[q]&&!connected[q]){connected[q]=1;queue[tail++]=q;}}
    if(mask.width!==mw||mask.height!==mh){mask.width=mw;mask.height=mh;}
    // Follow the connected skin silhouette with a smoothed quadratic outline.
    const rows=[];
    for(let j=0;j<mh;j++){
     let left=mw,right=-1;for(let i=0;i<mw;i++)if(connected[j*mw+i]){left=Math.min(left,i);right=Math.max(right,i);}
     if(right>=left)rows.push({y:j+.5,left:left+.25,right:right+.75});
    }
    const outline=rows.map((row,index)=>{
     let left=0,right=0,total=0;
     for(let n=Math.max(0,index-2);n<=Math.min(rows.length-1,index+2);n++){
      const weight=3-Math.abs(n-index);left+=rows[n].left*weight;right+=rows[n].right*weight;total+=weight;
     }
     return{y:row.y,left:left/total,right:right/total};
    });
    const contour=[...outline.map(p=>({x:p.left,y:p.y})),...outline.slice().reverse().map(p=>({x:p.right,y:p.y}))];
    paint.clearRect(0,0,mw,mh);paint.fillStyle='#fff';paint.beginPath();
    if(contour.length){
     const first=contour[0],last=contour[contour.length-1];paint.moveTo((first.x+last.x)/2,(first.y+last.y)/2);
     contour.forEach((p,i)=>{const next=contour[(i+1)%contour.length];paint.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);});paint.closePath();paint.fill();
    }
    hasMask=tail>0;
   }catch(e){hasMask=false;}
  }
  return hasMask?{image:mask.transferToImageBitmap(),x,y,width,height}:null;
 }

 return{process,reset};
}
