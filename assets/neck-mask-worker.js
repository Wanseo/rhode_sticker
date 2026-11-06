import {createNeckProcessor} from './neck-mask-core.js';
const processor=createNeckProcessor();
self.onmessage=({data})=>{
 const {image,stage,face,center,span,anchor}=data;
 try{
  const mask=processor.process(image,stage,face,center,span);
  if(mask){mask.anchor=anchor;self.postMessage({mask},[mask.image]);}
  else self.postMessage({mask:null});
 }finally{image.close();}
};
