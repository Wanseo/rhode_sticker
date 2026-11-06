import {createArmProcessor} from './arm-occlusion.js';
import {createNeckProcessor} from './neck-mask-core.js';
const processor=createNeckProcessor(),armProcessor=createArmProcessor();
self.onmessage=({data})=>{
 const {image,stage,face,center,span,anchor,arms=[]}=data;
 try{
  const mask=processor.process(image,stage,face,center,span);
  if(mask)mask.anchor=anchor;
  const armMasks=armProcessor.process(image,stage,face,arms);
  self.postMessage({mask,arms:armMasks},[...(mask?[mask.image]:[]),...armMasks.map(p=>p.image)]);
 }finally{image.close();}
};
