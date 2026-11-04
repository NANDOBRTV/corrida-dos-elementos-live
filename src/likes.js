// Curtidas recebidas do conector: não representam espectadores únicos ou recompensas.
// Agrupar rajadas evita um broadcast ou gravação no banco por cada toque.
export const LIKE_FLUSH_MS=2000;
export function createLikeBuffer({intervalMs=LIKE_FLUSH_MS,maxSeen=3000,ttlMs=1200000}={}){
  const seen=new Map();let pending=0,events=0,lastFlushAt=0;
  return {
    accept(like,time=Date.now()){
      if(!like||!Number.isSafeInteger(like.count)||like.count<1||like.count>100000)return false;
      const key=typeof like.eventId==="string"&&like.eventId?like.eventId:null;
      if(key){
        for(const [id,at] of seen)if(time-at>ttlMs)seen.delete(id);
        if(seen.has(key))return false;
        seen.set(key,time);
        while(seen.size>maxSeen)seen.delete(seen.keys().next().value);
      }
      pending=Math.min(1_000_000_000,pending+like.count);events++;
      return true;
    },
    drain(time=Date.now(),force=false){
      if(!pending||(!force&&time-lastFlushAt<intervalMs))return null;
      const batch={count:pending,events};pending=0;events=0;lastFlushAt=time;return batch;
    },
    pending:()=>pending
  };
}
export function applyLikeBatch(state,batch){
  if(!state||!Number.isSafeInteger(batch?.count)||batch.count<1)return null;
  const old=Number.isSafeInteger(state.observedLikes)&&state.observedLikes>=0?state.observedLikes:0;
  state.observedLikes=Math.min(1_000_000_000,old+batch.count);
  if(!Array.isArray(state.messages))state.messages=[];
  state.messages.unshift({text:"♥ "+batch.count+" curtidas observadas (sem vantagem na corrida)",at:state.round});
  state.messages.length=Math.min(8,state.messages.length);
  return {count:batch.count,total:state.observedLikes};
}
