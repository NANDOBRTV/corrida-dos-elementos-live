import {joinCommand} from "../src/engine.js";
export function normalizeTikTokChat(event) {
  const content=event?.comment??event?.content;
  if(!joinCommand(content))return null;
  const raw=event?.user?.userId??event?.user?.id??event?.user?.uniqueId;
  if(raw===undefined||raw===null)return null;
  if(typeof raw==="number"&&(!Number.isSafeInteger(raw)||raw<0))return null;
  let userId;
  try{userId=String(raw).trim()}catch{return null;}
  if(!userId||userId==="undefined"||userId==="null"||userId.length>128)return null;
  const displayName=String(event?.user?.nickname??event?.user?.uniqueId??event?.user?.displayId??"Participante")
    .trim().slice(0,28)||"Participante";
  const rawId=event?.common?.msgId??event?.common?.messageId??event?.msgId;
  const eventId=rawId==null?null:String(rawId).slice(0,150);
  return {userId,displayName,content:"entrar",eventId,source:"tiktok"};
}
export function normalizeTikTokGift(event) {
  if(!event||typeof event!=="object")return null;
  const rawUser=event.user?.userId??event.user?.id??event.user?.uniqueId;
  if(rawUser===null||rawUser===undefined)return null;
  if(typeof rawUser==="number"&&(!Number.isSafeInteger(rawUser)||rawUser<0))return null;
  const userId=String(rawUser).trim();
  if(!userId||userId==="undefined"||userId.length>128)return null;
  const gift=event.gift??event.giftDetails??{};
  const kind=gift.type??gift.giftType??event.giftType;
  // Combos enviam frames cumulativos: processar apenas o último.
  const streak=Number(kind)===1;
  if(streak&&event.repeatEnd!==true&&event.repeatEnd!==1&&event.repeatEnd!=="1")return null;
  const giftId=event.giftId??gift.id??gift.giftId;
  if(giftId===null||giftId===undefined||String(giftId).length>80)return null;
  const quantity=Number(event.repeatCount??1);
  if(!Number.isSafeInteger(quantity)||quantity<1)return null;
  const displayName=String(event.user?.nickname??event.user?.uniqueId??"Espectador").trim().slice(0,28)||"Espectador";
  const giftName=String(gift.name??gift.giftName??"Presente").trim().slice(0,40)||"Presente";
  const msgId=event.common?.msgId??event.msgId??event.transactionId;
  return {
    source:"tiktok",userId,displayName,giftId:String(giftId),giftName,
    repeatCount:Math.min(quantity,999),
    groupId:event.groupId==null?null:String(event.groupId).slice(0,120),
    eventId:msgId==null?null:String(msgId).slice(0,140)
  };
}

export function normalizeTikTokLike(event) {
  const count=Number(event?.count??event?.likeCount);
  if(!Number.isSafeInteger(count)||count<1||count>100000)return null;
  const raw=event?.common?.msgId??event?.msgId;
  // A identidade de quem curte nunca é armazenada ou divulgada.
  return {source:"tiktok",count,eventId:raw==null?null:String(raw).slice(0,140)};
}
export function startTikTokBridge({onChat,onGift=()=>{},onLike=()=>{},onEvent=()=>{},onStatus=()=>{},username=process.env.TIKTOK_USERNAME}={}) {
  const handle=(typeof username==="string"?username:"").trim().replace(/^@/,"");
  if(!handle)return {enabled:false,status:()=>({enabled:false,connected:false}),close:async()=>{}};
  let stopped=false,connected=false,connecting=false,connection=null,reconnectTimer=null;
  let delay=12000;
  function emit(info){onStatus(info);}
  async function disconnectOld(){
    const old=connection;connection=null;
    if(old)try{await old.disconnect()}catch{}
  }
  function retry(reason="disconnected"){
    if(stopped||reconnectTimer)return;
    connected=false;
    emit({enabled:true,connected:false,username:handle,phase:"retrying",reason});
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;void connect();},delay);
    reconnectTimer.unref?.();
    delay=Math.min(delay*1.6,90000);
  }
  async function connect(){
    if(stopped||connecting)return;
    connecting=true;
    emit({enabled:true,connected:false,username:handle,phase:"connecting"});
    try{
      await disconnectOld();
      const {TikTokLiveConnection,WebcastEvent,ControlEvent}=await import("tiktok-live-connector");
      if(stopped)return;
      const conn=new TikTokLiveConnection(handle,{processInitialData:false});
      connection=conn;
      conn.on(WebcastEvent.CHAT,event=>{
        if(stopped)return;
        const normalized=normalizeTikTokChat(event);
        onEvent({type:"chat",recognized:!!normalized});
        if(!normalized)return;
        try{onChat(normalized)}catch(error){console.error("[tiktok] erro de inscrição",error.message);}
      });
      conn.on(WebcastEvent.GIFT,event=>{
        if(stopped)return;
        const normalized=normalizeTikTokGift(event);
        onEvent({type:"gift",recognized:!!normalized});
        if(!normalized)return;
        try{onGift(normalized)}catch(error){console.error("[tiktok] erro de presente",error.message);}
      });
      conn.on(WebcastEvent.LIKE,event=>{
        if(stopped)return;
        const like=normalizeTikTokLike(event);
        onEvent({type:"like",recognized:!!like});
        if(like)try{onLike(like)}catch(error){console.error("[tiktok] erro de curtida",error.message);}
      });
      conn.on(ControlEvent.ERROR,({info,exception})=>{
        console.warn("[tiktok] evento de erro",String(info??exception?.message??"indisponível").slice(0,150));
      });
      conn.on("disconnected",()=>{if(!stopped&&connection===conn)retry("disconnected");});
      conn.on("streamEnd",()=>{if(!stopped&&connection===conn)retry("stream_ended");});
      await conn.connect();
      if(stopped){await conn.disconnect();return;}
      connected=true;delay=12000;
      console.log("[tiktok] chat conectado ao usuário configurado");
      emit({enabled:true,connected:true,username:handle,phase:"connected"});
    }catch(error){
      console.warn("[tiktok] conexão não disponível",String(error?.message??error).slice(0,160));
      const issue=/isn.t online|not live|not online/i.test(String(error?.message??error))?"live_not_active":"connection_failed";
      retry(issue);
    }finally{connecting=false;}
  }
  void connect();
  return {
    enabled:true,
    status:()=>({enabled:true,connected,username:handle}),
    async close(){
      stopped=true;clearTimeout(reconnectTimer);connected=false;
      await disconnectOld();
    }
  };
}
