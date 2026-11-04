// Simple state machine for the spectator's connection to the authoritative Render motor.
// Pure functions are testable without a browser, TikTok or network traffic.
export const STALE_AFTER_MS=12000;
export function createConnectionTracker({staleAfterMs=STALE_AFTER_MS}={}){
  let lastDataAt=null,lastEventAt=null,lastInstanceId=null,transport=null;
  let recovering=false;
  const threshold=Math.max(3000,Number(staleAfterMs)||STALE_AFTER_MS);
  function receive({now,source="http",instanceId}={}){
    if(!Number.isFinite(now))return {restarted:false};
    const id=typeof instanceId==="string"&&instanceId.length<=64?instanceId:null;
    const restarted=Boolean(id&&lastInstanceId&&id!==lastInstanceId);
    if(id)lastInstanceId=id;
    lastDataAt=now;
    if(source==="sse")lastEventAt=now;
    transport=source==="sse"?"sse":"http";
    recovering=false;
    return {restarted,instanceId:lastInstanceId};
  }
  function interrupted(){recovering=true;}
  function status(now){
    if(lastDataAt===null)return {phase:"connecting",ageMs:null,instanceId:lastInstanceId};
    const ageMs=Math.max(0,(Number.isFinite(now)?now:lastDataAt)-lastDataAt);
    if(ageMs>threshold)return {phase:"stale",ageMs,instanceId:lastInstanceId};
    if(recovering)return {phase:"reconnecting",ageMs,instanceId:lastInstanceId};
    return {phase:transport==="sse"?"online":"degraded",ageMs,instanceId:lastInstanceId};
  }
  return {receive,interrupted,status,lastEventAt:()=>lastEventAt};
}
export function connectionMessage(phase){
  return ({
    online:"● RENDER ONLINE · MOTOR NO SERVIDOR",
    degraded:"● RENDER ONLINE · SINCRONIZANDO POR HTTP",
    connecting:"● AGUARDANDO INICIALIZAÇÃO DO RENDER",
    reconnecting:"● RECONEXÃO EM ANDAMENTO · ESTADO CONGELADO",
    stale:"● CONEXÃO INTERROMPIDA · ESTADO NÃO ATUALIZADO"
  })[phase]||"● VERIFICANDO SERVIDOR";
}
