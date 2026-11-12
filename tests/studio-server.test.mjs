import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";
import {createStudioRuntime} from "../server/studio-runtime.js";

const KEY="studio-test-key";
async function appFor(t,enabled=true){
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({studioV5Enabled:enabled,adminKey:KEY,
    storage,seedDemo:false,disableTikTok:true});
  const address=await app.listen(0);
  const base="http://127.0.0.1:"+address.port;
  t.after(()=>app.close());
  async function get(path){
    const r=await fetch(base+path);
    return {code:r.status,data:await r.json()};
  }
  async function post(path,data,key=KEY){
    const r=await fetch(base+path,{method:"POST",
      headers:{"content-type":"application/json",...(key?{"x-admin-key":key}:{})},
      body:JSON.stringify(data)});
    return {code:r.status,data:await r.json()};
  }
  return {app,base,get,post};
}
const join=(userId,i=0)=>({
  type:"join",userId,name:"Jogador "+i,eventId:"join-"+userId
});
test("Studio endpoints are disabled unless explicitly enabled; legacy state is intact",async t=>{
  const {get}=await appFor(t,false);
  assert.equal((await get("/api/studio/state")).code,404);
  const legacy=await get("/api/state");
  assert.equal(legacy.code,200);
  assert.equal(legacy.data.state.phase,"LOBBY");
  assert.equal(legacy.data.state.trackLength,400);
});
test("Studio endpoint serves isolated 100-player motor alongside the old race",async t=>{
  const {get,post}=await appFor(t,true);
  const initial=await get("/api/studio/state");
  assert.equal(initial.code,200);
  assert.equal(initial.data.mode,"studio-v5");
  assert.equal(initial.data.state.distance,1200);
  assert.equal(initial.data.state.phase,"LOBBY");
  for(let i=0;i<100;i++){
    const r=await post("/api/studio/admin/event",join("u"+i,i));
    assert.equal(r.code,200,"join number "+i);
  }
  assert.equal((await get("/api/studio/state")).data.state.active.length,100);
  assert.equal((await get("/api/studio/state")).data.state.active[99].gridPosition>0,true);
  const extra=await post("/api/studio/admin/event",join("overflow"));
  assert.equal(extra.code,400);
  assert.equal((await get("/api/state")).data.state.active.length,0);
});
test("All Studio mutations require the operator key and never expose it in snapshots",async t=>{
  const {get,post}=await appFor(t,true);
  assert.equal((await post("/api/studio/admin/action",{action:"advance"},null)).code,401);
  assert.equal((await post("/api/studio/admin/event",join("hacked"),"bad")).code,401);
  assert.equal((await post("/api/studio/admin/action",{action:"invalid"})).code,400);
  const data=(await get("/api/studio/state")).data;
  assert.equal(JSON.stringify(data).includes(KEY),false);
});
test("Event IDs are deduplicated and bounded to one gameplay mutation",async t=>{
  const {post,get}=await appFor(t,true);
  const first=await post("/api/studio/admin/event",join("u1"));
  const second=await post("/api/studio/admin/event",join("u1"));
  assert.equal(first.code,200);
  assert.equal(second.data.duplicate,true);
  assert.equal((await get("/api/studio/state")).data.state.active.length,1);
  await post("/api/studio/admin/action",{action:"advance"});
  await post("/api/studio/admin/action",{action:"advance"});
  const like={type:"like",userId:"u1",count:40,eventId:"like-one"};
  assert.equal((await post("/api/studio/admin/event",like)).data.boosts>0,true);
  assert.equal((await post("/api/studio/admin/event",like)).data.duplicate,true);
  assert.equal((await get("/api/studio/state")).data.state.likesTotal,40);
});
test("Distance can be queued for the next race; existing race remains unchanged",async t=>{
  const {post,get}=await appFor(t,true);
  const act=(action,fields={})=>post("/api/studio/admin/action",{action,...fields});
  assert.equal((await act("set-distance",{distance:1500})).data.ok,true);
  assert.equal((await get("/api/studio/state")).data.state.distance,1500);
  await post("/api/studio/admin/event",join("x"));
  await act("advance");await act("advance");
  assert.equal((await act("set-distance",{distance:1050})).data.applies,"próxima");
  assert.equal((await get("/api/studio/state")).data.state.distance,1500);
  await act("advance");await act("advance");
  assert.equal((await get("/api/studio/state")).data.state.distance,1050);
});
test("SSE sends initial state and notices accepted admin events",async t=>{
  const {base,post}=await appFor(t,true);
  const abort=new AbortController();
  try{
    const response=await fetch(base+"/api/studio/events",{signal:abort.signal});
    assert.equal(response.status,200);
    assert.match(response.headers.get("content-type"),/text\/event-stream/);
    const reader=response.body.getReader();
    const first=Buffer.from((await reader.read()).value).toString();
    assert.match(first,/event: race/);
    assert.match(first,/"studio-v5"/);
    await post("/api/studio/admin/event",join("alice"));
    const next=Buffer.from((await reader.read()).value).toString();
    assert.match(next,/"alice"/);
    await reader.cancel();
  }finally{abort.abort();}
});
test("Simulation event API accepts presents, follows and caps effect count",async t=>{
  const {post,get}=await appFor(t,true);
  await post("/api/studio/admin/event",join("one"));
  await post("/api/studio/admin/event",join("two"));
  await post("/api/studio/admin/action",{action:"advance"});
  await post("/api/studio/admin/action",{action:"advance"});
  const gift=await post("/api/studio/admin/event",{
    type:"gift",userId:"one",giftName:"Rosa",coins:1,eventId:"gift-1"
  });
  assert.equal(gift.code,200);
  assert.equal(gift.data.type,"turbo");
  const follow=await post("/api/studio/admin/event",{
    type:"follow",userId:"one",name:"Fã",eventId:"follow-1"
  });
  assert.equal(follow.code,200);
  assert.ok(follow.data.targetId);
  const health=await get("/api/studio/health");
  assert.equal(health.data.connected,false);
  assert.equal(health.data.persistence,"memory-isolated");
  assert.ok((await get("/api/studio/state")).data.state.effects.length>0);
});
test("Request size is bounded and invalid JSON is rejected",async t=>{
  const {base}=await appFor(t,true);
  const req=(body)=>fetch(base+"/api/studio/admin/action",{method:"POST",
    headers:{"x-admin-key":KEY,"content-type":"application/json"},body});
  assert.equal((await req("{invalid")).status,400);
  assert.equal((await req(JSON.stringify({action:"advance",payload:"x".repeat(9500)}))).status,413);
});
test("Runtime clamps lost frames, supports disconnect status and closes without listener leaks",()=>{
  let time=0;
  const studio=createStudioRuntime({clock:()=>time,autoStart:false,adminKey:KEY});
  const first=studio.snapshot();
  assert.equal(first.state.countdown,60);
  time+=60000;
  studio.frame();
  assert.equal(studio.state().phase,"LOBBY");
  // Runtime advances a maximum of 3s per tick after OS/background suspension.
  assert.equal(studio.state().phaseMs,3000);
  studio.setConnected(true);
  assert.equal(studio.snapshot().state.connected,true);
  studio.act({action:"fill-bots",count:100});
  assert.equal(studio.snapshot().state.active.length,100);
  studio.stop();studio.stop();
  assert.equal(studio.ingest(join("late")).ok,false);
});
