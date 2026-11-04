// Contadores privados em memória. Nunca guarda conteúdo de mensagens, IDs, cookies ou tokens.
// "Observado" significa recebido do conector, não confirmado pelo TikTok como uma LIVE pública.
export function createLiveDiagnostics({clock=()=>new Date().toISOString()}={}) {
  const start=clock();
  const counts={
    connectionAttempts:0,
    chatEvents:0,enterCommands:0,registrationsAccepted:0,registrationsRejected:0,
    giftEvents:0,giftFinalEvents:0,giftsApplied:0,duplicateGifts:0,turbosApplied:0,simulatedGifts:0,
    likeEvents:0,likeValid:0,likesObserved:0,duplicateLikes:0
  };
  const dates={lastAttemptAt:null,lastConnectedAt:null,lastDisconnectAt:null,lastChatAt:null,lastJoinAt:null,lastGiftAt:null,lastLikeAt:null};
  let lastIssue=null;
  function connection(info={}){
    if(info.phase==="connecting") {
      counts.connectionAttempts++;
      dates.lastAttemptAt=clock();
    }
    if(info.connected===true) {
      dates.lastConnectedAt=clock();
      lastIssue=null;
    } else if(info.phase==="retrying"||info.phase==="disconnected") {
      dates.lastDisconnectAt=clock();
      lastIssue=info.reason||"disconnected";
    }
  }
  function observed(info={}){
    const time=clock();
    if(info.type==="chat") {
      counts.chatEvents++;
      dates.lastChatAt=time;
      if(info.recognized)counts.enterCommands++;
    } else if(info.type==="gift") {
      counts.giftEvents++;
      dates.lastGiftAt=time;
      if(info.recognized)counts.giftFinalEvents++;
    } else if(info.type==="like") {
      counts.likeEvents++;dates.lastLikeAt=time;
      if(info.recognized)counts.likeValid++;
    }
  }
  function registration(outcome={}){
    if(outcome.ok) {
      counts.registrationsAccepted++;
      dates.lastJoinAt=clock();
    } else counts.registrationsRejected++;
  }
  function gift(outcome={},simulated=false){
    if(!outcome.ok) {
      if(outcome.reason==="Evento duplicado")counts.duplicateGifts++;
      return;
    }
    if(simulated){counts.simulatedGifts++;return;}
    counts.giftsApplied++;
    if(outcome.effect==="turbo")counts.turbosApplied++;
  }
  function like(event,accepted){
    if(accepted)counts.likesObserved+=event.count;
    else counts.duplicateLikes++;
  }
  function snapshot({bridge={},storage="memory",storageHealthy=false,round=1,phase="LOBBY",current=0,next=0,connectedViewers=0}={}){
    return {
      startedAt:start,
      connector:{enabled:bridge.enabled===true,connected:bridge.connected===true,
        lastIssue,attempts:counts.connectionAttempts,lastAttemptAt:dates.lastAttemptAt,
        lastConnectedAt:dates.lastConnectedAt,lastDisconnectAt:dates.lastDisconnectAt},
      events:{chatObserved:counts.chatEvents,enterRecognized:counts.enterCommands,
        registrationsAccepted:counts.registrationsAccepted,
        registrationsRejected:counts.registrationsRejected,
        giftObserved:counts.giftEvents,giftFinalized:counts.giftFinalEvents,
        giftsApplied:counts.giftsApplied,duplicateGifts:counts.duplicateGifts,
        turbosApplied:counts.turbosApplied,simulatedGifts:counts.simulatedGifts,
        lastChatAt:dates.lastChatAt,lastJoinAt:dates.lastJoinAt,lastGiftAt:dates.lastGiftAt,
        likeObserved:counts.likeEvents,likeValid:counts.likeValid,
        likeCountObserved:counts.likesObserved,duplicateLikes:counts.duplicateLikes,lastLikeAt:dates.lastLikeAt},
      game:{round,phase,current,next,viewers:connectedViewers},
      persistence:{storage,healthy:storageHealthy===true}
    };
  }
  return {connection,observed,registration,gift,like,snapshot};
}
