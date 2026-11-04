import {createServer} from "node:http";
import {readFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,join,extname,resolve,sep} from "node:path";
import {timingSafeEqual,randomBytes} from "node:crypto";
import {createState,addDemo,register,rank,advance,tick,turbo,validateSavedState} from "../src/engine.js";
import {openStorage} from "./storage.js";
import {startTikTokBridge} from "./tiktok.js";
import {applyGiftEvent,createGiftDeduplicator} from "../src/gifts.js";

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
  if(validateSavedState(loaded)){
    state=loaded;
    state.accumulator=0;
    console.log("[game] Estado recuperado do armazenamento: rodada",state.round);
  } else if(opts.seedDemo!==false) {
    addDemo(state,10);
  }
  // Authorized test operations only. Never put this token in frontend assets.
  const secret=opts.adminKey??process.env.ADMIN_KEY??"";
  if(!secret)console.warn("[security] ADMIN_KEY ausente: todos os comandos admin bloqueados");
  const subscribers=new Set();
  let lastTick=now(),lastBroadcast=0,lastSave=now();
  let revision=0,savedRevision=validateSavedState(loaded)?0:-1;
  let inFlight=null,lastPersistSuccess=null,lastPersistError=null;
  const eventHistory=new Map();
  const stats={startedAt:new Date().toISOString(),ticks:0,snapshots:0,giftsProcessed:0,giftBoosts:0};
  const processedGifts=createGiftDeduplicator();
  let closed=false;
  let bridge=null;
  let bridgeStatus={enabled:false,connected:false};
  function publicMeta(){
    return {storage:storage.enabled?"postgres":"memory",
      storageHealthy:storage.enabled&&!lastPersistError,
      tiktokEnabled:bridgeStatus.enabled,tiktokConnected:bridgeStatus.connected};
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
    if(!processedGifts.accept(gift))return {ok:false,reason:"Evento duplicado"};
    const result=mutation(()=>applyGiftEvent(state,gift));
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
        uptimeSeconds:Math.round(process.uptime()),round:state.round,phase:state.phase,
        storage:storage.enabled?"postgres":"memory",storageHealthy:storage.enabled&&!lastPersistError,
        giftsProcessed:stats.giftsProcessed,giftBoosts:stats.giftBoosts,
        persistedAt:lastPersistSuccess,unflushedChanges:storage.enabled&&savedRevision!==revision,
        tiktokEnabled:bridgeStatus.enabled,tiktokConnected:bridgeStatus.connected});
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
    const publicFile=pathname==="/"||pathname==="/index.html"||pathname==="/tests.html"||
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
  const ssePing=setInterval(()=>{for(const res of subscribers){try{res.write(": health\n\n");}catch{subscribers.delete(res);}}},20000);
  ssePing.unref?.();
  return {
    state:()=>state,
    stats,
    flush:()=>persist(true),
    async listen(port=Number(process.env.PORT)||3000){
      await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"0.0.0.0",resolve);});
      const address=server.address();console.log("[server] corrida-dos-elementos-live http://0.0.0.0:"+address.port);
      if(!opts.disableTikTok){
        bridge=startTikTokBridge({
          username:process.env.TIKTOK_USERNAME,
          onStatus:info=>{bridgeStatus=info;},
          onGift:gift=>receiveGift(gift),
          onChat:({userId,displayName,content,eventId})=>{
            if(eventId&&eventHistory.has(eventId))return;
            const outcome=mutation(()=>register(state,userId,displayName,content));
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
