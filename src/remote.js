import {createConnectionTracker,connectionMessage} from "./connection.js";

// The Render URL is always authoritative, even during cold starts or network outages.
// A failed request must NEVER silently start a second local race.
export async function connectRemote({onState,onStatus=()=>{},onConnection=()=>{},onRestart=()=>{}}){
  const host=window.location.hostname.toLowerCase();
  const renderHost=host.endsWith(".onrender.com")||host==="localhost"||host==="127.0.0.1";
  const tracker=createConnectionTracker();
  let stopped=false,stream=null,reading=false,monitor=null,lastPollAt=0,lastPhase="";
  let explicitlyOffline=navigator.onLine===false;
  const getMeta=data=>({
    tiktokEnabled:data.tiktokEnabled,tiktokConnected:data.tiktokConnected,
    storage:data.storage??data.persistence,storageHealthy:data.storageHealthy,
    liveEventsMode:data.liveEventsMode,instanceId:data.instanceId
  });
  function report(force=false){
    const status=tracker.status(Date.now());
    if(explicitlyOffline){
      tracker.interrupted();
      status.phase=status.phase==="stale"?"stale":"reconnecting";
    }
    if(force||status.phase!==lastPhase){
      lastPhase=status.phase;
      onConnection(status);
      onStatus(connectionMessage(status.phase));
    }
  }
  function applySnapshot(data,source){
    if(stopped||explicitlyOffline||!data?.state)return;
    const result=tracker.receive({now:Date.now(),source,instanceId:data.instanceId});
    onState(data.state,getMeta(data));
    if(result.restarted)onRestart({instanceId:result.instanceId});
    report();
  }
  async function readState(){
    if(stopped||reading||explicitlyOffline)return false;
    reading=true;
    lastPollAt=Date.now();
    try{
      const response=await fetch("./api/state",{
        cache:"no-store",signal:AbortSignal.timeout(8000)
      });
      if(!response.ok||!response.headers.get("content-type")?.includes("application/json"))return false;
      const data=await response.json();
      if(data.mode!=="server"||!data.state)return false;
      applySnapshot(data,"http");
      return true;
    }catch{return false;}
    finally{reading=false;}
  }
  function openStream(){
    if(stopped||stream)return;
    const candidate=new EventSource("./api/stream");
    stream=candidate;
    candidate.addEventListener("race",event=>{
      if(stopped||stream!==candidate)return;
      try{applySnapshot(JSON.parse(event.data),"sse");}
      catch(error){console.warn("Evento remoto inválido",error);}
    });
    candidate.addEventListener("heartbeat",event=>{
      if(stopped||stream!==candidate)return;
      try{
        const info=JSON.parse(event.data);
        const current=tracker.status(Date.now()).instanceId;
        if(info.instanceId&&current&&info.instanceId!==current)void readState();
      }catch{}
    });
    candidate.onopen=()=>{
      if(stopped||stream!==candidate)return;
      // A transport reopening is not proof of fresh race data.
      report();
    };
    candidate.onerror=()=>{
      if(stopped||stream!==candidate)return;
      tracker.interrupted();
      report(true);
      // EventSource reconnects itself. HTTP polling keeps state fresh meanwhile.
    };
  }
  function onOffline(){
    explicitlyOffline=true;
    tracker.interrupted();
    report(true);
  }
  function onOnline(){
    explicitlyOffline=false;
    tracker.interrupted();
    report(true);
    void readState();
  }
  window.addEventListener("offline",onOffline);
  window.addEventListener("online",onOnline);
  const ready=await readState();
  if(!ready&&!renderHost){
    window.removeEventListener("offline",onOffline);
    window.removeEventListener("online",onOnline);
    return null;
  }
  openStream();
  report(true);
  monitor=setInterval(()=>{
    if(stopped)return;
    if(navigator.onLine===false&&!explicitlyOffline)onOffline();
    const now=Date.now(),lastEvent=tracker.lastEventAt();
    const status=tracker.status(now);
    report();
    const streamUnavailable=!stream||stream.readyState!==EventSource.OPEN;
    if(stream?.readyState===EventSource.CLOSED){
      stream.close();stream=null;openStream();
    }
    // If stream is disconnected or half-open, refresh from HTTP as a fallback.
    if((streamUnavailable||!lastEvent||now-lastEvent>8000||status.phase==="stale")&&
      now-lastPollAt>=6500)void readState();
  },2000);
  return {
    mode:"server",
    status:()=>tracker.status(Date.now()),
    async storageCheck(token=""){
      if(stopped)throw Error("Conexão encerrada");
      if(!token)throw Error("Informe a ADMIN_KEY do Render");
      const res=await fetch("./api/admin/storage-check",{
        headers:{"x-admin-key":token},cache:"no-store",signal:AbortSignal.timeout(12000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"Resposta inválida"}));
      if(!res.ok||!data.ok)throw Error(data.error||"Verificação do banco indisponível");
      return data;
    },
    async diagnostics(token=""){
      if(stopped)throw Error("Conexão encerrada");
      if(!token)throw Error("Informe a ADMIN_KEY do Render");
      const res=await fetch("./api/admin/diagnostics",{
        headers:{"x-admin-key":token},cache:"no-store",signal:AbortSignal.timeout(12000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"Resposta inválida"}));
      if(!res.ok||!data.ok)throw Error(data.error||"Diagnóstico indisponível");
      return data.diagnostics;
    },
    async action(action,params={},token=""){
      if(stopped)throw Error("Conexão encerrada");
      if(!token)throw Error("Informe sua ADMIN_KEY no painel");
      const route=action==="join"?"./api/admin/join":"./api/admin/action";
      const body=action==="join"?params:{action,...params};
      const res=await fetch(route,{
        method:"POST",headers:{"Content-Type":"application/json","x-admin-key":token},
        body:JSON.stringify(body),signal:AbortSignal.timeout(12000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"Servidor não retornou JSON válido"}));
      if(!res.ok||!data.ok)throw Error(data.error||data.result?.reason||"Ação não autorizada");
      if(data.state)onState(data.state,getMeta(data));
      return data;
    },
    close(){
      stopped=true;
      clearInterval(monitor);
      window.removeEventListener("offline",onOffline);
      window.removeEventListener("online",onOnline);
      stream?.close();stream=null;
    }
  };
}
