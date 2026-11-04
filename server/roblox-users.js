import {validRobloxUsername} from "../src/roblox-names.js";
export class RobloxLookupError extends Error{
  constructor(code,message){super(message);this.name="RobloxLookupError";this.code=code;}
}
export function createRobloxLookup({fetchImpl=globalThis.fetch,clock=Date.now,ttlMs=600000,maxPerMinute=30}={}){
  const cache=new Map(),pending=new Map(),attempts=[];
  async function lookup(username){
    if(!validRobloxUsername(username))throw new RobloxLookupError("invalid_username","Nome Roblox inválido. Use o nome @usuário, não o apelido.");
    const key=username.toLowerCase(),now=clock(),cached=cache.get(key);
    if(cached&&cached.expires>now){
      if(cached.error)throw new RobloxLookupError("not_found",cached.error);
      return cached.profile;
    }
    if(pending.has(key))return pending.get(key);
    while(attempts.length&&attempts[0]<=now-60000)attempts.shift();
    if(attempts.length>=maxPerMinute)throw new RobloxLookupError("rate_limited","Muitas consultas ao Roblox. Tente mais tarde.");
    attempts.push(now);
    const task=(async()=>{
      let response;
      try{
        response=await fetchImpl("https://users.roblox.com/v1/usernames/users",{
          method:"POST",
          headers:{"content-type":"application/json","accept":"application/json"},
          body:JSON.stringify({usernames:[username],excludeBannedUsers:true}),
          signal:AbortSignal.timeout(6500)
        });
      }catch{throw new RobloxLookupError("unavailable","Roblox indisponível agora.");}
      if(!response?.ok)throw new RobloxLookupError("unavailable","Roblox indisponível (HTTP "+(response?.status??"erro")+").");
      let data;
      try{data=await response.json();}catch{throw new RobloxLookupError("unavailable","Resposta Roblox inválida.");}
      const user=Array.isArray(data?.data)?data.data.find(x=>
        typeof x?.name==="string"&&x.name.toLowerCase()===key&&Number.isSafeInteger(x.id)&&x.id>0):null;
      if(!user){
        cache.set(key,{error:"Conta Roblox não encontrada.",expires:now+45000});
        throw new RobloxLookupError("not_found","Conta Roblox não encontrada.");
      }
      const profile={id:user.id,username:user.name,displayName:String(user.displayName??user.name).slice(0,28)};
      cache.set(key,{profile,expires:now+ttlMs});
      if(cache.size>1000)cache.delete(cache.keys().next().value);
      return profile;
    })().finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  }
  return {lookup};
}
