import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";

const TOKEN="test-only-not-production";
function storage(){
  let snapshot=null;
  return {
    enabled:true,
    load:async()=>snapshot?structuredClone(snapshot):null,
    save:async value=>{snapshot=structuredClone(value);},
    close:async()=>{}
  };
}
test("12 spectator streams receive the same authoritative round and unique process ID",async t=>{
  const app=await createApp({adminKey:TOKEN,storage:storage(),disableTikTok:true});
  const address=await app.listen(0);
  const base="http://127.0.0.1:"+address.port;
  t.after(()=>app.close());
  const health=await (await fetch(base+"/health")).json();
  assert.match(health.instanceId,/^[a-f0-9]{16}$/);
  const participants=await Promise.all(Array.from({length:12},async()=>{
    const controller=new AbortController();
    const response=await fetch(base+"/api/stream",{signal:controller.signal});
    assert.equal(response.status,200);
    const first=await response.body.getReader().read();
    const text=Buffer.from(first.value).toString("utf8");
    assert.match(text,/event: race/);
    const dataLine=text.split("\n").find(line=>line.startsWith("data: "));
    assert.ok(dataLine);
    const event=JSON.parse(dataLine.slice(6));
    assert.equal(event.instanceId,health.instanceId);
    assert.equal(event.state.round,health.round);
    return controller;
  }));
  const result=await fetch(base+"/api/admin/diagnostics",{headers:{"x-admin-key":TOKEN}});
  assert.equal(result.status,200);
  assert.equal((await result.json()).diagnostics.game.viewers,12);
  for(const controller of participants)controller.abort();
});
test("a simulated Render restart creates a new instance ID and recovers persisted state",async()=>{
  const persistent=storage();
  const first=await createApp({adminKey:TOKEN,storage:persistent,disableTikTok:true,seedDemo:false});
  const one=await first.listen(0);
  const a="http://127.0.0.1:"+one.port;
  const start=await (await fetch(a+"/health")).json();
  const join=await fetch(a+"/api/admin/join",{method:"POST",headers:{
    "Content-Type":"application/json","x-admin-key":TOKEN
  },body:JSON.stringify({userId:"simulated-1",displayName:"Corredor",content:"entrar"})});
  assert.equal(join.status,200);
  await first.close();
  const next=await createApp({adminKey:TOKEN,storage:persistent,disableTikTok:true,seedDemo:false});
  const two=await next.listen(0);
  try{
    const b="http://127.0.0.1:"+two.port;
    const h=await (await fetch(b+"/health")).json();
    const state=await (await fetch(b+"/api/state")).json();
    assert.notEqual(h.instanceId,start.instanceId);
    assert.equal(h.recovery.loaded,true);
    assert.equal(state.state.active[0].id,"simulated-1");
    assert.equal(state.instanceId,h.instanceId);
    assert.equal(state.liveEventsMode,"staged");
  }finally{await next.close();}
});
