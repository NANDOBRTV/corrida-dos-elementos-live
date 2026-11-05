// Broadcast spotlight: 0–10s randomized pause BETWEEN camera closeups.
// Official raceMs drives the clock, so pauses/reconnects cannot speed up the cuts.
// Camera animation only: race physics, gifts and results never change.
import {LANES} from "./config.js";
export const CLOSEUP_WAIT_MIN_MS=0;
export const CLOSEUP_WAIT_MAX_MS=10000;
export const CLOSEUP_DURATION_MS=3200;
const FADE_IN_MS=650,FADE_OUT_MS=750;
function hash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function smoothstep(x){
  const t=Math.min(1,Math.max(0,x));
  return t*t*(3-2*t);
}
// This is stable for a given round/shot index, including after browser reconnects.
// Zero means the next close begins immediately after the previous 3.2s highlight.
export function closeupWaitMs(race,index){
  return hash(String(race?.seed??0)+"|"+String(race?.round??0)+"|pause|"+index)%
    (CLOSEUP_WAIT_MAX_MS+1);
}
export function eligibleForCloseup(race){
  const active=Array.isArray(race?.active)?race.active:[];
  const running=active.filter(r=>r&&r.status==="running"&&typeof r.id==="string"&&
    Number.isFinite(r.progress)&&r.progress>=0&&Number.isInteger(r.lane)&&r.lane>=0&&r.lane<LANES);
  if(!running.length)return [];
  const distances=running.map(r=>r.progress).sort((a,b)=>a-b);
  const middle=distances[Math.floor(distances.length*.45)];
  return running.filter(r=>Math.abs(r.progress-middle)<=115)
    .sort((a,b)=>a.id.localeCompare(b.id));
}
export function chooseCloseup(race,slot,previousId=null){
  const pool=eligibleForCloseup(race);
  if(!pool.length)return null;
  let index=hash(String(race?.seed??0)+"|"+String(race?.round??0)+"|"+slot)%pool.length;
  if(pool.length>1&&pool[index].id===previousId)index=(index+1)%pool.length;
  return pool[index];
}
export function manualCloseup(race){
  const request=race?.manualCamera;
  const ms=Number(race?.raceMs);
  if(race?.phase!=="RUNNING"||!request||!Number.isFinite(ms)||
     request.round!==race.round||
     !Number.isFinite(request.startRaceMs)||
     !Number.isFinite(request.untilRaceMs)||
     ms<request.startRaceMs||ms>=request.untilRaceMs)return null;
  const runner=(race.active||[]).find(r=>r.id===request.id&&r.status==="running");
  if(!runner)return null;
  const elapsed=ms-request.startRaceMs,duration=request.untilRaceMs-request.startRaceMs;
  const blend=Math.min(smoothstep(elapsed/FADE_IN_MS),
    smoothstep((duration-elapsed)/FADE_OUT_MS));
  return {id:runner.id,name:String(runner.name||"Corredor").slice(0,28),
    progress:runner.progress,lane:runner.lane,blend,
    manual:true,elapsedMs:elapsed,durationMs:duration};
}
export function createCameraDirector(){
  let round=null,seed=null,shot=0,nextStart=0,selectedId=null,attempted=false;
  let previousId=null,latest=null,lastMs=-1;
  function reset(){
    round=null;seed=null;shot=0;nextStart=0;selectedId=null;
    attempted=false;previousId=null;latest=null;lastMs=-1;
  }
  function startRound(race){
    round=race.round;
    seed=race.seed;
    shot=0;
    nextStart=closeupWaitMs(race,0);
    selectedId=null;attempted=false;previousId=null;latest=null;
  }
  function update(race){
    const ms=Number(race?.raceMs);
    if(!race||race.phase!=="RUNNING"||!Number.isFinite(ms)||ms<0){
      reset();return null;
    }
    // Reset on official round change or a true replay/restart (old snapshot).
    if(round!==race.round||seed!==race.seed||ms<lastMs-1500)startRound(race);
    lastMs=ms;
    // Process skipped shots when reconnecting or jumping to a later checkpoint.
    // Each shot lasts 3.2s; the additional pause is always 0–10 seconds.
    while(ms>=nextStart+CLOSEUP_DURATION_MS){
      shot++;
      nextStart+=CLOSEUP_DURATION_MS+closeupWaitMs(race,shot);
      selectedId=null;attempted=false;
    }
    const manual=manualCloseup(race);
    if(manual){latest=manual;return manual;}
    if(ms<nextStart){latest=null;return null;}
    if(!attempted){
      const chosen=chooseCloseup(race,shot+1,previousId);
      selectedId=chosen?.id??null;
      attempted=true;
      if(chosen)previousId=chosen.id;
    }
    if(!selectedId){latest=null;return null;}
    const runner=race.active.find(r=>r.id===selectedId&&r.status==="running");
    if(!runner){latest=null;return null;}
    const elapsed=ms-nextStart;
    const blend=Math.min(smoothstep(elapsed/FADE_IN_MS),
      smoothstep((CLOSEUP_DURATION_MS-elapsed)/FADE_OUT_MS));
    latest={id:runner.id,name:String(runner.name||"Corredor").slice(0,28),
      progress:runner.progress,lane:runner.lane,slot:shot+1,elapsedMs:elapsed,blend};
    return latest;
  }
  return {update,reset,current:()=>latest};
}
