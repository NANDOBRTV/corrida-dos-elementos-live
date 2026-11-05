// Studio V5 optional backend. Isolated from the existing public state and DB.
// Enable with STUDIO_V5_ENABLED=true only after its UI and persistence pass QA.
// This module never accepts untrusted public gameplay mutations.
import {timingSafeEqual} from "node:crypto";
import {LIVE_STUDIO} from "../src/config.js";
import {
  createStudioState,studioJoin,studioGift,studioLike,studioFollow,
  studioSetDistance,studioAdvance,studioFillBots,studioTick,
  studioRank,studioCountdown
} from "../src/studio-engine.js";

const MAX_BODY=8192;
const MAX_CLIENTS=80;
const MAX_EVENTS=3000;
const DEDUP_TTL=20*60*1000;
const FRAME_INTERVAL=500;
const HEARTBEAT_INTERVAL=20000;
const VALID_ACTIONS=new Set(["advance","fill-bots","set-distance","pause","resume"]);
const bounded=(input,max=128)=>String(input??"").trim().slice(0,max);

function send(res,status,body){
  if(res.destroyed||res.writableEnded)return;
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(body));
}
function authorized(req,secret){
  if(!secret)return false;
  const actual=req.headers["x-admin-key"];
  if(typeof actual!=="string")return false;
  const a=Buffer.from(actual),b=Buffer.from(secret);
  return a.length===b.length&&timingSafeEqual(a,b);
}
async function parseBody(req){
  let size=0;
  const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY){
      const err=new Error("Corpo acima do limite");err.httpStatus=413;throw err;
    }
    chunks.push(chunk);
  }
  try{
    const data=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Formato");
    return data;
  }catch{
    const err=new Error("JSON inválido");err.httpStatus=400;throw err;
  }
}
function compactRunner(r){
  return {id:r.id,name:r.name,color:r.color,lane:r.lane,
    gridPosition:r.gridPosition,progress:Math.round(r.progress*10)/10,
    status:r.status,finishMs:r.finishMs,isBot:r.isBot,
    speed:Math.round(r.speed*100)/100,
    ...(r.robloxUserId?{robloxUserId:r.robloxUserId}:{})};
}
function normalizeEvent(data){
  if(!data||typeof data!=="object")return null;
  const type=bounded(data.type,20).toLowerCase();
  if(!["join","like","gift","follow"].includes(type))return null;
  const eventId=typeof data.eventId==="string"?bounded(data.eventId,160):null;
  const userId=bounded(data.userId,128);
  const name=bounded(data.name??data.displayName??"Espectador",28);
  if(type!=="like"&&!userId)return null;
  return {type,eventId,userId,name,
    ...(type==="join"?{robloxUserId:Number.isSafeInteger(data.robloxUserId)&&
      data.robloxUserId>0?data.robloxUserId:null}:{}),
    ...(type==="like"?{count:data.count}:{}),
    ...(type==="gift"?{giftName:bounded(data.giftName??"Presente",40),
      coins:data.coins}:{}),
  };
}

