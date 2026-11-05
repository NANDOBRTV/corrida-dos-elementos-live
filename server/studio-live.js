// TikTok/Roblox integration for Studio V5. Runs server-side, opt-in only.
// Privacy: raw TikTok IDs never leave this module; UI sees HMAC pseudonyms.
// No Roblox cookies, TikTok cookies, account passwords, or unofficial avatar 3D imports.
import {randomBytes} from "node:crypto";
import {validRobloxUsername} from "../src/roblox-names.js";
import {parseVehicleChoice} from "../src/vehicles.js";
import {normalizeTikTokGift,normalizeTikTokLike} from "./tiktok.js";
import {pseudonymizeTikTokUser} from "./privacy.js";
import {createRobloxLookup} from "./roblox-users.js";

const CACHE_TTL=10*60*1000;
const FAILURE_TTL=40*1000;
const CACHE_MAX=600;
const HEADSHOT_ENDPOINT="https://thumbnails.roblox.com/v1/users/avatar-headshot";
const clean=(x,n=128)=>String(x??"").trim().slice(0,n);
function safeImageUrl(value){
  if(typeof value!=="string"||value.length>600)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=="https:")return null;
    if(url.hostname!=="rbxcdn.com"&&!url.hostname.endsWith(".rbxcdn.com"))
      return null;
    return url.href;
  }catch{return null;}
}
function normalizeIdentity(event){
  const value=event?.user?.userId??event?.user?.id??event?.user?.uniqueId;
  if(value==null||typeof value==="number"&&!Number.isSafeInteger(value))return null;
  const raw=clean(value);
  if(!raw||raw==="undefined"||raw==="null")return null;
  const nickname=clean(event.user?.nickname??event.user?.uniqueId??"Participante",28)||
    "Participante";
  // Platform-internal identifiers must not leak if a provider accidentally
  // mirrors an ID into the display-name field. Short ordinary names stay valid.
  const name=raw.length>=8&&nickname.includes(raw)?"Participante":nickname;
  return {raw,name};
}
function messageId(event){
  const value=event?.common?.msgId??event?.common?.messageId??event?.msgId;
  return value==null?null:clean(value,150);
}
export function normalizeStudioChat(event){
  const sender=normalizeIdentity(event);
  if(!sender||typeof event?.comment!=="string")return null;
  // A viewer must select a valid model: "Civic", "CG 160" or
  // "entrar Civic". Usernames and arbitrary chat never register anyone.
  const vehicle=parseVehicleChoice(event.comment);
  if(!vehicle)return null;
  return {...sender,vehicleId:vehicle.id,vehicleName:vehicle.name,
    eventId:messageId(event)};
}
export function normalizeStudioFollow(event){
  const sender=normalizeIdentity(event);
  if(!sender)return null;
  return {...sender,eventId:messageId(event)};
}
// Roblox's public thumbnail endpoint returns a CDN URL, not an image blob.
// Cache and in-flight coalescing protect the service from 100 duplicate requests.
export function createStudioAvatarResolver({
  lookup=createRobloxLookup(),fetchImpl=globalThis.fetch,
  clock=Date.now,ttlMs=CACHE_TTL,maxEntries=CACHE_MAX
}={}){
  const cache=new Map(),pending=new Map();
  const fallback=Object.freeze({robloxUserId:null,robloxUsername:null,
    avatarUrl:null,source:"starter"});
  async function resolve(username){
    if(!validRobloxUsername(username))return fallback;
    const key=username.toLowerCase();
    const present=cache.get(key),now=clock();
    if(present&&present.expires>now)return present.value;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      let profile=null;
      try{
        profile=await lookup.lookup(username);
        if(!Number.isSafeInteger(profile?.id)||profile.id<=0)throw Error("bad id");
      }catch{
        cache.set(key,{expires:clock()+FAILURE_TTL,value:fallback});
        return fallback;
      }
      let avatarUrl=null;
      try{
        const query=new URLSearchParams({userIds:String(profile.id),
          size:"150x150",format:"Png",isCircular:"false"});
        const response=await fetchImpl(HEADSHOT_ENDPOINT+"?"+query,{
          headers:{accept:"application/json"},
          signal:AbortSignal.timeout(5000)
        });
        if(!response?.ok)throw Error("thumbnail error");
        const result=await response.json();
        const entry=Array.isArray(result?.data)?result.data.find(v=>v.targetId===profile.id):null;
        if(entry?.state==="Completed")avatarUrl=safeImageUrl(entry.imageUrl);
      }catch{
        // Still join as voxel; image retrieval must never block the race.
      }
      const value={robloxUserId:profile.id,
        robloxUsername:clean(profile.username??profile.name??username,20),
        avatarUrl,source:"roblox"};
      cache.set(key,{value,expires:clock()+ttlMs});
      while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
      return value;
    })().finally(()=>pending.delete(key));
    pending.set(key,task);
    return task;
  }
  return {resolve,cacheSize:()=>cache.size,clear:()=>{cache.clear();pending.clear();}};
}
function giftCoinValue(raw){
  const detail=raw?.gift??raw?.giftDetails??{};
  const unit=Number(detail.diamondCount??raw?.diamondCount);
  const quantity=Number(raw?.repeatCount??1);
  if(!Number.isSafeInteger(unit)||unit<0||!Number.isSafeInteger(quantity)||quantity<1)
    return 0;
  return Math.min(100000,unit*Math.min(quantity,999));
}
export function createStudioLiveBridge({
  studio,lookup=createRobloxLookup(),fetchImpl=globalThis.fetch,
  username="",identitySalt="",enabled=false,
  connectionFactory=null,clock=Date.now,
  retryBaseMs=12000,retryMaxMs=90000,
  resolver=null
}={}){
  if(!studio||typeof studio.ingest!=="function")throw Error("Studio runtime required");
  const secret=identitySalt.length>=16?identitySalt:randomBytes(32).toString("hex");
  const avatarResolver=resolver??createStudioAvatarResolver({lookup,fetchImpl,clock});
  const handle=clean(username,50).replace(/^@/,"");
  let connected=false,stopped=false,connecting=false,conn=null;
  let retries=0,timer=null,task=null;
  const cards=new Map();
  const pendingJoins=new Map();
  const metrics={chats:0,joins:0,starterFallbacks:0,gifts:0,
    likes:0,follows:0,errors:0,reconnects:0};
  function status(){return {enabled:Boolean(enabled&&handle),connected,
    phase:stopped?"stopped":connected?"connected":connecting?"connecting":"offline",
    retries,metrics:{...metrics},avatarCache:avatarResolver.cacheSize()};}
  function safeId(raw){try{return pseudonymizeTikTokUser(raw,secret);}
    catch{return null;}}
  function publishAvatar(userId,avatar){
    cards.set(userId,{id:userId,robloxUsername:avatar.robloxUsername,
      avatarUrl:avatar.avatarUrl,source:avatar.source});
    while(cards.size>150)cards.delete(cards.keys().next().value);
  }
  function avatars(){
    const active=studio.state().active;
    return {ok:true,round:studio.state().round,
      profiles:active.map(r=>cards.get(r.id)??{
        id:r.id,vehicleId:r.vehicleId??"car-uno",avatarUrl:null,
        source:"vehicle"})};
  }
  async function chat(raw){
    if(stopped)return {ok:false,reason:"Bridge stopped"};
    const event=normalizeStudioChat(raw);
    if(!event)return {ok:false,reason:"Not a valid joining command"};
    const id=safeId(event.raw);
    if(!id)return {ok:false,reason:"Invalid sender"};
    if(pendingJoins.has(id))return pendingJoins.get(id);
    const request=(async()=>{
      if(stopped)return {ok:false,reason:"Bridge stopped"};
      // Never fetch a third-party avatar or use a social username to choose
      // the vehicle. The catalog ID is exactly the viewer's chat selection.
      const result=studio.ingest({type:"join",eventId:event.eventId,userId:id,
        name:event.name,vehicleId:event.vehicleId});
      if(result.ok&&!result.duplicate){
        cards.set(id,{id,vehicleId:event.vehicleId,
          avatarUrl:null,source:"vehicle"});
        metrics.joins++;
      }
      metrics.chats++;
      return result;
    })().catch(error=>{
      metrics.errors++;
      return {ok:false,reason:"Join unavailable",error:String(error?.message??error).slice(0,80)};
    }).finally(()=>pendingJoins.delete(id));
    pendingJoins.set(id,request);
    return request;
  }
  function gift(raw){
    if(stopped)return {ok:false,reason:"Bridge stopped"};
    const gift=normalizeTikTokGift(raw);
    if(!gift)return {ok:false,reason:"Incomplete gift/combination"};
    const userId=safeId(gift.userId);
    if(!userId)return {ok:false,reason:"Invalid sender"};
    const fallbackKey=gift.groupId&&gift.giftId?
      gift.groupId+":"+gift.giftId+":"+gift.repeatCount:null;
    const result=studio.ingest({type:"gift",userId,
      name:gift.displayName,giftName:gift.giftName,coins:giftCoinValue(raw),
      eventId:gift.eventId??fallbackKey});
    if(result.ok&&!result.duplicate)metrics.gifts++;
    return result;
  }
  function like(raw){
    if(stopped)return {ok:false,reason:"Bridge stopped"};
    const v=normalizeTikTokLike(raw);
    if(!v)return {ok:false,reason:"Invalid like"};
    const result=studio.ingest({type:"like",count:v.count,
      eventId:v.eventId,userId:""});
    if(result.ok&&!result.duplicate)metrics.likes+=v.count;
    return result;
  }
  function follow(raw){
    if(stopped)return {ok:false,reason:"Bridge stopped"};
    const v=normalizeStudioFollow(raw);
    if(!v)return {ok:false,reason:"Invalid follow"};
    const id=safeId(v.raw);
    if(!id)return {ok:false,reason:"Invalid sender"};
    const result=studio.ingest({type:"follow",userId:id,name:v.name,eventId:v.eventId});
    if(result.ok&&!result.duplicate)metrics.follows++;
    return result;
  }
  function disconnect(){
    const prev=conn;conn=null;
    return prev?.disconnect?.().catch(()=>{});
  }
  function scheduleRetry(){
    if(stopped||timer||!enabled||!handle)return;
    connected=false;studio.setConnected(false);
    metrics.reconnects++;retries++;
    const delay=Math.min(retryMaxMs,retryBaseMs*Math.pow(1.6,Math.min(retries,12)));
    timer=setTimeout(()=>{timer=null;void start();},delay);
    timer.unref?.();
  }
  async function start(){
    if(stopped||connecting||connected||!enabled||!handle)return status();
    connecting=true;
    try{
      await disconnect();
      const provider=connectionFactory??(async()=>{
        const mod=await import("tiktok-live-connector");
        return new mod.TikTokLiveConnection(handle,{processInitialData:false});
      });
      const next=await provider(handle);
      if(stopped){try{await next.disconnect();}catch{}return status();}
      conn=next;
      for(const [name,fn] of [["chat",event=>{void chat(event);}],
        ["gift",gift],["like",like],["follow",follow]]){
        next.on(name,event=>{
          try{const value=fn(event);
            if(value?.catch)void value.catch(()=>{metrics.errors++});
          }catch{metrics.errors++;}
        });
      }
      for(const ev of ["disconnected","streamEnd"]){
        next.on(ev,()=>{if(stopped||conn!==next)return;
          connected=false;studio.setConnected(false);scheduleRetry();});
      }
      next.on("error",()=>{metrics.errors++;});
      await next.connect();
      if(stopped||conn!==next){try{await next.disconnect();}catch{}return status();}
      connected=true;retries=0;studio.setConnected(true);
    }catch{
      metrics.errors++;
      scheduleRetry();
    }finally{connecting=false;}
    return status();
  }
  async function close(){
    if(stopped)return;
    stopped=true;connected=false;
    clearTimeout(timer);timer=null;
    pendingJoins.clear();cards.clear();
    studio.setConnected(false);
    await disconnect();
    avatarResolver.clear();
  }
  return {start,close,status,avatars,chat,gift,like,follow,
    metrics,avatarResolver};
}
