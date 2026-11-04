import { BIOMES, BIOME_ORDER, TRACK_LENGTH, mapForRound, biome } from "./config.js";
import { createState, addDemo, register, rank, tick, countdown, advance, turbo, validateSavedState } from "./engine.js";
import { createWorld } from "./world.js";
import { createAvatars } from "./avatars.js";
import { connectRemote } from "./remote.js";

const STORAGE_KEY="elemental-race-browser-v1";
const byId=id=>document.getElementById(id);
const canvas=byId("raceCanvas");
const notice=byId("joinResponse");
let state;
let remoteMode=window.location.hostname.toLowerCase().endsWith(".onrender.com"),remote=null;
try {
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
  state=validateSavedState(saved)?saved:createState();
} catch { state=createState(); }
if(!remoteMode&&state.round===1&&state.active.length===0&&state.next.length===0&&state.phase==="LOBBY")addDemo(state,10);
state.paused=Boolean(state.paused);
let selectedPreviewMap="";
let world=null,avatars=null,displayedMap="",lastFrame=performance.now(),lastPaint=0,lastSave=0,shownRound=state.round;
let renderError=false;

try {
  world=createWorld(canvas);
  avatars=createAvatars(world.scene);
  displayedMap=state.mapId;
  world.setMap(displayedMap);
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
  if(remoteMode)return;
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
  byId("mapName").textContent=m.emoji+" "+m.name;
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
  const sorted=rank(state.active);
  const ranking=byId("rankingRows");
  if(sorted.length===0)ranking.innerHTML='<p class="empty-ranking">Aguardando inscritos na rodada atual...</p>';
  else ranking.innerHTML=sorted.slice(0,5).map((r,i)=>{
    const pct=Math.min(100,Math.floor(r.progress/TRACK_LENGTH*100));
    return '<div class="rank-row"><span class="rank-pos">'+String(i+1).padStart(2,"0")+
      '</span><span class="rank-avatar" style="background:'+r.color+'"></span><span class="rank-name">'+escapeHTML(r.name)+
      '</span><span class="rank-progress"><span style="width:'+pct+'%;background:'+r.color+
      '"></span></span><span class="rank-percent">'+pct+'%</span></div>';
  }).join("");
  byId("latestEvent").textContent=state.messages?.[0]?.text||"Aguardando eventos.";
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
  if(wanted!==displayedMap){world.setMap(wanted);displayedMap=wanted;world.resize();}
  avatars.sync(state.active);
  avatars.animate(state.active,state.phase,dt,now);
  world.render(state,dt);
}
function onFrame(now) {
  const delta=Math.min(Math.max(now-lastFrame,0),120);
  lastFrame=now;
  if(!document.hidden && !remoteMode)tick(state,delta);
  if(shownRound!==state.round){
    shownRound=state.round;
    selectedPreviewMap="";
    byId("mapPreview").value="";
    feedback("Rodada "+state.round+" iniciada: "+biome(state.mapId).name+". Inscrições anteriores encerradas.");
    persist();
  }
  if(now-lastPaint>=160){renderHud();lastPaint=now;}
  if(now-lastSave>=4000){persist();lastSave=now;}
  if(!renderError)updateWorld(delta/1000,now);
  requestAnimationFrame(onFrame);
}
async function adminRequest(action,params={}) {
  if(!remote)return null;
  const key=byId("adminKey").value.trim();
  if(!key){feedback("Informe o token ADMIN_KEY configurado no Render para controlar o motor remoto.",false);return null;}
  try {return await remote.action(action,params,key);}
  catch(e){feedback(e?.message||"Falha ao acessar o servidor",false);return null;}
}
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
document.addEventListener("visibilitychange",()=>{lastFrame=performance.now();if(document.hidden)persist();});
window.addEventListener("pagehide",persist);
renderHud();
if(remoteMode){
  byId("remoteMode").hidden=false;
  byId("remoteMode").textContent="● CONECTANDO AO RENDER";
  byId("serverPanel").hidden=false;
  byId("remoteStatus").textContent="Aguardando estado oficial — sem simulação local";
}
requestAnimationFrame(onFrame);
void connectRemote({
  onState(next){
    remoteMode=true;
    if(!validateSavedState(next)){console.warn("Snapshot remoto inválido");return;}
    state=next;
    byId("remoteMode").hidden=false;
    byId("remoteMode").textContent="● RENDER ONLINE · MOTOR NO SERVIDOR";
    byId("serverPanel").hidden=false;
    byId("modeDisclaimer").textContent="Render controla a corrida e compartilha o estado entre espectadores. Esta demonstração ainda não está conectada ao TikTok. A continuidade 24h depende de hospedagem sem suspensão.";
    renderHud();
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
