import {validRobloxUsername} from "../src/roblox-names.js";

export class RobloxLookupError extends Error{
  constructor(code,message){super(message);this.name="RobloxLookupError";this.code=code;}
}
// Public Roblox username lookup: batches 50 entrants into one request instead of flooding
// Roblox from the TikTok comment handler. No cookies or Roblox credentials required.
export function createRobloxLookup({
  fetchImpl=globalThis.fetch,clock=Date.now,ttlMs=600000,
  maxPerMinute=30,batchSize=50,batchDelayMs=65
}={}){
  const cache=new Map(),pending=new Map(),queued=[],calls=[];
  let timer=null,inFlight=0;
  function failOne(entry,code,message){
    entry.reject(new RobloxLookupError(code,message));
    pending.delete(entry.key);
  }
  function schedule(){
    if(timer||!queued.length)return;
    timer=setTimeout(()=>{
      timer=null;
      if(inFlight>=2){schedule();return;}
      const batch=queued.splice(0,Math.min(50,batchSize));
      inFlight++;
      void flush(batch).finally(()=>{inFlight--;schedule();});
      schedule();
    },batchDelayMs);
  }
  async function flush(batch){
    const now=clock();
    while(calls.length&&calls[0]<=now-60000)calls.shift();
    if(calls.length>=maxPerMinute){
      for(const e of batch)failOne(e,"rate_limited","Muitas consultas ao Roblox. Tente mais tarde.");
      return;
    }
    calls.push(now);
    let response,body;
    try{
      response=await fetchImpl("https://users.roblox.com/v1/usernames/users",{
        method:"POST",
        headers:{"content-type":"application/json","accept":"application/json"},
        body:JSON.stringify({usernames:batch.map(e=>e.username),excludeBannedUsers:true}),
        signal:AbortSignal.timeout(6500)
      });
      if(!response?.ok)throw Error("HTTP "+(response?.status??"indisponível"));
      body=await response.json();
      if(!Array.isArray(body?.data))throw Error("Resposta inválida");
    }catch{
      for(const e of batch)failOne(e,"unavailable","Roblox indisponível agora.");
      return;
    }
    for(const e of batch){
      const user=body.data.find(x=>
        typeof x?.name==="string"&&x.name.toLowerCase()===e.key&&
        Number.isSafeInteger(x.id)&&x.id>0);
      if(!user){
        const message="Conta Roblox não encontrada.";
        cache.set(e.key,{error:message,expires:now+45000});
        failOne(e,"not_found",message);
        continue;
      }
      const profile={id:user.id,username:user.name,
        displayName:String(user.displayName??user.name).slice(0,28)};
      cache.set(e.key,{profile,expires:now+ttlMs});
      e.resolve(profile);
      pending.delete(e.key);
    }
    while(cache.size>1000)cache.delete(cache.keys().next().value);
  }
  async function lookup(username){
    if(!validRobloxUsername(username))
      throw new RobloxLookupError("invalid_username","Nome Roblox inválido. Use o nome @usuário, não o apelido.");
    const key=username.toLowerCase(),cached=cache.get(key);
    if(cached&&cached.expires>clock()){
      if(cached.error)throw new RobloxLookupError("not_found",cached.error);
      return cached.profile;
    }
    if(pending.has(key))return pending.get(key);
    if(queued.length>=300)throw new RobloxLookupError("rate_limited","Fila Roblox temporariamente cheia.");
    let resolve,reject;
    const task=new Promise((ok,bad)=>{resolve=ok;reject=bad;});
    pending.set(key,task);
    queued.push({key,username,resolve,reject});
    schedule();
    return task;
  }
  return {lookup};
}
