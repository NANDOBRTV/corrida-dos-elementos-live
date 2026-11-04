// Histórico compacto embutido no snapshot do jogo, persistido no PostgreSQL.
export const MAX_RACE_HISTORY=12;
export const MAX_SEASON_LEADERS=100;
function boundedArray(value){return Array.isArray(value)?value:[];}
function numericTime(value){return Number.isFinite(value)&&value>=0?value:null;}
export function recordCompletedRace(state) {
  if(!state||!Number.isSafeInteger(state.round)||state.round<1||!Array.isArray(state.results))return false;
  const history=boundedArray(state.history);
  // Called once when entering RESULTS; guard against replay on recovery.
  if(history.some(h=>h.round===state.round))return false;
  const finished=state.results.filter(r=>r.finished===true&&numericTime(r.finishTime)!==null);
  const podium=finished.slice(0,3).map((r,i)=>({
    id:String(r.id).slice(0,128),name:String(r.name).slice(0,28),
    position:i+1,timeMs:r.finishTime
  }));
  const winner=podium[0]??null;
  state.history=[{
    round:state.round,mapId:state.mapId,
    winner,podium,participants:state.results.length
  },...history].slice(0,MAX_RACE_HISTORY);
  const standings=new Map(boundedArray(state.seasonLeaders).filter(x=>x&&typeof x.id==="string").map(x=>[x.id,x]));
  for(const r of state.results){
    if(!r||typeof r.id!=="string"||!r.id)continue;
    const previous=standings.get(r.id);
    const entry=previous?{...previous}:{id:r.id,name:String(r.name).slice(0,28),
      wins:0,podiums:0,races:0,finishes:0,bestTimeMs:null};
    entry.name=String(r.name).slice(0,28);
    entry.races++;
    if(r.finished===true&&numericTime(r.finishTime)!==null){
      entry.finishes++;
      entry.bestTimeMs=entry.bestTimeMs===null? r.finishTime:Math.min(entry.bestTimeMs,r.finishTime);
      if(podium.some(p=>p.id===r.id))entry.podiums++;
      if(winner?.id===r.id)entry.wins++;
    }
    standings.set(r.id,entry);
  }
  state.seasonLeaders=[...standings.values()].sort((a,b)=>
    b.wins-a.wins||b.podiums-a.podiums||b.finishes-a.finishes||
    (a.bestTimeMs??Infinity)-(b.bestTimeMs??Infinity)||a.id.localeCompare(b.id)
  ).slice(0,MAX_SEASON_LEADERS);
  return true;
}
export function seasonTop(state,limit=5){
  return boundedArray(state?.seasonLeaders).slice(0,Math.max(0,Math.min(20,Math.trunc(limit)||5)));
}
export function recentWinners(state,limit=3){
  return boundedArray(state?.history).filter(x=>x?.winner).slice(0,Math.max(0,Math.min(12,Math.trunc(limit)||3)));
}
