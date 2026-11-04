import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";
import {createState} from "../src/engine.js";

const secret="long-test-only-secret-for-storage-checks";
function memoryStore(initial=null) {
  let value=initial;
  return {
    enabled:true,
    async load(){return value?structuredClone(value):null;},
    async save(snapshot){value=structuredClone(snapshot);},
    async close(){}
  };
}
async function start(t,storage) {
  const app=await createApp({storage,adminKey:secret,disableTikTok:true,seedDemo:false});
  const addr=await app.listen(0);
  t.after(()=>app.close());
  return {app,base:"http://127.0.0.1:"+addr.port};
}
test("Health identifies a valid recovery from persisted storage",async t=>{
  const saved=createState(1249);
  saved.round=47;saved.mapId="desert";saved.phase="LOBBY";
  const {base}=await start(t,memoryStore(saved));
  const response=await fetch(base+"/health");
  assert.equal(response.status,200);
  const health=await response.json();
  assert.equal(health.recovery.loaded,true);
  assert.equal(health.recovery.round,47);
  assert.equal(health.round,47);
  assert.equal(health.recovery.phase,"LOBBY");
});
test("Cold boot without data reports no recovery",async t=>{
  const {base}=await start(t,memoryStore());
  const health=await (await fetch(base+"/health")).json();
  assert.equal(health.recovery.loaded,false);
  assert.equal(health.recovery.round,null);
});
test("Direct Postgres snapshot readback is admin-only and omits participants",async t=>{
  const saved=createState(1249);
  saved.round=12;saved.mapId="desert";
  saved.active=[{id:"PRIVATE-VIEWER-ID",name:"Private",finishTime:null}];
  const {base}=await start(t,memoryStore(saved));
  const url=base+"/api/admin/storage-check";
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{headers:{"x-admin-key":"wrong"}})).status,401);
  assert.equal((await fetch(url,{method:"POST",headers:{"x-admin-key":secret}})).status,405);
  const resp=await fetch(url,{headers:{"x-admin-key":secret}});
  assert.equal(resp.status,200);
  const body=await resp.json();
  assert.equal(body.readable,true);
  assert.equal(body.validSnapshot,true);
  assert.equal(body.persistedRound,12);
  assert.equal(body.recoveredRound,12);
  assert.equal(body.currentRound,12);
  assert.ok(!JSON.stringify(body).includes("PRIVATE-VIEWER-ID"));
  assert.ok(!JSON.stringify(body).includes(secret));
});
test("Storage readback recognizes memory-only demo without fake DB claims",async t=>{
  const {base}=await start(t,{enabled:false,load:async()=>null,close:async()=>{}});
  const resp=await fetch(base+"/api/admin/storage-check",{headers:{"x-admin-key":secret}});
  assert.equal(resp.status,200);
  const body=await resp.json();
  assert.equal(body.storage,"memory");
  assert.equal(body.readable,false);
});
test("Readback does not expose database errors to clients",async t=>{
  let count=0;
  const storage={enabled:true,
    async load(){return count++===0?createState():Promise.reject(new Error("database secret error"));},
    async save(){},async close(){}
  };
  const {base}=await start(t,storage);
  const resp=await fetch(base+"/api/admin/storage-check",{headers:{"x-admin-key":secret}});
  assert.equal(resp.status,503);
  const body=await resp.json();
  assert.equal(body.ok,false);
  assert.ok(!JSON.stringify(body).includes("secret"));
});
