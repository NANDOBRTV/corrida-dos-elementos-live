import test from "node:test";
import assert from "node:assert/strict";
import {parseRaceJoin,validRobloxUsername} from "../src/roblox-names.js";
import {normalizeTikTokChat} from "../server/tiktok.js";
import {createRobloxLookup,RobloxLookupError} from "../server/roblox-users.js";
import {createState,register,advance,nextRound} from "../src/engine.js";
import {createApp} from "../server/index.js";

test("Usernames are explicit chat commands, not arbitrary messages",()=>{
  assert.deepEqual(parseRaceJoin(" ENTRAR Nando_2026 "),{mode:"roblox",username:"Nando_2026",content:"entrar Nando_2026"});
  assert.equal(parseRaceJoin("ENTRAR").mode,"demo");
  assert.equal(parseRaceJoin("nando_2026"),null);
  for(const x of ["entrar x","entrar @@name","entrar wrong-name","entrar nome dois","entrando nome",
                  "entrar ___","entrar _hello"])
    assert.equal(parseRaceJoin(x),null,x);
  assert.equal(validRobloxUsername("User_900"),true);
  const chat=normalizeTikTokChat({comment:"entrar MinhaConta99",user:{userId:"550",nickname:"espectador"}});
  assert.equal(chat.robloxUsername,"MinhaConta99");
});
test("Official username lookup is singleflight and cached, bound to Roblox URL",async()=>{
  let calls=0,request;
  const fake=async(url,opts)=>{calls++;request={url,opts};return {ok:true,json:async()=>({data:[
    {id:987654,name:"Nando_2026",displayName:"Nando"}]})};};
  const api=createRobloxLookup({fetchImpl:fake});
  const both=await Promise.all([api.lookup("Nando_2026"),api.lookup("nando_2026")]);
  assert.equal(calls,1);
  assert.equal(both[0].id,987654);
  assert.equal(both[1].username,"Nando_2026");
  assert.equal((await api.lookup("NANDO_2026")).id,987654);
  assert.equal(request.url,"https://users.roblox.com/v1/usernames/users");
  assert.equal(request.opts.method,"POST");
  assert.deepEqual(JSON.parse(request.opts.body).usernames,["Nando_2026"]);
});
test("Roblox response cannot substitute a different username",async()=>{
  const api=createRobloxLookup({fetchImpl:async()=>({ok:true,json:async()=>({data:[{id:1,name:"DifferentName"}]})})});
  await assert.rejects(()=>api.lookup("WantedName"),e=>e instanceof RobloxLookupError&&e.code==="not_found");
});
test("Same Roblox avatar is unique per round and survives the queued round",()=>{
  const state=createState(11),profile={id:100040,username:"Nando_2026"};
  assert.equal(register(state,"tiktok-1","Viewer","entrar Nando_2026").ok,false);
  assert.equal(register(state,"tiktok-1","Viewer","entrar Nando_2026",profile).ok,true);
  assert.equal(state.active[0].robloxUserId,100040);
  assert.equal(state.active[0].name,"Nando_2026");
  assert.equal(register(state,"tiktok-2","Impersonator","entrar Nando_2026",profile).ok,false);
  advance(state);advance(state);
  assert.equal(register(state,"tiktok-3","Next","entrar Nando_2026",profile).ok,true);
  assert.equal(state.next[0].robloxUserId,100040);
  advance(state);nextRound(state);
  assert.equal(state.active[0].robloxUserId,100040);
  assert.equal(state.active[0].robloxUsername,"Nando_2026");
  assert.equal(state.trackLength,5000);
});
test("Studio bridge is private; exports only public user IDs and race movement",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const lookup={lookup:async username=>({id:12345,username})};
  const app=await createApp({storage,seedDemo:false,adminKey:"test-admin",robloxLookup:lookup,robloxBridgeKey:"test-bridge",disableTikTok:true});
  const addr=await app.listen(0);t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  assert.equal((await fetch(base+"/api/roblox/participants")).status,401);
  assert.equal((await fetch(base+"/api/roblox/participants",{headers:{"x-admin-key":"test-admin"}})).status,401);
  const join=await (await fetch(base+"/api/admin/join",{method:"POST",
    headers:{"x-admin-key":"test-admin","content-type":"application/json"},
    body:JSON.stringify({userId:"tiktok-private",displayName:"Viewer",content:"entrar Nando_2026"})})).json();
  assert.equal(join.ok,true);
  assert.equal(join.result.robloxUserId,12345);
  const linked=await (await fetch(base+"/api/roblox/participants",{headers:{"x-roblox-bridge-key":"test-bridge"}})).json();
  assert.equal(linked.participants[0].userId,12345);
  assert.equal(linked.participants[0].username,"Nando_2026");
  assert.equal(linked.trackLength,5000);
  assert.ok(!JSON.stringify(linked).includes("tiktok-private"));
  assert.ok(!JSON.stringify(linked).includes("test-admin"));
});
test("Studio route is unavailable by default, even when admin key exists",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({storage,seedDemo:false,adminKey:"secret",disableTikTok:true,robloxBridgeKey:""});
  const addr=await app.listen(0);t.after(()=>app.close());
  assert.equal((await fetch("http://127.0.0.1:"+addr.port+"/api/roblox/participants")).status,503);
});

