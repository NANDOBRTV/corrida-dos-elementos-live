
import {createStudioScene} from "./studio-scene.js";
import {studioCourseAt} from "./studio-camera.js";
import {createStudioState,studioFillBots,studioTick,studioRank} from "./studio-engine.js";
import {LIVE_STUDIO} from "./config.js";

const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const text=(node,value)=>{if(node)node.textContent=String(value??"");};
const asNum=(value,otherwise=0)=>Number.isFinite(Number(value))?Number(value):otherwise;
const shortName=(value,max=20)=>String(value??"").trim().slice(0,max)||"Corredor";
const METERS=LIVE_STUDIO.defaultDistance;
const PHOTO_HOST="rbxcdn.com";
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
    "<aside class='studio-race-data' aria-label='Informações da corrida'>",
      "<div class='studio-race-time' id='studioRaceTime'>0:00</div>",
      "<div class='studio-race-remaining'><span aria-hidden='true'>⚑</span><b id='studioRemaining'>1200 m</b><span>restantes</span></div>",
      "<div class='studio-race-count'><b id='studioRunnerCount'>0/100</b><span>corredores</span></div>",
    "</aside>",
    "<div class='studio-minimap' aria-label='Minimapa da pista'>",
      "<svg id='studioMap' viewBox='0 0 180 180' preserveAspectRatio='xMidYMid meet' aria-hidden='true'>",
        "<path id='studioMapPath' fill='none' stroke='white' stroke-width='5' stroke-linejoin='round' stroke-linecap='round'></path>",
        "<circle id='studioMapDot' r='6' fill='#ffcb45' stroke='#151c27' stroke-width='2'></circle>",
      "</svg>",
    "</div>",
    "<div id='studioPlates' class='studio-plates' aria-label='Identificação dos líderes'></div>",
    "<div id='studioOpening' class='studio-opening' hidden>",
      "<span id='studioOpeningTitle'>INSCRIÇÕES ABERTAS</span>",
      "<strong id='studioOpeningClock'>60</strong>",
      "<small id='studioOpeningHint'>COMENTE ENTRAR + NOME ROBLOX</small>",
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
        "<button id='studioBoost' class='studio-action boost' type='button'><span>⚡</span>BOOST</button>",
        "<button id='studioJoin' class='studio-action join' type='button'><span>✚</span>JOIN</button>",
        "<button id='studioSprint' class='studio-action sprint' type='button'><span>➤</span>SPRINT <small>×20</small></button>",
      "</div>",
      "<div class='studio-social-actions'>",
        "<button id='studioPeople' type='button' aria-label='Participantes'>♟</button>",
        "<button id='studioGifts' type='button' aria-label='Presentes'>🎁</button>",
        "<button id='studioShare' type='button' aria-label='Compartilhar'>↗</button>",
      "</div>",
    "</aside>",
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
function avatarChip(profile,name,color){
  const holder=element("span","studio-avatar");
  holder.style.setProperty("--avatar-color",color||"#81b9d5");
  const source=safePhoto(profile?.avatarUrl);
  holder.textContent=shortName(name,1).toUpperCase();
  if(source){
    const img=document.createElement("img");
    img.src=source;img.alt="";
    img.referrerPolicy="no-referrer";
    img.loading="lazy";
    img.addEventListener("load",()=>{holder.textContent="";holder.append(img);},{once:true});
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
  if(state.phase!=="RESULTS")return null;
  return state.results?.[0]?.id??null;
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
  const low=qualityParam==="low"||(qualityParam!=="high"&&deviceMemory&&deviceMemory<=4);
  let world;
  try{
    world=createStudioScene($("studioCanvas"),{
      quality:low?"low":qualityParam==="high"?"high":"balanced",
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
    map:null,lastChatKey:"",lastRankKey:"",plateNodes:new Map(),
    latestFrameAt:0,lastUiAt:0,lastPlateAt:0,lastFacesKey:"",fpsAccum:0,
    fpsFrames:0,lastPerfAt:performance.now(),qualityScale:1,
    previousPhase:null,toastTimer:null,connection:null,closed:false
  };
  const ui={
    likes:$("studioLikes"),viewers:$("studioViewerTotal"),
    faces:$("studioViewerFaces"),rank:$("studioRankRows"),
    time:$("studioRaceTime"),remaining:$("studioRemaining"),
    count:$("studioRunnerCount"),mapPath:$("studioMapPath"),
    mapDot:$("studioMapDot"),chat:$("studioChatEntries"),
    plates:$("studioPlates"),opening:$("studioOpening"),
    openingTitle:$("studioOpeningTitle"),
    openingClock:$("studioOpeningClock"),
    openingHint:$("studioOpeningHint"),
    countdown:$("studioCountdown"),winner:$("studioWinner"),
    winnerName:$("studioWinnerName"),toast:$("studioToast")
  };
  function toast(message){
    text(ui.toast,message);
    ui.toast.hidden=false;
    clearTimeout(liveState.toastTimer);
    liveState.toastTimer=setTimeout(()=>{ui.toast.hidden=true;},3300);
  }
  $("studioFollow").addEventListener("click",()=>
    toast("Toque em Seguir no perfil do canal da transmissão."));
  $("studioJoin").addEventListener("click",()=>
    toast("No chat da transmissão, escreva: entrar NomeRoblox"));
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
    const selected=world.nameplates({featuredId:chooseFeatured(state)});
    const used=new Set();
    const accepted=[];
    for(const plate of selected){
      const x=asNum(plate.x)*100,y=asNum(plate.y)*100;
      // Keep labels away from ranking, timer, chat and gift controls.
      if(x<24||x>79||y<31||y>79)continue;
      if(accepted.some(q=>Math.abs(q.x-x)<12&&Math.abs(q.y-y)<3.5))continue;
      accepted.push({x,y});used.add(plate.id);
      let node=liveState.plateNodes.get(plate.id);
      if(!node){
        node=element("div","studio-nameplate");
        ui.plates.append(node);
        liveState.plateNodes.set(plate.id,node);
      }
      const key=plate.rank+"|"+plate.name+"|"+profile(plate.id)?.avatarUrl;
      if(node.dataset.key!==key){
        node.dataset.key=key;
        node.replaceChildren();
        node.append(element("b","studio-position",plate.rank));
        const avatar=avatarChip(profile(plate.id),plate.name,plate.color);
        node.append(avatar,element("span","studio-plate-name",shortName(plate.name,12)));
      }
      node.classList.toggle("studio-gold",plate.rank===1);
      node.style.left=x.toFixed(2)+"%";
      node.style.top=y.toFixed(2)+"%";
    }
    for(const [id,node] of liveState.plateNodes){
      if(!used.has(id)){node.remove();liveState.plateNodes.delete(id);}
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
    if(phase==="LOBBY"){
      text(ui.openingTitle,"INSCRIÇÕES ABERTAS");
      text(ui.openingClock,openingSeconds(state));
      text(ui.openingHint,"COMENTE ENTRAR + NOME ROBLOX");
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
    renderRank(state);renderViewerFaces(state);renderMessages(state);
    rebuildMap(state);
    const dot=liveState.map.point(meters);
    ui.mapDot.setAttribute("cx",dot.x.toFixed(1));
    ui.mapDot.setAttribute("cy",dot.y.toFixed(1));
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
  const previewState=preview?createStudioState({connected:false,seed:5001}):null;
  if(previewState){
    studioFillBots(previewState,{count:100});
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
    window.setInterval(()=>{
      if(!liveState.closed&&performance.now()-liveState.lastPacketAt>3500)
        void fetchLatest();
    },4000);
    window.setInterval(()=>{if(!liveState.closed)void loadProfiles();},16000);
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
        studioFillBots(previewState,{count:100});
      liveState.source=previewState;
      liveState.lastPacketAt=now;
    }
    const state=liveState.source;
    if(!state)return;
    const visual=interpolate(state,now);
    world.update(visual,Math.max(dt,.001));
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
  }
  window.addEventListener("resize",()=>{if(!liveState.closed)world.resize();});
  window.addEventListener("pagehide",()=>{
    liveState.closed=true;
    cancelAnimationFrame(rafId);
    clearTimeout(liveState.toastTimer);
    liveState.connection?.close();
    world.dispose();
  },{once:true});
  window.__studioV5Debug=preview?{
    getState:()=>liveState.source,
    getSceneStats:()=>world.stats(),
    getPlateCount:()=>liveState.plateNodes.size,
    getMapLength:()=>ui.mapPath.getTotalLength()
  }:undefined;
  rafId=requestAnimationFrame(loop);
  return {world,stage,stop:()=>{liveState.closed=true;
    cancelAnimationFrame(rafId);liveState.connection?.close();world.dispose();}};
}
