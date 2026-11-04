import { BIOMES, BIOME_ORDER, TRACK_LENGTH, mapForRound, biome } from "./config.js";
import { createState, addDemo, register, rank, tick, countdown, advance, turbo, validateSavedState, migrateSavedState, raceLength } from "./engine.js";
import { createWorld } from "./world.js";
import { createAvatars } from "./avatars.js";
import { connectRemote } from "./remote.js";
import { applyGiftEvent } from "./gifts.js";
import {seasonTop,recentWinners} from "./history.js";
import {getViewMode} from "./view.js";
import {qualityFromUrl,QUALITY_SETTINGS,shouldRender} from "./performance.js";
import {createFrameMonitor,gradePerformance} from "./metrics.js";
import {createAdaptiveQuality} from "./adaptive.js";
import {connectionMessage} from "./connection.js";

const STORAGE_KEY="elemental-race-browser-v1";
const byId=id=>document.getElementById(id);
document.body.dataset.view=getViewMode(window.location.search);
const showcase=document.body.dataset.view==="live"&&
  new URLSearchParams(window.location.search).get("showcase")==="1";
document.body.dataset.showcase=showcase?"on":"off";
const canvas=byId("raceCanvas");
const notice=byId("joinResponse");
const graphics=qualityFromUrl(window.location.search,{
  memory:navigator.deviceMemory,cores:navigator.hardwareConcurrency
});
const graphicsProfile=QUALITY_SETTINGS[graphics];
const requestedGraphics=new URLSearchParams(window.location.search).get("quality")||"auto";
const adaptiveQuality=createAdaptiveQuality({
  enabled:requestedGraphics==="auto",
  targetFps:graphicsProfile.targetFps
});
const performanceMonitor=createFrameMonitor({targetFps:graphicsProfile.targetFps});
const debugOverlay=new URLSearchParams(window.location.search).get("debug")==="1";
byId("perfOverlay").hidden=!debugOverlay;
let state;
let remoteMode=!showcase&&window.location.hostname.toLowerCase().endsWith(".onrender.com"),remote=null;
try {
  const saved=showcase?null:JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
  const migrated=migrateSavedState(saved);
  state=validateSavedState(migrated)?migrated:createState();
} catch { state=createState(); }
if(showcase){
  const names=["Luna","Bia","Nina","Raio","Theo","Mika","Sol","Zara","Ravi","Lua",
    "Kai","Pip","Ari","Max","Mel","Nox","Ivo","Eva","Léo","Cris"];
  for(let i=0;i<50;i++)register(state,"preview-"+i,names[i%names.length]+" "+(Math.floor(i/names.length)+1),"entrar");
  advance(state);advance(state); // Just the visual demo, never the authoritative Render motor.
} else if(!remoteMode&&state.round===1&&state.active.length===0&&state.next.length===0&&state.phase==="LOBBY")addDemo(state,10);
state.paused=Boolean(state.paused);
let selectedPreviewMap="";
let world=null,avatars=null,displayedMap="",displayedLength=0,lastFrame=performance.now(),lastPaint=0,lastSave=0,last3dFrame=0,lastPerfReport=0,shownRound=state.round;
let renderError=false;
let showcaseBoostRound=0;

