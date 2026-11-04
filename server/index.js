import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,join,extname,resolve,sep} from "node:path";
import {timingSafeEqual,randomBytes} from "node:crypto";
import {createState,addDemo,register,rank,advance,tick,turbo,validateSavedState,migrateSavedState} from "../src/engine.js";
import {openStorage} from "./storage.js";
import {startTikTokBridge} from "./tiktok.js";
import {applyGiftEvent,createGiftDeduplicator} from "../src/gifts.js";
import {pseudonymizeTikTokUser} from "./privacy.js";
import {createLiveDiagnostics} from "./telemetry.js";
import {createLikeBuffer,applyLikeBatch,applySimulatedLikes} from "../src/likes.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",
  ".ico":"image/x-icon",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp"};
const now=()=>Date.now();
const MAX_POST_BYTES=4096;
const MAX_SSE_CLIENTS=150;
function sendJson(res,code,data,extra={}){
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",...extra});res.end(JSON.stringify(data));
}
function authorized(req,secret){
  if(!secret)return false;
  const candidate=req.headers["x-admin-key"];
  if(typeof candidate!=="string")return false;
  const supplied=Buffer.from(candidate);const expected=Buffer.from(secret);
  return supplied.length===expected.length && timingSafeEqual(supplied,expected);
}
async function bodyJson(req){
  const chunks=[];let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>MAX_POST_BYTES){const err=new Error("Corpo muito grande");err.status=413;throw err;}
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString("utf8");
  try{return JSON.parse(raw||"{}");}
  catch {const err=new Error("JSON inválido");err.status=400;throw err;}
}
function safeRoute(url){
  let pathname;
  try{pathname=decodeURIComponent(new URL(url,"http://localhost").pathname);}
  catch{return null;}
  if(pathname.includes("\0")||pathname.includes("\\")||pathname.split("/").includes(".."))return null;
  const target=resolve(root,"."+pathname);
  if(target!==root&&!target.startsWith(root+sep))return null;
  return pathname==="/"?join(root,"index.html"):target;
}
export async function createApp(opts={}){
  const storage=opts.storage??await openStorage();
  let state=createState();
  const loaded=await storage.load();
  const normalized=migrateSavedState(loaded);
  const recovered=validateSavedState(normalized);
  const biomeMigrated=recovered&&normalized!==loaded;
  const recovery={loaded:recovered,round:recovered?loaded.round:null,
    phase:recovered?loaded.phase:null};
  if(recovered){
    state=normalized;
    if(biomeMigrated)console.log("[game] Migração dos mapas concluída: Gelo e Floresta, rodada",state.round);
    state.accumulator=0;
    console.log("[game] Estado recuperado do armazenamento: rodada",state.round);
  } else if(opts.seedDemo!==false) {
    addDemo(state,10);
  }
  // Authorized test operations only. Never put this token in frontend assets.
  const secret=opts.adminKey??process.env.ADMIN_KEY??"";
  if(!secret)console.warn("[security] ADMIN_KEY ausente: todos os comandos admin bloqueados");
  const identitySalt=process.env.TIKTOK_ID_SALT||secret||randomBytes(32).toString("hex");
  // Segurança pré-lançamento: TIKTOK_USERNAME pode permanecer salvo sem abrir conexão.
  const realLiveEnabled=process.env.TIKTOK_LIVE_MODE==="enabled";
  const subscribers=new Set();
  let lastTick=now(),lastBroadcast=0,lastSave=now();
  let revision=0,savedRevision=recovered&&!biomeMigrated?0:-1;
  let inFlight=null,lastPersistSuccess=null,lastPersistError=null;
  const eventHistory=new Map();
  const instanceId=randomBytes(8).toString("hex");
  const stats={startedAt:new Date().toISOString(),ticks:0,snapshots:0,giftsProcessed:0,giftBoosts:0};
  const processedGifts=createGiftDeduplicator();
  const observedLikes=createLikeBuffer();
  const liveDiagnostics=createLiveDiagnostics();
  let closed=false;
  let bridge=null;
  let bridgeStatus={enabled:false,connected:false};
  function publicMeta(){
    return {storage:storage.enabled?"postgres":"memory",
      storageHealthy:storage.enabled&&!lastPersistError,
      tiktokEnabled:bridgeStatus.enabled,tiktokConnected:bridgeStatus.connected,
      liveEventsMode:realLiveEnabled?"enabled":"staged",instanceId};
  }
  function notify(){
    const message="event: race\ndata: "+JSON.stringify({state,serverTime:now(),...publicMeta()})+"\n\n";
    for(const client of subscribers){
      if(client.destroyed){subscribers.delete(client);continue;}
      try{
        // A disconnected or slow browser must not fill the Node.js heap with SSE backlog.
        if(!client.write(message)){subscribers.delete(client);client.end();}
      }catch{subscribers.delete(client);client.destroy();}
    }
    stats.snapshots++;lastBroadcast=now();
  }
  // Serializes writes and captures an immutable snapshot before each PostgreSQL save.
  // A shutdown flush waits for in-flight writes, then stores the most recent revision.
  async function persist(force=false){
    if(!storage.enabled)return true;
    if(inFlight){
      if(!force)return inFlight;
      await inFlight;
    }
    if(savedRevision===revision)return true;
    const targetRevision=revision;
    const snapshot=structuredClone(state);
    const task=Promise.resolve().then(()=>storage.save(snapshot)).then(()=>{
      savedRevision=targetRevision;
      lastPersistSuccess=new Date().toISOString();
      lastPersistError=null;
      return true;
    }).catch(error=>{
      lastPersistError=String(error?.message??error).slice(0,160);
      console.error("[storage] Erro ao salvar snapshot:",lastPersistError);
      return false;
    }).finally(()=>{
      if(inFlight===task)inFlight=null;
      lastSave=now();
    });
    inFlight=task;
    const ok=await task;
    if(ok&&force&&savedRevision!==revision)return persist(true);
    return ok;
  }
  function mutation(fn){
    const result=fn();
    revision++;
    notify();
    return result;
  }
  function receiveGift(gift){
    if(!processedGifts.accept(gift)){
      const failed={ok:false,reason:"Evento duplicado"};
      liveDiagnostics.gift(failed);
      return failed;
    }
    const result=mutation(()=>applyGiftEvent(state,gift));
    liveDiagnostics.gift(result,gift.simulated===true);
    if(result.ok){
      stats.giftsProcessed++;
      if(result.effect==="turbo")stats.giftBoosts++;
    }
    return result;
  }
  async function handler(req,res){
    if(closed){sendJson(res,503,{ok:false,error:"Serviço encerrando"});return;}
    const url=new URL(req.url??"/","http://localhost");
    const path=url.pathname;
    if(req.method==="GET"&&path==="/health"){
      sendJson(res,200,{ok:true,service:"corrida-dos-elementos-live",role:"race-engine",
        uptimeSeconds:Math.round(process.uptime()),instanceId,round:state.round,phase:state.phase,
        recovery,
        storage:storage.enabled?"postgres":"memory",storageHealthy:storage.enabled&&!lastPersistError,
        giftsProcessed:stats.giftsProcessed,giftBoosts:stats.giftBoosts,
        persistedAt:lastPersistSuccess,unflushedChanges:storage.enabled&&savedRevision!==revision,
        tiktokEnabled:bridgeStatus.enabled,tiktokConnected:bridgeStatus.connected,
        liveEventsMode:realLiveEnabled?"enabled":"staged"});
      return;
    }
    if(req.method==="GET"&&path==="/api/state"){
      sendJson(res,200,{ok:true,mode:"server",state,serverTime:now(),
        persistence:storage.enabled?"postgres":"memory",...publicMeta()});
      return;
    }
    if(req.method==="GET"&&path==="/api/stream"){
      if(subscribers.size>=MAX_SSE_CLIENTS){sendJson(res,503,{ok:false,error:"Capacidade de espectadores atingida"});return;}
      res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform",
        "Connection":"keep-alive","X-Accel-Buffering":"no"});
      res.write("retry: 2500\n\n");
      subscribers.add(res);
      res.write("event: race\ndata: "+JSON.stringify({state,serverTime:now(),...publicMeta()})+"\n\n");
      req.on("close",()=>{subscribers.delete(res);});
      return;
    }
    // Checks the actual configured storage from inside Render's private network.
    // Never exposes participants, tokens, connection strings or raw snapshots.
    if(path==="/api/admin/storage-check"){
      if(req.method!=="GET"){sendJson(res,405,{ok:false,error:"Somente GET"});return;}
      if(!authorized(req,secret)){sendJson(res,401,{ok:false,error:"Token administrativo inválido ou ausente"});return;}
      if(!storage.enabled){sendJson(res,200,{ok:true,storage:"memory",readable:false,
        recoveredOnBoot:recovery.loaded,recoveredRound:recovery.round});return;}
      try{
        const snapshot=await storage.load();
        const valid=validateSavedState(migrateSavedState(snapshot));
        sendJson(res,200,{ok:true,storage:"postgres",readable:true,validSnapshot:valid,
          persistedRound:valid?snapshot.round:null,persistedPhase:valid?snapshot.phase:null,
          currentRound:state.round,recoveredOnBoot:recovery.loaded,
          recoveredRound:recovery.round,unflushedChanges:savedRevision!==revision,
          persistedAt:lastPersistSuccess});
      }catch(error){
        console.error("[storage] Leitura de diagnóstico indisponível:",String(error?.message??error).slice(0,150));
        sendJson(res,503,{ok:false,error:"Leitura do armazenamento indisponível"});
      }
      return;
    }
    if(path==="/api/admin/diagnostics"){
      if(req.method!=="GET"){sendJson(res,405,{ok:false,error:"Somente GET"});return;}
      if(!authorized(req,secret)){sendJson(res,401,{ok:false,error:"Token administrativo inválido ou ausente"});return;}
      const snapshot=liveDiagnostics.snapshot({
        bridge:bridgeStatus,storage:storage.enabled?"postgres":"memory",
        storageHealthy:storage.enabled&&!lastPersistError,
        round:state.round,phase:state.phase,
        current:state.active.length,next:state.next.length,
        connectedViewers:subscribers.size
      });
      sendJson(res,200,{ok:true,diagnostics:snapshot});
      return;
    }
    if(path.startsWith("/api/admin/")){
      if(req.method!=="POST"){sendJson(res,405,{ok:false,error:"Somente POST"});return;}
      if(!authorized(req,secret)){sendJson(res,401,{ok:false,error:"Token administrativo inválido ou ausente"});return;}
      let data;
      try{data=await bodyJson(req);}catch(e){sendJson(res,e.status||400,{ok:false,error:e.message});return;}
      if(path==="/api/admin/join"){
        const id=typeof data.userId==="string"?data.userId:"";
        const name=typeof data.displayName==="string"?data.displayName:"";
        const content=typeof data.content==="string"?data.content:"";
        // eventId only prevents duplicates from the same event delivery; ID+round handles all repeats.
        const eventId=typeof data.eventId==="string"?data.eventId.slice(0,150):null;
        if(eventId&&eventHistory.has(eventId)){
          sendJson(res,200,{ok:true,registered:false,reason:"Evento já processado",state});return;
        }
        const result=mutation(()=>register(state,id,name,content));
        if(eventId&&result.ok){
          eventHistory.set(eventId,now());
          if(eventHistory.size>2000)eventHistory.delete(eventHistory.keys().next().value);
        }
        sendJson(res,result.ok?200:400,{ok:result.ok,registered:result.ok,result,state,error:result.ok?undefined:result.reason});
        return;
      }
      if(path==="/api/admin/action"){
        const action=String(data.action??"");
        let outcome={ok:true};
        if(action==="pause")mutation(()=>{state.paused=true;});
        else if(action==="resume")mutation(()=>{state.paused=false;lastTick=now();});
        else if(action==="advance")mutation(()=>advance(state));
        else if(action==="add-demo")outcome={ok:true,added:mutation(()=>addDemo(state,10))};
        else if(action==="turbo") {
          const id=typeof data.userId==="string"?data.userId:rank(state.active).find(r=>r.status==="running")?.id;
          if(!mutation(()=>turbo(state,id))){sendJson(res,400,{ok:false,error:"Turbo disponível somente durante a corrida"});return;}
        } else if(action==="like-test"){
          const simulated=mutation(()=>applySimulatedLikes(state,10));
          liveDiagnostics.simulatedLike(simulated.count);
          outcome={ok:true,...simulated};
        } else if(action==="gift-test"){
          const userId=typeof data.userId==="string"?data.userId
            :(rank(state.active).find(r=>r.status==="running")??rank(state.active)[0])?.id;
          const runner=state.active.find(r=>r.id===userId);
          if(!runner){sendJson(res,400,{ok:false,error:"Inscreva um corredor antes de simular presente"});return;}
          const effect=receiveGift({
            userId:runner.id,displayName:runner.name,giftId:"demo-rose",
            giftName:"Rosa de teste",repeatCount:1,simulated:true,
            eventId:"demo-"+randomBytes(12).toString("hex")
          });
          outcome={...effect,simulated:true};
        } else if(action==="reset"){
          if(data.confirm!=="RESET_DEMO"){sendJson(res,400,{ok:false,error:"Confirmação necessária"});return;}
          mutation(()=>{state=createState();addDemo(state,10);eventHistory.clear();lastTick=now();});
        } else {sendJson(res,400,{ok:false,error:"Ação desconhecida"});return;}
        sendJson(res,200,{...outcome,state});return;
      }
      sendJson(res,404,{ok:false,error:"Rota administrativa não encontrada"});return;
    }
    if(path.startsWith("/api/")){sendJson(res,404,{ok:false,error:"Rota não encontrada"});return;}
    if(req.method!=="GET"&&req.method!=="HEAD"){sendJson(res,405,{ok:false,error:"Método indisponível"});return;}
    const target=safeRoute(req.url||"/");
    const pathname=new URL(req.url||"/","http://localhost").pathname;
    const publicFile=pathname==="/"||pathname==="/index.html"||pathname==="/tests.html"||pathname==="/benchmark.html"||
      /^\/(?:src|assets|tests)\/[a-zA-Z0-9_.\/-]+$/.test(pathname);
    if(!target||!publicFile||pathname.split("/").some(p=>p.startsWith("."))){
      sendJson(res,404,{ok:false,error:"Arquivo não encontrado"});return;
    }
    try{
      const file=await stat(target);
      if(!file.isFile())throw new Error("not file");
      const content=await readFile(target);
      res.writeHead(200,{"Content-Type":mime[extname(target)]||"application/octet-stream",
        "Cache-Control":target.endsWith(".html")?"no-cache":"public, max-age=60","X-Content-Type-Options":"nosniff"});
      if(req.method==="HEAD")res.end();else res.end(content);
    }catch{sendJson(res,404,{ok:false,error:"Arquivo não encontrado"});}
  }
  const server=createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(e=>{
    console.error("[http]",e);
    if(!res.headersSent)sendJson(res,500,{ok:false,error:"Erro interno"});
    else res.end();
  });});
  const heartbeat=setInterval(()=>{
    const current=now();
    const likesBatch=observedLikes.drain(current);
    if(likesBatch)mutation(()=>applyLikeBatch(state,likesBatch));
    if(!state.paused){
      tick(state,current-lastTick);
      stats.ticks++;revision++;
    }
    lastTick=current;
    if(current-lastBroadcast>=850)notify();
    if(current-lastSave>=5000)void persist();
  },50);
  heartbeat.unref?.();
  // Outgoing SSE comments don't keep Render Free services awake. Paid plan is needed for true always-on.
  const ssePing=setInterval(()=>{
    // A heartbeat lets spectators detect half-open connections and server restarts.
    const heartbeat="event: heartbeat\ndata: "+JSON.stringify({instanceId,serverTime:now()})+"\n\n";
    for(const res of subscribers){
      if(res.destroyed){subscribers.delete(res);continue;}
      try{if(!res.write(heartbeat)){subscribers.delete(res);res.end();}}
      catch{subscribers.delete(res);res.destroy();}
    }
  },20000);
  ssePing.unref?.();
  return {
    state:()=>state,
    stats,
    flush:()=>persist(true),
    async listen(port=Number(process.env.PORT)||3000){
      await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"0.0.0.0",resolve);});
      const address=server.address();console.log("[server] corrida-dos-elementos-live http://0.0.0.0:"+address.port);
      if(!opts.disableTikTok&&(opts.bridgeFactory||realLiveEnabled)){
        bridge=(opts.bridgeFactory??startTikTokBridge)({
          username:process.env.TIKTOK_USERNAME,
          onStatus:info=>{bridgeStatus=info;liveDiagnostics.connection(info);},
          onEvent:info=>liveDiagnostics.observed(info),
          onLike:like=>{
            const accepted=observedLikes.accept(like);
            liveDiagnostics.like(like,accepted);
          },
          onGift:gift=>{
            const safeId=pseudonymizeTikTokUser(gift.userId,identitySalt);
            return receiveGift({...gift,userId:safeId});
          },
          onChat:({userId,displayName,content,eventId})=>{
            if(eventId&&eventHistory.has(eventId))return;
            const safeId=pseudonymizeTikTokUser(userId,identitySalt);
            const outcome=mutation(()=>register(state,safeId,displayName,content));
            liveDiagnostics.registration(outcome);
            if(outcome.ok&&eventId){
              eventHistory.set(eventId,now());
              if(eventHistory.size>2000)eventHistory.delete(eventHistory.keys().next().value);
            }
          }
        });
        bridgeStatus=bridge.status();
      }
      return address;
    },
    async close(){
      if(closed)return;closed=true;
      clearInterval(heartbeat);clearInterval(ssePing);
      for(const client of subscribers){try{client.end();}catch{}}
      subscribers.clear();
      if(bridge)await bridge.close();
      const finalLikes=observedLikes.drain(now(),true);
      if(finalLikes)mutation(()=>applyLikeBatch(state,finalLikes));
      const saved=await persist(true);
      if(!saved&&storage.enabled)console.error("[storage] Encerramento sem persistência confirmada");
      await storage.close();
      await new Promise(resolve=>server.close(()=>resolve()));
    },
    server
  };
}
async function boot(){
  const app=await createApp();
  await app.listen();
  const shutdown=async()=>{await app.close();process.exit(0);};
  process.once("SIGTERM",shutdown);
  process.once("SIGINT",shutdown);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  boot().catch(e=>{console.error(e);process.exit(1);});
}
