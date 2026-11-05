// Periodic broadcast camera close-up; visual-only, never changes race state.
// Uses authoritative raceMs (not wall clock) so pausing and reconnecting are safe.
export const CLOSEUP_EVERY_MS=10000;
export const CLOSEUP_DURATION_MS=3200;
const FADE_IN_MS=650,FADE_OUT_MS=750;
function hash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function smoothstep(x){
  const v=Math.min(1,Math.max(0,x));
  return v*v*(3-2*v);
}
export function eligibleForCloseup(race){
  const active=Array.isArray(race?.active)?race.active:[];
  const running=active.filter(r=>r&&r.status==="running"&&typeof r.id==="string"&&
    Number.isFinite(r.progress)&&r.progress>=0&&Number.isInteger(r.lane)&&r.lane>=0&&r.lane<5);
  if(!running.length)return [];
  const distances=running.map(r=>r.progress).sort((a,b)=>a-b);
  const middle=distances[Math.floor(distances.length*.45)];
  const nearby=running.filter(r=>Math.abs(r.progress-middle)<=115);
  return nearby.sort((a,b)=>a.id.localeCompare(b.id));
}
export function chooseCloseup(race,slot,previousId=null){
  const pool=eligibleForCloseup(race);
  if(!pool.length)return null;
  let index=hash(String(race?.seed??0)+"|"+String(race?.round??0)+"|"+slot)%pool.length;
  if(pool.length>1&&pool[index].id===previousId)index=(index+1)%pool.length;
  return pool[index];
}
export function createCameraDirector(){
  let round=null,slot=0,selectedId=null,previousId=null,latest=null;
  function reset(){
    round=null;slot=0;selectedId=null;previousId=null;latest=null;
  }
  function update(race){
    const ms=Number(race?.raceMs);
    if(!race||race.phase!=="RUNNING"||!Number.isFinite(ms)||ms<0){
      reset();return null;
    }
    if(round!==race.round){round=race.round;slot=0;selectedId=null;previousId=null;}
    const currentSlot=Math.floor(ms/CLOSEUP_EVERY_MS);
    if(currentSlot<1){latest=null;return null;}
    if(currentSlot!==slot){
      if(currentSlot<slot){previousId=null;}
      slot=currentSlot;
      const chosen=chooseCloseup(race,slot,previousId);
      selectedId=chosen?.id??null;
      if(chosen)previousId=chosen.id;
    }
    const time=ms-currentSlot*CLOSEUP_EVERY_MS;
    if(time>=CLOSEUP_DURATION_MS||!selectedId){latest=null;return null;}
    const runner=race.active.find(r=>r.id===selectedId&&r.status==="running");
    if(!runner){latest=null;return null;}
    const blend=Math.min(smoothstep(time/FADE_IN_MS),
      smoothstep((CLOSEUP_DURATION_MS-time)/FADE_OUT_MS));
    latest={
      id:runner.id,name:String(runner.name||"Corredor").slice(0,28),
      progress:runner.progress,lane:runner.lane,
      slot:currentSlot,elapsedMs:time,blend
    };
    return latest;
  }
  return {update,reset,current:()=>latest};
}
