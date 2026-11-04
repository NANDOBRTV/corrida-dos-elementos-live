import { TRACK_LENGTH, PREVIOUS_TRACK_LENGTH, LEGACY_TRACK_LENGTH, LONG_RACE_TIMEOUT, STREAM_TILE_LENGTH, PHASE_TIMES, BIOME_ORDER, mapForRound, RUNNER_COLORS, obstaclesFor, LANES, LEGACY_BIOME_IDS } from "./config.js";
import {recordCompletedRace} from "./history.js";
import {parseRaceJoin,validRobloxUsername} from "./roblox-names.js";

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
    version:1, round:1, mapId:mapForRound(1), trackLength:TRACK_LENGTH, phase:"LOBBY", phaseMs:0, raceMs:0,
    accumulator:0, seed:seed>>>0, active:[], next:[], results:[], history:[], seasonLeaders:[], paused:false,
    messages:[{ text:"Ambiente de demonstração iniciado. Digite entrar.", at:0 }]
  };
}
export function buildRunner(person,index,seed) {
  const rng=randomFrom(hash(person.id+"|"+seed));
  return {
    id:person.id, name:person.name, ...(person.robloxUserId?{robloxUserId:person.robloxUserId,robloxUsername:person.robloxUsername}:{}), lane:index%LANES, progress:0,
    baseSpeed:5.05+rng()*1.65, speed:0, status:"waiting",
    finishTime:null, slowUntil:0, turboUntil:0, passed:[], color:RUNNER_COLORS[index%RUNNER_COLORS.length]
  };
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
  if(current)target.push(buildRunner(person,target.length,state.seed));else target.push(person);
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
  if(nextPhase==="COUNTDOWN")announce(state,"Inscrições da rodada "+state.round+" encerradas.");
  if(nextPhase==="RUNNING"){
    state.raceMs=0;
    for(const r of state.active){
      r.progress=0; r.speed=0; r.status="running"; r.finishTime=null;
      r.slowUntil=0;r.turboUntil=0;r.passed=[];
    }
    announce(state,"LARGADA! Boa sorte a todos.");
  }
  if(nextPhase==="RESULTS"){
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
  state.trackLength=TRACK_LENGTH;
  state.seed=(state.seed+7919)>>>0;
  state.active=pending.map((p,i)=>buildRunner(p,i,state.seed));
  state.next=[];
  state.results=[];
  state.phase="LOBBY";state.phaseMs=0;state.raceMs=0;state.accumulator=0;
  announce(state,"Novo lobby: "+state.mapId+". É necessário comentar entrar a cada rodada.");
}
export function advance(state) {
  if(state.phase==="LOBBY")enterPhase(state,"COUNTDOWN");
  else if(state.phase==="COUNTDOWN")enterPhase(state,"RUNNING");
  else if(state.phase==="RUNNING")enterPhase(state,"RESULTS");
  else nextRound(state);
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
  return [TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,LEGACY_TRACK_LENGTH].includes(state?.trackLength)
    ?state.trackLength:LEGACY_TRACK_LENGTH;
}
export function phaseDuration(state){
  return state?.phase==="RUNNING"&&raceLength(state)===TRACK_LENGTH
    ?LONG_RACE_TIMEOUT:PHASE_TIMES[state?.phase]||0;
}
function stepRunners(state,ms) {
  state.raceMs+=ms;
  const seconds=ms/1000;
  const finishAt=raceLength(state);
  const hazards=obstaclesFor(state.mapId,finishAt);
  for(const r of state.active) {
    if(r.status!=="running")continue;
    const slowed=r.slowUntil>state.raceMs;
    const boosted=r.turboUntil>state.raceMs;
    const speed=r.baseSpeed*(slowed?.46:1)*(boosted?1.75:1);
    // Each obstacle has an independent deterministic outcome. Rendering FPS cannot change it.
    // Hazards are ordered by distance. Only inspect the nearby tile, not all
    // ~400 obstacles 50 runners × 20 ticks/second for a 5km race.
    const firstIndex=Math.max(0,Math.floor(r.progress/STREAM_TILE_LENGTH)*24-1);
    for(let i=firstIndex;i<hazards.length;i++) {
      const h=hazards[i];
      if(h.z>r.progress+speed*seconds+.15)break;
      if(h.z<r.progress-.2||r.passed.includes(h.index)||h.lane!==r.lane)continue;
      if(r.progress<=h.z && r.progress+speed*seconds>=h.z-.15) {
        r.passed.push(h.index);
        const dice=randomFrom(hash(r.id+"|"+state.seed+"|"+h.index))();
        if(dice<.60)r.lane=Math.max(0,Math.min(LANES-1,r.lane+(r.lane===4?-1:r.lane===0?1:dice<.3?-1:1)));
        else r.slowUntil=state.raceMs+1100+Math.floor(dice*800);
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
  // New records explicitly declare 5000m. v2.6 snapshots retain their 300m
  // finish, and older snapshots without trackLength retain the 150m finish.
  const needsDistance=v.trackLength===undefined;
  if(!retired&&!needsDistance)return v;
  return {
    ...v,
    mapId:retired?mapForRound(v.round):v.mapId,
    trackLength:needsDistance?LEGACY_TRACK_LENGTH:v.trackLength
  };
}
export function validateSavedState(v) {
  if(!v||v.version!==1||!Number.isSafeInteger(v.round)||v.round<1||
     !BIOME_ORDER.includes(v.mapId)||!PHASE_TIMES[v.phase]||
     (v.trackLength!==undefined&&![TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,LEGACY_TRACK_LENGTH].includes(v.trackLength))||
     !Array.isArray(v.active)||!Array.isArray(v.next)||!Array.isArray(v.results)||
     v.active.length>50||v.next.length>50)return false;
  return true;
}
