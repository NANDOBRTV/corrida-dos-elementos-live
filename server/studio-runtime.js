// Studio V5 optional backend. Isolated from the existing public state and DB.
// Enable with STUDIO_V5_ENABLED=true only after its UI and persistence pass QA.
// This module never accepts untrusted public gameplay mutations.
import {timingSafeEqual} from "node:crypto";
import {LIVE_STUDIO,BIOME_ORDER} from "../src/config.js";
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

const CHECKPOINT_FORMAT="studio-v5-checkpoint";
const WRITE_DEBOUNCE=650,WRITE_PERIOD=4000,MAX_CHECKPOINT_BYTES=250000;
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const isNum=x=>typeof x==="number"&&Number.isFinite(x);
const isInt=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const phasemax={LOBBY:LIVE_STUDIO.lobbyMs,
  COUNTDOWN:LIVE_STUDIO.countdownMs,RUNNING:LIVE_STUDIO.maxRaceMs,
  RESULTS:LIVE_STUDIO.resultsMs};
function validDistance(x){return isInt(x,LIVE_STUDIO.minDistance,LIVE_STUDIO.maxDistance)&&
  (x-LIVE_STUDIO.minDistance)%LIVE_STUDIO.distanceStep===0;}
export function validateStudioCheckpoint(value){
  if(value==null)return null;
  if(!isObject(value)||value.format!==CHECKPOINT_FORMAT||value.version!==1||
    !isInt(value.revision,0,Number.MAX_SAFE_INTEGER)||!isNum(value.savedAt))
    throw Error("Checkpoint V5 inválido: cabeçalho");
  const serialized=JSON.stringify(value);
  if(!serialized||Buffer.byteLength(serialized)>MAX_CHECKPOINT_BYTES)
    throw Error("Checkpoint V5 inválido: tamanho");
  const v=value.state;
  if(!isObject(v)||v.schema!==2||!isInt(v.round,1,1e9)||
    !BIOME_ORDER.includes(v.mapId)||!Object.hasOwn(phasemax,v.phase)||
    !isNum(v.phaseMs)||v.phaseMs<0||v.phaseMs>phasemax[v.phase]||
    !isNum(v.raceMs)||v.raceMs<0||v.raceMs>LIVE_STUDIO.maxRaceMs||
    !isInt(v.seed,0,4294967295)||!validDistance(v.distance)||
    !validDistance(v.nextDistance)||!isNum(v.likesTotal)||
    !isInt(v.eventSequence,0,Number.MAX_SAFE_INTEGER)||
    typeof v.paused!=="boolean"||
    !Array.isArray(v.active)||v.active.length>100||
    !Array.isArray(v.next)||v.next.length>100||
    !Array.isArray(v.results)||v.results.length>100||
    !Array.isArray(v.effects)||v.effects.length>LIVE_STUDIO.maxVisualEffects||
    !Array.isArray(v.messages)||v.messages.length>5)
    throw Error("Checkpoint V5 inválido: motor");
  const seen=new Set();
  for(const r of v.active){
    if(!isObject(r)||typeof r.id!=="string"||r.id.length<1||
      r.id.length>128||seen.has(r.id)||typeof r.name!=="string"||
      r.name.length>28||!isInt(r.lane,0,9)||
      !isInt(r.gridPosition,1,100)||
      !["waiting","running","finished"].includes(r.status)||
      !isNum(r.progress)||r.progress<0||r.progress>v.distance||
      !["speed","baseSpeed","likeBonus","turboUntil","jetpackUntil",
        "turboCharges","lastTurboChargeAt","slowUntil",
        "lastLaneChangeAt"].every(k=>isNum(r[k]))||
      !(r.finishMs===null||isNum(r.finishMs)))
      throw Error("Checkpoint V5 inválido: corredor");
    seen.add(r.id);
  }
  const nextIds=new Set();
  for(const item of v.next){
    const id=item?.id??item?.userId;
    if(!isObject(item)||typeof id!=="string"||!id||id.length>128||
      nextIds.has(id))throw Error("Checkpoint V5 inválido: fila");
    nextIds.add(id);
  }
  if(!Array.isArray(value.dedupe)||value.dedupe.length>MAX_EVENTS||
    !value.dedupe.every(item=>Array.isArray(item)&&item.length===2&&
      typeof item[0]==="string"&&item[0].length<=190&&isNum(item[1])))
    throw Error("Checkpoint V5 inválido: deduplicação");
  return structuredClone(value);
}
export async function openStudioStore({
  connectionString=process.env.DATABASE_URL,requireDatabase=false,pool=null
}={}){
  if(!pool&&!connectionString){
    if(requireDatabase)throw Error("Studio V5 requer DATABASE_URL para preservar corridas");
    return {enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  }
  let owned=false,db=pool;
  try{
    if(!db){
      const {Pool}=await import("pg");
      db=new Pool({connectionString,max:1,
        ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:true}:undefined,
        connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
      owned=true;
    }
    await db.query("SELECT 1");
    await db.query(`CREATE TABLE IF NOT EXISTS elemental_studio_state
      (id SMALLINT PRIMARY KEY CHECK(id=1),
       checkpoint JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    return {enabled:true,
      async load(){
        const result=await db.query("SELECT checkpoint FROM elemental_studio_state WHERE id=1");
        return validateStudioCheckpoint(result.rows[0]?.checkpoint??null);
      },
      async save(value){
        const safe=validateStudioCheckpoint(value);
        await db.query(`INSERT INTO elemental_studio_state(id,checkpoint,updated_at)
          VALUES(1,$1::jsonb,NOW()) ON CONFLICT(id) DO UPDATE
          SET checkpoint=excluded.checkpoint,updated_at=NOW()`,
          [JSON.stringify(safe)]);
      },
      async close(){if(owned)await db.end();}
    };
  }catch(error){
    if(owned&&db)await db.end().catch(()=>{});
    throw error;
  }
}


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
  sourceConnected=false,clock=()=>Date.now(),autoStart=true,
  store=null,checkpoint=null
}={}){
  const restored=validateStudioCheckpoint(checkpoint);
  let state=restored?.state??createStudioState({seed,distance,connected:sourceConnected});
  state.connected=Boolean(sourceConnected);
  state.effects=state.effects.filter(e=>e&&Number(e.expiresAt)>state.raceMs);
  let lastTick=clock(),lastEmit=clock(),closed=false;
  let revision=restored?restored.revision+1:0;
  let savedRevision=restored?restored.revision:-1;
  let timer=null,heartbeat=null,writeTimer=null,shuttingDown=false;
  let lastWriteAttempt=clock(),lastWriteSuccess=restored?.savedAt??null,
    lastWriteError=null,writeFailures=0;
  let writeQueue=Promise.resolve(),queuedRevision=-1,queuedJob=null,closingPromise=null;
  const clients=new Set();
  const dedupe=new Map((restored?.dedupe??[]).filter(([key,at])=>
    typeof key==="string"&&clock()-at<=DEDUP_TTL));
  const metrics={joined:0,likes:0,gifts:0,follows:0,frames:0,rejected:0,
    watchdogErrors:0,writeFailures:0,restored:Boolean(restored)};


  function storageHealth(){
    return {mode:store?.enabled?"postgres":"memory-isolated",
      healthy:Boolean(store?.enabled)&&!lastWriteError,
      recovered:Boolean(restored),savedAt:lastWriteSuccess,
      dirty:Boolean(store?.enabled)&&revision!==savedRevision,
      error:lastWriteError,writeFailures};
  }
  function checkpointSnapshot(){
    pruneDedupe();
    return {format:CHECKPOINT_FORMAT,version:1,revision,savedAt:clock(),
      state:structuredClone(state),dedupe:[...dedupe].slice(-MAX_EVENTS)};
  }
  function persist(force=false){
    if(!store?.enabled)return Promise.resolve(false);
    if(!force&&savedRevision===revision)return Promise.resolve(true);
    if(queuedRevision===revision&&queuedJob)return queuedJob;
    const targetRevision=revision,payload=checkpointSnapshot();
    const next=writeQueue.then(async()=>{
      if(targetRevision<=savedRevision)return true;
      await store.save(payload);
      savedRevision=targetRevision;
      lastWriteSuccess=payload.savedAt;lastWriteError=null;
      return true;
    }).catch(error=>{
      lastWriteError=String(error?.message??error).slice(0,160);
      writeFailures++;metrics.writeFailures=writeFailures;
      // A failed revision must be eligible for another save attempt.
      if(queuedRevision===targetRevision){queuedRevision=-1;queuedJob=null;}
      console.error("[studio-v5/storage]",lastWriteError);
      return false;
    });
    queuedRevision=targetRevision;queuedJob=next;
    writeQueue=next.then(()=>undefined);
    lastWriteAttempt=clock();
    return next;
  }
  function saveSoon(){
    if(!store?.enabled||closed||shuttingDown||writeTimer)return;
    writeTimer=setTimeout(()=>{
      writeTimer=null;void persist().catch(()=>{});
    },WRITE_DEBOUNCE);
    writeTimer.unref?.();
  }
  function touch(){
    revision++;publish(true);saveSoon();
  }
  async function shutdown(){
    if(closingPromise)return closingPromise;
    shuttingDown=true;clearInterval(timer);clearInterval(heartbeat);
    clearTimeout(writeTimer);timer=null;heartbeat=null;writeTimer=null;
    closingPromise=(async()=>{
      const saved=await persist(true);
      stop();
      try{await store?.close?.();}catch(error){
        console.error("[studio-v5/storage] Pool:",String(error?.message??error).slice(0,160));
      }
      return saved||!store?.enabled;
    })();
    return closingPromise;
  }

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
    if(closed||shuttingDown)return {ok:false,reason:"Servidor encerrado"};
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
      touch();
    }else metrics.rejected++;
    return result??{ok:false,reason:"Evento indisponível"};
  }
  function act({action,distance:requested,count}={}){
    if(closed||shuttingDown)return {ok:false,reason:"Servidor encerrado"};
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
    if(result.ok)touch();
    return result;
  }
  function frame(){
    if(closed||shuttingDown)return;
    try{
      const now=clock(),elapsed=Math.max(0,Math.min(now-lastTick,3000));
      lastTick=now;
      if(elapsed>0){
        const round=state.round,phase=state.phase;
        studioTick(state,elapsed);
        if(round!==state.round)dedupe.clear();
        if(!state.paused){
          revision++;
          if(phase!==state.phase){publish(true);saveSoon();}
        }
      }
      publish();
      if(store?.enabled&&!state.paused&&
        now-lastWriteAttempt>=WRITE_PERIOD&&savedRevision!==revision)
        void persist().catch(()=>{});
    }catch(error){
      metrics.watchdogErrors++;
      console.error("[studio-v5/watchdog]",
        String(error?.message??error).slice(0,180));
    }
  }
  async function handle(req,res,path){
    if(!path.startsWith("/api/studio/"))return false;
    if(closed||shuttingDown){send(res,503,{ok:false,error:"Studio indisponível"});return true;}
    if(path==="/api/studio/health"&&req.method==="GET"){
      send(res,200,{ok:true,enabled:true,phase:state.phase,
        round:state.round,connected:state.connected,clients:clients.size,
        persistence:storageHealth().mode,storage:storageHealth(),metrics});return true;
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
    if(result.ok&&store?.enabled&&!(await persist(true))){
      send(res,503,{ok:false,error:"Alteração em memória; banco indisponível",
        revision});return true;
    }
    send(res,result.ok?200:400,{...result,revision});
    return true;
  }
  function start(){
    if(timer||closed)return;
    lastTick=clock();
    timer=setInterval(()=>{try{frame();}catch(error){
      metrics.watchdogErrors++;
      console.error("[studio-v5/watchdog] ciclo inesperado:",
        String(error?.message??error).slice(0,180));
    }},50);
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
    if(state.connected===Boolean(value))return;
    state.connected=Boolean(value);
    touch();
  }
  function stop(){
    if(closed)return;closed=true;
    clearInterval(timer);clearInterval(heartbeat);clearTimeout(writeTimer);
    timer=null;heartbeat=null;writeTimer=null;
    for(const client of clients){try{client.end();}catch{}}
    clients.clear();dedupe.clear();
  }
  if(autoStart)start();
  return {handle,ingest,act,snapshot,state:()=>state,frame,start,stop,
    shutdown,persist,storageHealth,setConnected,metrics};
}
