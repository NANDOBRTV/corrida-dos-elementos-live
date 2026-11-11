
import {createStudioScene} from "./studio-scene.js";
import {studioCourseAt,studioCameraShot,STUDIO_SHOTS} from "./studio-camera.js";
import {createStudioState,studioFillBots,studioTick,studioRank,studioGift,studioJoin} from "./studio-engine.js";
import {LIVE_STUDIO} from "./config.js";
import {resolveVehicle,parseVehicleChoice,HERO_CAR_IDS} from "./vehicles.js";
import {createStudioCommentary,createStudioVoice} from "./studio-commentary.js";

const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const text=(node,value)=>{if(node)node.textContent=String(value??"");};
const asNum=(value,otherwise=0)=>Number.isFinite(Number(value))?Number(value):otherwise;
const shortName=(value,max=20)=>String(value??"").trim().slice(0,max)||"Corredor";
const METERS=LIVE_STUDIO.defaultDistance;
const PHOTO_HOST="rbxcdn.com";

/**
 * Browser watchdog (only for the new broadcast renderer).
 * A stopped graphics loop is different from a stopped race engine:
 * this code never modifies participant data or injects gameplay events.
 */
export const STUDIO_WATCHDOG=Object.freeze({
  frameTimeoutMs:30000,
  packetProbeMs:30000,
  packetReloadMs:45000,
  startupGraceMs:65000,
  intervalMs:5000,
  retryWindowMs:15*60*1000,
  maxReloads:3
});
const RECOVERY_SESSION_KEY="corrida-studio-v5-watchdog-reload-history";
export function studioRecoveryReason({
  now,lastGoodFrameAt,lastPacketAt,startedAt,hasState,
  preview=false,visible=true,online=true,contextLostAt=null
}={}){
  if(!visible||!online||!Number.isFinite(now))return null;
  if(Number.isFinite(contextLostAt)&&now-contextLostAt>=STUDIO_WATCHDOG.frameTimeoutMs)
    return "webgl-context-lost";
  if(hasState&&now-lastGoodFrameAt>=STUDIO_WATCHDOG.frameTimeoutMs)
    return "animation-stalled";
  if(!preview){
    if(!hasState&&now-startedAt>=STUDIO_WATCHDOG.startupGraceMs)
      return "initial-state-timeout";
    if(hasState&&now-lastPacketAt>=STUDIO_WATCHDOG.packetReloadMs)
      return "server-state-timeout";
  }
  return null;
}

const MARKUP=[
  "<main id='studioLive' class='studio-stage' role='main' aria-label='Transmissão da Corrida dos Elementos'>",
    "<canvas id='studioCanvas' aria-label='Corrida voxel 3D com câmera fixa atrás do pelotão'></canvas>",
    "<header class='studio-channel'>",
      "<div class='studio-channel-icon' aria-hidden='true'>⚡</div>",
      "<div class='studio-channel-info'>",
        "<strong class='studio-channel-name'>CORRIDA DOS ELEMENTOS</strong>",
        "<span><b id='studioLikes'>0</b> curtidas</span>",
        "<button id='studioFollow' class='studio-follow' type='button'>Seguir</button>",
      "</div>",
    "</header>",
    "<div class='studio-chips' aria-label='Categorias da transmissão'>",
      "<span>LIVE MATCH</span><span>RANKING SEMANAL</span>",
    "</div>",
    "<aside class='studio-viewers' aria-label='Espectadores'>",
      "<div id='studioViewerFaces' class='studio-viewer-faces'></div>",
      "<div class='studio-viewer-count'><b id='studioViewerTotal'>—</b><span>vendo</span></div>",
    "</aside>",
    "<section class='studio-ranking' aria-label='LIVE RANKING'>",
      "<div class='studio-panel-title'><span class='studio-live-dot'></span>LIVE RANKING</div>",
      "<ol id='studioRankRows' class='studio-ranking-rows'></ol>",
    "</section>",
    "<aside class='studio-vehicle-mini' aria-label='Mini lista de veículos na pista'>",
      "<strong class='studio-vehicle-mini-title'>🚗 VEÍCULOS NA PISTA</strong>",
      "<ol id='studioVehicleList' class='studio-vehicle-mini-rows'></ol>",
    "</aside>",
    "<div id='studioCameraLabel' class='studio-camera-label' hidden aria-live='off'></div>",
    "<button id='studioNarratorToggle' class='studio-narrator-toggle' type='button' aria-pressed='false' aria-label='Ativar narração esportiva'>🎙️ ATIVAR NARRADOR</button>",
    "<div id='studioNarratorCaption' class='studio-narrator-caption' role='status' aria-live='off' hidden></div>",
    "<aside class='studio-race-data' aria-label='Informações da corrida'>",
      "<div class='studio-race-time' id='studioRaceTime'>0:00</div>",
      "<div class='studio-race-remaining'><span aria-hidden='true'>⚑</span><b id='studioRemaining'>1200 m</b><span>restantes</span></div>",
      "<div class='studio-race-count'><b id='studioRunnerCount'>0/100</b><span>corredores</span></div>",
    "</aside>",
    "<div class='studio-minimap' aria-label='Minimapa da pista'>",
      "<svg id='studioMap' viewBox='0 0 180 180' preserveAspectRatio='xMidYMid meet' aria-hidden='true'>",
        "<path id='studioMapPath' fill='none' stroke='white' stroke-width='5' stroke-linejoin='round' stroke-linecap='round'></path>",
        "<g id='studioMapRunners'></g>",
      "</svg>",
    "</div>",
    "<div id='studioPlates' class='studio-plates' aria-label='Identificação dos líderes'></div>",
    "<div id='studioOpening' class='studio-opening' hidden>",
      "<span id='studioOpeningTitle'>INSCRIÇÕES ABERTAS</span>",
      "<strong id='studioOpeningClock'>60</strong>",
      "<small id='studioOpeningHint'>DIGITE O MODELO: CIVIC, GOL OU CG 160</small>",
    "</div>",
    "<div id='studioGuide' class='studio-guide'>",
      "<strong>ESCOLHA SEU VEÍCULO</strong>",
      "<span>COMENTE <b>Civic, Gol ou CG 160</b></span>",
      "<small>20 CARROS • 10 MOTOS • SEM SORTEIO</small>",
    "</div>",
    "<div id='studioFeatureCard' class='studio-feature-card' hidden aria-live='off'>",
      "<div class='studio-feature-avatar' id='studioFeatureAvatar'>⚡</div>",
      "<strong id='studioFeatureName'>Corredor</strong>",
      "<span id='studioFeaturePower'>⚡ IMPULSO</span>",
      "<small id='studioFeatureLabel'>DEMONSTRAÇÃO</small>",
    "</div>",
    "<div id='studioCountdown' class='studio-countdown' hidden aria-live='off'>3</div>",
    "<div id='studioWinner' class='studio-winner' hidden>",
      "<span>🏆 VENCEDOR</span><strong id='studioWinnerName'>Corredor</strong>",
      "<small>1º LUGAR</small>",
    "</div>",
    "<section class='studio-chat' aria-label='Últimas mensagens da transmissão'>",
      "<div class='studio-chat-title'>CHAT AO VIVO</div>",
      "<div id='studioChatEntries' class='studio-chat-entries'></div>",
    "</section>",
    "<aside class='studio-interactions' aria-label='Interações da corrida'>",
      "<div class='studio-action-row'>",
        "<button id='studioBoost' class='studio-action boost' type='button'>IMPULSO <span>⬆️⚡</span></button>",
        "<button id='studioJoin' class='studio-action join' type='button'>ENTRAR <span>💬✚</span></button>",
        "<button id='studioSprint' class='studio-action sprint' type='button'>TURBO <span>🔥➤</span></button>",
      "</div>",
      "<div class='studio-social-actions'>",
        "<button id='studioPeople' type='button' aria-label='Participantes'>♟</button>",
        "<button id='studioGifts' type='button' aria-label='Presentes'>🎁</button>",
        "<button id='studioShare' type='button' aria-label='Compartilhar'>↗</button>",
      "</div>",
    "</aside>",
    "<a class='studio-credits-link' href='/assets/hero-credits.html' target='_blank' rel='noopener noreferrer' aria-label='Créditos dos modelos 3D'>ⓘ Créditos 3D</a>",
    "<div id='studioToast' class='studio-toast' role='status' hidden></div>",
  "</main>"
].join("");

