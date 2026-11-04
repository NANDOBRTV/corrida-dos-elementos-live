// Browser-only sampling; does not change authoritative race timing or results.
// Samples actual WebGL draw intervals, not just scheduled requestAnimationFrame callbacks.
export function createFrameMonitor({targetFps=30,sampleSize=120}={}) {
  const target=Number.isFinite(targetFps)&&targetFps>0?targetFps:30;
  const max=Math.max(12,Math.min(240,Math.trunc(sampleSize)||120));
  const durations=[];
  let previous=0,drawCalls=0,triangles=0,lastSampleAt=0,lastLongFrame=0;
  function frame(timestamp,rendererInfo) {
    if(!Number.isFinite(timestamp))return;
    if(previous){
      const duration=timestamp-previous;
      // A tab restored after backgrounding must not look like a massive frame drop.
      if(duration>0&&duration<=1000){
        durations.push(duration);
        if(durations.length>max)durations.shift();
        if(duration>1000/target*1.5)lastLongFrame=timestamp;
      }else if(duration>1000){
        durations.length=0;
      }
    }
    previous=timestamp;
    lastSampleAt=timestamp;
    drawCalls=Math.max(0,Math.trunc(Number(rendererInfo?.render?.calls)||0));
    triangles=Math.max(0,Math.trunc(Number(rendererInfo?.render?.triangles)||0));
  }
  function snapshot(){
    const sorted=[...durations].sort((a,b)=>a-b);
    const average=durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0;
    const longFrames=durations.filter(x=>x>1000/target*1.5).length;
    const p95=sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]:0;
    return {
      fps:average?Math.min(240,Math.round(1000/average)):0,
      targetFps:target,
      samples:durations.length,
      avgFrameMs:Number(average.toFixed(1)),
      p95FrameMs:Number(p95.toFixed(1)),
      slowFramePercent:durations.length?Math.round(longFrames/durations.length*100):0,
      drawCalls,triangles,lastSampleAt,lastLongFrame
    };
  }
  function reset(){
    durations.length=0;previous=0;drawCalls=0;triangles=0;
    lastSampleAt=0;lastLongFrame=0;
  }
  return {frame,snapshot,reset};
}
export function gradePerformance(metrics){
  if(!metrics||metrics.samples<8)return {level:"sampling",text:"Medindo desempenho..."};
  if(metrics.fps<metrics.targetFps*.6||metrics.slowFramePercent>35)
    return {level:"low",text:"Quedas de FPS: experimente o perfil Leve"};
  if(metrics.fps<metrics.targetFps*.85||metrics.slowFramePercent>15)
    return {level:"medium",text:"Desempenho variável: reduza os gráficos"};
  return {level:"good",text:"Desempenho estável neste navegador"};
}
