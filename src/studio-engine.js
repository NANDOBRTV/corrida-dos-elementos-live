// Motor v5 independente e determinístico. O servidor legado só migra
// após a aprovação das integrações e testes das próximas partes.
import {LIVE_STUDIO,BIOME_ORDER,RUNNER_COLORS} from "./config.js";
import {resolveVehicle,vehicleForBot} from "./vehicles.js";

const C=LIVE_STUDIO;
const MAX_MESSAGES=5;
const STEP_MS=100;
const BOT_LABELS=["Atlas","Brisa","Cobre","Delta","Eco","Faro","Giro","Hera",
  "Íris","Jade","Kiro","Lume","Mira","Nilo","Orla","Polo","Rubi","Sol","Téo","Vento"];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=(v,otherwise=0)=>Number.isFinite(Number(v))?Number(v):otherwise;
const clean=(v,max=28)=>String(v??"").trim().slice(0,max);
export function studioHash(input){
  let h=2166136261;
  for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
export function validStudioDistance(distance){
  return Number.isInteger(distance)&&distance>=C.minDistance&&
    distance<=C.maxDistance&&(distance-C.minDistance)%C.distanceStep===0;
}
export function createStudioState({seed=91357,distance=C.defaultDistance,connected=false}={}){
  if(!validStudioDistance(distance))throw new RangeError("Distância inválida: 1000–1500 m, passos de 50 m");
  return {
    schema:2,round:1,mapId:BIOME_ORDER[0],phase:"LOBBY",phaseMs:0,raceMs:0,
    distance,nextDistance:distance,seed:finite(seed)>>>0,connected:Boolean(connected),
    active:[],next:[],results:[],messages:[],effects:[],likesTotal:0,
    eventSequence:0,paused:false,finishedAt:null
  };
}
function message(state,text){
  state.messages.unshift({id:++state.eventSequence,round:state.round,
    text:clean(text,150),atMs:state.raceMs});
  state.messages.length=Math.min(MAX_MESSAGES,state.messages.length);
}
function effect(state,type,meta={},duration=2500){
  const item={id:"vfx-"+state.round+"-"+(++state.eventSequence),
    type,createdAt:state.raceMs,expiresAt:state.raceMs+duration,...meta};
  state.effects.unshift(item);
  state.effects.length=Math.min(C.maxVisualEffects,state.effects.length);
  return item;
}
function newRunner(state,{userId,name,vehicleId=null,robloxUserId=null,isBot=false},index){
  const id=clean(userId,128),driverName=clean(name)||"Participante";
  // User-selected models are never randomized. The deterministic Uno fallback
  // keeps old administrative/test events compatible; the LIVE chat parser
  // always requires an explicit valid selection.
  const vehicle=resolveVehicle(vehicleId)||resolveVehicle(name)||
    (isBot?vehicleForBot(index):resolveVehicle("Uno"));
  const variation=studioHash(id+"|"+state.seed)/4294967296;
  return {
    id,name:vehicle.name,driverName,vehicleId:vehicle.id,
    vehicleKind:vehicle.kind,isBot:Boolean(isBot),
    ...(Number.isSafeInteger(robloxUserId)&&robloxUserId>0?{robloxUserId}:{}),
    color:RUNNER_COLORS[index%RUNNER_COLORS.length],
    lane:index%10,gridPosition:index+1,progress:0,status:"waiting",
    speed:0,baseSpeed:C.speedMin+C.speedRange*variation,
    likeBonus:0,turboUntil:0,jetpackUntil:0,turboCharges:0,
    lastTurboChargeAt:-1000,slowUntil:0,lastLaneChangeAt:-3000,
    finishMs:null,passed:[]
  };
}
export function studioJoin(state,{userId,name,vehicleId=null,robloxUserId=null}={}){
  const id=clean(userId,128);
  if(!id||id.length>128)return {ok:false,reason:"Identificador inválido"};
  if(!["LOBBY","COUNTDOWN","RUNNING","RESULTS"].includes(state.phase))
    return {ok:false,reason:"Rodada indisponível"};
  // Reject unknown explicitly selected models rather than substituting one.
  if(vehicleId&&!resolveVehicle(vehicleId))
    return {ok:false,reason:"Veículo indisponível; escolha um dos 30 modelos"};
  const selected=resolveVehicle(vehicleId)||resolveVehicle(name)||
    resolveVehicle("Uno");
  const current=state.phase==="LOBBY",target=current?state.active:state.next;
  if(target.some(r=>r.id===id))return {ok:false,reason:"Já inscrito nesta rodada"};
  if(target.length>=C.maxRunners)return {ok:false,reason:"Limite de 100 corredores"};
  const data={userId:id,name,vehicleId:selected.id,robloxUserId,isBot:false};
  target.push(current?newRunner(state,data,target.length):data);
  if(current)studioArrangeGrid(state);
  message(state,selected.name+" entrou na "+(current?"corrida":"fila seguinte"));
  return {ok:true,vehicleId:selected.id,vehicleName:selected.name,
    queue:current?"atual":"próxima",round:state.round+(current?0:1)};
}
export function studioArrangeGrid(state){
  if(state.phase!=="LOBBY"&&state.phase!=="COUNTDOWN")return;
  const byId=[...state.active].sort((a,b)=>a.id.localeCompare(b.id,"pt-BR"));
  byId.forEach((r,i)=>{r.gridPosition=i+1;r.lane=i%10;});
}
export function studioFillBots(state,{count=C.botFillTarget}={}){
  if(state.phase!=="LOBBY"&&state.phase!=="COUNTDOWN")return 0;
  const countWanted=clamp(Math.trunc(finite(count)),0,C.maxRunners);
  let filled=0;
  for(let i=0;state.active.length<countWanted&&i<C.maxRunners;i++){
    const id="bot-"+state.round+"-"+String(i+1).padStart(3,"0");
    if(state.active.some(r=>r.id===id))continue;
    state.active.push(newRunner(state,{
      userId:id,name:BOT_LABELS[i%BOT_LABELS.length]+" "+String(i+1).padStart(2,"0"),
      vehicleId:vehicleForBot(i).id,isBot:true
    },state.active.length));
    filled++;
  }
  if(filled)studioArrangeGrid(state);
  return filled;
}
export function studioRank(runners){
  return [...runners].sort((a,b)=>{
    const doneA=a.finishMs!==null,doneB=b.finishMs!==null;
    if(doneA!==doneB)return doneA?-1:1;
    if(doneA)return a.finishMs-b.finishMs||a.id.localeCompare(b.id);
    return b.progress-a.progress||a.id.localeCompare(b.id);
  });
}
export function studioSetDistance(state,requested){
  const distance=Number(requested);
  if(!validStudioDistance(distance))return {
    ok:false,reason:"Distância entre 1000 e 1500 m, em passos de 50 m"
  };
  if(state.phase==="LOBBY"){state.distance=distance;state.nextDistance=distance;}
  else state.nextDistance=distance;
  return {ok:true,distance,applies:state.phase==="LOBBY"?"atual":"próxima"};
}
function phaseLimit(state){
  if(state.phase==="LOBBY")return C.lobbyMs;
  if(state.phase==="COUNTDOWN")return C.countdownMs;
  if(state.phase==="RESULTS")return C.resultsMs;
  return C.maxRaceMs;
}
export function studioCountdown(state){
  return Math.max(0,Math.ceil((phaseLimit(state)-state.phaseMs)/1000));
}
export function studioAdvance(state){
  if(state.phase==="LOBBY"){
    // Sem transmissão ou inscrições reais, os bots garantem a continuidade.
    if(!state.connected||state.active.length===0)studioFillBots(state);
    studioArrangeGrid(state);
    state.phase="COUNTDOWN";
    message(state,"Inscrições encerradas. Preparar!");
  }else if(state.phase==="COUNTDOWN"){
    state.phase="RUNNING";state.raceMs=0;state.effects=[];
    const gridRows=Math.ceil(state.active.length/10);
    for(const r of state.active){
      // Stagger grid rows to avoid 100 vehicles spawning in the same spot.
      r.progress=.01+Math.max(0,gridRows-1-Math.floor((r.gridPosition-1)/10))*6.5;
      r.status="running";r.speed=0;r.finishMs=null;
      r.turboUntil=0;r.jetpackUntil=0;r.slowUntil=0;r.turboCharges=0;r.passed=[];
    }
    message(state,"LARGADA!");
  }else if(state.phase==="RUNNING"){
    state.phase="RESULTS";state.finishedAt=state.raceMs;
    state.results=studioRank(state.active).map((r,i)=>({
      id:r.id,name:r.name,vehicleId:r.vehicleId,vehicleKind:r.vehicleKind,
      isBot:r.isBot,position:i+1,
      meters:Math.floor(r.progress),finishMs:r.finishMs
    }));
    message(state,"Vitória de "+(state.results[0]?.name||"ninguém"));
    state.effects=[];
  }else{
    const next=state.next;
    state.round++;
    state.mapId=BIOME_ORDER[(state.round-1)%BIOME_ORDER.length];
    state.distance=state.nextDistance;
    state.seed=(state.seed+7919)>>>0;
    state.active=next.map((p,i)=>newRunner(state,p,i)).slice(0,C.maxRunners);
    state.next=[];state.results=[];state.effects=[];state.phase="LOBBY";
    state.raceMs=0;state.finishedAt=null;studioArrangeGrid(state);
    message(state,"Nova rodada aberta");
  }
  state.phaseMs=0;
  return state.phase;
}
function running(state){
  return state.active.filter(r=>r.status==="running");
}
function selectRunner(state,userId,salt){
  const eligible=running(state);
  if(!eligible.length)return null;
  const id=clean(userId,128);
  return eligible.find(r=>r.id===id)||
    eligible[studioHash(salt+"|"+state.seed+"|"+state.round)%eligible.length];
}
export function studioLike(state,{count=1,userId=""}={}){
  const amount=clamp(Math.trunc(finite(count)),0,100000);
  if(!amount)return {ok:false,reason:"Curtidas inválidas"};
  const previous=state.likesTotal;state.likesTotal+=amount;
  if(state.phase!=="RUNNING")return {ok:true,boosts:0};
  const boosts=clamp(Math.floor(state.likesTotal/C.likeThreshold)-
    Math.floor(previous/C.likeThreshold),0,100);
  const recipient=selectRunner(state,userId,"likes-"+state.likesTotal);
  if(recipient&&boosts){
    recipient.likeBonus=clamp(recipient.likeBonus+boosts*C.likeSpeedBonus,0,C.likeSpeedCap);
    effect(state,"like-boost",{runnerId:recipient.id,boosts},1200);
  }
  return {ok:true,boosts:recipient?boosts:0,runnerId:recipient?.id??null};
}
export function studioGift(state,{userId="",name="Presente",coins=0}={}){
  if(state.phase!=="RUNNING")return {ok:false,reason:"Aguardando corrida"};
  const runner=selectRunner(state,userId,"gift-"+name);
  if(!runner)return {ok:false,reason:"Sem corredores ativos"};
  const label=clean(name,40).toLocaleLowerCase("pt-BR");
  const value=clamp(Math.trunc(finite(coins)),0,100000);
  let type="thanks",fx=null;
  if(/\b(rosa|rose|flor)\b/u.test(label)){
    type="turbo";runner.turboUntil=Math.max(runner.turboUntil,state.raceMs+C.roseTurboMs);
    fx=effect(state,"turbo-flame",{runnerId:runner.id},C.roseTurboMs);
  }else if(value>=50){
    type="obstacle";
    const ahead=clamp(runner.progress+20,0,state.distance-1);
    fx=effect(state,"obstacle",{lane:runner.lane,meters:ahead,
      struck:[]},C.obstacleMs);
  }else if(value>=30){
    type="turbo-rain";
    runner.turboCharges=clamp(runner.turboCharges+20,0,C.maxTurboCharges);
    fx=effect(state,"turbo-rain",{runnerId:runner.id,charges:20},C.maxTurboCharges*C.turboChargeMs);
  }else if(value>=10){
    type="jetpack";runner.jetpackUntil=state.raceMs+C.jetpackMs;
    fx=effect(state,"jetpack-smoke",{runnerId:runner.id},C.jetpackMs);
  }
  message(state,clean(name,40)+" para "+runner.name+" ("+type+")");
  return {ok:true,type,runnerId:runner.id,effectId:fx?.id??null};
}
export function studioFollow(state,{userId="",name="Espectador"}={}){
  if(state.phase!=="RUNNING")return {ok:false,reason:"Aguardando corrida"};
  const pool=running(state).filter(r=>r.id!==clean(userId,128));
  if(!pool.length)return {ok:false,reason:"Sem alvo elegível"};
  const target=pool[studioHash(userId+"|"+state.eventSequence+"|torpedo")%pool.length];
  const fx=effect(state,"torpedo",{targetId:target.id,impacted:false},
    C.torpedoTravelMs+1200);
  message(state,clean(name)+" seguiu e enviou um torpedo!");
  return {ok:true,targetId:target.id,effectId:fx.id};
}
function stepRace(state,ms){
  state.raceMs+=ms;
  const seconds=ms/1000;
  const liveEffects=state.effects;
  for(const fx of liveEffects){
    if(fx.type==="torpedo"&&!fx.impacted&&
       state.raceMs>=fx.createdAt+C.torpedoTravelMs){
      fx.impacted=true;
      const victim=state.active.find(r=>r.id===fx.targetId&&r.status==="running");
      if(victim){
        victim.slowUntil=Math.max(victim.slowUntil,state.raceMs+C.torpedoSlowMs);
        effect(state,"torpedo-explosion",{runnerId:victim.id},900);
      }
    }
  }
  for(const r of state.active){
    if(r.status!=="running")continue;
    if(r.turboCharges>0&&state.raceMs-r.lastTurboChargeAt>=C.turboChargeMs){
      r.lastTurboChargeAt=state.raceMs;
      r.turboCharges--;
      r.turboUntil=Math.max(r.turboUntil,state.raceMs+C.turboChargeMs);
    }
    const turbo=r.turboUntil>state.raceMs;
    const jet=r.jetpackUntil>state.raceMs;
    const slow=r.slowUntil>state.raceMs;
    const wave=Math.sin(state.raceMs*.003+studioHash(r.id)%57)*.17;
    const raw=(r.baseSpeed+r.likeBonus+wave)*(turbo?1.35:1)*(jet?1.18:1)*(slow?.65:1);
    r.speed=clamp(raw,2,C.speedCap);
    const previous=r.progress;
    r.progress=Math.min(state.distance,r.progress+r.speed*seconds);
    for(const fx of liveEffects){
      if(fx.type!=="obstacle"||fx.lane!==r.lane||
         !Array.isArray(fx.struck)||fx.struck.includes(r.id))continue;
      if(previous<=fx.meters&&r.progress>=fx.meters){
        fx.struck.push(r.id);
        r.slowUntil=Math.max(r.slowUntil,state.raceMs+1200);
        effect(state,"ice-impact",{runnerId:r.id},750);
      }
    }
    if(state.raceMs-r.lastLaneChangeAt>1700&&
       r.progress<state.distance-10){
      const f=studioHash(r.id+"|"+Math.floor(state.raceMs/1700)+"|"+state.seed);
      if(f%5===0){
        r.lane=clamp(r.lane+(f%2===0?1:-1),0,9);
        r.lastLaneChangeAt=state.raceMs;
      }
    }
    if(r.progress>=state.distance){
      r.status="finished";r.finishMs=state.raceMs;r.speed=0;
    }
  }
  // Physical spacing: vehicles in the same lane cannot pass through one another.
  // Resolve front-to-back after all movement and lane changes, so ordering
  // does not depend on the active array iteration order.
  const laneGroups=Array.from({length:10},()=>[]);
  for(const r of state.active){
    if(r.status==="running")laneGroups[r.lane]?.push(r);
  }
  for(const lane of laneGroups){
    lane.sort((a,b)=>b.progress-a.progress||a.id.localeCompare(b.id));
    for(let i=1;i<lane.length;i++){
      const ahead=lane[i-1],behind=lane[i];
      const safeProgress=Math.max(0,ahead.progress-5);
      if(behind.progress>safeProgress){
        behind.progress=safeProgress;
        behind.speed=Math.min(behind.speed,ahead.speed);
      }
    }
  }
  state.effects=state.effects.filter(fx=>fx.expiresAt>state.raceMs)
    .slice(0,C.maxVisualEffects);
}
export function studioTick(state,deltaMs){
  if(state.paused)return state.phase;
  let remaining=clamp(finite(deltaMs),0,60000);
  while(remaining>0){
    const until=phaseLimit(state)-state.phaseMs;
    if(until<=0){studioAdvance(state);continue;}
    const slice=Math.min(remaining,STEP_MS,until);
    if(state.phase==="RUNNING")stepRace(state,slice);
    state.phaseMs+=slice;
    remaining-=slice;
    const done=state.phase==="RUNNING"&&state.active.length>0&&
      state.active.every(r=>r.status==="finished");
    if(done||state.phaseMs>=phaseLimit(state))studioAdvance(state);
  }
  return state.phase;
}