test("50 simultaneous unique Roblox usernames use a single batched API request",async()=>{
  let calls=0;
  const fake=async(_url,opts)=>{
    calls++;
    const names=JSON.parse(opts.body).usernames;
    return {ok:true,json:async()=>({data:names.map((name,i)=>({id:1000+i,name}))})};
  };
  const lookup=createRobloxLookup({fetchImpl:fake,batchDelayMs:15});
  const names=Array.from({length:50},(_,i)=>"Player"+String(i).padStart(2,"0"));
  const profiles=await Promise.all(names.map(name=>lookup.lookup(name)));
  assert.equal(calls,1);
  assert.equal(profiles.length,50);
  assert.equal(new Set(profiles.map(p=>p.id)).size,50);
});
test("Command also allows an optional @ before Roblox username",()=>{
  assert.deepEqual(parseRaceJoin("entrar @Nando_2026"),{
    mode:"roblox",username:"Nando_2026",content:"entrar Nando_2026"
  });
});

test("Studio movement feed has velocity for smooth client interpolation",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({storage,seedDemo:false,adminKey:"test-admin",
    robloxLookup:{lookup:async username=>({id:50009,username})},
    robloxBridgeKey:"test-bridge",disableTikTok:true});
  const addr=await app.listen(0);t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  const res=await fetch(base+"/api/admin/join",{method:"POST",
    headers:{"x-admin-key":"test-admin","content-type":"application/json"},
    body:JSON.stringify({userId:"visitor",displayName:"Viewer",content:"entrar DemoAccount12"})});
  assert.equal(res.status,200);
  const feed=await (await fetch(base+"/api/roblox/participants",{headers:{"x-roblox-bridge-key":"test-bridge"}})).json();
  assert.equal(typeof feed.participants[0].speed,"number");
  assert.ok(Number.isFinite(feed.participants[0].speed));
});

test("Private Roblox Studio bridge shows no obstacle before gift and one after a test gift",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({storage,seedDemo:false,adminKey:"test-admin",
    robloxLookup:{lookup:async username=>({id:50009,username})},
    robloxBridgeKey:"test-bridge",disableTikTok:true});
  const addr=await app.listen(0);t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  const headers={"x-admin-key":"test-admin","content-type":"application/json"};
  const feed=async()=> (await (await fetch(base+"/api/roblox/participants",{
    headers:{"x-roblox-bridge-key":"test-bridge"}
  })).json()).obstacles;
  await fetch(base+"/api/admin/join",{method:"POST",headers,
    body:JSON.stringify({userId:"runner",displayName:"Runner",content:"entrar DemoAccount12"})});
  for(let i=0;i<2;i++)await fetch(base+"/api/admin/action",{method:"POST",headers,
    body:JSON.stringify({action:"advance"})});
  assert.deepEqual(await feed(),[]);
  const gift=await fetch(base+"/api/admin/action",{method:"POST",headers,
    body:JSON.stringify({action:"gift-test",userId:"runner"})});
  assert.equal(gift.status,200);
  const obstacles=await feed();
  assert.equal(obstacles.length,1);
  assert.equal(obstacles[0].simulated,true);
  assert.equal(typeof obstacles[0].z,"number");
  assert.equal(obstacles[0].kind,"ice");
});

test("Studio avatar camera reads replicated official race time and cuts every 10 seconds",async()=>{
  const {readFile}=await import("node:fs/promises");
  const server=await readFile(new URL("../roblox/LiveRace.server.luau",import.meta.url),"utf8");
  const camera=await readFile(new URL("../roblox/LiveCamera.client.luau",import.meta.url),"utf8");
  for(const marker of ['folder:SetAttribute("RaceMs",snapshot.raceMs)',
    'folder:SetAttribute("RacePhase",snapshot.phase)',
    'folder:SetAttribute("RaceRound",snapshot.round)',
    'model:SetAttribute("RaceLane",lane)'])
    assert.ok(server.includes(marker),marker);
  for(const marker of ["math.floor(raceMs/10000)","3200","chooseFeatured",
    "desired=desired:Lerp(close,blend)","Random.new(round*7937+slot*10949)"])
    assert.ok(camera.includes(marker),marker);
});
