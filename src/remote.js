// Adaptador entre o jogo do navegador e o motor Node.js autoritativo no Render.
// No GitHub Pages, /api/state não existe: o jogo permanece em modo LOCAL.
export async function connectRemote({onState,onStatus}) {
  let response;
  try {
    response=await fetch("./api/state",{cache:"no-store",signal:AbortSignal.timeout(5000)});
    if(!response.ok||!response.headers.get("content-type")?.includes("application/json"))return null;
    const data=await response.json();
    if(data.mode!=="server"||!data.state)return null;
    onState(data.state);
  }catch{return null;}
  let closed=false;
  const stream=new EventSource("./api/stream");
  stream.addEventListener("race",event=>{
    if(closed)return;
    try{const payload=JSON.parse(event.data);if(payload.state)onState(payload.state);}
    catch(e){console.warn("Evento recebido inválido",e);}
  });
  stream.onopen=()=>{if(!closed)onStatus("Motor Render conectado · corrida controlada no servidor");};
  stream.onerror=()=>{if(!closed)onStatus("Conexão instável: aguardando reconexão automática do Render");};
  const timer=setInterval(async()=>{
    if(closed||stream.readyState===EventSource.OPEN)return;
    try {
      const r=await fetch("./api/state",{cache:"no-store",signal:AbortSignal.timeout(5000)});
      if(r.ok){const j=await r.json();if(j.state)onState(j.state);}
    }catch{}
  },10000);
  return {
    mode:"server",
    async action(action,params={},token="") {
      const route=action==="join"?"./api/admin/join":"./api/admin/action";
      const body=action==="join"?params:{action,...params};
      const r=await fetch(route,{
        method:"POST",headers:{"Content-Type":"application/json","x-admin-key":token},
        body:JSON.stringify(body),signal:AbortSignal.timeout(10000)
      });
      const data=await r.json().catch(()=>({ok:false,error:"Resposta inválida do servidor"}));
      if(!r.ok||!data.ok)throw new Error(data.error||data.result?.reason||"Ação não autorizada");
      if(data.state)onState(data.state);
      return data;
    },
    close(){closed=true;clearInterval(timer);stream.close();}
  };
}
