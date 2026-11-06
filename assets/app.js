import { createRobe } from './robe.js';
import { createLip } from './lip.js';
import { createRecorder } from './recorder.js';
const $ = s => document.querySelector(s);
const video=$('#video'), stage=$('#stage'), canvas=$('#overlay'), ctx=canvas.getContext('2d');
const robeCanvas=$('#robe-overlay'),robeContext=robeCanvas.getContext('2d');
const film=$('#film'), caseButton=$('#case'), hint=$('#hint'), tracking=$('#tracking'), cursor=$('#cursor');
const recording=createRecorder({video,stage,overlay:canvas,backgroundOverlay:robeCanvas,button:$('#record'),download:$('#download'),message});
const berry=new Image(); berry.src='assets/strawberry.svg';
const patch=new Image();
const patchTexture=document.createElement('canvas');patchTexture.width=720;patchTexture.height=432;
let patchTextureReady=false;
patch.onload=()=>{patchTexture.getContext('2d').drawImage(patch,0,0,720,432);patchTextureReady=true;};
patch.src='assets/eye-patch.svg';
const packet=$('#packet'),patchTray=$('#patch-tray');
let packetOpen=false,tearStart=null,patchReadyAt=0;
let poseWorker,poseReady=false,poseBusy=false,pose=[],lastPoseVideo=-1,lastPoseDetect=0;
const robe=createRobe();
let stream, handModel, faceModel, loading, session=0, raf, lastVideo=-1, lastDetect=0;
let face=[], hands=[], stickers=[], drag=null, pinching=false, trail=[], open=false, pointerId=null, lastHandSeen=0, filmReadyAt=0, lastFaceSeen=0;
const lip=createLip({stage,face:()=>face,message});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function message(s){hint.textContent=s;}
function openCase(){
  if(open)return; open=true; caseButton.classList.add('open');caseButton.setAttribute('aria-expanded','true');
  film.hidden=false;
  filmReadyAt=performance.now()+2350;
  message('딸기를 엄지·검지로 집어 얼굴로 가져간 뒤 손가락을 펴주세요');
}
function reset(){lip.reset();stickers=[];drag=null;pinching=false;document.querySelectorAll('#film button, #patch-tray button').forEach(b=>b.classList.remove('used'));}
for(let i=0;i<9;i++){
 const rear=document.createElement('span');rear.innerHTML='<img src="assets/strawberry.svg" alt="">';$('#rear-film').append(rear);
 const b=document.createElement('button');b.ariaLabel=`딸기 스티커 ${i+1} 집기`;b.innerHTML='<img src="assets/strawberry.svg" alt="딸기">';film.append(b);
 bindSticker(b);
}
function bindSticker(b){
 b.addEventListener('pointerdown',e=>{if(drag||!stickerExposed(b))return;e.preventDefault();pointerId=e.pointerId;b.setPointerCapture(e.pointerId);pick(b,local(e.clientX,e.clientY));});
 b.addEventListener('pointermove',e=>{if(pointerId===e.pointerId&&drag)drag.p=local(e.clientX,e.clientY);});
 b.addEventListener('pointerup',e=>{if(pointerId===e.pointerId){drop();pointerId=null;}});
 b.addEventListener('pointercancel',()=>{cancelDrag();pointerId=null;});
}
patchTray.querySelectorAll('button').forEach(bindSticker);
function openPacket(){
 if(packetOpen)return;packetOpen=true;tearStart=null;packet.classList.add('open');packet.setAttribute('aria-expanded','true');patchTray.hidden=false;patchReadyAt=performance.now()+800;
 message('아이패치를 엄지·검지로 집어 눈 아래에 가져간 뒤 손가락을 펴주세요');
}
packet.addEventListener('click',openPacket);
packet.addEventListener('pointerdown',e=>{if(packetOpen)return;pointerId=e.pointerId;tearStart={x:e.clientX,y:e.clientY};packet.setPointerCapture(e.pointerId);});
packet.addEventListener('pointermove',e=>{if(tearStart&&pointerId===e.pointerId&&dist(tearStart,{x:e.clientX,y:e.clientY})>25)openPacket();});
packet.addEventListener('pointerup',()=>{pointerId=null;tearStart=null;});
packet.addEventListener('pointercancel',()=>{pointerId=null;tearStart=null;});
caseButton.addEventListener('click',openCase);
$('#reset').addEventListener('click',reset);
function local(x,y){const r=stage.getBoundingClientRect();return{x:x-r.left,y:y-r.top};}
function map(p){
 const w=stage.clientWidth,h=stage.clientHeight;
 const scale=getComputedStyle(video).objectFit==='cover'?Math.max(w/video.videoWidth,h/video.videoHeight):Math.min(w/video.videoWidth,h/video.videoHeight);
 const vw=video.videoWidth*scale,vh=video.videoHeight*scale;
 return{x:(1-p.x)*vw+(w-vw)/2,y:p.y*vh+(h-vh)/2,visibility:p.visibility??1};
}
function basis(){if(!face.length)return null;const a=face[33],b=face[263];const size=dist(a,b);if(size<10)return null;return{size,angle:Math.atan2(b.y-a.y,b.x-a.x)};}
function stickerExposed(button){
 const ready=button.dataset.sticker?packetOpen&&!patchTray.hidden&&performance.now()>patchReadyAt:open&&!film.hidden&&performance.now()>filmReadyAt;
 return ready&&!button.classList.contains('used');
}
function pick(button,p){
 if(drag)return;
 const kind=button.dataset.sticker||'berry';
 const ratio=kind==='berry'?1.2:.6;
 const rect=button.querySelector('img').getBoundingClientRect();
 const size=Math.min(rect.width,rect.height/ratio);
 button.classList.add('used');drag={button,p,size,kind};
}
function stickerPosition(sticker,base=basis()){
 const c=Math.cos(base.angle),s=Math.sin(base.angle),anchor=face[sticker.index];
 return{x:anchor.x+(sticker.u*c-sticker.v*s)*base.size,y:anchor.y+(sticker.u*s+sticker.v*c)*base.size};
}
function pickPlaced(p){
 const base=basis();if(!base||drag)return false;
 for(const sticker of [...stickers].reverse()){
  const center=stickerPosition(sticker,base),angle=base.angle-Math.PI,c=Math.cos(angle),s=Math.sin(angle);
  const dx=p.x-center.x,dy=p.y-center.y,size=sticker.size*base.size,ratio=sticker.kind==='berry'?1.2:.6;
  if(Math.abs(dx*c+dy*s)<=size/2+12&&Math.abs(-dx*s+dy*c)<=size*ratio/2+12){
   drag={existing:sticker,p:center,size,kind:sticker.kind,offset:{x:center.x-p.x,y:center.y-p.y},angle};
   message('Move the sticker, then release to place it.');return true;
  }
 }
 return false;
}
function moveDrag(p){if(drag)drag.p={x:p.x+(drag.offset?.x||0),y:p.y+(drag.offset?.y||0)};}
function cancelDrag(){if(drag?.button)drag.button.classList.remove('used');drag=null;}
stage.addEventListener('pointerdown',e=>{
 if(e.target.closest('button,a')||pointerId!==null||!pickPlaced(local(e.clientX,e.clientY)))return;
 pointerId=e.pointerId;stage.setPointerCapture(e.pointerId);e.preventDefault();
});
stage.addEventListener('pointermove',e=>{if(pointerId===e.pointerId&&drag?.existing)moveDrag(local(e.clientX,e.clientY));});
stage.addEventListener('pointerup',e=>{if(pointerId===e.pointerId&&drag?.existing){moveDrag(local(e.clientX,e.clientY));drop();pointerId=null;}});
stage.addEventListener('pointercancel',e=>{if(pointerId===e.pointerId&&drag?.existing){cancelDrag();pointerId=null;}});
function drop(){
 if(!drag)return;
 const base=basis();
 if(base){
  if(!drag.existing&&(drag.kind==='patch'||drag.kind==='patch-flipped')){
   const first=stickers.find(s=>s.kind==='patch'||s.kind==='patch-flipped');
   if(first){
    const c=Math.cos(base.angle),s=Math.sin(base.angle),anchor=face[first.index];
    const firstPosition={x:anchor.x+(first.u*c-first.v*s)*base.size,y:anchor.y+(first.u*s+first.v*c)*base.size};
    // Keep the chosen horizontal position; align height along the face's eye line.
    const heightDifference=-(drag.p.x-firstPosition.x)*s+(drag.p.y-firstPosition.y)*c;
    drag.p={x:drag.p.x+heightDifference*s,y:drag.p.y-heightDifference*c};
   }
  }
  let index=0,nearest=Infinity;face.forEach((p,i)=>{const d=dist(p,drag.p);if(d<nearest){nearest=d;index=i;}});
  const xs=face.map(p=>p.x),ys=face.map(p=>p.y);
  const inside=drag.p.x>=Math.min(...xs)&&drag.p.x<=Math.max(...xs)&&drag.p.y>=Math.min(...ys)&&drag.p.y<=Math.max(...ys);
  if(inside&&nearest<base.size*.45){
   const dx=drag.p.x-face[index].x,dy=drag.p.y-face[index].y,c=Math.cos(base.angle),s=Math.sin(base.angle);
   const pairedPatch=drag.kind.startsWith('patch')?stickers.find(s=>s!==drag.existing&&s.kind.startsWith('patch')):null;
   const placement={index,u:(dx*c+dy*s)/base.size,v:(-dx*s+dy*c)/base.size,size:pairedPatch?.size??drag.size/base.size,kind:drag.kind};
   if(drag.existing)Object.assign(drag.existing,placement);else stickers.push(placement);
   drag=null;message('Sticker applied! Pick up another sticker and try it on.');return;
  }
 }
 cancelDrag();message(face.length?'얼굴 위에서 손가락을 펴면 스티커가 붙어요':'얼굴이 카메라에 보이도록 해주세요');
}
function initRobeTracking(){
 if(poseWorker||!globalThis.Worker||!globalThis.createImageBitmap)return;
 const worker=new Worker(new URL('./robe-tracker.js',import.meta.url));
 poseWorker=worker;
 worker.onmessage=({data})=>{
  if(worker!==poseWorker)return;
  if(data.type==='ready'){poseReady=true;return;}
  poseBusy=false;
  if(data.type==='result'&&data.session===session&&stream)pose=data.landmarks.map(p=>({...map(p),z:p.z??0}));
  if(data.type==='error'){pose=[];poseReady=false;worker.terminate();poseWorker=null;console.warn('Robe tracking unavailable:',data.message);}
 };
 worker.onerror=()=>{if(worker!==poseWorker)return;pose=[];poseReady=false;poseBusy=false;worker.terminate();poseWorker=null;};
}
async function trackRobe(now){
 if(!poseReady||poseBusy||!poseWorker||video.readyState<2||lastPoseVideo===video.currentTime||now-lastPoseDetect<100)return;
 const worker=poseWorker,id=session;
 poseBusy=true;lastPoseVideo=video.currentTime;lastPoseDetect=now;
 try{
  const frame=await createImageBitmap(video,{resizeWidth:480,resizeHeight:Math.max(1,Math.round(video.videoHeight*480/video.videoWidth))});
  if(worker!==poseWorker||id!==session||!stream){frame.close();return;}
  worker.postMessage({type:'frame',frame,timestamp:now,session:id},[frame]);
 }catch(e){if(worker===poseWorker)poseBusy=false;}
}
async function initModels(){
 initRobeTracking();
 if(handModel&&faceModel)return;
 if(loading)return loading;
 loading=(async()=>{
  const {FilesetResolver,HandLandmarker,FaceLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs');
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm');
  const created=[];
  try{
   const hand=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:1});created.push(hand);
   const faceTask=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},runningMode:'VIDEO',numFaces:1});
   handModel=hand;faceModel=faceTask;

  }catch(e){created.forEach(m=>m.close());throw e;}
 })();
 try{await loading;}finally{loading=null;}
}
function gesture(now){
 if(pointerId!==null)return;
 if(!hands.length){cursor.hidden=true;if(now-lastHandSeen>450){if(drag?.kind?.startsWith('patch')&&face.length)drop();else cancelDrag();lip.cancel();pinching=false;trail=[];tearStart=null;}return;}
 lastHandSeen=now;
 const h=hands[0],p={x:(h[4].x+h[8].x)/2,y:(h[4].y+h[8].y)/2};
 cursor.hidden=false;cursor.style.left=p.x+'px';cursor.style.top=p.y+'px';
 const ratio=dist(h[4],h[8])/Math.max(1,dist(h[0],h[9]));
 const releaseRatio=drag?.kind?.startsWith('patch') ? .40 : .48;
 const next=pinching?ratio<releaseRatio:ratio<.30;
 cursor.classList.toggle('pinching',next);
 if(next&&!pinching&&!drag)pickPlaced(p);
 if(lip.gesture(p,next,pinching,!!drag)){pinching=next;return;}
 if(!open){
  const palm=h[9],r=caseButton.getBoundingClientRect(),q=stage.getBoundingClientRect();
  trail.push({x:palm.x,y:palm.y,t:now});trail=trail.filter(p=>now-p.t<650);
  const near=palm.x>r.left-q.left-70&&palm.y>r.top-q.top-100&&palm.y<r.bottom-q.top+70;
  if(near&&trail.length>3&&trail.some(t=>dist(t,palm)>Math.max(35,stage.clientWidth*.07))&&!next)openCase();
 }
 if(!packetOpen){
  const r=packet.getBoundingClientRect(),s=stage.getBoundingClientRect();
  if(next&&!pinching&&p.x>=r.left-s.left-12&&p.x<=r.right-s.left+12&&p.y>=r.top-s.top-15&&p.y<=r.top-s.top+r.height*.25)tearStart={...p};
  if(next&&tearStart&&dist(p,tearStart)>Math.max(24,stage.clientWidth*.035))openPacket();
  if(!next)tearStart=null;
 }
 if(next&&!pinching&&!drag){
  for(const b of document.querySelectorAll('#film button:not(.used), #patch-tray button:not(.used)')){if(!stickerExposed(b))continue;const r=b.getBoundingClientRect(),s=stage.getBoundingClientRect();if(p.x>=r.left-s.left-10&&p.x<=r.right-s.left+10&&p.y>=r.top-s.top-10&&p.y<=r.bottom-s.top+10){pick(b,p);break;}}
 }
 if(drag&&next)moveDrag(p);
 if(pinching&&!next&&drag)drop();
 pinching=next;
}
function drawSticker(p,size,angle=0,kind='berry'){
 const image=kind==='berry'?berry:patch,ratio=kind==='berry'?1.2:.6;
 if(!image.complete||!image.naturalWidth)return;
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);if(kind==='patch-flipped')ctx.scale(-1,1);
 ctx.drawImage(image,-size/2,-size*ratio/2,size,size*ratio);ctx.restore();
}
function drawFittedPatch(p,size,angle,kind){
 if(!patchTextureReady){drawSticker(p,size,angle,kind);return;}
 const base=basis();if(!base)return;
 const axis={x:Math.cos(angle),y:Math.sin(angle)};
 const nose=face[168],side=(p.x-nose.x)*axis.x+(p.y-nose.y)*axis.y<0?-1:1;
 const eyes=[[face[33],face[133]],[face[263],face[362]]];
 eyes.sort((a,b)=>dist({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},p)-dist({x:(b[0].x+b[1].x)/2,y:(b[0].y+b[1].y)/2},p));
 const eye=eyes[0];
 eye.sort((a,b)=>(a.x-b.x)*axis.x+(a.y-b.y)*axis.y);
 const eyeAngle=Math.atan2(eye[1].y-eye[0].y,eye[1].x-eye[0].x);
 const delta=Math.atan2(Math.sin(eyeAngle-angle),Math.cos(eyeAngle-angle));
 const tilt=Math.max(-.22,Math.min(.22,delta))*.65;
 const leftSpan=dist(face[234],nose),rightSpan=dist(face[454],nose);
 const yaw=Math.max(-.4,Math.min(.4,(leftSpan-rightSpan)/Math.max(1,leftSpan+rightSpan)));
 const compression=1-Math.abs(yaw)*.3;
 const bend=size*(.06+Math.abs(yaw)*.05);
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle+tilt);
 // Narrow texture strips follow a curved cheek surface; the center stays at the drop point.
 const count=28,sw=patchTexture.width/count,height=size*.6;
 for(let i=0;i<count;i++){
  const t=(i+.5)/count-.5;
  const outward=t*side;
  const lift=-bend*(outward+2*outward*outward);
  const x=(i/count-.5)*size*compression;
  const source=kind==='patch-flipped'?(count-1-i)*sw:i*sw;
  ctx.save();ctx.translate(x,lift);
  if(kind==='patch-flipped'){ctx.translate(size*compression/count,0);ctx.scale(-1,1);}
  ctx.drawImage(patchTexture,source,0,sw,patchTexture.height,0,-height/2,size*compression/count+.3,height);
  ctx.restore();
 }
 ctx.restore();
}
function render(now){
 if(!stream)return;
 for(const layer of [canvas,robeCanvas])if(layer.width!==stage.clientWidth||layer.height!==stage.clientHeight){layer.width=stage.clientWidth;layer.height=stage.clientHeight;}
 if(handModel&&faceModel&&video.readyState>=2&&lastVideo!==video.currentTime&&now-lastDetect>65){
  lastVideo=video.currentTime;lastDetect=now;
  try{
   const detectedFace=(faceModel.detectForVideo(video,now).faceLandmarks[0]||[]).map(map);
   if(detectedFace.length){face=detectedFace;lastFaceSeen=now;}
   else if(now-lastFaceSeen>650)face=[];
   hands=handModel.detectForVideo(video,now).landmarks.map(h=>h.map(map));
   tracking.textContent=`${face.length?'Face detected':'Show your face'} · ${hands.length?'Hand detected':'Show your hand'}`;
   gesture(now);
  }catch(e){tracking.textContent='인식이 잠시 멈췄어요. 카메라를 다시 켜주세요';handModel.close();faceModel.close();handModel=faceModel=null;cancelDrag();cursor.hidden=true;}
 }
 trackRobe(now);
 ctx.clearRect(0,0,canvas.width,canvas.height);
 robeContext.clearRect(0,0,robeCanvas.width,robeCanvas.height);
 robe.draw(robeContext,pose,hands,face,video,stage);
 const b=basis();if(b)for(const s of stickers){if(drag?.existing===s)continue;const p=stickerPosition(s,b),draw=s.kind==='berry'?drawSticker:drawFittedPatch;draw(p,s.size*b.size,b.angle-Math.PI,s.kind);}
 if(drag)drawSticker(drag.p,drag.size,drag.angle||0,drag.kind);
 lip.draw(ctx,now);
 recording.draw();
 raf=requestAnimationFrame(render);
}
function closeCamera(){poseWorker?.terminate();poseWorker=null;poseReady=false;poseBusy=false;robe.reset();pose=[];lastPoseVideo=-1;lip.close();recording.stop();session++;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('#camera').hidden=true;$('#welcome').hidden=false;cursor.hidden=true;reset();face=[];hands=[];trail=[];open=false;caseButton.classList.remove('open');caseButton.setAttribute('aria-expanded','false');film.hidden=true;packetOpen=false;tearStart=null;packet.classList.remove('open');packet.setAttribute('aria-expanded','false');patchTray.hidden=true;pointerId=null;lastVideo=-1;}
$('#start').addEventListener('click',async()=>{
 if($('#start').disabled)return;$('#start').disabled=true;$('#error').hidden=true;const id=++session;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('이 브라우저에서는 카메라를 사용할 수 없어요.');
  const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false});
  if(id!==session){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;video.srcObject=stream;await video.play();
  $('#welcome').hidden=true;$('#camera').hidden=false;tracking.textContent='손·얼굴 인식 준비 중';message('처음에는 인식 모델을 불러오는 데 잠시 걸릴 수 있어요');raf=requestAnimationFrame(render);
  try{await initModels();if(id!==session)return;message('Open the case on the right, or pinch and tear open the pouch on the left.');}
  catch(e){if(id===session){tracking.textContent='인식 모델을 불러오지 못했어요';message('카메라를 다시 켜서 인식을 재시도해주세요. 케이스 클릭과 스티커 드래그도 가능해요');}}
 }catch(e){if(id===session){closeCamera();$('#error').textContent=e.name==='NotAllowedError'?'카메라 권한을 허용한 뒤 다시 눌러주세요.':e.name==='NotFoundError'?'연결된 카메라가 없어요.':e.message;$('#error').hidden=false;}}
 finally{$('#start').disabled=false;}
});
$('#close').addEventListener('click',()=>{closeCamera();$('#start').focus();});window.addEventListener('pagehide',closeCamera);
