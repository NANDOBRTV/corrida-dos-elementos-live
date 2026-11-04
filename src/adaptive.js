// Quality adjustment is strictly visual. It never changes map geometry, textures,
// voxel decorations, physics, player order or authoritative race state.
export const ADAPTIVE_SCALES=Object.freeze([1,.88,.76,.65]);
export function createAdaptiveQuality({
  enabled=true,targetFps=30,scales=ADAPTIVE_SCALES,
  sampleFloor=35,lowWindows=3,stableWindows=8,
  downCooldownMs=8000,upCooldownMs=20000
}={}){
  const clean=[...scales].filter((x,i,a)=>Number.isFinite(x)&&x>=.5&&x<=1&&(i===0||x<a[i-1]));
  if(!clean.length||clean[0]!==1)throw Error("Lista de resoluções inválida");
  const fps=Math.max(15,Math.min(120,Number(targetFps)||30));
  let level=0,slow=0,good=0,lastChangeAt=-Infinity,ready=false;
  function update(metrics,now){
    if(!enabled||!Number.isFinite(now)||!metrics||metrics.samples<sampleFloor)
      return {changed:false,scale:clean[level],level,reason:"sampling"};
    // Every decision uses an independent sampling interval; avoid repeatedly
    // incrementing a streak within the same UI frame.
    const performanceBad=metrics.fps<fps*.76||metrics.slowFramePercent>=28;
    const performanceGood=metrics.fps>=fps*.93&&metrics.slowFramePercent<=8&&
      metrics.p95FrameMs<=1000/fps*1.38;
    slow=performanceBad?slow+1:0;
    good=performanceGood?good+1:0;
    if(!ready){ready=true;lastChangeAt=now- downCooldownMs;}
    if(slow>=lowWindows&&level<clean.length-1&&now-lastChangeAt>=downCooldownMs){
      level++;
      slow=0;good=0;lastChangeAt=now;
      return {changed:true,scale:clean[level],level,reason:"down"};
    }
    if(good>=stableWindows&&level>0&&now-lastChangeAt>=upCooldownMs){
      level--;
      slow=0;good=0;lastChangeAt=now;
      return {changed:true,scale:clean[level],level,reason:"up"};
    }
    return {changed:false,scale:clean[level],level,reason:"hold"};
  }
  function status(){return {enabled,scale:clean[level],level,maxLevel:clean.length-1};}
  function reset(){slow=0;good=0;ready=false;lastChangeAt=-Infinity;}
  return {update,status,reset};
}