function safePhoto(raw){
  if(typeof raw!=="string"||raw.length>700)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||
      (url.hostname!==PHOTO_HOST&&!url.hostname.endsWith("."+PHOTO_HOST)))
      return null;
    return url.href;
  }catch{return null;}
}
function element(tag,className,value){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=String(value);
  return node;
}
// Original 32px pixel portraits replace letter-only placeholders in the
// ranking, nameplates, viewer chips and event card. No platform assets used.
const portraitCache=new Map();
function voxelPortrait(name,color="#86a8d7"){
  // A sharp 32px pixel-art picture of the CHOSEN VEHICLE, never a human face.
  const model=resolveVehicle(name);
  const key=String(model?.id??name)+"|"+String(color);
  if(portraitCache.has(key))return portraitCache.get(key);
  const canvas=document.createElement("canvas");
  canvas.width=32;canvas.height=32;
  const ctx=canvas.getContext("2d");
  ctx.imageSmoothingEnabled=false;
  const rect=(x,y,w,h,fill)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);};
  const c=/^#[0-9a-f]{6}$/i.test(color)?color:"#d95843";
  rect(0,0,32,32,"#26384e");
  for(let i=0;i<5;i++)rect(i*7,0,1,32,"#718ca738");
  if(model?.kind==="motorcycle"){
    rect(13,3,6,5,"#22232b");rect(13,24,6,5,"#22232b");
    rect(11,6,10,3,"#adb9c1");
    rect(13,8,6,18,c);
    rect(10,11,12,6,"#a7bbc9");
    rect(12,19,8,5,"#1b2128");
    rect(8,6,16,2,"#bec7d0");
    rect(14,4,4,3,"#f7e8b8");
  }else{
    const pickup=model?.shape==="pickup";
    const suv=model?.shape==="suv";
    const long=/sedan|muscle/.test(model?.shape??"");
    const width=suv?20:18;
    const left=(32-width)/2;
    const front=long?3:5,rear=long?29:27;
    rect(left-3,front+4,3,6,"#13181c");
    rect(left+width,front+4,3,6,"#13181c");
    rect(left-3,rear-10,3,6,"#13181c");
    rect(left+width,rear-10,3,6,"#13181c");
    rect(left,front,width,rear-front,c);
    rect(left+2,front+5,width-4,long?10:9,"#263a51");
    if(!pickup)rect(left+2,rear-8,width-4,4,"#364b5f");
    else rect(left+2,rear-10,width-4,8,"#5d6370");
    rect(left+2,front+1,4,2,"#fff0be");
    rect(left+width-6,front+1,4,2,"#fff0be");
    rect(left+2,rear-2,4,2,"#fd5454");
    rect(left+width-6,rear-2,4,2,"#fd5454");
    rect(left+2,front+17,width-4,1,"#172c38");
  }
  const result=canvas.toDataURL("image/png");
  if(portraitCache.size>=150)
    portraitCache.delete(portraitCache.keys().next().value);
  portraitCache.set(key,result);
  return result;
}
function avatarChip(profile,name,color){
  const holder=element("span","studio-avatar");
  holder.style.setProperty("--avatar-color",color||"#81b9d5");
  const source=safePhoto(profile?.avatarUrl)||voxelPortrait(name,color);
  holder.textContent=shortName(name,1).toUpperCase();
  if(source){
    const img=document.createElement("img");
    img.alt="";
    img.referrerPolicy="no-referrer";
    // Images not attached to the DOM cannot load while marked lazy.
    // Load eagerly, install the handler first, then set src so the 32px
    // cached portrait renders in ranking / viewer chips immediately.
    img.loading="eager";
    img.decoding="async";
    img.addEventListener("load",()=>holder.replaceChildren(img),{once:true});
    img.src=source;
  }
  return holder;
}
function elapsedTime(ms){
  const total=Math.max(0,Math.floor(asNum(ms)/1000));
  return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
}
function openingSeconds(state){
  const limit=state.phase==="COUNTDOWN"?LIVE_STUDIO.countdownMs:
    LIVE_STUDIO.lobbyMs;
  return Math.max(0,Math.ceil((limit-asNum(state.phaseMs))/1000));
}
function standings(state){
  if(Array.isArray(state.leaderboard)&&state.leaderboard.length)return state.leaderboard;
  const active=Array.isArray(state.active)?state.active:[];
  return studioRank(active).slice(0,5).map((r,i)=>({
    id:r.id,name:r.name,position:i+1,
    meters:Math.floor(asNum(r.progress)),color:r.color
  }));
}
function trackMap(distance){
  const length=clamp(Math.round(asNum(distance,METERS)),1000,1500);
  const points=[];
  for(let d=0;d<=length;d+=5){
    const p=studioCourseAt(d);
    points.push({distance:d,x:p.x,z:p.z});
  }
  if(points.at(-1)?.distance!==length){
    const p=studioCourseAt(length);
    points.push({distance:length,x:p.x,z:p.z});
  }
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of points){
    minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
  }
  const project=p=>({
    x:14+(p.x-minX)/Math.max(1,maxX-minX)*152,
    y:166-(p.z-minZ)/Math.max(1,maxZ-minZ)*152
  });
  const projected=points.map(project);
  const path=projected.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
  function point(progress){
    const p=studioCourseAt(clamp(asNum(progress),0,length));
    return project(p);
  }
  return {length,path,point};
}
function chooseFeatured(state){
  if(state.phase==="RUNNING")
    return studioCameraShot(state).featuredId;
  if(state.phase==="RESULTS")return state.results?.[0]?.id??null;
  return null;
}
export async function startStudioLive({preview=false}={}){
  document.body.classList.add("studio-live-active");
  document.body.replaceChildren();
  const main=document.createElement("div");
  main.innerHTML=MARKUP;
  const stage=main.firstElementChild;
  document.body.append(stage);
  const params=new URLSearchParams(location.search);
  const qualityParam=(params.get("quality")||"").toLowerCase();
  const deviceMemory=navigator.deviceMemory;
  const premiumRequested=qualityParam==="high"||qualityParam==="ultra";
  const low=qualityParam==="low"||(!premiumRequested&&deviceMemory&&deviceMemory<=4);
  let world;
  try{
    world=createStudioScene($("studioCanvas"),{
      quality:low?"low":qualityParam==="ultra"?"ultra":
        premiumRequested?"high":"balanced",
      shadows:false
    });
  }catch(error){
    // Canvas failures are not mistaken for an online race; the legacy
    // page can only be restored by the loader before body replacement.
    text($("studioOpeningTitle"),"CENÁRIO INDISPONÍVEL");
    throw error;
  }
  const liveState={
    source:null,lastPacketAt:0,round:-1,profiles:new Map(),
    map:null,lastChatKey:"",lastRankKey:"",lastVehicleKey:"",plateNodes:new Map(),
    latestFrameAt:0,lastUiAt:0,lastPlateAt:0,lastFacesKey:"",fpsAccum:0,
    fpsFrames:0,lastPerfAt:performance.now(),qualityScale:1,
    previousPhase:null,toastTimer:null,connection:null,closed:false,
    startedAt:performance.now(),lastGoodFrameAt:performance.now(),
    contextLostAt:null,renderErrors:0,reloading:false,
    monitoring:false,watchdogLastProbeAt:0,resumedAt:0
  };
  const ui={
    likes:$("studioLikes"),viewers:$("studioViewerTotal"),
    faces:$("studioViewerFaces"),rank:$("studioRankRows"),
    vehicleList:$("studioVehicleList"),cameraLabel:$("studioCameraLabel"),
    narratorButton:$("studioNarratorToggle"),narratorCaption:$("studioNarratorCaption"),
    time:$("studioRaceTime"),remaining:$("studioRemaining"),
    count:$("studioRunnerCount"),mapPath:$("studioMapPath"),
    mapRunners:$("studioMapRunners"),chat:$("studioChatEntries"),
    plates:$("studioPlates"),opening:$("studioOpening"),
    openingTitle:$("studioOpeningTitle"),
    openingClock:$("studioOpeningClock"),
    openingHint:$("studioOpeningHint"),
    countdown:$("studioCountdown"),winner:$("studioWinner"),
    winnerName:$("studioWinnerName"),toast:$("studioToast"),
    featureCard:$("studioFeatureCard"),featureAvatar:$("studioFeatureAvatar"),
    featureName:$("studioFeatureName"),featurePower:$("studioFeaturePower"),
    featureLabel:$("studioFeatureLabel")
  };
  function toast(message){
    text(ui.toast,message);
    ui.toast.hidden=false;
    clearTimeout(liveState.toastTimer);
    liveState.toastTimer=setTimeout(()=>{ui.toast.hidden=true;},3300);
  }
  const raceCommentary=createStudioCommentary();
  let captionTimer=null;
  const speaker=createStudioVoice({
    onCaption:line=>{
      clearTimeout(captionTimer);
      text(ui.narratorCaption,line);
      ui.narratorCaption.hidden=!line;
      if(line)captionTimer=setTimeout(()=>{
        ui.narratorCaption.hidden=true;
      },6800);
    },
    onStatus:status=>{
      const active=speaker.state().enabled;
      ui.narratorButton.setAttribute("aria-pressed",String(active));
      ui.narratorButton.textContent=active?"🎙️ NARRADOR LIGADO":"🎙️ ATIVAR NARRADOR";
      if(status==="error")toast("A voz não pôde ser reproduzida. Confira o áudio do navegador.");
    }
  });
  if(!speaker.state().supported){
    ui.narratorButton.textContent="🎙️ VOZ INDISPONÍVEL";
    ui.narratorButton.disabled=true;
    ui.narratorButton.title="Abra no Chrome para usar voz em português.";
  }
  ui.narratorButton.addEventListener("click",()=>{
    if(speaker.state().enabled){
      speaker.disable();
      toast("Narração desligada.");
    }else{
      raceCommentary.reset();
      if(speaker.enable())toast("Narrador ligado: áudio em português brasileiro.");
      else toast("Narração indisponível neste navegador.");
    }
  });
  $("studioFollow").addEventListener("click",()=>
    toast("Toque em Seguir no perfil do canal da transmissão."));
  $("studioJoin").addEventListener("click",()=>{
    if(!preview){
      toast("No chat, escreva Civic, Gol ou CG 160; também vale entrar Civic.");
      return;
    }
    // Native prompt is used ONLY after an explicit tap in an offline preview:
    // lets the owner exercise the same catalog parser without LIVE credentials.
    const typed=window.prompt("TESTE DO CHAT: digite Civic, Gol, CG 160 ou outro modelo:");
    if(typed===null)return;
    const vehicle=parseVehicleChoice(typed);
    if(!vehicle){toast("Modelo não encontrado. Escolha um dos 20 carros ou 10 motos.");return;}
    if(!previewState)return;
    if(previewState.phase==="LOBBY"){
      // Demonstration replaces a bot instead of inflating the 20/100 lineup.
      const prior=previewState.active.findIndex(r=>r.id==="demo-selecao");
      if(prior>=0)previewState.active.splice(prior,1);
      else{
        const last=previewState.active.findLastIndex(r=>r.isBot);
        if(last>=0)previewState.active.splice(last,1);
      }
    }
    const result=studioJoin(previewState,{
      userId:"demo-selecao",name:"Prévia do chat",vehicleId:vehicle.id
    });
    toast(result.ok?"DEMO: "+vehicle.name+" inscrito na fila "+result.queue:
      result.reason);
  });
  $("studioBoost").addEventListener("click",()=>
    toast("Uma rosa enviada na transmissão ativa o turbo."));
  $("studioSprint").addEventListener("click",()=>
    toast("Um presente de 30 moedas libera 20 turbos."));
  $("studioPeople").addEventListener("click",()=>
    toast("Participantes inscritos: "+(liveState.source?.active?.length??0)+"/100"));
  $("studioGifts").addEventListener("click",()=>
    toast("Os presentes devem ser enviados pelo aplicativo da transmissão."));
  $("studioShare").addEventListener("click",async()=>{
    const url=location.origin+location.pathname+"?view=live";
    try{
      if(navigator.share)await navigator.share({title:"Corrida dos Elementos",url});
      else if(navigator.clipboard){
        await navigator.clipboard.writeText(url);
        toast("Link da transmissão copiado.");
      }else toast("Compartilhe o endereço da página da corrida.");
    }catch(error){
      if(error?.name!=="AbortError")toast("Não foi possível compartilhar agora.");
    }
  });
  function profile(id){return liveState.profiles.get(id)||null;}
  function renderRank(state){
    const rows=standings(state).slice(0,5);
    const signature=rows.map(r=>r.id+"@"+Math.floor(asNum(r.meters)/2)).join("|");
    if(signature===liveState.lastRankKey)return;
    liveState.lastRankKey=signature;
    const list=[];
    rows.forEach((r,i)=>{
      const row=element("li","studio-rank-row"+(i===0?" leader":""));
      const medal=element("span","studio-medal",i===0?"🥇":i===1?"🥈":i===2?"🥉":String(i+1));
      row.append(medal,avatarChip(profile(r.id),r.name,r.color));
      const label=element("span","studio-rank-name",shortName(r.name,16));
      const meters=element("span","studio-rank-meters",Math.floor(asNum(r.meters))+" m");
      row.append(label,meters);
      if(i===0)row.append(element("span","studio-fire","🔥"));
      list.push(row);
    });
    ui.rank.replaceChildren(...list);
  }
  function renderViewerFaces(state){
    const leaders=standings(state).slice(0,3);
    const facesKey=leaders.map(r=>r.id+"|"+(profile(r.id)?.avatarUrl||"")).join(",");
    if(facesKey!==liveState.lastFacesKey){
      liveState.lastFacesKey=facesKey;
      const list=[];
      for(const r of leaders)list.push(avatarChip(profile(r.id),r.name,r.color));
      ui.faces.replaceChildren(...list);
    }
    const viewers=asNum(state.viewerCount,NaN);
    text(ui.viewers,Number.isFinite(viewers)&&viewers>=0?
      Math.floor(viewers).toLocaleString("pt-BR"):"—");
  }
  function renderMessages(state){
    const messages=Array.isArray(state.messages)?state.messages.slice(0,5):[];
    // Reference-like fictional preview chat; clearly identified as a demo.
    // Never generate synthetic spectators, messages or gifts in a real LIVE.
    if(preview&&state.active?.length){
      const time=(state.phase==="RUNNING"?state.raceMs:state.phaseMs)||0;
      const bucket=Math.floor(time/5100);
      const sample=[
        "vai dar certo! ✨",
        "olha essa corrida 🔥",
        "quem está liderando? 👀",
        "torcendo por vocês 💙",
        "esse turbo foi demais ⚡"
      ];
      for(let k=0;k<4;k++){
        const runner=state.active[(bucket*3+k*5)%state.active.length];
        messages.push({id:"demo-"+bucket+"-"+k,
          sender:runner?.name||"Corredor",
          text:"[demo] "+sample[(bucket+k)%sample.length]});
      }
    }
    const signature=messages.map(m=>String(m.id??"")+"#"+String(m.text)).join("|");
    if(signature===liveState.lastChatKey)return;
    liveState.lastChatKey=signature;
    const items=[];
    for(const m of messages){
      const item=element("div","studio-chat-line");
      const sender=shortName(m.sender??m.name??"Pista",18);
      item.append(avatarChip(profile(m.userId),sender,"#9dc6db"));
      const line=element("span","studio-chat-content");
      line.append(element("b","",sender+": "));
      line.append(document.createTextNode(String(m.text??"").slice(0,115)));
      item.append(line);
      items.push(item);
    }
    ui.chat.replaceChildren(...items);
  }
  function rebuildMap(state){
    const distance=clamp(asNum(state.distance,METERS),1000,1500);
    if(liveState.map?.length===distance)return;
    liveState.map=trackMap(distance);
    ui.mapPath.setAttribute("d",liveState.map.path);
  }
  function applyState(next){
    if(liveState.closed||!next||typeof next!=="object")return;
    const incoming=next.state&&typeof next.state==="object"?next.state:next;
    if(!Array.isArray(incoming.active))return;
    liveState.source=incoming;
    liveState.lastPacketAt=performance.now();
    if(incoming.round!==liveState.round){
      liveState.round=incoming.round;
      liveState.lastRankKey="";
      liveState.lastVehicleKey="";
      liveState.lastChatKey="";
      liveState.lastFacesKey="";
      void loadProfiles();
    }
    rebuildMap(incoming);
  }
  async function loadProfiles(){
    if(preview)return;
    try{
      const res=await fetch("/api/studio/avatars",{cache:"no-store",
        signal:AbortSignal.timeout(4500)});
      if(!res.ok)return;
      const data=await res.json();
      if(liveState.closed||!Array.isArray(data.profiles))return;
      const next=new Map();
      for(const p of data.profiles.slice(0,100)){
        if(typeof p?.id==="string")next.set(p.id,{
          avatarUrl:safePhoto(p.avatarUrl),source:p.source
        });
      }
      liveState.profiles=next;
      liveState.lastRankKey="";liveState.lastChatKey="";
      liveState.lastFacesKey="";
    }catch{/* Image service outages never stop the race. */}
  }
  function renderPlates(state){
    // Every vehicle gets its owner's username anchored over its 3D position.
    // Only in-frustum, non-overlapping anchors are rendered to keep mobile
    // overlays legible with 100 participants.
    const featured=chooseFeatured(state);
    const selected=world.nameplates({featuredId:featured});
    const shot=studioCameraShot(state);
    const focus=new Set(shot.focusIds||[]);
    const priority=selected.slice().sort((a,b)=>
      Number(focus.has(b.id))-Number(focus.has(a.id))||
      asNum(b.y)-asNum(a.y));
    const used=new Set(),accepted=[];
    for(const plate of priority){
      const x=asNum(plate.x)*100,y=asNum(plate.y)*100;
      if(x<6||x>94||y<30||y>84)continue;
      if(accepted.some(q=>Math.abs(q.x-x)<6.5&&Math.abs(q.y-y)<2.5))continue;
      if(accepted.length>=36)break;
      accepted.push({x,y});used.add(plate.id);
      let node=liveState.plateNodes.get(plate.id);
      if(!node){
        node=element("div","studio-nameplate");
        ui.plates.append(node);liveState.plateNodes.set(plate.id,node);
      }
      const username=shortName(plate.username||"Participante",26);
      const key=plate.rank+"|"+username+"|"+plate.name;
      if(node.dataset.key!==key){
        node.dataset.key=key;node.replaceChildren();
        node.append(element("b","studio-position",plate.rank));
        node.append(element("span","studio-plate-name",username));
      }
      node.classList.toggle("studio-gold",plate.rank===1);
      node.classList.toggle("studio-camera-focus",focus.has(plate.id));
      node.style.left=x.toFixed(2)+"%";
      node.style.top=y.toFixed(2)+"%";
    }
    for(const [id,node] of liveState.plateNodes){
      if(!used.has(id)){node.remove();liveState.plateNodes.delete(id);}
    }
  }
  function renderVehicleMiniList(state,board){
    const shot=studioCameraShot(state),focus=new Set(shot.focusIds||[]);
    // The main leaderboard intentionally has only five rows. Derive the
    // mini list directly from the whole 100-car race to show seven models.
    const rows=studioRank(state.active||[]).slice(0,7).map((r,i)=>({
      ...r,position:i+1,meters:Math.floor(asNum(r.progress))
    }));
    const key=state.phase+"|"+rows.map(r=>
      r.id+"@"+r.name+"#"+Math.floor(asNum(r.meters)/3)+"!"+Number(focus.has(r.id))
    ).join("|");
    if(key!==liveState.lastVehicleKey){
      liveState.lastVehicleKey=key;
      const elements=rows.map((r,i)=>{
        const item=element("li","studio-mini-vehicle"+(focus.has(r.id)?" is-focus":""));
        item.append(element("span","studio-mini-number",String(i+1)));
        item.append(element("span","studio-mini-name",shortName(r.name,22)));
        return item;
      });
      ui.vehicleList.replaceChildren(...elements);
    }
    if(state.phase!=="RUNNING"){
      ui.cameraLabel.hidden=true;
      return;
    }
    ui.cameraLabel.hidden=false;
    if(shot.mode==="VEHICLE_CLOSEUP"){
      const active=(state.active||[]).find(r=>r.id===shot.featuredId);
      const remaining=Math.max(1,Math.ceil((STUDIO_SHOTS.closeupMs-
        asNum(state.raceMs)%(
          STUDIO_SHOTS.closeupMs+STUDIO_SHOTS.topThreeMs))/1000));
      text(ui.cameraLabel,"📷 CLOSE: "+shortName(active?.name,15)+
        " · "+shortName(active?.driverName,16)+" · "+remaining+"s");
    }else{
      text(ui.cameraLabel,"🏁 CÂMERA: 3 PRIMEIROS");
    }
  }
  function updateUi(state){
    const phase=state.phase||"LOBBY";
    text(ui.likes,Math.floor(asNum(state.likesTotal)).toLocaleString("pt-BR"));
    const active=state.active??[];
    const actual=active.length;
    text(ui.count,actual+"/"+LIVE_STUDIO.maxRunners);
    if(phase==="RUNNING"){
      text(ui.time,elapsedTime(state.raceMs));
    }else if(phase==="RESULTS"){
      text(ui.time,"PÓDIO");
    }else{
      text(ui.time,openingSeconds(state)+"s");
    }
    const board=standings(state);
    const leader=board[0];
    const meters=asNum(leader?.meters);
    text(ui.remaining,Math.max(0,Math.ceil(asNum(state.distance,METERS)-meters))+" m");
    ui.opening.hidden=phase==="RUNNING"||phase==="RESULTS";
    ui.countdown.hidden=phase!=="COUNTDOWN";
    ui.winner.hidden=phase!=="RESULTS";
    const activeFx=phase==="RUNNING"?
      [...(state.effects||[])].reverse().find(e=>
        ["turbo-flame","jetpack-smoke","torpedo-explosion","turbo-rain",
          "like-boost","ice-impact"].includes(e?.type)&&
        asNum(state.raceMs)-asNum(e?.createdAt)<2250):null;
    ui.featureCard.hidden=!activeFx;
    if(activeFx){
      const chosen=active.find(r=>r.id===activeFx.runnerId||
        r.id===activeFx.targetId);
      const name=shortName(chosen?.name??"Corredor",13);
      const powers={
        "turbo-flame":["⚡ TURBO","#f2c960"],
        "jetpack-smoke":["🚀 PROPULSOR","#a1dcff"],
        "torpedo-explosion":["✨ IMPACTO","#ffa36b"],
        "turbo-rain":["🔥 PODER","#ffa56a"],
        "like-boost":["⭐ IMPULSO","#ffe47d"],
        "ice-impact":["❄️ GELO","#89e7ff"]
      };
      const [label,color]=powers[activeFx.type]??["⚡ EFEITO","#f2c960"];
      text(ui.featureName,name);text(ui.featurePower,label);
      text(ui.featureAvatar,"");
      ui.featureAvatar.style.backgroundColor=color;
      const avatarSrc=safePhoto(profile(chosen?.id)?.avatarUrl)||
        voxelPortrait(name,color);
      ui.featureAvatar.style.backgroundImage="url("+avatarSrc+")";
      ui.featureAvatar.style.backgroundSize="cover";
      text(ui.featureLabel,preview?"EFEITO DE DEMONSTRAÇÃO":"EFEITO DA CORRIDA");
    }
    if(phase==="LOBBY"){
      text(ui.openingTitle,"INSCRIÇÕES ABERTAS");
      text(ui.openingClock,openingSeconds(state));
      text(ui.openingHint,"DIGITE O MODELO: CIVIC, GOL OU CG 160");
    }
    if(phase==="COUNTDOWN"){
      text(ui.openingTitle,"LARGADA EM");
      text(ui.openingClock,openingSeconds(state));
      text(ui.countdown,openingSeconds(state));
      text(ui.openingHint,"PREPARE-SE!");
    }
    if(phase==="RESULTS"){
      text(ui.winnerName,shortName(state.results?.[0]?.name??"Corredor",22));
    }
    stage.dataset.phase=phase.toLowerCase();
    stage.dataset.connected=state.connected?"yes":"no";
    if(speaker.state().enabled){
      // Read authoritative snapshots, never extrapolated render-only positions.
      // One narrator works across every new round; no gifts or races are created.
      speaker.update(raceCommentary.next(state,performance.now()));
    }
    renderRank(state);renderViewerFaces(state);renderMessages(state);
    renderVehicleMiniList(state,board);
    rebuildMap(state);
    // Plot every vehicle, not just the leader; preserve race ordering and
    // use small dots so a full 100-runner field remains legible.
    ui.mapRunners.innerHTML=state.active.map((runner,index)=>{
      const point=liveState.map.point(Math.max(0,Number(runner.progress)||0));
      const leader=index===0;
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${leader?4:2.4}" fill="${leader?"#ffcb45":"#59d8ff"}" stroke="#151c27" stroke-width=".6"/>`;
    }).join("");
    liveState.previousPhase=phase;
  }
  function interpolate(state,now){
    const age=clamp((now-liveState.lastPacketAt)/1000,0,.6);
    if(state.phase!=="RUNNING"||preview)return state;
    return {...state,active:state.active.map(r=>{
      if(r.status!=="running")return r;
      return {...r,progress:Math.min(asNum(state.distance,METERS),
        asNum(r.progress)+Math.max(0,asNum(r.speed))*age)};
    })};
  }
  let lastRaf=0,rafId=null;
  const intervals=[];
  const every=(fn,ms)=>{
    const id=window.setInterval(fn,ms);
    intervals.push(id);
    return id;
  };
  function requestReload(reason){
    if(liveState.closed||liveState.reloading)return false;
    // Never reload a genuinely offline browser or a throttled hidden tab.
    if(document.visibilityState==="hidden"||navigator.onLine===false)return false;
    const time=Date.now();
    let history=[];
    try{
      const saved=JSON.parse(sessionStorage.getItem(RECOVERY_SESSION_KEY)||"[]");
      history=Array.isArray(saved)?saved.filter(x=>
        Number.isFinite(x)&&time-x>=0&&time-x<STUDIO_WATCHDOG.retryWindowMs):[];
    }catch{/* Storage can be blocked by OBS/CEF privacy settings. */}
    if(history.length>=STUDIO_WATCHDOG.maxReloads){
      toast("Falha prolongada. Reabra a fonte de navegador para recuperar.");
      return false;
    }
    try{sessionStorage.setItem(RECOVERY_SESSION_KEY,
      JSON.stringify([...history,time]));}catch{/* No persistent local storage needed. */}
    liveState.reloading=true;
    console.warn("[studio-v5/watchdog] Recuperação:",reason);
    toast("Reconectando a transmissão...");
    location.reload();
    return true;
  }
  async function supervisor(){
    if(liveState.closed||liveState.reloading||liveState.monitoring)return;
    if(document.visibilityState==="hidden"||navigator.onLine===false)return;
    // Browser sources paused while hidden get a short reconnect grace when
    // OBS shows them again, rather than an immediate false watchdog reload.
    if(performance.now()-liveState.resumedAt<12000)return;
    liveState.monitoring=true;
    try{
      const now=performance.now();
      if(!preview&&now-liveState.lastPacketAt>=STUDIO_WATCHDOG.packetProbeMs&&
        now-liveState.watchdogLastProbeAt>=STUDIO_WATCHDOG.intervalMs){
        liveState.watchdogLastProbeAt=now;
        await fetchLatest();
      }
      const reason=studioRecoveryReason({
        now:performance.now(),lastGoodFrameAt:liveState.lastGoodFrameAt,
        lastPacketAt:liveState.lastPacketAt,startedAt:liveState.startedAt,
        hasState:Boolean(liveState.source),preview,
        visible:document.visibilityState!=="hidden",
        online:navigator.onLine!==false,
        contextLostAt:liveState.contextLostAt
      });
      if(reason)requestReload(reason);
    }catch(error){
      // Network / timer failures must not terminate the animation loop.
      console.warn("[studio-v5/watchdog]",String(error?.message??error).slice(0,100));
    }finally{liveState.monitoring=false;}
  }
  const canvas=$("studioCanvas");
  const onContextLost=event=>{
    event.preventDefault();
    liveState.contextLostAt=performance.now();
    console.warn("[studio-v5/watchdog] WebGL context lost");
  };
  const onContextRestored=()=>{
    liveState.contextLostAt=null;
    liveState.lastGoodFrameAt=performance.now();
  };
  canvas.addEventListener("webglcontextlost",onContextLost);
  canvas.addEventListener("webglcontextrestored",onContextRestored);

  const requestedCrowd=Number(params.get("crowd"));
  const previewBots=Number.isInteger(requestedCrowd)&&
    requestedCrowd>=1&&requestedCrowd<=100?requestedCrowd:100;
  // Explicit owner-only demonstration mode. Real chat registrations remain
  // selected by the viewer, never reassigned or randomly substituted.
  const heroPreview=preview&&params.get("hero")==="1";
  const applyHeroPreview=state=>{
    if(!heroPreview||!state?.active)return;
    let index=0;
    for(const runner of state.active){
      if(!runner.isBot)continue;
      const vehicle=resolveVehicle(HERO_CAR_IDS[index%HERO_CAR_IDS.length]);
      index++;
      if(vehicle&&runner.vehicleId!==vehicle.id){
        runner.name=vehicle.name;
        runner.vehicleId=vehicle.id;
        runner.vehicleKind=vehicle.kind;
      }
    }
  };
  const previewState=preview?createStudioState({connected:false,seed:5001}):null;
  if(previewState){
    previewState.previewOnly=true;
    const showcase=resolveVehicle(params.get("showcase"));
    if(heroPreview&&showcase?.kind==="car")
      previewState.previewSpotlightVehicleId=showcase.id;
  }
  let previewGiftBucket=-1,previewGiftRound=-1;
  if(previewState){
    studioFillBots(previewState,{count:previewBots});
    applyHeroPreview(previewState);
    applyState(previewState);
  }
  async function fetchLatest(){
    if(preview||liveState.closed)return;
    try{
      const result=await fetch("/api/studio/state",{
        cache:"no-store",signal:AbortSignal.timeout(5000)
      });
      if(result.ok)applyState(await result.json());
    }catch{/* EventSource continues trying. */}
  }
  if(!preview){
    await fetchLatest();
    if(typeof EventSource!=="undefined"){
      const stream=new EventSource("/api/studio/events");
      stream.addEventListener("race",event=>{
        try{applyState(JSON.parse(event.data));}catch{/* untrusted wire data */}
      });
      liveState.connection=stream;
    }
    // An SSE connection is naturally retried; polling also covers captive
    // networks and clients that do not expose EventSource.
    every(()=>{
      if(!liveState.closed&&performance.now()-liveState.lastPacketAt>3500)
        void fetchLatest();
    },4000);
    every(()=>{if(!liveState.closed)void loadProfiles();},16000);
  }
  function loop(now){
    if(liveState.closed)return;
    rafId=requestAnimationFrame(loop);
    if(!lastRaf){lastRaf=now;return;}
    const dt=clamp((now-lastRaf)/1000,0,.25);
    if(dt<1/38&&low)return; // Limit mid-range mobile scene to about 30 FPS.
    lastRaf=now;
    if(previewState){
      studioTick(previewState,dt*1000);
      if(previewState.phase==="LOBBY"&&previewState.active.length===0)
        studioFillBots(previewState,{count:previewBots});
      // The offline engine normally auto-fills 100 bots at the countdown.
      // In a video-reference demo, honor ?crowd=20 throughout the race,
      // while the real engine and ?crowd=100 still support all 100 slots.
      if(previewBots<100&&previewState.active.length>previewBots)
        previewState.active.length=previewBots;
      applyHeroPreview(previewState);
      if(previewGiftRound!==previewState.round){
        previewGiftRound=previewState.round;previewGiftBucket=-1;
      }
      // Offline-only example effect every 15 seconds. These are not platform
      // gifts, real spectators, payments or server-authoritative mutations.
      if(previewState.phase==="RUNNING"&&previewState.raceMs>=3500){
        const bucket=Math.floor((previewState.raceMs-3500)/15000);
        if(bucket!==previewGiftBucket){
          previewGiftBucket=bucket;
          const pool=previewState.active.filter(r=>r.status==="running");
          const player=pool[Math.floor(pool.length*.55)];
          if(player)studioGift(previewState,{
            userId:player.id,name:"Rosa",coins:1
          });
        }
      }
      liveState.source=previewState;
      liveState.lastPacketAt=now;
    }
    const state=liveState.source;
    if(!state)return;
    try{
      const visual=interpolate(state,now);
      world.update(visual,Math.max(dt,.001));
      // WebGL context loss is cleared only by the real restored event;
      // a successful JavaScript call alone does not mean the GPU recovered.
      if(now-liveState.lastUiAt>210){
        updateUi(state);liveState.lastUiAt=now;
      }
      if(now-liveState.lastPlateAt>125){
        renderPlates(visual);liveState.lastPlateAt=now;
      }
      liveState.fpsAccum+=dt;liveState.fpsFrames++;
      if(now-liveState.lastPerfAt>4200){
        const fps=liveState.fpsFrames/Math.max(.001,liveState.fpsAccum);
        const target=fps<25?Math.max(.62,liveState.qualityScale-.1):
          fps>42?Math.min(1,liveState.qualityScale+.05):liveState.qualityScale;
        liveState.qualityScale=target;
        world.setRenderScale(target);
        liveState.fpsFrames=0;liveState.fpsAccum=0;liveState.lastPerfAt=now;
      }
      if(liveState.contextLostAt===null)
        liveState.lastGoodFrameAt=performance.now();
    }catch(error){
      liveState.renderErrors++;
      if(liveState.renderErrors===1||liveState.renderErrors%300===0)
        console.warn("[studio-v5/frame] Renderização:",
          String(error?.message??error).slice(0,150));
      // Preserve the next animation tick; the 30s watchdog decides recovery.
    }
  }
  const onResize=()=>{if(!liveState.closed)world.resize();};
  const onVisibility=()=>{
    if(liveState.closed||document.visibilityState!=="visible")return;
    liveState.resumedAt=performance.now();
    // The WebGL draw may have been legitimately throttled while hidden.
    liveState.lastGoodFrameAt=liveState.resumedAt;
    if(!preview)void fetchLatest();
  };
  window.addEventListener("resize",onResize);
  document.addEventListener("visibilitychange",onVisibility);
  function cleanup(){
    if(liveState.closed)return;
    liveState.closed=true;
    cancelAnimationFrame(rafId);
    for(const timer of intervals)clearInterval(timer);
    clearTimeout(liveState.toastTimer);
    clearTimeout(captionTimer);
    speaker.dispose();
    liveState.connection?.close();
    canvas.removeEventListener("webglcontextlost",onContextLost);
    canvas.removeEventListener("webglcontextrestored",onContextRestored);
    window.removeEventListener("resize",onResize);
    document.removeEventListener("visibilitychange",onVisibility);
    world.dispose();
  }
  window.addEventListener("pagehide",cleanup,{once:true});
  window.__studioV5Debug=preview?{
    getState:()=>liveState.source,
    getSceneStats:()=>world.stats(),
    getCameraShot:()=>studioCameraShot(liveState.source),
    getNarratorState:()=>speaker.state(),
    getNarratorCaption:()=>ui.narratorCaption.textContent,
    getPlateCount:()=>liveState.plateNodes.size,
    getMapLength:()=>ui.mapPath.getTotalLength(),
    getWatchdog:()=>({
      lastGoodFrameAt:liveState.lastGoodFrameAt,
      lastPacketAt:liveState.lastPacketAt,
      renderErrors:liveState.renderErrors,
      reloading:liveState.reloading
    })
  }:undefined;
  every(()=>{void supervisor();},STUDIO_WATCHDOG.intervalMs);
  rafId=requestAnimationFrame(loop);
  return {world,stage,stop:cleanup};
}
