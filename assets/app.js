import { createLip } from './lip.js';
import { createRecorder } from './recorder.js';
const $ = s => document.querySelector(s);
const video=$('#video'), stage=$('#stage'), canvas=$('#overlay'), ctx=canvas.getContext('2d');
const film=$('#film'), caseButton=$('#case'), hint=$('#hint'), tracking=$('#tracking'), cursor=$('#cursor');
const recording=createRecorder({video,stage,overlay:canvas,button:$('#record'),download:$('#download'),message});
const berry=new Image(); berry.src='assets/strawberry.svg';
const patch=new Image();patch.src='assets/eye-patch.svg';
const packet=$('#packet'),patchTray=$('#patch-tray');
let packetOpen=false,tearStart=null,patchReadyAt=0;
let stream, handModel, faceModel, loading, session=0, raf, lastVideo=-1, lastDetect=0;
let face=[], hands=[], stickers=[], drag=null, pinching=false, trail=[], open=false, pointerId=null, lastHandSeen=0, filmReadyAt=0;
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
 return{x:(1-p.x)*vw+(w-vw)/2,y:p.y*vh+(h-vh)/2};
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
function cancelDrag(){if(drag)drag.button.classList.remove('used');drag=null;}
function drop(){
 if(!drag)return;
 const base=basis();
 if(base){
  let index=0,nearest=Infinity;face.forEach((p,i)=>{const d=dist(p,drag.p);if(d<nearest){nearest=d;index=i;}});
  const xs=face.map(p=>p.x),ys=face.map(p=>p.y);
  const inside=drag.p.x>=Math.min(...xs)&&drag.p.x<=Math.max(...xs)&&drag.p.y>=Math.min(...ys)&&drag.p.y<=Math.max(...ys);
  if(inside&&nearest<base.size*.45){
   const dx=drag.p.x-face[index].x,dy=drag.p.y-face[index].y,c=Math.cos(base.angle),s=Math.sin(base.angle);
   stickers.push({index,u:(dx*c+dy*s)/base.size,v:(-dx*s+dy*c)/base.size,size:drag.size/base.size,kind:drag.kind});
   drag=null;message('붙었어요! 다른 스티커도 집어서 붙여보세요');return;
  }
 }
 cancelDrag();message(face.length?'얼굴 위에서 손가락을 펴면 스티커가 붙어요':'얼굴이 카메라에 보이도록 해주세요');
}
async function initModels(){
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
 if(!hands.length){cursor.hidden=true;if(now-lastHandSeen>450){cancelDrag();lip.cancel();pinching=false;trail=[];tearStart=null;}return;}
 lastHandSeen=now;
 const h=hands[0],p={x:(h[4].x+h[8].x)/2,y:(h[4].y+h[8].y)/2};
 cursor.hidden=false;cursor.style.left=p.x+'px';cursor.style.top=p.y+'px';
 const ratio=dist(h[4],h[8])/Math.max(1,dist(h[0],h[9]));
 const next=pinching?ratio<.48:ratio<.30;
 cursor.classList.toggle('pinching',next);
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
 if(drag&&next)drag.p=p;
 if(pinching&&!next&&drag)drop();
 pinching=next;
}
function drawSticker(p,size,angle=0,kind='berry'){
 const image=kind==='berry'?berry:patch,ratio=kind==='berry'?1.2:.6;
 if(!image.complete||!image.naturalWidth)return;
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);if(kind==='patch-flipped')ctx.scale(-1,1);
 ctx.drawImage(image,-size/2,-size*ratio/2,size,size*ratio);ctx.restore();
}
function render(now){
 if(!stream)return;
 if(canvas.width!==stage.clientWidth||canvas.height!==stage.clientHeight){canvas.width=stage.clientWidth;canvas.height=stage.clientHeight;}
 if(handModel&&faceModel&&video.readyState>=2&&lastVideo!==video.currentTime&&now-lastDetect>65){
  lastVideo=video.currentTime;lastDetect=now;
  try{
   face=(faceModel.detectForVideo(video,now).faceLandmarks[0]||[]).map(map);
   hands=handModel.detectForVideo(video,now).landmarks.map(h=>h.map(map));
   tracking.textContent=`${face.length?'Face detected':'Show your face'} · ${hands.length?'Hand detected':'Show your hand'}`;
   gesture(now);
  }catch(e){tracking.textContent='인식이 잠시 멈췄어요. 카메라를 다시 켜주세요';handModel.close();faceModel.close();handModel=faceModel=null;cancelDrag();cursor.hidden=true;}
 }
 ctx.clearRect(0,0,canvas.width,canvas.height);
 const b=basis();if(b)for(const s of stickers){const c=Math.cos(b.angle),sn=Math.sin(b.angle),p=face[s.index];drawSticker({x:p.x+(s.u*c-s.v*sn)*b.size,y:p.y+(s.u*sn+s.v*c)*b.size},s.size*b.size,b.angle-Math.PI,s.kind);}
 if(drag)drawSticker(drag.p,drag.size,0,drag.kind);
 lip.draw(ctx,now);
 recording.draw();
 raf=requestAnimationFrame(render);
}
function closeCamera(){lip.close();recording.stop();session++;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('#camera').hidden=true;$('#welcome').hidden=false;cursor.hidden=true;reset();face=[];hands=[];trail=[];open=false;caseButton.classList.remove('open');caseButton.setAttribute('aria-expanded','false');film.hidden=true;packetOpen=false;tearStart=null;packet.classList.remove('open');packet.setAttribute('aria-expanded','false');patchTray.hidden=true;pointerId=null;lastVideo=-1;}
$('#start').addEventListener('click',async()=>{
 if($('#start').disabled)return;$('#start').disabled=true;$('#error').hidden=true;const id=++session;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('이 브라우저에서는 카메라를 사용할 수 없어요.');
  const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false});
  if(id!==session){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;video.srcObject=stream;await video.play();
  $('#welcome').hidden=true;$('#camera').hidden=false;tracking.textContent='손·얼굴 인식 준비 중';message('처음에는 인식 모델을 불러오는 데 잠시 걸릴 수 있어요');raf=requestAnimationFrame(render);
  try{await initModels();if(id!==session)return;message('오른쪽 케이스를 열거나 왼쪽 봉투 윗부분을 집어 뜯어보세요');}
  catch(e){if(id===session){tracking.textContent='인식 모델을 불러오지 못했어요';message('카메라를 다시 켜서 인식을 재시도해주세요. 케이스 클릭과 스티커 드래그도 가능해요');}}
 }catch(e){if(id===session){closeCamera();$('#error').textContent=e.name==='NotAllowedError'?'카메라 권한을 허용한 뒤 다시 눌러주세요.':e.name==='NotFoundError'?'연결된 카메라가 없어요.':e.message;$('#error').hidden=false;}}
 finally{$('#start').disabled=false;}
});
$('#close').addEventListener('click',()=>{closeCamera();$('#start').focus();});window.addEventListener('pagehide',closeCamera);