export function createStudioRuntime({
  adminKey="",seed=91357,distance=LIVE_STUDIO.defaultDistance,
  sourceConnected=false,clock=()=>Date.now(),autoStart=true
}={}){
  let state=createStudioState({seed,distance,connected:sourceConnected});
  let lastTick=clock(),lastEmit=clock(),closed=false,revision=0;
  let timer=null,heartbeat=null;
  const clients=new Set();
  const dedupe=new Map();
  const metrics={joined:0,likes:0,gifts:0,follows:0,frames:0,rejected:0};

  function snapshot(){
    const standings=studioRank(state.active);
    return {
      ok:true,mode:"studio-v5",revision,serverTime:clock(),
      state:{
        schema:2,round:state.round,mapId:state.mapId,
        phase:state.phase,phaseMs:state.phaseMs,raceMs:state.raceMs,
        distance:state.distance,nextDistance:state.nextDistance,
        countdown:studioCountdown(state),
        connected:state.connected,paused:state.paused,
        active:state.active.map(compactRunner),
        nextCount:state.next.length,
        results:state.results.slice(0,100),
        leaderboard:standings.slice(0,5).map((r,i)=>({
          id:r.id,name:r.name,position:i+1,meters:Math.floor(r.progress),
          color:r.color,isBot:r.isBot
        })),
        messages:state.messages.slice(0,5),effects:state.effects.slice(0,60),
        likesTotal:state.likesTotal
      }
    };
  }
  function publish(force=false){
    const now=clock();
    if(!force&&now-lastEmit<FRAME_INTERVAL)return;
    const wire="event: race\ndata: "+JSON.stringify(snapshot())+"\n\n";
    for(const client of clients){
      if(client.destroyed||client.writableEnded){clients.delete(client);continue;}
      try{
        if(!client.write(wire)){
          clients.delete(client);
          client.end();
        }
      }catch{clients.delete(client);try{client.destroy();}catch{}}
    }
    lastEmit=now;metrics.frames++;
  }
  function pruneDedupe(){
    const now=clock();
    for(const [key,at] of dedupe){
      if(now-at>DEDUP_TTL)dedupe.delete(key);
    }
    while(dedupe.size>MAX_EVENTS)dedupe.delete(dedupe.keys().next().value);
  }
  function ingest(raw){
    if(closed)return {ok:false,reason:"Servidor encerrado"};
    const event=normalizeEvent(raw);
    if(!event)return {ok:false,reason:"Evento inválido"};
    // Only delivered event IDs are deduplicated; no hidden global user locks.
    const key=event.eventId?event.type+":"+event.eventId:null;
    pruneDedupe();
    if(key&&dedupe.has(key))return {ok:true,duplicate:true};
    let result;
    switch(event.type){
      case "join":result=studioJoin(state,{
        userId:event.userId,name:event.name,robloxUserId:event.robloxUserId
      });break;
      case "like":result=studioLike(state,{
        userId:event.userId,count:event.count
      });break;
      case "gift":result=studioGift(state,{
        userId:event.userId,name:event.giftName,coins:event.coins
      });break;
      case "follow":result=studioFollow(state,{
        userId:event.userId,name:event.name
      });break;
    }
    if(result?.ok){
      if(key){dedupe.set(key,clock());pruneDedupe();}
      metrics[event.type==="join"?"joined":event.type==="like"?"likes":
        event.type==="gift"?"gifts":"follows"]++;
      revision++;publish(true);
    }else metrics.rejected++;
    return result??{ok:false,reason:"Evento indisponível"};
  }
  function act({action,distance:requested,count}={}){
    if(closed)return {ok:false,reason:"Servidor encerrado"};
    if(!VALID_ACTIONS.has(action))return {ok:false,reason:"Ação não reconhecida"};
    let result={ok:true};
    if(action==="advance")studioAdvance(state);
    else if(action==="fill-bots"){
      result={ok:true,added:studioFillBots(state,{
        count:Math.max(0,Math.min(100,Number(count) || 100))
      })};
    }else if(action==="set-distance")result=studioSetDistance(state,requested);
    else if(action==="pause")state.paused=true;
    else if(action==="resume"){state.paused=false;lastTick=clock();}
    if(result.ok){revision++;publish(true);}
    return result;
  }
  function frame(){
    if(closed)return;
    const now=clock(),elapsed=Math.max(0,Math.min(now-lastTick,3000));
    lastTick=now;
    if(elapsed>0){
      const round=state.round,phase=state.phase;
      studioTick(state,elapsed);
      if(round!==state.round){dedupe.clear();}
      if(!state.paused){
        revision++;
        if(phase!==state.phase)publish(true);
      }
    }
    publish();
  }
  async function handle(req,res,path){
    if(!path.startsWith("/api/studio/"))return false;
    if(closed){send(res,503,{ok:false,error:"Studio indisponível"});return true;}
    if(path==="/api/studio/health"&&req.method==="GET"){
      send(res,200,{ok:true,enabled:true,phase:state.phase,
        round:state.round,connected:state.connected,clients:clients.size,
        persistence:"memory-isolated",metrics});return true;
    }
    if(path==="/api/studio/state"&&req.method==="GET"){
      send(res,200,snapshot());return true;
    }
    if(path==="/api/studio/events"&&req.method==="GET"){
      if(clients.size>=MAX_CLIENTS){
        send(res,503,{ok:false,error:"Limite de espectadores"});return true;
      }
      res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8",
        "Cache-Control":"no-cache, no-transform",
        "Connection":"keep-alive","X-Accel-Buffering":"no"});
      res.write("retry: 2500\n\n");
      clients.add(res);
      res.write("event: race\ndata: "+JSON.stringify(snapshot())+"\n\n");
      req.once("close",()=>clients.delete(res));
      return true;
    }
    if(!path.startsWith("/api/studio/admin/")){
      send(res,404,{ok:false,error:"Rota Studio não encontrada"});return true;
    }
    if(req.method!=="POST"){
      send(res,405,{ok:false,error:"Use POST"});return true;
    }
    if(!authorized(req,adminKey)){
      send(res,401,{ok:false,error:"Acesso negado"});return true;
    }
    let data;
    try{data=await parseBody(req);}
    catch(error){
      send(res,error.httpStatus||400,{ok:false,error:error.message});return true;
    }
    const result=path==="/api/studio/admin/event"?ingest(data):
      path==="/api/studio/admin/action"?act(data):
      {ok:false,reason:"Rota desconhecida"};
    send(res,result.ok?200:400,{...result,revision});
    return true;
  }
  function start(){
    if(timer||closed)return;
    lastTick=clock();
    timer=setInterval(frame,50);
    heartbeat=setInterval(()=>{
      for(const client of clients){
        if(client.destroyed){clients.delete(client);continue;}
        try{if(!client.write(": keep-alive\n\n")){
          clients.delete(client);client.end();
        }}catch{clients.delete(client);try{client.destroy();}catch{}}
      }
    },HEARTBEAT_INTERVAL);
    timer.unref?.();
    heartbeat.unref?.();
  }
  function setConnected(value){
    if(closed)return;
    state.connected=Boolean(value);
    revision++;publish(true);
  }
  function stop(){
    if(closed)return;closed=true;
    clearInterval(timer);clearInterval(heartbeat);
    for(const client of clients){try{client.end();}catch{}}
    clients.clear();dedupe.clear();
  }
  if(autoStart)start();
  return {handle,ingest,act,snapshot,state:()=>state,frame,start,stop,
    setConnected,metrics};
}
