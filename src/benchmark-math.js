// Pure, portable helpers for device-local performance comparison.
// Raw frames remain in the browser and are never uploaded to Render.
export function summarizeFrames(frameMs) {
  const frames=Array.isArray(frameMs)?frameMs.filter(x=>Number.isFinite(x)&&x>0&&x<1000):[];
  if(!frames.length)return {fps:0,avgMs:0,p95Ms:0,frames:0};
  const sorted=[...frames].sort((a,b)=>a-b);
  const mean=frames.reduce((a,b)=>a+b,0)/frames.length;
  return {
    fps:Math.round(1000/mean*10)/10,
    avgMs:Math.round(mean*10)/10,
    p95Ms:Math.round(sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]*10)/10,
    frames:frames.length
  };
}
export function compareTrials(fixed,adaptive) {
  const baseline=Number(fixed?.fps)||0,adjusted=Number(adaptive?.fps)||0;
  return {
    fixedFps:baseline,adaptiveFps:adjusted,
    deltaFps:Math.round((adjusted-baseline)*10)/10,
    deltaPercent:baseline>0?Math.round((adjusted/baseline-1)*1000)/10:null
  };
}
export function benchmarkSummary(rows) {
  const usable=(Array.isArray(rows)?rows:[]).filter(x=>x?.fixed?.fps>0&&x?.adaptive?.fps>0);
  if(!usable.length)return {maps:0,fixedFps:0,adaptiveFps:0,deltaPercent:null};
  const fixed=usable.reduce((a,b)=>a+b.fixed.fps,0)/usable.length;
  const adaptive=usable.reduce((a,b)=>a+b.adaptive.fps,0)/usable.length;
  return {
    maps:usable.length,
    fixedFps:Math.round(fixed*10)/10,
    adaptiveFps:Math.round(adaptive*10)/10,
    deltaPercent:Math.round((adaptive/fixed-1)*1000)/10
  };
}
export function interpretAdaptiveResult(rows){
  const pairs=(Array.isArray(rows)?rows:[]).filter(row=>row?.fixed?.fps>0&&row?.adaptive?.fps>0);
  const engaged=pairs.filter(({adaptive})=>
    (Number.isFinite(adaptive.avgScale)&&adaptive.avgScale<.995)||
    (Number.isFinite(adaptive.scale)&&adaptive.scale<.995)
  ).length;
  return {
    testedMaps:pairs.length,adjustedMaps:engaged,
    conclusion:engaged===0
      ?"Auto manteve 100% de resolução em todos os mapas; a diferença de FPS observada não comprova ganho causado pela adaptação."
      :"Auto reduziu a resolução em "+engaged+" de "+pairs.length+
      " mapas. A diferença de FPS é observada nesta sessão; repita o teste para confirmar o ganho."
  };
}
export function formatBenchReport(rows,{device="Navegador móvel",quality="balanced",date="",trackLength=null}={}) {
  const summary=benchmarkSummary(rows);
  const lines=[
    "CORRIDA DOS ELEMENTOS LIVE — BENCHMARK LOCAL",
    "Dispositivo/navegador: "+device,
    "Perfil base idêntico: "+quality,
    "Data: "+date,
    "Mapas testados: "+summary.maps,
    ...(Number.isFinite(trackLength)&&trackLength>0?["Distância da pista: "+trackLength+" m · primeira e segunda metade"]:[]),
    "Média fixa: "+summary.fixedFps+" FPS",
    "Média adaptativa: "+summary.adaptiveFps+" FPS",
    "Diferença observada: "+(summary.deltaPercent===null?"indisponível":(summary.deltaPercent>0?"+":"")+summary.deltaPercent+"%"),
    "Interpretação: "+interpretAdaptiveResult(rows).conclusion,
    ""
  ];
  for(const row of rows){
    const compare=compareTrials(row.fixed,row.adaptive);
    lines.push(row.name+": "+compare.fixedFps+" FPS fixo / "+compare.adaptiveFps+
      " FPS Auto ("+(compare.deltaPercent>0?"+":"")+compare.deltaPercent+
      "%), resolução Auto final "+Math.round((row.adaptive.scale??1)*100)+"%"+
      (Number.isFinite(row.adaptive.avgDrawCalls)?", draw calls médios: "+row.adaptive.avgDrawCalls:"")+
      (Number.isFinite(row.adaptive.avgTriangles)?", triângulos médios: "+row.adaptive.avgTriangles:"")+
      (Number.isFinite(row.fixed?.p95Ms)&&Number.isFinite(row.adaptive?.p95Ms)
        ?", P95 quadro fixo/Auto: "+row.fixed.p95Ms+"/"+row.adaptive.p95Ms+" ms":""));
  }
  lines.push("Dados de uma única sessão local. Medição depende de temperatura, bateria, tela e navegador.");
  lines.push("Sem conexão ao chat TikTok, sem presentes pagos e sem upload automático.");
  return lines.join("\n");
}
