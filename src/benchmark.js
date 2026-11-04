import {createWorld} from "./world.js";
import {createAvatars} from "./avatars.js";
import {createState,register,advance} from "./engine.js";
import {BIOME_ORDER,biome} from "./config.js";
import {createFrameMonitor} from "./metrics.js";
import {createAdaptiveQuality} from "./adaptive.js";
import {summarizeFrames,benchmarkSummary,compareTrials,interpretAdaptiveResult,formatBenchReport} from "./benchmark-math.js";

const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
// This accelerated mode is for CI on localhost ONLY; real Render tests use the full trial.
const qa=/(^localhost$|^127\.0\.0\.1$)/.test(location.hostname)&&query.get("qa")==="1";
const trialMs=qa?900:14000;
const warmupMs=qa?120:1800;
const rendererProfile="balanced"; // Same 3D objects, lighting and initial pixel density for both trials.
let world=null,avatars=null,controller=null,wakeLock=null,results=[],running=false;
const canvas=$("testCanvas");
const runners=createState(42719);
for(let i=0;i<50;i++)register(runners,"benchmark-"+i,"Corredor "+String(i+1).padStart(2,"0"),"entrar");
advance(runners);advance(runners);
runners.active.forEach((r,i)=>{
  r.progress=38+(i%10)*.55;r.status="running";r.speed=r.baseSpeed;
});
function setMessage(title,details=""){
  $("testStatus").textContent=title;
  $("testDetails").textContent=details;
}
function stepInfo(mapId,mode,index,percentage,fps){
  $("sceneMap").textContent=biome(mapId).emoji+" "+biome(mapId).name;
  $("sceneMode").textContent=mode==="fixed"?"100% FIXO":"AUTO ADAPTATIVO";
  $("progressLabel").textContent=(index+1)+"/10 etapas";
  $("testProgress").style.width=Math.min(100,Math.max(0,(index+percentage)/10*100)).toFixed(1)+"%";
  $("currentFps").textContent=fps>0?fps.toFixed(1)+" FPS":"— FPS";
}
function doTrial(mapId,mode,index,signal){
  return new Promise((resolve,reject)=>{
    const monitor=createFrameMonitor({targetFps:45,sampleSize:180});
    const adaptation=createAdaptiveQuality({targetFps:45,enabled:mode==="adaptive"});
    world.setMap(mapId);
    world.setRenderScale(1);
    world.resize();
    const delays=[];
    let last=null,start=null,lastAdapt=null,lastUi=null,scaleSum=0,scaleCount=0;
    let drawSum=0,triangleSum=0;
    let request=0,finished=false;
    function clean(){signal.removeEventListener("abort",cancel);if(request)cancelAnimationFrame(request);}
    function cancel(){
      if(finished)return;
      finished=true;clean();reject(new Error("Teste interrompido. Recomece com a tela ligada."));
    }
    signal.addEventListener("abort",cancel,{once:true});
    if(signal.aborted){cancel();return;}
    function render(now){
      if(finished)return;
      if(start===null)start=now;
      const elapsed=now-start;
      const dt=last===null?0:now-last;
      if(last!==null&&dt>0&&dt<1000&&elapsed>warmupMs){
        delays.push(dt);
        scaleSum+=world.getRenderScale();scaleCount++;
      }
      last=now;
      // Exactly the same 50 visible, animated runners for both comparison modes.
      avatars.animate(runners.active,"RUNNING",Math.min(.1,dt/1000),now);
      world.render(runners,Math.min(.1,dt/1000));
      if(elapsed>warmupMs&&dt>0&&dt<1000){
        drawSum+=world.renderer.info.render.calls;
        triangleSum+=world.renderer.info.render.triangles;
      }
      monitor.frame(now,world.renderer.info);
      if(lastAdapt===null||now-lastAdapt>=1000){
        lastAdapt=now;
        if(mode==="adaptive"){
          const adjustment=adaptation.update(monitor.snapshot(),now);
          if(adjustment.changed){
            world.setRenderScale(adjustment.scale);
            monitor.reset();
          }
        }
      }
      if(lastUi===null||now-lastUi>=350){
        lastUi=now;
        const fps=monitor.snapshot().fps;
        stepInfo(mapId,mode,index,Math.min(1,elapsed/trialMs),fps);
      }
      if(elapsed>=trialMs){
        finished=true;clean();
        const data=summarizeFrames(delays);
        data.scale=world.getRenderScale();
        data.avgScale=scaleCount?Math.round(scaleSum/scaleCount*100)/100:1;
        data.avgDrawCalls=scaleCount?Math.round(drawSum/scaleCount):0;
        data.avgTriangles=scaleCount?Math.round(triangleSum/scaleCount):0;
        data.mode=mode;
        resolve(data);
        return;
      }
      request=requestAnimationFrame(render);
    }
    request=requestAnimationFrame(render);
  });
}
function showReport(){
  $("results").hidden=false;
  const summary=benchmarkSummary(results);
  const pct=summary.deltaPercent;
  $("interpretation").textContent=interpretAdaptiveResult(results).conclusion;
  $("summaryText").textContent=summary.maps+"/5 mapas · "+summary.fixedFps+
    " FPS fixo / "+summary.adaptiveFps+" FPS Auto"+
    (pct===null?"":(" · "+(pct>0?"+":"")+pct+"%"));
  $("benchmarkRows").replaceChildren();
  for(const row of results){
    const line=document.createElement("div");line.className="result-row";
    const compare=compareTrials(row.fixed,row.adaptive);
    const left=document.createElement("div");
    const title=document.createElement("b");title.textContent=biome(row.mapId).emoji+" "+row.name;
    const note=document.createElement("span");note.className="note";
    note.textContent=compare.fixedFps+" FPS fixo · "+compare.adaptiveFps+
      " FPS Auto · resolução final "+Math.round(row.adaptive.scale*100)+
      "% · "+row.adaptive.avgDrawCalls+" draw calls · "+row.adaptive.avgTriangles+" triângulos";
    left.append(title,note);
    const delta=document.createElement("strong");
    delta.textContent=(compare.deltaPercent>0?"+":"")+compare.deltaPercent+"%";
    line.append(left,delta);
    $("benchmarkRows").append(line);
  }
  const memory=navigator.deviceMemory??"?";
  const cores=navigator.hardwareConcurrency??"?";
  const device=(navigator.platform||"Navegador")+" · "+memory+" GB estimados · "+
    cores+" núcleos declarados · "+innerWidth+"px viewport";
  $("reportText").value=formatBenchReport(results,{
    device,quality:rendererProfile,date:new Date().toLocaleString("pt-BR")
  });
}
function finishCleanup(){
  running=false;
  $("startTest").disabled=false;
  $("stopTest").disabled=true;
  controller=null;
  if(wakeLock){void wakeLock.release().catch(()=>{});wakeLock=null;}
}
async function begin(){
  if(running)return;
  running=true;results=[];
  $("results").hidden=true;
  $("startTest").disabled=true;$("stopTest").disabled=false;
  controller=new AbortController();
  setMessage("Preparando a comparação","Nenhum dado será enviado ao servidor. Mantenha o aparelho em primeiro plano.");
  try{
    if(navigator.wakeLock?.request){
      try{wakeLock=await navigator.wakeLock.request("screen");}catch{}
    }
    if(!world){
      world=createWorld(canvas,{quality:rendererProfile});
      avatars=createAvatars(world.scene,{quality:rendererProfile});
      avatars.sync(runners.active);
    }
    const plans=BIOME_ORDER.flatMap((mapId,i)=>{
      // Alternating order makes heating/order effects less one-sided.
      const modes=i%2===0?["fixed","adaptive"]:["adaptive","fixed"];
      return modes.map(mode=>({mapId,mode}));
    });
    for(let i=0;i<plans.length;i++){
      if(controller.signal.aborted)throw Error("Teste interrompido.");
      const {mapId,mode}=plans[i];
      setMessage(biome(mapId).name+" · "+(mode==="fixed"?"qualidade fixa":"qualidade automática"),
        "Etapa "+(i+1)+" de 10 · 50 corredores simulados · não envolve a LIVE ou a corrida oficial.");
      const sample=await doTrial(mapId,mode,i,controller.signal);
      let entry=results.find(x=>x.mapId===mapId);
      if(!entry){entry={mapId,name:biome(mapId).name};results.push(entry);}
      entry[mode]=sample;
    }
    $("testProgress").style.width="100%";
    $("progressLabel").textContent="10/10 etapas";
    showReport();
    setMessage("Teste concluído no seu aparelho","Role até o relatório e toque em COPIAR RESULTADO para enviar a comparação no ChatGPT.");
  }catch(error){
    setMessage("Teste não concluído",String(error?.message||error)+
      " O benchmark incompleto não é usado para afirmar ganho de desempenho.");
  }finally{finishCleanup();}
}
$("startTest").addEventListener("click",()=>void begin());
$("stopTest").addEventListener("click",()=>controller?.abort());
$("copyReport").addEventListener("click",async()=>{
  const value=$("reportText").value;
  if(!value)return;
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
    else {$("reportText").select();document.execCommand("copy");}
    $("copyReport").textContent="✓ RESULTADO COPIADO";
  }catch{
    $("reportText").focus();$("reportText").select();
    $("copyReport").textContent="Selecione e copie o texto acima";
  }
});
$("shareReport").addEventListener("click",async()=>{
  const value=$("reportText").value;
  if(navigator.share&&value)try{await navigator.share({text:value,title:"Benchmark Corrida dos Elementos"});}catch{}
  else $("reportText").select();
});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&running)controller?.abort();});
window.addEventListener("pagehide",()=>controller?.abort());
window.addEventListener("resize",()=>{if(world)world.resize();});
