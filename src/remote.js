// Modo remoto: a URL Render sempre usa o servidor, inclusive durante reconexões.
// GitHub Pages conserva a demonstração local e não tenta registrar usuários reais.
export async function connectRemote({onState,onStatus}) {
  const hostname=window.location.hostname.toLowerCase();
  const renderHost=hostname.endsWith(".onrender.com") || hostname==="localhost" || hostname==="127.0.0.1";
  let stopped=false, stream=null, retryTimer=null, connecting=false;
  const readState=async()=>{
    if(connecting)return false;
    connecting=true;
    try {
      const res=await fetch("./api/state",{cache:"no-store",signal:AbortSignal.timeout(6000)});
      if(!res.ok||!res.headers.get("content-type")?.includes("application/json"))return false;
      const data=await res.json();
      if(data.mode!=="server"||!data.state)return false;
      if(!stopped)onState(data.state,{tiktokEnabled:data.tiktokEnabled,tiktokConnected:data.tiktokConnected,storage:data.storage??data.persistence,storageHealthy:data.storageHealthy});
      return true;
    }catch{return false;}
    finally{connecting=false;}
  };
  const ready=await readState();
  if(!ready&&!renderHost)return null;
  function connectStream(){
    if(stopped||stream)return;
    const es=new EventSource("./api/stream");
    stream=es;
    es.addEventListener("race",event=>{
      if(stopped)return;
      try{const data=JSON.parse(event.data);if(data.state)onState(data.state,{tiktokEnabled:data.tiktokEnabled,tiktokConnected:data.tiktokConnected,storage:data.storage??data.persistence,storageHealthy:data.storageHealthy});}
      catch(e){console.warn("Evento de corrida inválido",e);}
    });
    es.onopen=()=>{if(!stopped)onStatus("Render conectado · corrida controlada pelo servidor");};
    es.onerror=()=>{if(!stopped)onStatus("Reconectando ao Render automaticamente...");};
  }
  if(ready)connectStream();
  else onStatus("Aguardando o Render iniciar o servidor (pode levar um minuto)...");
  retryTimer=setInterval(async()=>{
    if(stopped)return;
    if(stream?.readyState===EventSource.OPEN)return;
    const ok=await readState();
    if(ok&&!stream)connectStream();
    else if(!ok)onStatus("Conexão indisponível · mantendo a corrida congelada até reconectar");
  },8000);
  return {
    mode:"server",
    async action(action,params={},token=""){
      if(stopped)throw Error("Conexão encerrada");
      if(!token)throw Error("Informe sua ADMIN_KEY no painel");
      const route=action==="join"?"./api/admin/join":"./api/admin/action";
      const body=action==="join"?params:{action,...params};
      const res=await fetch(route,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-admin-key":token},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(12000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"Servidor não retornou JSON válido"}));
      if(!res.ok||!data.ok)throw Error(data.error||data.result?.reason||"Ação não autorizada");
      if(data.state)onState(data.state);
      return data;
    },
    close(){
      stopped=true;
      clearInterval(retryTimer);
      stream?.close();
    }
  };
}
