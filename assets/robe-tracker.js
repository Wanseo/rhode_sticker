// Body inference runs away from the camera, gesture and animation UI thread.
let tracker;
self.onmessage=({data})=>{
 if(data.type!=='frame')return;
 const {frame,timestamp,session}=data;
 try{
  const landmarks=tracker.detectForVideo(frame,timestamp).landmarks[0]||[];
  self.postMessage({type:'result',landmarks,session});
 }catch(error){self.postMessage({type:'error',message:error.message});}
 finally{frame.close();}
};
async function init(){
try{
 const {FilesetResolver,PoseLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs');
 const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm');
 tracker=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'},runningMode:'VIDEO',numPoses:1});
 self.postMessage({type:'ready'});
}catch(error){self.postMessage({type:'error',message:error.message});}
}
init();
