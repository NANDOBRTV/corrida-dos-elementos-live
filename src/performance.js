// Configuração visual independente das regras e resultados da corrida.
export const QUALITY_SETTINGS=Object.freeze({
  low:Object.freeze({name:"Leve",pixelRatio:1,shadows:false,sceneStep:2,targetFps:30}),
  balanced:Object.freeze({name:"Equilibrada",pixelRatio:1.15,shadows:true,sceneStep:1,targetFps:45}),
  high:Object.freeze({name:"Alta",pixelRatio:1.6,shadows:true,sceneStep:1,targetFps:60})
});
export function resolveQuality(requested="auto",device={}){
  if(requested==="low"||requested==="balanced"||requested==="high")return requested;
  const memory=Number(device.memory);
  const cores=Number(device.cores);
  if((Number.isFinite(memory)&&memory>0&&memory<=4)||
     (Number.isFinite(cores)&&cores>0&&cores<=4))return "low";
  if((Number.isFinite(memory)&&memory>=12)&&
     (Number.isFinite(cores)&&cores>=8))return "high";
  return "balanced";
}
export function qualityFromUrl(search="",device={}){
  const params=new URLSearchParams(search.startsWith("?")?search.slice(1):search);
  return resolveQuality(params.get("quality")||"auto",device);
}
export function shouldRender(now,lastRender,targetFps=30){
  if(!Number.isFinite(now)||!Number.isFinite(lastRender))return true;
  const fps=Number.isFinite(targetFps)&&targetFps>0?Math.max(15,Math.min(120,targetFps)):30;
  return now-lastRender>=1000/fps-1;
}
