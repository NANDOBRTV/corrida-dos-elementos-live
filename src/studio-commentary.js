// Sports commentary for the Studio V5 race. No AI key or remote service.
// The pure director consumes race snapshots; the browser voice is opt-in.
export const COMMENTARY_LIMITS=Object.freeze({
  minIntervalMs:7500,leaderCooldownMs:3100,maxText:170,
  supportedPhases:["LOBBY","COUNTDOWN","RUNNING","RESULTS"]
});
const safeNumber=(v,fall=0)=>Number.isFinite(Number(v))?Number(v):fall;
const cleanName=v=>{
  const value=String(v??"").replace(/^@/,"").replace(/[\p{C}\p{Extended_Pictographic}]/gu," ")
    .replace(/[^\p{L}\p{N}\s.'-]/gu," ").replace(/\s+/g," ").trim().slice(0,34);
  return value||"um competidor";
};
export function commentatorName(runner){
  if(!runner)return "um competidor";
  const model=cleanName(runner.name||"competidor");
  const driver=runner.driverName?cleanName(runner.driverName):"";
  return driver&&driver.toLowerCase()!==model.toLowerCase()?
    model+" de "+driver:model;
}
function mapName(id){
  return ({ice:"Gelo",forest:"Floresta",desert:"Deserto",
    volcano:"Vulcão",hell:"Inferno"})[id]||"pista";
}
function sorted(state){
  return Array.isArray(state?.active)?[...state.active].sort((a,b)=>{
    const fa=Number.isFinite(a?.finishMs)?a.finishMs:Infinity;
    const fb=Number.isFinite(b?.finishMs)?b.finishMs:Infinity;
    if(fa!==fb)return fa-fb;
    return safeNumber(b?.progress)-safeNumber(a?.progress)||
      String(a?.id??"").localeCompare(String(b?.id??""));
  }):[];
}
function announcement(text,kind="race",priority=1){
  return {text:String(text).slice(0,COMMENTARY_LIMITS.maxText),kind,priority};
}
// One director per viewing session: never mutates the game's official state.
export function createStudioCommentary(){
  let round=null,phase=null,leaderId=null,prevRaceMs=-1;
  let lastSpeechAt=-Infinity,beat=0,lastEffectId=null;
  let nearFinish=false,finalStretch=false,podiumSpoken=false;
  const trySay=(line,now,force=false)=>{
    if(!line)return null;
    if(!force&&now-lastSpeechAt<COMMENTARY_LIMITS.minIntervalMs)return null;
    lastSpeechAt=now;return line;
  };
  function reset(){
    round=null;phase=null;leaderId=null;prevRaceMs=-1;
    lastSpeechAt=-Infinity;beat=0;lastEffectId=null;
    nearFinish=false;finalStretch=false;podiumSpoken=false;
  }
  function next(input,nowMs=0){
    const s=input?.state??input;
    if(!s||!Array.isArray(s.active))return null;
    const now=Math.max(0,safeNumber(nowMs));
    const currentRound=Math.max(1,Math.floor(safeNumber(s.round,1)));
    const currentPhase=COMMENTARY_LIMITS.supportedPhases.includes(s.phase)?
      s.phase:"LOBBY";
    const board=sorted(s),leader=board[0],runnerCount=board.length;
    const raceMs=Math.max(0,safeNumber(s.raceMs));
    if(round!==currentRound){
      reset();round=currentRound;
      phase=currentPhase;leaderId=leader?.id??null;prevRaceMs=raceMs;
      if(currentPhase==="RUNNING")
        return trySay(announcement("Estamos ao vivo na rodada "+currentRound+
          "! "+runnerCount+" veículos disputam a liderança. Acelera!", "start",3),now,true);
      if(currentPhase==="RESULTS")
        return trySay(announcement("Fim de prova! Vitória de "+
          commentatorName(s.results?.[0]||leader)+". Que corrida espetacular!","finish",3),now,true);
      return trySay(announcement("Atenção, pilotos! Rodada "+currentRound+
        " no cenário "+mapName(s.mapId)+". Inscrições abertas, preparem os motores!",
        "intro",2),now,true);
    }
    if(phase!==currentPhase){
      phase=currentPhase;lastEffectId=null;
      if(currentPhase==="LOBBY"){
        leaderId=leader?.id??null;nearFinish=false;
        finalStretch=false;podiumSpoken=false;prevRaceMs=-1;
        return trySay(announcement("Nova bateria a caminho! "+
          "Escolham os veículos e ocupem o grid de largada!","intro",2),now,true);
      }
      if(currentPhase==="COUNTDOWN")
        return trySay(announcement("Inscrições encerradas! "+
          "Atenção no grid, faltam três segundos para a largada!","countdown",3),now,true);
      if(currentPhase==="RUNNING"){
        leaderId=leader?.id??null;prevRaceMs=raceMs;
        nearFinish=false;finalStretch=false;podiumSpoken=false;beat=0;
        return trySay(announcement("LARGOU! Começa a corrida! "+
          runnerCount+" veículos aceleram forte no "+mapName(s.mapId)+"!","start",4),now,true);
      }
      if(currentPhase==="RESULTS"){
        podiumSpoken=false;
        return trySay(announcement("BANDEIRA QUADRICULADA! "+
          commentatorName(s.results?.[0]||leader)+
          " é o grande vencedor! Que final emocionante!","finish",4),now,true);
      }
    }
    if(currentPhase==="RESULTS"){
      if(!podiumSpoken&&now-lastSpeechAt>=4000&&s.results?.length>2){
        podiumSpoken=true;
        return trySay(announcement("Pódio definido! Segundo lugar para "+
          commentatorName(s.results[1])+", terceiro para "+
          commentatorName(s.results[2])+". Parabéns aos finalistas!","podium",2),now,true);
      }
      return null;
    }
    if(currentPhase!=="RUNNING")return null;
    // Reject stale SSE frames: do not narrate a false overtake after rollback.
    if(raceMs+900<prevRaceMs)return null;
    prevRaceMs=Math.max(prevRaceMs,raceMs);
    if(!leader)return null;
    const dist=Math.max(1,safeNumber(s.distance,1200));
    const remaining=Math.max(0,dist-safeNumber(leader.progress));
    if(leaderId!==null&&leaderId!==leader.id&&raceMs>2300&&
      now-lastSpeechAt>=COMMENTARY_LIMITS.leaderCooldownMs){
      leaderId=leader.id;
      return trySay(announcement("ULTRAPASSAGEM NA PONTA! "+
        commentatorName(leader)+" assume a liderança! "+
        "A disputa está pegando fogo!","overtake",3),now,true);
    }
    leaderId=leader.id;
    if(!finalStretch&&remaining<=dist*.035){
      finalStretch=true;
      return trySay(announcement("ÚLTIMOS METROS! "+commentatorName(leader)+
        " está perto da bandeirada! Quem vai cruzar primeiro?","final",3),now,true);
    }
    if(!nearFinish&&remaining<=dist*.13){
      nearFinish=true;
      return trySay(announcement("Entramos na reta decisiva! "+
        commentatorName(leader)+" puxa o pelotão, mas nada está garantido!","final",2),now,true);
    }
    const effects=Array.isArray(s.effects)?s.effects:[];
    const last=effects.findLast?.(fx=>fx&&typeof fx.id==="string")||
      [...effects].reverse().find(fx=>fx&&typeof fx.id==="string");
    if(last&&last.id!==lastEffectId){
      lastEffectId=last.id;
      const boosted=board.find(r=>r.id===last.runnerId||r.id===last.targetId);
      if(boosted&&now-lastSpeechAt>=COMMENTARY_LIMITS.leaderCooldownMs){
        const verb=/torpedo|impact/.test(String(last.type))?
          "SENTIU O IMPACTO!":"TURBO ATIVADO!";
        return trySay(announcement(verb+" "+commentatorName(boosted)+
          " agita a corrida! Olho nessa disputa!","power",2),now,true);
      }
    }
    if(now-lastSpeechAt<COMMENTARY_LIMITS.minIntervalMs)return null;
    const second=board[1],third=board[2];
    const phrases=[
      "O pelotão acelera no "+mapName(s.mapId)+
        "! "+commentatorName(leader)+" está na frente!",
      "É emoção a cada curva! "+commentatorName(leader)+
        " mantém a primeira colocação!",
      second?"Olha a pressão! "+commentatorName(second)+
        " está perseguindo "+commentatorName(leader)+"!":
        "A corrida segue intensa! Quem segura essa velocidade?",
      third?"Três competidores na briga pelo pódio! "+
        commentatorName(third)+" quer subir na classificação!":
        "A torcida acompanha cada metro desta disputa!",
      "Atenção para a liderança: "+commentatorName(leader)+
        " segue acelerando, ninguém quer ficar para trás!",
      "A pista está desafiadora! Mais uma volta cheia de ação e velocidade!",
      "Reta após reta, a disputa esquenta! O primeiro colocado é "+
        commentatorName(leader)+"!"
    ];
    const text=phrases[beat%phrases.length];beat++;
    return trySay(announcement(text,"race",1),now);
  }
  return {next,reset};
}
// Choose natural Brazilian voices when available; operating system owns the audio.
export function chooseBrazilianVoice(voices){
  const candidates=(Array.isArray(voices)?voices:[]).filter(v=>
    /^pt([-_]|$)/i.test(v?.lang||""));
  candidates.sort((a,b)=>{
    const score=v=>{
      let n=/^pt[-_]BR$/i.test(v.lang)?100:20;
      if(/natural|neural|enhanced|premium|online/i.test(v.name))n+=35;
      if(/brazil|brasil|português \(brasil\)/i.test(v.name))n+=12;
      if(/antonio|daniel|ricardo|francisco|felipe|rafael/i.test(v.name))n+=8;
      if(v.localService)n+=1;return n;
    };
    return score(b)-score(a);
  });
  return candidates[0]||null;
}
export function createStudioVoice({host=typeof window==="undefined"?null:window,
  onCaption=()=>{},onStatus=()=>{}}={}){
  const synth=host?.speechSynthesis;
  const Utterance=host?.SpeechSynthesisUtterance;
  const supported=Boolean(synth&&Utterance);
  let enabled=false,disposed=false,voice=null,current=null,spoken=0;
  let pending=null,startedAt=0,lastError=null;
  const state=()=>({
    supported,enabled,voice:voice?.name||null,spoken,
    speaking:Boolean(synth?.speaking),pending:Boolean(pending),lastError
  });
  function refresh(){
    if(!supported||disposed)return;
    try{voice=chooseBrazilianVoice(synth.getVoices());}catch{voice=null;}
  }
  function drain(){
    if(disposed||!enabled||!supported||current||!pending)return;
    const event=pending;pending=null;
    const utterance=new Utterance(event.text);
    utterance.lang="pt-BR";
    if(voice)utterance.voice=voice;
    utterance.rate=1.11;utterance.pitch=.94;utterance.volume=1;
    current=utterance;startedAt=Date.now();
    utterance.onend=()=>{
      if(current!==utterance)return;
      current=null;drain();
    };
    utterance.onerror=e=>{
      if(current!==utterance)return;
      current=null;
      if(!["canceled","interrupted"].includes(String(e?.error))) {
        lastError=String(e?.error||"voz indisponível").slice(0,70);
        onStatus("error");
      }
      drain();
    };
    try{
      onCaption(event.text);
      synth.speak(utterance);spoken++;
    }catch(error){
      current=null;lastError=String(error?.message||error).slice(0,70);
      onStatus("error");
    }
  }
  function speak(event){
    if(!supported||!enabled||disposed||!event?.text)return false;
    if(current&&Number(event.priority)<3)return false;
    if(current&&event.priority>=3){
      // Cancel old commentary for a start, an overtake or the result.
      current=null;
      try{synth.cancel();}catch{}
    }
    pending=event;
    drain();
    return true;
  }
  function enable(){
    if(disposed||!supported)return false;
    enabled=true;lastError=null;refresh();
    onStatus("enabled");
    // This immediate utterance runs inside the user's tap on Android Chrome.
    speak({text:"Narração esportiva ativada! Prepare-se para fortes emoções!",
      priority:4,kind:"ready"});
    return true;
  }
  function disable(){
    enabled=false;current=null;pending=null;
    try{synth?.cancel();}catch{}
    onCaption("");onStatus("disabled");
  }
  function update(event){
    if(!enabled||disposed)return;
    // Recover Chrome voice synthesis stuck after prolonged tab throttling.
    if(current&&Date.now()-startedAt>16000){
      current=null;try{synth.cancel();}catch{}
    }
    if(event)speak(event);
  }
  if(supported){
    refresh();
    synth.addEventListener?.("voiceschanged",refresh);
  }
  function dispose(){
    disable();disposed=true;
    synth?.removeEventListener?.("voiceschanged",refresh);
  }
  return {enable,disable,update,dispose,state,speak,refresh};
}