try {
  world=createWorld(canvas,{quality:graphics});
  avatars=createAvatars(world.scene,{quality:graphics});
  displayedMap=state.mapId;
  displayedLength=raceLength(state);
  world.setMap(displayedMap,displayedLength);
  world.resize();
} catch(err) {
  console.error("WebGL initialization failed",err);
  renderError=true;
  byId("canvasError").hidden=false;
}
function escapeHTML(v) {
  return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function persist() {
  if(remoteMode||showcase)return;
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }catch(err){console.warn("localStorage unavailable",err);}
}
function feedback(message,ok=true) {
  notice.textContent=message;
  notice.classList.toggle("error",!ok);
}
function toTime(ms) {
  const seconds=Math.max(0,Math.floor(ms/1000));
  return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
}
function queueNames(rows) {
  if(!rows.length)return '<span style="color:#819f8b">Nenhum inscrito</span>';
  return rows.slice(0,50).map(r=>escapeHTML(r.name)+" <span style=\"opacity:.5\">("+escapeHTML(r.id)+")</span>").join("<br>");
}
function renderHud() {
  const m=biome(state.mapId);
  const distance=raceLength(state);
  byId("liveMiniFinish").textContent="🏁 "+distance+" m";
  document.body.dataset.phase=state.phase.toLowerCase();
  const leading=rank(state.active);
  const leadProgress=leading.length?Math.max(0,Number(leading[0].progress)||0):0;
  byId("liveTimer").textContent=toTime(state.raceMs);
  byId("liveRemaining").textContent=Math.max(0,Math.ceil(distance-leadProgress))+" m até a chegada";
  byId("liveRaceCount").textContent=state.active.length+"/50 corredores";
  byId("liveMiniMapName").textContent=m.emoji+" "+m.name;
  const mapWidget=byId("liveMiniMapName").closest(".live-minimap");
  mapWidget.dataset.biome=m.id;
  const mapLeader=byId("liveMapDot");
  mapLeader.hidden=leading.length===0;
  mapLeader.style.bottom=Math.min(100,leadProgress/distance*100)+"%";
  mapLeader.title=leading.length?leading[0].name+" · "+Math.floor(leadProgress)+"m":"";
  for(let i=1;i<=2;i++){
    const marker=byId("liveMapRival"+(i+1));
    const racer=leading[i];
    marker.hidden=!racer;
    if(racer){
      const progress=Math.max(0,Math.min(distance,Number(racer.progress)||0));
      marker.style.bottom=(progress/distance*100)+"%";
      marker.title=racer.name+" · "+Math.floor(progress)+"m";
    }
  }
  byId("liveWeatherTag").textContent=m.id==="ice"?"❄️ NEVE NA PISTA":"🌿 TRILHA DA FLORESTA";
  const boost=state.phase==="RUNNING"
    ?state.active.find(r=>r.turboUntil>state.raceMs&&r.status==="running"):null;
  const sprint=byId("liveSprintCard");
  sprint.hidden=!boost;
  if(boost)byId("liveSprintName").textContent=boost.name;
  byId("liveChatMessages").innerHTML=(state.messages||[]).slice(0,3)
    .map(event=>"<p>"+escapeHTML(event.text)+"</p>").join("")||"<p>Aguardando participantes...</p>";
  byId("mapName").textContent=m.name; // The biome ribbon already includes the emoji.
  byId("roundNumber").textContent="#"+String(state.round).padStart(3,"0");
  byId("playerCount").textContent=String(state.active.length);
  byId("phaseTime").textContent=countdown(state)+"s";
  byId("phaseName").textContent=(state.paused?"⏸ ":"")+({
    LOBBY:"LOBBY ABERTO",COUNTDOWN:"PREPARE-SE",RUNNING:"CORRIDA EM ANDAMENTO",RESULTS:"RESULTADOS"
  }[state.phase]);
  byId("arenaSub").textContent=selectedPreviewMap?"PRÉVIA VISUAL — "+biome(selectedPreviewMap).name:m.subtitle.toUpperCase();
  byId("arenaMessage").textContent=state.phase==="LOBBY"?"PRÓXIMA LARGADA":state.phase==="COUNTDOWN"?"PORTÕES FECHADOS":state.phase==="RUNNING"?"CORREDORES NA PISTA":"PÓDIO FINAL";
  byId("arenaElapsed").textContent=toTime(state.phase==="RUNNING"?state.raceMs:state.phaseMs);
  byId("raceChip").textContent=selectedPreviewMap?"PRÉVIA • NÃO OFICIAL":"CORRIDA AUTOMÁTICA";
  byId("countdownOverlay").hidden=state.phase!=="COUNTDOWN";
  if(state.phase==="COUNTDOWN")byId("countdownOverlay").textContent=String(countdown(state));
  const isResults=state.phase==="RESULTS";
  byId("resultsOverlay").hidden=!isResults;
  if(isResults) {
    const results=state.results.slice(0,3);
    byId("podiumList").innerHTML=results.length?results.map((r,i)=>
      '<div class="podium-row"><strong>'+["🥇","🥈","🥉"][i]+" "+escapeHTML(r.name)+'</strong><span>'+(r.finished?(r.finishTime/1000).toFixed(2)+"s":"Sem concluir")+"</span></div>"
    ).join(""):'<p class="empty-ranking">Sem participantes nesta rodada.</p>';
  }
  const sorted=leading;
  const ranking=byId("rankingRows");
  if(sorted.length===0)ranking.innerHTML='<p class="empty-ranking">Aguardando inscritos na rodada atual...</p>';
  else ranking.innerHTML=sorted.slice(0,5).map((r,i)=>{
    const pct=Math.min(100,Math.floor(r.progress/distance*100));
    return '<div class="rank-row"><span class="rank-pos">'+String(i+1).padStart(2,"0")+
      '</span><span class="rank-avatar" style="background:'+r.color+'"></span><span class="rank-name">'+escapeHTML(r.name)+
      '</span><span class="rank-progress"><span style="width:'+pct+'%;background:'+r.color+
      '"></span></span><span class="rank-percent">'+pct+'%</span><span class="rank-meters">'+Math.floor(r.progress||0)+'m</span></div>';
  }).join("");
  const leaders=seasonTop(state,3);
  const leadersPanel=byId("seasonLeaders");
  leadersPanel.innerHTML=leaders.length?leaders.map((entry,i)=>
    '<div class="season-row"><strong>'+["🥇","🥈","🥉"][i]+' '+escapeHTML(entry.name)+
    '</strong><span>'+Math.max(0,Number(entry.wins)||0)+' vitória'+(entry.wins===1?"":"s")+
    ' · '+Math.max(0,Number(entry.podiums)||0)+' pódios</span></div>'
  ).join(""):'<span class="season-empty">Aguardando primeira corrida concluída...</span>';
  const latest=recentWinners(state,1)[0];
  const recent=byId("recentChampion");
  recent.hidden=!latest;
  if(latest)recent.textContent="🏁 Último vencedor: "+latest.winner.name+
    " • Rodada #"+String(latest.round)+" • "+(latest.winner.timeMs/1000).toFixed(2)+"s";
  byId("latestEvent").textContent=state.messages?.[0]?.text||"Aguardando eventos.";
  const gifts=Array.isArray(state.gifts)?state.gifts.slice(0,3):[];
  const feed=byId("giftFeed");
  feed.hidden=gifts.length===0;
  feed.innerHTML=gifts.map(g=>{
    const title=(g.simulated?"[TESTE] ":"")+"🎁 "+escapeHTML(g.displayName)+" · "+escapeHTML(g.giftName)+
      (g.quantity>1?" ×"+g.quantity:"");
    const outcome=g.effect==="turbo"?"⚡ TURBO +4s":"💚 OBRIGADO!";
    return '<div class="gift-entry"><span>'+title+'</span><strong>'+outcome+'</strong></div>';
  }).join("");
  byId("nextMapText").textContent="PRÓXIMA: "+biome(mapForRound(state.round+1)).emoji+" "+biome(mapForRound(state.round+1)).name;
  byId("nextQueueCount").textContent=state.next.length+" NA FILA";
  byId("currentQueue").textContent=String(state.active.length);
  byId("nextQueue").textContent=String(state.next.length);
  byId("currentNames").innerHTML=queueNames(state.active);
  byId("nextNames").innerHTML=queueNames(state.next);
  byId("togglePause").textContent=state.paused?"▶ CONTINUAR MOTOR":"⏸ PAUSAR MOTOR";
  byId("turboButton").disabled=state.phase!=="RUNNING"||!state.active.some(r=>r.status==="running");
  byId("biomeRoute").innerHTML=BIOME_ORDER.map(id=>
    '<span class="'+(id===state.mapId?"active":"")+'">'+biome(id).emoji+" "+biome(id).name+"</span>"
  ).join("");
}
function updateWorld(dt,now) {
  if(!world||!avatars)return;
  const wanted=selectedPreviewMap||state.mapId;
  const length=raceLength(state);
  if(wanted!==displayedMap||length!==displayedLength){
    world.setMap(wanted,length);displayedMap=wanted;displayedLength=length;world.resize();
  }
  avatars.sync(state.active);
  avatars.animate(state.active,state.phase,dt,now);
  world.render(state,dt);
}
function onFrame(now) {
  const delta=Math.min(Math.max(now-lastFrame,0),120);
  lastFrame=now;
  if(!document.hidden && !remoteMode)tick(state,delta);
  // Showcase-only ability demonstration. No operator requests or database writes.
  if(showcase&&state.phase==="RUNNING"&&state.raceMs>=2200&&
    showcaseBoostRound!==state.round&&state.active.length){
    showcaseBoostRound=state.round;
    const best=rank(state.active)[0];
    if(best)turbo(state,best.id);
  }
  if(shownRound!==state.round){
    shownRound=state.round;
    if(showcase&&state.phase==="LOBBY"){
      for(let i=0;i<50;i++)register(state,"preview-"+i,"Corredor "+String(i+1).padStart(2,"0"),"entrar");
      advance(state);advance(state);
    }
    selectedPreviewMap="";
    byId("mapPreview").value="";
    feedback("Rodada "+state.round+" iniciada: "+biome(state.mapId).name+". Inscrições anteriores encerradas.");
    persist();
  }
  if(now-lastPaint>=160){renderHud();lastPaint=now;}
  if(now-lastSave>=4000){persist();lastSave=now;}
  if(!document.hidden&&!renderError&&shouldRender(now,last3dFrame,graphicsProfile.targetFps)){
    const drawDelta=last3dFrame?Math.min((now-last3dFrame)/1000,.2):delta/1000;
    updateWorld(drawDelta,now);
    performanceMonitor.frame(now,world?.renderer?.info);
    last3dFrame=now;
  }
  if(now-lastPerfReport>=1000){
    lastPerfReport=now;
    const metrics=performanceMonitor.snapshot();
    const adjustment=!document.hidden&&!renderError?adaptiveQuality.update(metrics,now):{changed:false};
    if(adjustment.changed&&world){
      world.setRenderScale(adjustment.scale);
      performanceMonitor.reset();
    }
    const adaptation=adaptiveQuality.status();
    const displayScale=Math.round(adaptation.scale*100);
    const qualityStatus=adaptation.enabled
      ?"Automático · resolução 3D "+displayScale+"% · cenário preservado"
      :"Perfil fixo · resolução 3D 100%";
    const assessment=gradePerformance(metrics);
    const info=metrics.samples
      ?metrics.fps+" FPS / meta "+metrics.targetFps+" · "+metrics.drawCalls+
        " chamadas 3D · P95 "+metrics.p95FrameMs+" ms · "+metrics.slowFramePercent+"% frames lentos"
      :"Medindo FPS neste aparelho...";
    byId("performanceReport").textContent=info+"\n"+qualityStatus+"\n"+assessment.text;
    if(debugOverlay){
      const badge=byId("perfOverlay");
      badge.textContent=metrics.samples?metrics.fps+"/"+metrics.targetFps+" FPS · "+displayScale+"% resolução · "+metrics.drawCalls+" draw calls":"Medindo FPS...";
      badge.dataset.level=assessment.level;
    }
  }
  requestAnimationFrame(onFrame);
}
async function adminRequest(action,params={}) {
  if(!remote)return null;
  const key=byId("adminKey").value.trim();
  if(!key){feedback("Informe o token ADMIN_KEY configurado no Render para controlar o motor remoto.",false);return null;}
  try {return await remote.action(action,params,key);}
  catch(e){feedback(e?.message||"Falha ao acessar o servidor",false);return null;}
}
function dateLabel(value){
  if(!value)return "Ainda não registrado";
  const time=new Date(value);
  return Number.isNaN(time.getTime())?"Data indisponível":time.toLocaleString("pt-BR");
}
byId("refreshStorage").addEventListener("click",async()=>{
  const box=byId("storageCheckReport");
  box.hidden=false;
  if(!remote){
    box.textContent="A verificação persistente exige o serviço Render. Este navegador usa simulação local.";
    return;
  }
  const token=byId("adminKey").value.trim();
  if(!token){box.textContent="Informe a ADMIN_KEY do Render para verificar o PostgreSQL.";return;}
  box.textContent="Consultando o banco por meio do servidor...";
  try{
    const d=await remote.storageCheck(token);
    const lines=[
      "💾 VERIFICAÇÃO DE PERSISTÊNCIA",
      "Armazenamento: "+(d.storage==="postgres"?"PostgreSQL":"Memória temporária"),
      "Banco acessível: "+(d.readable?"SIM":"NÃO"),
      "Snapshot válido: "+(d.validSnapshot===true?"SIM":d.validSnapshot===false?"NÃO":"NÃO APLICÁVEL"),
      "Corrida recuperada na última inicialização: "+(d.recoveredOnBoot?"SIM":"NÃO"),
      "Rodada restaurada: "+(d.recoveredRound??"Nenhuma"),
      "Última rodada salva: "+(d.persistedRound??"Não registrada"),
      "Rodada em execução: "+(d.currentRound??"Não disponível"),
      "Gravação pendente: "+(d.unflushedChanges?"SIM":"NÃO"),
      "Última gravação deste processo: "+dateLabel(d.persistedAt)
    ];
    box.textContent=lines.join("\n");
  }catch(err){
    box.textContent="Verificação indisponível: "+String(err?.message||err);
  }
});
byId("refreshDiagnostics").addEventListener("click",async()=>{
  const panel=byId("diagnosticReport");
  panel.hidden=false;
  if(!remote){
    panel.textContent="Este painel só funciona no serviço Render. No GitHub Pages, os eventos são locais e simulados.";
    return;
  }
  const key=byId("adminKey").value.trim();
  if(!key){
    panel.textContent="Informe a ADMIN_KEY do Render acima para consultar os contadores privados.";
    return;
  }
  panel.textContent="Consultando estado do conector no Render...";
  try{
    const d=await remote.diagnostics(key);
    const c=d.connector,e=d.events,g=d.game,p=d.persistence;
    const reason={
      live_not_active:"Conta não está transmitindo",
      connection_failed:"Falha de conexão",
      disconnected:"Conexão interrompida",
      stream_ended:"A transmissão foi encerrada"
    }[c.lastIssue]||c.lastIssue||"Nenhuma falha registrada";
    const lines=[
      "📡 DIAGNÓSTICO DA LIVE",
      "Conexão TikTok: "+(c.connected?"CONECTADA":c.enabled?"AGUARDANDO":"DESATIVADA"),
      "Motivo atual: "+(c.connected?"Conectado":reason),
      "Tentativas de conexão: "+c.attempts,
      "Última conexão confirmada: "+dateLabel(c.lastConnectedAt),
      "",
      "💬 COMENTÁRIOS REAIS",
      "Eventos observados: "+e.chatObserved,
      "Comando entrar reconhecido: "+e.enterRecognized,
      "Inscrições aceitas: "+e.registrationsAccepted,
      "Inscrições rejeitadas: "+e.registrationsRejected,
      "Último comentário: "+dateLabel(e.lastChatAt),
      "",
      "🎁 PRESENTES REAIS",
      "Eventos recebidos: "+e.giftObserved,
      "Presentes finalizados: "+e.giftFinalized,
      "Presentes processados: "+e.giftsApplied,
      "Duplicatas ignoradas: "+e.duplicateGifts,
      "Turbos aplicados: "+e.turbosApplied,
      "Presentes de teste (separados): "+e.simulatedGifts,
      "",
      "🏁 ESTADO ATUAL",
      "Rodada: "+g.round+" | Fase: "+g.phase,
      "Na corrida: "+g.current+" | Próxima fila: "+g.next,
      "Espectadores conectados ao jogo: "+g.viewers,
      "Banco: "+(p.storage==="postgres"?(p.healthy?"PostgreSQL OK":"Falha na gravação"):"Somente memória"),
      "",
      "Contadores a partir de "+dateLabel(d.startedAt)+".",
      "Sem conexão com uma LIVE real, os contadores reais permanecem zerados."
    ];
    panel.textContent=lines.join("\n");
  }catch(error){
    panel.textContent="Não foi possível verificar: "+String(error?.message||error);
  }
});

