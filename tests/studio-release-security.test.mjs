import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";
import {validateStudioCheckpoint} from "../server/studio-runtime.js";

const ADMIN_KEY="final-release-test-key";
const mockLegacy={
  enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}
};

function durableStore(shared,{failure=null}={}){
  return {
    enabled:true,
    async load(){return shared.checkpoint?structuredClone(shared.checkpoint):null;},
    async save(value){
      if(failure?.enabled)throw Error(failure.message);
      shared.checkpoint=validateStudioCheckpoint(value);
      shared.writes=(shared.writes||0)+1;
    },
    async close(){}
  };
}

async function serve(t,store){
  const app=await createApp({
    storage:mockLegacy,studioV5Enabled:true,
    studioStore:store,adminKey:ADMIN_KEY,
    disableTikTok:true,seedDemo:false
  });
  const address=await app.listen(0);
  const origin="http://127.0.0.1:"+address.port;
  let closed=false;
  async function close(){
    if(closed)return;
    closed=true;
    await app.close();
  }
  t.after(close);
  const request=async(path,{method="GET",key,body,raw}={})=>{
    const headers={};
    if(key!==undefined)headers["x-admin-key"]=key;
    if(body!==undefined||raw!==undefined)headers["content-type"]="application/json";
    const result=await fetch(origin+path,{
      method,headers,body:raw??(body===undefined?undefined:JSON.stringify(body))
    });
    const txt=await result.text();
    return {status:result.status,text:txt,json:JSON.parse(txt)};
  };
  return {origin,close,request,app};
}

test("Release: endpoints administrativos exigem chave e nao alteram estado",async t=>{
  const shared={},server=await serve(t,durableStore(shared));
  const path="/api/studio/admin/event";
  const event={type:"join",userId:"person1",name:"Participante",
    eventId:"join-person1"};
  assert.equal((await server.request(path,{method:"POST",body:event})).status,401);
  assert.equal((await server.request(path,{
    method:"POST",key:"invalid-key",body:event
  })).status,401);
  assert.equal((await server.request(path,{key:ADMIN_KEY})).status,405);
  assert.equal((await server.request(path,{
    method:"POST",key:ADMIN_KEY,raw:"{not-json"
  })).status,400);
  assert.equal((await server.request(path,{
    method:"POST",key:ADMIN_KEY,body:{type:"invalid",userId:"person1"}
  })).status,400);
  const current=await server.request("/api/studio/state");
  assert.equal(current.status,200);
  assert.equal(current.json.state.active.length,0);
  assert.equal((await server.request("/api/studio/health")).json.enabled,true);
  const previous=await server.request("/api/state");
  assert.equal(previous.json.state.active.length,0);
  assert.equal(shared.checkpoint?.state.active.length??0,0);
});

test("Release: persistencia de eventos, fila e protecao contra replay apos reinicio",async t=>{
  const shared={};
  const first=await serve(t,durableStore(shared));
  const admin="/api/studio/admin/";
  const send=(s,path,body)=>s.request(admin+path,{
    method:"POST",key:ADMIN_KEY,body
  });
  const join={type:"join",userId:"viewer-1",name:"Jogador Real",
    eventId:"unique-join-1"};
  assert.equal((await send(first,"event",join)).status,200);
  const duplicated=await send(first,"event",join);
  assert.equal(duplicated.status,200);
  assert.equal(duplicated.json.duplicate,true);
  assert.equal((await send(first,"action",{action:"advance"})).status,200);
  assert.equal((await send(first,"action",{action:"advance"})).status,200);
  const like={type:"like",userId:"viewer-1",count:20,eventId:"like-20"};
  assert.equal((await send(first,"event",like)).status,200);
  const next={type:"join",userId:"viewer-late",name:"Fila",
    eventId:"late-join"};
  const queued=await send(first,"event",next);
  assert.equal(queued.status,200);
  assert.equal(queued.json.queue,"proxima");
  const before=(await first.request("/api/studio/state")).json.state;
  assert.equal(before.phase,"RUNNING");
  assert.equal(before.active.length,100);
  assert.equal(before.nextCount,1);
  assert.equal(before.likesTotal,20);
  await first.close();
  assert.ok(shared.writes>=4);
  assert.ok(shared.checkpoint?.state.active.length===100);

  const second=await serve(t,durableStore(shared));
  const resumed=(await second.request("/api/studio/state")).json.state;
  assert.equal(resumed.phase,"RUNNING");
  assert.equal(resumed.round,before.round);
  assert.equal(resumed.active.length,100);
  assert.equal(resumed.nextCount,1);
  assert.equal(resumed.likesTotal,20);
  assert.equal(resumed.active.filter(r=>!r.isBot).length,1);
  assert.equal((await send(second,"event",like)).json.duplicate,true);
  assert.equal((await send(second,"event",next)).json.duplicate,true);
  assert.equal((await second.request("/api/studio/state")).json.state.likesTotal,20);
  assert.equal((await second.request("/api/studio/health")).json.storage.recovered,true);
  await second.close();
});

test("Release: falhas privadas de Postgres nunca aparecem em endpoints publicos",async t=>{
  const marker="INTERNAL_PRIVATE_DATABASE_VALUE_NOT_FOR_PUBLIC";
  const failure={enabled:true,message:"pg connection failure "+marker};
  const shared={},server=await serve(t,durableStore(shared,{failure}));
  const result=await server.request("/api/studio/admin/event",{
    method:"POST",key:ADMIN_KEY,
    body:{type:"join",userId:"viewer-1",name:"Participante",eventId:"private"}
  });
  assert.equal(result.status,503);
  const health=await server.request("/api/studio/health");
  const general=await server.request("/health");
  assert.equal(health.status,200);
  assert.equal(health.json.storage.healthy,false);
  assert.equal(health.json.storage.writeFailures>=1,true);
  assert.equal(general.json.studio.healthy,false);
  assert.ok(health.json.storage.error);
  for(const document of [health.text,general.text,result.text]){
    assert.ok(!document.includes(marker),"Sensitive failure detail escaped");
  }
  failure.enabled=false;
  assert.equal(await server.app.studioRuntime.persist(true),true);
  const recovered=await server.request("/api/studio/health");
  assert.equal(recovered.json.storage.healthy,true);
  assert.equal(recovered.json.storage.error,null);
  assert.equal(shared.checkpoint.state.active.length,1);
});

test("Release: SSE oferece snapshot mas nao vaza chave administrativa",async t=>{
  const shared={},server=await serve(t,durableStore(shared));
  const response=await fetch(server.origin+"/api/studio/events");
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")||"",/text\/event-stream/);
  const reader=response.body.getReader();
  const first=await reader.read();
  assert.equal(first.done,false);
  const text=Buffer.from(first.value).toString("utf8");
  assert.match(text,/event: race/);
  assert.ok(!text.includes(ADMIN_KEY));
  await reader.cancel();
  const invalid=await server.request("/api/studio/not-found");
  assert.equal(invalid.status,404);
});
