import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";
import {createStudioRuntime,openStudioStore,
  validateStudioCheckpoint} from "../server/studio-runtime.js";
const KEY="recovery-test-secret";
const JOIN={type:"join",userId:"user001",name:"Jogador 01",eventId:"j-001"};

function memoryStore(){
  let latest=null,closed=false,writes=0,fail=false;
  return {
    enabled:true,
    async load(){return latest?structuredClone(latest):null;},
    async save(checkpoint){
      if(fail)throw Error("simulated persistence outage");
      latest=validateStudioCheckpoint(checkpoint);
      writes++;
    },
    async close(){closed=true;},
    setFail(value){fail=Boolean(value);},
    get snapshot(){return latest;},
    get writes(){return writes;},
    get closed(){return closed;}
  };
}
function noLegacyDb(){
  return {enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
}
async function start(t,studioStore){
  const app=await createApp({
    storage:noLegacyDb(),studioV5Enabled:true,studioStore,
    adminKey:KEY,disableTikTok:true,seedDemo:false
  });
  const addr=await app.listen(0);
  const origin="http://127.0.0.1:"+addr.port;
  let done=false;
  async function close(){if(done)return;done=true;await app.close();}
  t.after(close);
  return {
    app,close,
    async get(path){
      const res=await fetch(origin+path);
      return {status:res.status,json:await res.json()};
    },
    async post(path,body){
      const res=await fetch(origin+path,{
        method:"POST",
        headers:{"x-admin-key":KEY,"content-type":"application/json"},
        body:JSON.stringify(body)
      });
      return {status:res.status,json:await res.json()};
    }
  };
}
test("A separate Studio store has a dedicated table and never accesses the legacy snapshot",async()=>{
  const calls=[],pool={
    async query(sql,params){
      calls.push({sql,params});
      if(sql.includes("SELECT checkpoint"))return {rows:[]};
      return {rows:[]};
    }
  };
  const store=await openStudioStore({pool});
  assert.equal(store.enabled,true);
  assert.equal(await store.load(),null);
  assert.ok(calls.some(c=>c.sql.includes("CREATE TABLE IF NOT EXISTS elemental_studio_state")));
  assert.ok(calls.every(c=>!c.sql.includes("elemental_game_state")));
  await store.close();
  assert.ok(calls.every(c=>!c.sql.includes("DROP TABLE")));
});
test("Production refuses boot when DATABASE_URL is absent instead of claiming 24-hour durability",async()=>{
  await assert.rejects(openStudioStore({
    connectionString:"",requireDatabase:true
  }),/requer DATABASE_URL/);
  const fallback=await openStudioStore({
    connectionString:"",requireDatabase:false
  });
  assert.equal(fallback.enabled,false);
});
test("Checkpoint preserves 100 players, active race progress, next queue and accepted event IDs",async()=>{
  let now=10000;
  const store=memoryStore();
  const game=createStudioRuntime({
    store,adminKey:KEY,autoStart:false,clock:()=>now
  });
  for(let i=0;i<100;i++){
    const id="user-"+i;
    assert.equal(game.ingest({
      type:"join",userId:id,name:"Corredor "+i,eventId:"join-"+i
    }).ok,true);
  }
  game.act({action:"advance"});
  game.act({action:"advance"});
  now+=1200;game.frame();
  assert.equal(game.state().phase,"RUNNING");
  assert.ok(game.state().active.every(r=>r.progress>0));
  assert.equal(game.ingest({type:"join",userId:"late",
    name:"Próxima",eventId:"join-late"}).queue,"próxima");
  const current=structuredClone(game.state());
  assert.equal(await game.shutdown(),true);
  assert.equal(store.snapshot.state.active.length,100);
  assert.equal(store.snapshot.state.next.length,1);
  assert.equal(store.closed,true);
  // A new instance must use a new DB-backed store, not volatile memory.
  const recovered=createStudioRuntime({
    autoStart:false,clock:()=>now+10000,
    checkpoint:store.snapshot,adminKey:KEY,
    store:memoryStore()
  });
  assert.equal(recovered.storageHealth().recovered,true);
  assert.equal(recovered.state().phase,"RUNNING");
  assert.equal(recovered.state().round,1);
  assert.deepEqual(recovered.state().active.map(r=>r.progress),
    current.active.map(r=>r.progress));
  assert.equal(recovered.state().next[0].userId,"late");
  assert.equal(recovered.state().connected,false);
  assert.equal(recovered.ingest({type:"join",userId:"late",
    name:"Próxima",eventId:"join-late"}).duplicate,true);
  recovered.frame();
  assert.ok(recovered.state().phase==="RUNNING");
  recovered.stop();
});
test("Corrupted checkpoints are rejected, not silently replaced with an empty race",async()=>{
  const store=memoryStore();
  const game=createStudioRuntime({store,autoStart:false,adminKey:KEY});
  game.ingest(JOIN);await game.shutdown();
  const good=store.snapshot;
  assert.ok(validateStudioCheckpoint(good));
  for(const corrupt of [
    {...good,version:2},
    {...good,state:{...good.state,distance:900}},
    {...good,state:{...good.state,active:[...good.state.active,
      {...good.state.active[0]}]}},
    {...good,state:{...good.state,phaseMs:-1}},
    {...good,dedupe:[["x",null]]}
  ]){
    assert.throws(()=>validateStudioCheckpoint(corrupt),/Checkpoint V5 inválido/);
    assert.throws(()=>createStudioRuntime({
      autoStart:false,checkpoint:corrupt
    }),/Checkpoint V5 inválido/);
  }
});
test("Write queue never commits an older revision over a newer one",async()=>{
  const snapshots=[],store={
    enabled:true,
    async save(data){
      await new Promise(resolve=>setTimeout(resolve,2));
      snapshots.push(structuredClone(data));
    },
    close:async()=>{}
  };
  const rt=createStudioRuntime({store,autoStart:false,adminKey:KEY});
  rt.ingest(JOIN);
  const first=rt.persist(true);
  rt.ingest({type:"join",userId:"user002",
    name:"Jogador 02",eventId:"j-002"});
  const second=rt.persist(true);
  assert.equal(await first,true);
  assert.equal(await second,true);
  assert.ok(snapshots.length>=1);
  for(let i=1;i<snapshots.length;i++)
    assert.ok(snapshots[i].revision>snapshots[i-1].revision);
  assert.equal(snapshots.at(-1).state.active.length,2);
  await rt.shutdown();
});
test("Authenticated administrative mutations acknowledge after durable write",async t=>{
  const store=memoryStore(),client=await start(t,store);
  const joined=await client.post("/api/studio/admin/event",JOIN);
  assert.equal(joined.status,200);
  assert.equal(store.snapshot.state.active.length,1);
  const status=await client.get("/api/studio/health");
  assert.equal(status.status,200);
  assert.equal(status.json.persistence,"postgres");
  assert.equal(status.json.storage.healthy,true);
  assert.equal(status.json.storage.dirty,false);
  const health=await client.get("/health");
  assert.equal(health.json.studio.mode,"postgres");
  const oldState=await client.get("/api/state");
  assert.equal(oldState.json.state.active.length,0);
  await client.close();
});
test("Storage outage returns HTTP 503, exposes diagnostic and retries without losing current race",async t=>{
  const store=memoryStore(),client=await start(t,store);
  store.setFail(true);
  const joined=await client.post("/api/studio/admin/event",JOIN);
  assert.equal(joined.status,503);
  assert.equal(joined.json.ok,false);
  const badHealth=await client.get("/api/studio/health");
  assert.equal(badHealth.json.storage.healthy,false);
  assert.ok(badHealth.json.storage.writeFailures>=1);
  const current=await client.get("/api/studio/state");
  assert.equal(current.json.state.active.length,1);
  store.setFail(false);
  assert.equal(await client.app.studioRuntime.persist(true),true);
  assert.equal(store.snapshot.state.active.length,1);
  const good=await client.get("/api/studio/health");
  assert.equal(good.json.storage.healthy,true);
  await client.close();
});
test("Restarted HTTP service restores the same round and kept positions",async t=>{
  const store=memoryStore(),first=await start(t,store);
  assert.equal((await first.post("/api/studio/admin/event",JOIN)).status,200);
  await first.post("/api/studio/admin/action",{action:"advance"});
  await first.post("/api/studio/admin/action",{action:"advance"});
  const running=await first.get("/api/studio/state");
  assert.equal(running.json.state.phase,"RUNNING");
  await first.close();
  const secondStore={
    enabled:true,load:async()=>store.snapshot,
    save:async cp=>{validateStudioCheckpoint(cp);},
    close:async()=>{}
  };
  const second=await start(t,secondStore);
  const restored=await second.get("/api/studio/state");
  assert.equal(restored.json.state.phase,"RUNNING");
  assert.equal(restored.json.state.round,running.json.state.round);
  assert.equal(restored.json.state.active.length,1);
  assert.equal(restored.json.state.active[0].id,"user001");
  const recovery=await second.get("/api/studio/health");
  assert.equal(recovery.json.storage.recovered,true);
  await second.close();
});
test("SSE reconnect gets a new snapshot and open connection is released on shutdown",async t=>{
  const store=memoryStore(),client=await start(t,store);
  const rt=client.app.studioRuntime;
  assert.equal(rt.snapshot().state.phase,"LOBBY");
  const response=await fetch((await client.get("/api/studio/health")).status===200?
    "http://127.0.0.1:"+client.app.server.address().port+"/api/studio/events":
    "http://127.0.0.1:1");
  assert.equal(response.status,200);
  const reader=response.body.getReader();
  const frame=Buffer.from((await reader.read()).value).toString();
  assert.match(frame,/event: race/);
  await reader.cancel();
  await client.close();
  assert.equal(store.closed,true);
  assert.equal(rt.ingest(JOIN).ok,false);
});
