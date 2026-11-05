// Regras públicas dos presentes. Não representam conversão financeira nem saldo de moedas.
import {spawnGiftObstacle} from "./gift-obstacles.js";
import {hash} from "./engine.js";
export const GIFT_TURBO_MS=4000;
export const MAX_GIFT_FEED=8;
export const GIFT_VEHICLE_MS=12000;

export function applyGiftEvent(state,gift) {
  if(!state||typeof gift!=="object"||!gift)return {ok:false,reason:"Evento inválido"};
  const userId=typeof gift.userId==="string"?gift.userId.trim():"";
  if(!userId||userId.length>128)return {ok:false,reason:"Remetente inválido"};
  const nickname=String(gift.displayName||"Espectador").trim().slice(0,28)||"Espectador";
  const giftName=String(gift.giftName||"Presente").trim().slice(0,40)||"Presente";
  const repeatCount=Number(gift.repeatCount);
  const quantity=Number.isSafeInteger(repeatCount)&&repeatCount>0
    ?Math.min(999,repeatCount):1;
  const runner=state.active.find(r=>r.id===userId);
  // Um único turbo por corredor em cada rodada: não transforma presentes caros em vitória certa.
  const eligible=state.phase==="RUNNING"&&runner?.status==="running"&&runner.giftBoostRound!==state.round;
  if(eligible){
    runner.giftBoostRound=state.round;
    runner.turboUntil=Math.max(Number(runner.turboUntil)||0,state.raceMs+GIFT_TURBO_MS);
  }
  const effect=eligible?"turbo":"agradecimento";
  const simulated=gift.simulated===true;
  const obstacle=spawnGiftObstacle(state,{simulated});
  let vehicle=null;
  if(state.phase==="RUNNING"){
    const runners=state.active.filter(r=>r.status==="running");
    if(runners.length){
      const selected=runner?.status==="running"?runner:
        runners[hash(userId+"|"+String(gift.giftId??"gift"))%runners.length];
      const hint=(giftName+" "+String(gift.giftId??"")).toLowerCase();
      const kind=/moto|motorcycle/.test(hint)?"moto":
        /carro|kart|car/.test(hint)?"kart":
        hash(userId+"|"+giftName)%2===0?"kart":"moto";
      selected.vehicleKind=kind;
      selected.vehicleUntil=state.raceMs+GIFT_VEHICLE_MS;
      vehicle={runnerId:selected.id,runnerName:selected.name,kind,
        expiresAt:selected.vehicleUntil,simulated};
    }
  }
  const entry={
    userId,displayName:nickname,giftName,quantity,
    effect,simulated,round:state.round,obstacleSpawned:Boolean(obstacle),vehicle:vehicle?.kind??null
  };
  if(!Array.isArray(state.gifts))state.gifts=[];
  state.gifts.unshift(entry);
  state.gifts.length=Math.min(state.gifts.length,MAX_GIFT_FEED);
  const announce=(simulated?"[TESTE] ":"")+nickname+" enviou "+giftName+
    (quantity>1?" x"+quantity:"")+(eligible?" · TURBO +4s!":" · obrigado!")+
    (obstacle?" · OBSTÁCULO NA PISTA!":"")+
    (vehicle?" · "+(vehicle.kind==="kart"?"CARRO":"MOTO")+" PARA "+vehicle.runnerName:"");
  if(!Array.isArray(state.messages))state.messages=[];
  state.messages.unshift({text:announce.slice(0,150),at:state.round});
  state.messages.length=Math.min(8,state.messages.length);
  return {ok:true,effect,entry,obstacle:obstacle||null,vehicle};
}

// Retém somente marcadores técnicos de eventos; não armazena mensagens nem tokens.
export function createGiftDeduplicator({max=3000,ttlMs=20*60*1000}={}){
  const previous=new Map();
  return {
    accept(gift,time=Date.now()){
      if(!gift||typeof gift.userId!=="string"||!gift.userId)return false;
      for(const [key,seenAt] of previous){
        if(time-seenAt>ttlMs)previous.delete(key);
      }
      const sender=gift.userId;
      const giftId=String(gift.giftId||"gift");
      const group=String(gift.groupId||"");
      const eventId=String(gift.eventId||"");
      const key=group
        ?"combo:"+sender+":"+giftId+":"+group
        :eventId?"event:"+sender+":"+eventId
        :"fallback:"+sender+":"+giftId+":"+Math.floor(time/2500);
      if(previous.has(key))return false;
      previous.set(key,time);
      while(previous.size>max)previous.delete(previous.keys().next().value);
      return true;
    },
    reset(){previous.clear();},
    size(){return previous.size;}
  };
}
