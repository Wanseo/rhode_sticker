import { createRecorder } from './recorder.js';
const $ = s => document.querySelector(s);
const video=$('#video'), stage=$('#stage'), canvas=$('#overlay'), ctx=canvas.getContext('2d');
const film=$('#film'), caseButton=$('#case'), hint=$('#hint'), tracking=$('#tracking'), cursor=$('#cursor');
const recording=createRecorder({video,stage,overlay:canvas,button:$('#record'),download:$('#download'),message});
const berry=new Image(); berry.src='assets/strawberry.svg';
let stream, handModel, faceModel, loading, session=0, raf, lastVideo=-1, lastDetect=0;
let face=[], hands=[], stickers=[], drag=null, pinching=false, trail=[], open=false, pointerId=null, lastHandSeen=0, filmReadyAt=0;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function message(s){hint.textContent=s;}
function openCase(){
  if(open)return; open=true; caseButton.classList.add('open');caseButton.setAttribute('aria-expanded','true');
  film.hidden=false;
  filmReadyAt=performance.now()+2350;
  message('딸기를 엄지·검지로 집어 얼굴로 가져간 뒤 손가락을 펴주세요');
}
function reset(){stickers=[];drag=null;pinching=false;film.querySelectorAll('button').forEach(b=>b.classList.remove('used'));}
for(let i=0;i<9;i++){
 const rear=document.createElement('span');rear.innerHTML='<img src="assets/strawberry.svg" alt="">';$('#rear-film').append(rear);
 const b=document.createElement('button');b.ariaLabel=`딸기 스티커 ${i+1} 집기`;b.innerHTML='<img src="assets/strawberry.svg" alt="딸기">';film.append(b);
 b.addEventListener('pointerdown',e=>{if(drag||performance.now()<filmReadyAt||!stickerExposed(b))return;e.preventDefault();pointerId=e.pointerId;b.setPointerCapture(e.pointerId);pick(b,local(e.clientX,e.clientY));});
 b.addEventListener('pointermove',e=>{if(pointerId===e.pointerId&&drag)drag.p=local(e.clientX,e.clientY);});
 b.addEventListener('pointerup',e=>{if(pointerId===e.pointerId){drop();pointerId=null;}});
 b.addEventListener('pointercancel',()=>{cancelDrag();pointerId=null;});
}
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
 return open && !film.hidden && !button.classList.contains('used');
}
function pick(button,p){
 if(drag)return;
 const image=button.querySelector('img');
 const rect=image.getBoundingClientRect();
 // Match the contained 100 × 120 SVG, including any letterboxing.
 const size=Math.min(rect.width,rect.height/1.2);
 button.classList.add('used');
 drag={button,p,size};
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
   stickers.push({index,u:(dx*c+dy*s)/base.size,v:(-dx*s+dy*c)/base.size,size:drag.size/base.size});
   drag=null;message('붙었어요! 다른 딸기도 집어서 붙여보세요');return;
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
 if(!hands.length){cursor.hidden=true;if(now-lastHandSeen>450){cancelDrag();pinching=false;trail=[];}return;}
 lastHandSeen=now;
 const h=hands[0],p={x:(h[4].x+h[8].x)/2,y:(h[4].y+h[8].y)/2};
 cursor.hidden=false;cursor.style.left=p.x+'px';cursor.style.top=p.y+'px';
 const ratio=dist(h[4],h[8])/Math.max(1,dist(h[0],h[9]));
 const next=pinching?ratio<.48:ratio<.30;
 cursor.classList.toggle('pinching',next);
 if(!open){
  const palm=h[9],r=caseButton.getBoundingClientRect(),q=stage.getBoundingClientRect();
  trail.push({x:palm.x,y:palm.y,t:now});trail=trail.filter(p=>now-p.t<650);
  const near=palm.x>r.left-q.left-70&&palm.y>r.top-q.top-100&&palm.y<r.bottom-q.top+70;
  if(near&&trail.length>3&&trail.some(t=>dist(t,palm)>Math.max(35,stage.clientWidth*.07))&&!next)openCase();
 }
 if(next&&!pinching&&open&&!drag&&now>filmReadyAt){
  for(const b of film.querySelectorAll('button:not(.used)')){if(!stickerExposed(b))continue;const r=b.getBoundingClientRect(),s=stage.getBoundingClientRect();if(p.x>=r.left-s.left-10&&p.x<=r.right-s.left+10&&p.y>=r.top-s.top-10&&p.y<=r.bottom-s.top+10){pick(b,p);break;}}
 }
 if(drag&&next)drag.p=p;
 if(pinching&&!next&&drag)drop();
 pinching=next;
}
function drawBerry(p,size,angle=0){if(!berry.complete||!berry.naturalWidth)return;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.drawImage(berry,-size/2,-size*.6,size,size*1.2);ctx.restore();}
function render(now){
 if(!stream)return;
 if(canvas.width!==stage.clientWidth||canvas.height!==stage.clientHeight){canvas.width=stage.clientWidth;canvas.height=stage.clientHeight;}
 if(handModel&&faceModel&&video.readyState>=2&&lastVideo!==video.currentTime&&now-lastDetect>65){
  lastVideo=video.currentTime;lastDetect=now;
  try{
   face=(faceModel.detectForVideo(video,now).faceLandmarks[0]||[]).map(map);
   hands=handModel.detectForVideo(video,now).landmarks.map(h=>h.map(map));
   tracking.textContent=`${face.length?'얼굴 인식됨':'얼굴을 보여주세요'} · ${hands.length?'손 인식됨':'손을 보여주세요'}`;
   gesture(now);
  }catch(e){tracking.textContent='인식이 잠시 멈췄어요. 카메라를 다시 켜주세요';handModel.close();faceModel.close();handModel=faceModel=null;cancelDrag();cursor.hidden=true;}
 }
 ctx.clearRect(0,0,canvas.width,canvas.height);
 const b=basis();if(b)for(const s of stickers){const c=Math.cos(b.angle),sn=Math.sin(b.angle),p=face[s.index];drawBerry({x:p.x+(s.u*c-s.v*sn)*b.size,y:p.y+(s.u*sn+s.v*c)*b.size},s.size*b.size,b.angle-Math.PI);}
 if(drag)drawBerry(drag.p,drag.size);
 recording.draw();
 raf=requestAnimationFrame(render);
}
function closeCamera(){recording.stop();session++;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('#camera').hidden=true;$('#welcome').hidden=false;cursor.hidden=true;reset();face=[];hands=[];trail=[];open=false;caseButton.classList.remove('open');caseButton.setAttribute('aria-expanded','false');film.hidden=true;pointerId=null;lastVideo=-1;}
$('#start').addEventListener('click',async()=>{
 if($('#start').disabled)return;$('#start').disabled=true;$('#error').hidden=true;const id=++session;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('이 브라우저에서는 카메라를 사용할 수 없어요.');
  const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720}},audio:false});
  if(id!==session){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;video.srcObject=stream;await video.play();
  $('#welcome').hidden=true;$('#camera').hidden=false;tracking.textContent='손·얼굴 인식 준비 중';message('처음에는 인식 모델을 불러오는 데 잠시 걸릴 수 있어요');raf=requestAnimationFrame(render);
  try{await initModels();if(id!==session)return;message('오른쪽 케이스를 눌러 열어보세요');}
  catch(e){if(id===session){tracking.textContent='인식 모델을 불러오지 못했어요';message('카메라를 다시 켜서 인식을 재시도해주세요. 케이스 클릭과 스티커 드래그도 가능해요');}}
 }catch(e){if(id===session){closeCamera();$('#error').textContent=e.name==='NotAllowedError'?'카메라 권한을 허용한 뒤 다시 눌러주세요.':e.name==='NotFoundError'?'연결된 카메라가 없어요.':e.message;$('#error').hidden=false;}}
 finally{$('#start').disabled=false;}
});
$('#close').addEventListener('click',()=>{closeCamera();$('#start').focus();});window.addEventListener('pagehide',closeCamera);
