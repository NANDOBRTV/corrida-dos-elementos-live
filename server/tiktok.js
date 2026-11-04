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
export function startTikTokBridge({onChat,onStatus=()=>{},username=process.env.TIKTOK_USERNAME}={}) {
  const handle=(typeof username==="string"?username:"").trim().replace(/^@/,"");
  if(!handle)return {enabled:false,status:()=>({enabled:false,connected:false}),close:async()=>{}};
  let stopped=false,connected=false,connecting=false,connection=null,reconnectTimer=null;
  let delay=12000;
  function emit(info){onStatus(info);}
  async function disconnectOld(){
    const old=connection;connection=null;
    if(old)try{await old.disconnect()}catch{}
  }
  function retry(){
    if(stopped||reconnectTimer)return;
    connected=false;
    emit({enabled:true,connected:false,username:handle});
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;void connect();},delay);
    reconnectTimer.unref?.();
    delay=Math.min(delay*1.6,90000);
  }
  async function connect(){
    if(stopped||connecting)return;
    connecting=true;
    try{
      await disconnectOld();
      const {TikTokLiveConnection,WebcastEvent,ControlEvent}=await import("tiktok-live-connector");
      if(stopped)return;
      const conn=new TikTokLiveConnection(handle,{processInitialData:false});
      connection=conn;
      conn.on(WebcastEvent.CHAT,event=>{
        if(stopped)return;
        const normalized=normalizeTikTokChat(event);
        if(!normalized)return;
        try{onChat(normalized)}catch(error){console.error("[tiktok] erro de inscrição",error.message);}
      });
      conn.on(WebcastEvent.GIFT,()=>{ /* Presentes serão mapeados em versão posterior. */ });
      conn.on(ControlEvent.ERROR,({info,exception})=>{
        console.warn("[tiktok] evento de erro",String(info??exception?.message??"indisponível").slice(0,150));
      });
      conn.on("disconnected",()=>{if(!stopped)retry();});
      conn.on("streamEnd",()=>{if(!stopped)retry();});
      await conn.connect();
      if(stopped){await conn.disconnect();return;}
      connected=true;delay=12000;
      console.log("[tiktok] chat conectado ao usuário configurado");
      emit({enabled:true,connected:true,username:handle});
    }catch(error){
      console.warn("[tiktok] conexão não disponível",String(error?.message??error).slice(0,160));
      retry();
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
