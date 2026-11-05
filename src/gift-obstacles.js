// Obstáculos existem SOMENTE após presente aceito pelo servidor ou presente simulado.
// Não há geração periódica. Valores/quantidade de moedas não afetam o resultado.
export const MAX_ACTIVE_GIFT_OBSTACLES=8;
export const MAX_GIFT_OBSTACLES_PER_ROUND=24;
export const GIFT_OBSTACLE_LIFETIME_MS=16000;
export function activeGiftObstacles(state){
  if(state?.phase!=="RUNNING"||!Array.isArray(state?.giftObstacles))return [];
  const clock=Number(state.raceMs)||0;
  return state.giftObstacles.filter(h=>h&&h.round===state.round&&
    Number.isFinite(h.z)&&h.z>=0&&h.z<=(state.trackLength||5000)&&
    Number.isInteger(h.lane)&&h.lane>=0&&h.lane<5&&h.expiresAt>clock);
}
export function spawnGiftObstacle(state,{simulated=false}={}){
  if(state?.phase!=="RUNNING"||!Array.isArray(state?.active))return null;
  const runners=state.active.filter(r=>r?.status==="running"&&Number.isFinite(r.progress));
  if(!runners.length)return null;
  const active=activeGiftObstacles(state);
  const sequence=Number.isSafeInteger(state.giftObstacleSequence)&&state.giftObstacleSequence>=0
    ?state.giftObstacleSequence:0;
  if(active.length>=MAX_ACTIVE_GIFT_OBSTACLES||sequence>=MAX_GIFT_OBSTACLES_PER_ROUND)return null;
  const positions=runners.map(r=>r.progress).sort((a,b)=>a-b);
  const middle=positions[Math.floor(positions.length/2)];
  const finish=Number.isFinite(state.trackLength)?state.trackLength:5000;
  // Place 16 metres ahead of the pack; never spawn on top of a runner.
  const z=Math.min(finish-1,middle+16);
  if(z<=middle+2)return null;
  const obstacle={
    id:"gift-"+state.round+"-"+sequence,
    z,lane:sequence%5,
    kind:state.mapId==="ice"?"ice":"log",
    round:state.round,
    expiresAt:(Number(state.raceMs)||0)+GIFT_OBSTACLE_LIFETIME_MS,
    simulated:simulated===true
  };
  state.giftObstacleSequence=sequence+1;
  state.giftObstacles=[...active,obstacle];
  return obstacle;
}