byId("joinForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const input={userId:byId("userId").value,displayName:byId("userName").value,content:byId("chatContent").value};
  if(remoteMode){
    const response=await adminRequest("join",input);
    if(response){feedback("Inscrição remota confirmada na rodada "+response.result.round+" ("+response.result.queue+").");renderHud();}
    return;
  }
  const result=register(state,input.userId,input.displayName,input.content);
  feedback(result.ok?"Inscrição CONFIRMADA na rodada "+result.round+" ("+result.queue+").":result.reason,result.ok);
  renderHud();persist();
});
byId("togglePause").addEventListener("click",async()=>{
  if(remoteMode){
    const response=await adminRequest(state.paused?"resume":"pause");
    if(response)feedback(state.paused?"Motor remoto pausado":"Motor remoto retomado");
    return;
  }
  state.paused=!state.paused;
  feedback(state.paused?"Motor pausado neste navegador.":"Motor retomado neste navegador.");
  renderHud();persist();
});
byId("nextPhase").addEventListener("click",async()=>{
  if(remoteMode){const response=await adminRequest("advance");if(response)feedback("Fase remota alterada: "+state.phase);return;}
  advance(state);
  feedback("Fase alterada: "+state.phase+" — rodada "+state.round+".");
  renderHud();persist();
});
byId("addDemo").addEventListener("click",async()=>{
  if(remoteMode){const response=await adminRequest("add-demo");if(response)feedback((response.added||0)+" inscritos adicionados ao Render.");return;}
  const count=addDemo(state,10);
  feedback(count?count+" corredores fictícios adicionados.":"IDs demo já inscritos nesta rodada; nenhum duplicado.",Boolean(count));
  renderHud();persist();
});
byId("turboButton").addEventListener("click",async()=>{
  const runner=rank(state.active).find(r=>r.status==="running");
  if(remoteMode){const response=await adminRequest("turbo",{userId:runner?.id});if(response)feedback("Turbo remoto aplicado em "+(runner?.name||"corredor"));return;}
  feedback(runner&&turbo(state,runner.id)?"Turbo aplicado em "+runner.name+" por 5 segundos.":"Turbo disponível apenas durante a corrida.",Boolean(runner));
  renderHud();persist();
});
byId("giftTest").addEventListener("click",async()=>{
  const runner=rank(state.active).find(r=>r.status==="running")??rank(state.active)[0];
  if(!runner){feedback("Não há corredor inscrito para receber um presente de teste.",false);return;}
  if(remoteMode){
    const result=await adminRequest("gift-test",{userId:runner.id});
    if(result)feedback("Presente SIMULADO: "+(result.effect==="turbo"?"turbo ativado":"agradecimento sem turbo"));
  }else{
    const result=applyGiftEvent(state,{userId:runner.id,displayName:runner.name,
      giftName:"Rosa de teste",giftId:"demo-rose",repeatCount:1,simulated:true});
    feedback(result.ok?"Presente SIMULADO: "+(result.effect==="turbo"?"turbo ativado":"agradecimento sem turbo"):result.reason,result.ok);
    renderHud();persist();
  }
});
const qualityControl=byId("graphicsQuality");
const graphicsParams=new URL(window.location.href);
qualityControl.value=graphicsParams.searchParams.get("quality")||"auto";
byId("graphicsInfo").textContent=(adaptiveQuality.status().enabled?"Auto adaptativo: ":"Perfil fixo: ")+
  graphicsProfile.name+" · até "+graphicsProfile.targetFps+
  " FPS · a resolução muda automaticamente apenas no modo Auto";
