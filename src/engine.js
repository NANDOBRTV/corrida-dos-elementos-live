import { TRACK_LENGTH, PREVIOUS_LONG_TRACK_LENGTH, PREVIOUS_TRACK_LENGTH, LEGACY_TRACK_LENGTH, LONG_RACE_TIMEOUT, MIN_LAPS, MAX_LAPS, STREAM_TILE_LENGTH, PHASE_TIMES, BIOME_ORDER, mapForRound, RUNNER_COLORS, obstaclesFor, LANES, LEGACY_BIOME_IDS } from "./config.js";
import {recordCompletedRace} from "./history.js";
import {parseRaceJoin,validRobloxUsername} from "./roblox-names.js";
import {activeGiftObstacles} from "./gift-obstacles.js";
import {startingGrid} from "./start-grid.js";

export const FIXED_STEP = 50;
export function hash(text) {
  let h=2166136261;
  for (let i=0;i<String(text).length;i++) { h^=String(text).charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
export function randomFrom(seed) {
  let value=seed>>>0;
  return () => { value=(Math.imul(1664525,value)+1013904223)>>>0; return value/4294967296; };
}
export function joinCommand(content) { return typeof content==="string" && content.trim().toLowerCase()==="entrar"; }
export function createState(seed=127492) {
  return {
    version:1, round:1, mapId:mapForRound(1), trackLength:TRACK_LENGTH, phase:"LOBBY", phaseMs:0, raceMs:0, laps:1, nextLaps:1,
    accumulator:0, seed:seed>>>0, active:[], next:[], results:[], history:[], seasonLeaders:[], paused:false,
    giftObstacles:[],giftObstacleSequence:0,manualCamera:null,
    messages:[{ text:"Ambiente de demonstração iniciado. Digite entrar.", at:0 }]
  };
}
export function buildRunner(person,index,seed) {
  const rng=randomFrom(hash(person.id+"|"+seed));
  return {
    id:person.id, name:person.name, ...(person.robloxUserId?{robloxUserId:person.robloxUserId,robloxUsername:person.robloxUsername}:{}), lane:1+index%3,gridPosition:index+1,progress:0,
    baseSpeed:5.05+rng()*1.65, speed:0, status:"waiting",
    vehicleKind:"foot",vehicleUntil:0,
    finishTime:null, slowUntil:0, turboUntil:0, passed:[], color:RUNNER_COLORS[index%RUNNER_COLORS.length]
  };
}
export function arrangeStartingGrid(state){
  if(state.phase!=="LOBBY"&&state.phase!=="COUNTDOWN")return;
  const byId=new Map(state.active.map(r=>[r.id,r]));
  for(const place of startingGrid(state.active)){
    const runner=byId.get(place.id);
    runner.gridPosition=place.position;
    runner.lane=place.lane;
  }
}
function announce(state,message) {
  state.messages.unshift({text:message.slice(0,150),at:state.round});
  state.messages.length=Math.min(8,state.messages.length);
}
export function register(state,userId,displayName,content,robloxProfile=null){
  const command=parseRaceJoin(content);
  if(!command)return {ok:false,reason:"Use entrar ou entrar NomeRoblox."};
  if(typeof userId!=="string"||!userId.trim()||userId.length>128)return {ok:false,reason:"ID inválido."};
  let identity={};
  if(command.mode==="roblox"){
    if(!robloxProfile||!Number.isSafeInteger(robloxProfile.id)||robloxProfile.id<1||
       !validRobloxUsername(robloxProfile.username)||
       command.username.toLowerCase()!==robloxProfile.username.toLowerCase())
      return {ok:false,reason:"A conta Roblox precisa ser localizada antes da inscrição."};
    identity={robloxUserId:robloxProfile.id,robloxUsername:robloxProfile.username};
  }
  const id=userId.trim(),name=identity.robloxUsername||
    (String(displayName||"Participante").trim().slice(0,28)||"Participante");
  const current=state.phase==="LOBBY",target=current?state.active:state.next;
  if(target.some(r=>r.id===id))return {ok:false,reason:"Participante já inscrito nesta rodada."};
  if(identity.robloxUserId&&target.some(r=>r.robloxUserId===identity.robloxUserId))
    return {ok:false,reason:"Esse personagem Roblox já foi escolhido nesta rodada."};
  if(target.length>=50)return {ok:false,reason:"Limite de 50 participantes nesta rodada."};
  const person={id,name,...identity};
  if(current){
    target.push(buildRunner(person,target.length,state.seed));
    arrangeStartingGrid(state);
  }else target.push(person);
  const round=state.round+(current?0:1);
  announce(state,name+" confirmado na rodada "+round);
  return {ok:true,round,queue:current?"atual":"próxima",id,...identity};
}
export function addDemo(state,amount=10) {
  let count=0;
  for(let i=1;i<=amount;i++) {
    const id="demo-"+String(i).padStart(2,"0");
    if(register(state,id,"Corredor "+String(i).padStart(2,"0"),"entrar").ok)count++;
  }
  return count;
}
export function rank(runners) {
  return [...runners].sort((a,b)=>{
    const aDone=a.finishTime!==null, bDone=b.finishTime!==null;
    if(aDone!==bDone)return aDone?-1:1;
    if(aDone && bDone)return a.finishTime-b.finishTime||a.id.localeCompare(b.id);
    return b.progress-a.progress||a.id.localeCompare(b.id);
  });
}
function enterPhase(state,nextPhase) {
  state.phase=nextPhase;
  state.phaseMs=0;
  if(nextPhase==="COUNTDOWN"){
    state.manualCamera=null;
    arrangeStartingGrid(state);
    announce(state,"Inscrições da rodada "+state.round+" encerradas.");
  }
  if(nextPhase==="RUNNING"){
    state.manualCamera=null;
    state.raceMs=0;
    state.giftObstacles=[];state.giftObstacleSequence=0;
    for(const r of state.active){
      r.progress=0; r.speed=0; r.status="running"; r.finishTime=null;
      r.slowUntil=0;r.turboUntil=0;r.passed=[];
      r.vehicleKind="foot";r.vehicleUntil=0;
    }
    announce(state,"LARGADA! Boa sorte a todos.");
  }
  if(nextPhase==="RESULTS"){
    state.manualCamera=null;
    state.giftObstacles=[];
    for(const r of state.active){r.vehicleKind="foot";r.vehicleUntil=0;}
    state.results=rank(state.active).map((r,index)=>({
      id:r.id,name:r.name,position:index+1,progress:r.progress,
      finished:r.finishTime!==null,finishTime:r.finishTime
    }));
    recordCompletedRace(state);
    announce(state,"Corrida encerrada. Confira o pódio!");
  }
}
export function nextRound(state) {
  const pending=state.next;
  state.round++;
  state.mapId=mapForRound(state.round);
  state.laps=Number.isInteger(state.nextLaps)&&state.nextLaps>=1&&state.nextLaps<=MAX_LAPS?state.nextLaps:1;
  state.trackLength=TRACK_LENGTH*state.laps;
  state.nextLaps=1;
  state.seed=(state.seed+7919)>>>0;
  state.active=pending.map((p,i)=>buildRunner(p,i,state.seed));
  arrangeStartingGrid({...state,phase:"LOBBY",active:state.active});
  state.next=[];
  state.results=[];
  state.giftObstacles=[];state.giftObstacleSequence=0;state.manualCamera=null;
  state.phase="LOBBY";state.phaseMs=0;state.raceMs=0;state.accumulator=0;
  announce(state,"Novo lobby: "+state.mapId+". É necessário comentar entrar a cada rodada.");
}
export function advance(state) {
  if(state.phase==="LOBBY")enterPhase(state,"COUNTDOWN");
  else if(state.phase==="COUNTDOWN")enterPhase(state,"RUNNING");
  else if(state.phase==="RUNNING")enterPhase(state,"RESULTS");
  else nextRound(state);
}
export function configureNextLaps(state,requested){
  const laps=Number(requested);
  if(!Number.isInteger(laps)||laps<MIN_LAPS||laps>MAX_LAPS)
    return {ok:false,reason:"Escolha de 1 a 10 voltas."};
  if(state.phase==="LOBBY"){
    state.laps=laps;state.trackLength=TRACK_LENGTH*laps;
    announce(state,"Esta corrida terá "+laps+" volta(s) de 400 metros.");
    return {ok:true,laps,applies:"corrida atual"};
  }
  state.nextLaps=laps;
  announce(state,"Próxima corrida: "+laps+" volta(s) de 400 metros.");
  return {ok:true,laps,applies:"próxima corrida"};
}
export const MANUAL_CAMERA_MS=5000;
export function focusRunner(state,userId){
  if(state?.phase!=="RUNNING")
    return {ok:false,reason:"Close manual disponível apenas durante a corrida."};
  if(typeof userId!=="string"||!userId||userId.length>128)
    return {ok:false,reason:"Selecione um participante válido."};
  const runner=state.active.find(r=>r.id===userId&&r.status==="running");
  if(!runner)return {ok:false,reason:"O participante não está correndo."};
  state.manualCamera={
    id:runner.id,round:state.round,
    startRaceMs:state.raceMs,
    untilRaceMs:state.raceMs+MANUAL_CAMERA_MS
  };
  return {ok:true,id:runner.id,name:runner.name,durationMs:MANUAL_CAMERA_MS};
}
export function turbo(state,id) {
  if(state.phase!=="RUNNING")return false;
  const runner=state.active.find(r=>r.id===id&&r.status==="running");
  if(!runner)return false;
  runner.turboUntil=state.raceMs+5000;
  announce(state,"Turbo de teste ativado para "+runner.name);
  return true;
}
export function raceLength(state){
  const d=state?.trackLength;
  return ((Number.isInteger(d)&&d>=TRACK_LENGTH&&d<=TRACK_LENGTH*MAX_LAPS&&d%TRACK_LENGTH===0)||
    [PREVIOUS_LONG_TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,LEGACY_TRACK_LENGTH].includes(d))
    ?d:LEGACY_TRACK_LENGTH;
}
export function phaseDuration(state){
  if(state?.phase!=="RUNNING")return PHASE_TIMES[state?.phase]||0;
  const d=raceLength(state);
  if(d===PREVIOUS_LONG_TRACK_LENGTH)return LONG_RACE_TIMEOUT;
  return d>=TRACK_LENGTH?Math.min(LONG_RACE_TIMEOUT,
    Math.max(PHASE_TIMES.RUNNING,Math.ceil(d/4.3*1000))):PHASE_TIMES.RUNNING;
}
function stepRunners(state,ms) {
  state.raceMs+=ms;
  const seconds=ms/1000;
  const finishAt=raceLength(state);
  // Empty until a completed present event is accepted. At most 8 active,
  // time-limited obstacles are checked per runner, regardless of 5km distance.
  const hazards=activeGiftObstacles(state);
  for(const r of state.active) {
    if(r.status!=="running")continue;
    const slowed=r.slowUntil>state.raceMs;
    const boosted=r.turboUntil>state.raceMs;
    const speed=r.baseSpeed*(slowed?.46:1)*(boosted?1.75:1);
    for(const h of hazards){
      if(h.lane!==r.lane||r.passed.includes(h.id))continue;
      if(r.progress<=h.z&&r.progress+speed*seconds>=h.z-.15){
        r.passed.push(h.id);
        const dice=randomFrom(hash(r.id+"|"+state.seed+"|"+h.id))();
        if(dice<.60){
          r.lane=Math.max(0,Math.min(LANES-1,r.lane+
            (r.lane===4?-1:r.lane===0?1:dice<.3?-1:1)));
        }else{
          r.slowUntil=state.raceMs+1100+Math.floor(dice*800);
        }
      }
    }
    r.speed=speed;
    const previous=r.progress;
    r.progress=Math.min(finishAt,r.progress+speed*seconds);
    if(previous<finishAt&&r.progress>=finishAt) {
      r.status="finished";
      r.finishTime=state.raceMs;
      r.speed=0;
    }
  }
}
function updateStep(state,ms) {
  state.phaseMs+=ms;
  if(state.phase==="RUNNING")stepRunners(state,ms);
  if(state.phase==="RUNNING"&&Array.isArray(state.giftObstacles))
    state.giftObstacles=activeGiftObstacles(state);
  if(state.manualCamera&&state.raceMs>=state.manualCamera.untilRaceMs)
    state.manualCamera=null;
  const everyoneFinished=state.phase==="RUNNING"&&state.active.length>0&&state.active.every(r=>r.status==="finished");
  // No entrants? Don't leave the demo in a pointless 85-second empty race.
  const emptyRace=state.phase==="RUNNING"&&state.active.length===0&&state.phaseMs>=1500;
  if(everyoneFinished||emptyRace||state.phaseMs>=phaseDuration(state))advance(state);
}
export function tick(state,deltaMs) {
  if(state.paused)return;
  state.accumulator+=Math.min(250,Math.max(0,Number(deltaMs)||0));
  while(state.accumulator>=FIXED_STEP) {
    state.accumulator-=FIXED_STEP;
    updateStep(state,FIXED_STEP);
  }
}
export function countdown(state) {
  return Math.max(0,Math.ceil((phaseDuration(state)-state.phaseMs)/1000));
}
// Preserve race progression and participants if a pre-2.3 snapshot was saved
// in one of the retired maps. Only the current map is remapped; historic results
// and season standings remain unchanged.
export function migrateSavedState(v) {
  if(!v||v.version!==1||!Number.isSafeInteger(v.round)||v.round<1)return v;
  const current=BIOME_ORDER.includes(v.mapId);
  const retired=LEGACY_BIOME_IDS.includes(v.mapId);
  if(!current&&!retired)return v; // Unknown biome remains invalid, no silent reset.
  // Preserve old races in progress, but upgrade an idle 5km lobby to the
  // new 400m W circuit without deleting already registered participants.
  const needsDistance=v.trackLength===undefined;
  const upgradeLobby=v.trackLength===PREVIOUS_LONG_TRACK_LENGTH&&v.phase==="LOBBY";
  if(!retired&&!needsDistance&&!upgradeLobby)return v;
  return {
    ...v,
    mapId:retired?mapForRound(v.round):v.mapId,
    trackLength:needsDistance?LEGACY_TRACK_LENGTH:upgradeLobby?TRACK_LENGTH:v.trackLength,
    ...(upgradeLobby?{laps:1,nextLaps:1}:{})
  };
}
export function validateSavedState(v) {
  if(!v||v.version!==1||!Number.isSafeInteger(v.round)||v.round<1||
     !BIOME_ORDER.includes(v.mapId)||!PHASE_TIMES[v.phase]||
     (v.trackLength!==undefined&&
       !((Number.isInteger(v.trackLength)&&v.trackLength>=TRACK_LENGTH&&
          v.trackLength<=TRACK_LENGTH*MAX_LAPS&&v.trackLength%TRACK_LENGTH===0)||
         [PREVIOUS_LONG_TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,LEGACY_TRACK_LENGTH].includes(v.trackLength)))||
     (v.laps!==undefined&&(!Number.isInteger(v.laps)||v.laps<1||v.laps>MAX_LAPS))||
     (v.nextLaps!==undefined&&(!Number.isInteger(v.nextLaps)||v.nextLaps<1||v.nextLaps>MAX_LAPS))||
     !Array.isArray(v.active)||!Array.isArray(v.next)||!Array.isArray(v.results)||
     v.active.length>50||v.next.length>50)return false;
  return true;
}