byId("applyGraphics").addEventListener("click",()=>{
  const selected=qualityControl.value;
  const url=new URL(window.location.href);
  if(selected==="auto")url.searchParams.delete("quality");
  else url.searchParams.set("quality",selected);
  window.location.assign(url.toString());
});
byId("mapPreview").addEventListener("change",event=>{
  const id=event.target.value;
  selectedPreviewMap=Object.prototype.hasOwnProperty.call(BIOMES,id)?id:"";
  feedback(selectedPreviewMap?"Visualizando "+biome(selectedPreviewMap).name+" (somente cenário; rodada e ranking não mudam).":"Voltando ao mapa oficial.");
  renderHud();
});
byId("resetDemo").addEventListener("click",async()=>{
  if(!window.confirm(remoteMode?"Zerar a corrida e filas de TODOS os espectadores conectados ao Render?":"Reiniciar somente esta demonstração local?"))return;
  if(remoteMode){
    const result=await adminRequest("reset",{confirm:"RESET_DEMO"});
    if(result)feedback("Demonstração no servidor reiniciada");
    return;
  }
  state=createState();addDemo(state,10);shownRound=1;selectedPreviewMap="";
  byId("mapPreview").value="";
  feedback("Demonstração reiniciada com 10 corredores fictícios.");
  renderHud();persist();
});
window.addEventListener("resize",()=>world?.resize(),{passive:true});
document.addEventListener("visibilitychange",()=>{
  lastFrame=performance.now();
  last3dFrame=0;
  performanceMonitor.reset();
  adaptiveQuality.reset();
  if(document.hidden)persist();
});
window.addEventListener("pagehide",persist);
renderHud();
if(remoteMode){
  byId("remoteMode").hidden=false;
  byId("remoteMode").textContent="● CONECTANDO AO RENDER";
  byId("serverPanel").hidden=false;
  byId("remoteStatus").textContent="Aguardando estado oficial — sem simulação local";
}
requestAnimationFrame(onFrame);
if(showcase){
  byId("remoteMode").hidden=false;
  byId("remoteMode").textContent="● PRÉVIA VISUAL LOCAL · 50 CORREDORES FICTÍCIOS";
  byId("tiktokStatus").hidden=false;
  byId("tiktokStatus").textContent="● SEM CONEXÃO COM O TIKTOK";
  byId("streamTag").textContent="● PRÉVIA";
  byId("joinCta").classList.add("prelaunch");
  byId("joinCtaTop").textContent="APENAS DEMONSTRAÇÃO VISUAL";
  byId("joinCtaTitle").textContent="50 CORREDORES FICTÍCIOS";
  byId("joinCtaBottom").textContent="SEM CHAT OU PRESENTES REAIS";
}
if(!showcase)void connectRemote({
  onState(next,meta={}){
    remoteMode=true;
    const current=migrateSavedState(next);
    if(!validateSavedState(current)){console.warn("Snapshot remoto inválido");return;}
    state=current;
    byId("remoteMode").hidden=false;
    byId("remoteMode").textContent="● RENDER ONLINE · MOTOR NO SERVIDOR";
    byId("serverPanel").hidden=false;
    if(typeof meta.tiktokEnabled==="boolean"){
      byId("tiktokStatus").hidden=false;
      byId("tiktokStatus").textContent=meta.liveEventsMode==="staged"
        ?"● PRÉ-LANÇAMENTO · CHAT REAL DESATIVADO"
        :meta.tiktokConnected?"● TIKTOK CHAT CONECTADO"
        :meta.tiktokEnabled?"● TIKTOK AGUARDANDO LIVE":"● TIKTOK NÃO CONFIGURADO";
      byId("streamTag").textContent=meta.tiktokConnected?"● CHAT LIVE":"● DEMO";
      const prelaunch=meta.liveEventsMode==="staged";
      byId("joinCta").classList.toggle("prelaunch",prelaunch);
      byId("joinCtaTop").textContent=prelaunch?"JOGO EM DESENVOLVIMENTO":"PARTICIPE DA CORRIDA";
      byId("joinCtaTitle").innerHTML=prelaunch
        ?"PRÉ-LANÇAMENTO"
        :"DIGITE <span>ENTRAR</span> NO CHAT";
      byId("joinCtaBottom").textContent=prelaunch
        ?"CHAT REAL DESATIVADO • TESTES NO PAINEL DO OPERADOR"
        :"UMA INSCRIÇÃO POR CORRIDA • SEM REINSCRIÇÃO AUTOMÁTICA";
    }
    if(meta.storage){
      const badge=byId("dbStatus");
      badge.hidden=false;
      badge.textContent=meta.storage==="postgres"
        ?(meta.storageHealthy?"● POSTGRESQL CONECTADO":"● FALHA AO SALVAR NO POSTGRESQL")
        :"● SALVAMENTO TEMPORÁRIO • MEMÓRIA";
      badge.style.color=meta.storage==="postgres"&&meta.storageHealthy?"#cbff91":"#ffd7a0";
    }
    byId("modeDisclaimer").textContent="O Render compartilha a corrida entre espectadores. Leitura de chat TikTok e transmissão de vídeo são serviços diferentes. Funcionamento 24h exige hospedagem sem suspensão e armazenamento persistente.";
    renderHud();
  },
  onConnection(status){
    if(!remoteMode)return;
    byId("remoteMode").textContent=connectionMessage(status.phase);
    document.body.dataset.connection=status.phase;
    const warning=byId("connectionNotice");
    const lost=["stale","reconnecting","connecting"].includes(status.phase);
    warning.hidden=!lost;
    warning.textContent=status.phase==="stale"
      ?"⚠ O servidor não está respondendo. A imagem da corrida está congelada até a reconexão."
      :status.phase==="reconnecting"
        ?"Reconectando ao motor Render. A última rodada recebida está congelada."
        :"Conectando ao Render. Aguardando estado oficial da corrida.";
  },
  onRestart(){
    // A restarted Render instance has a new process ID. The latest official state
    // is already received before this callback; do not reset or recreate the race.
    feedback("O Render reiniciou. Estado oficial sincronizado novamente.");
  },
  onStatus(text){byId("remoteStatus").textContent=text;}
}).then(client=>{
  if(client){
    remote=client;remoteMode=true;
    feedback("Modo remoto habilitado. Comandos administrativos exigem ADMIN_KEY.");
  }else{
    byId("remoteMode").textContent="● MODO LOCAL • GITHUB PAGES";
    byId("remoteMode").hidden=false;
    byId("remoteStatus").textContent="Simulador local — para servidor compartilhado, abra a URL do Render";
  }
}).catch(e=>console.error("Falha ao identificar o Render",e));
