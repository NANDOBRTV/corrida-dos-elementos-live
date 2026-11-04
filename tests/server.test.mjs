import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";

async function setup(t){
  const saves=[];
  const storage={enabled:false,load:async()=>null,save:async s=>saves.push(s),close:async()=>{}};
  const app=await createApp({adminKey:"testing-secret",storage,seedDemo:false});
  const addr=await app.listen(0);
  t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  async function get(path){const response=await fetch(base+path);return {status:response.status,body:await response.json()};}
  async function post(path,data,secret="testing-secret"){
    const response=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":secret},body:JSON.stringify(data)});
    return {status:response.status,body:await response.json()};
  }
  return {app,base,get,post,saves};
}
test("health endpoint reports live process and storage",async t=>{
  const {get}=await setup(t);
  const {status,body}=await get("/health");
  assert.equal(status,200);assert.equal(body.ok,true);
  assert.equal(body.service,"corrida-dos-elementos-live");
  assert.equal(body.storage,"memory");
  assert.equal(body.tiktokConnected,false);
});
test("state is public read-only and initially in lobby",async t=>{
  const {get}=await setup(t);
  const {status,body}=await get("/api/state");
  assert.equal(status,200);assert.equal(body.mode,"server");
  assert.equal(body.state.phase,"LOBBY");assert.equal(body.state.round,1);
});
test("administrator actions reject requests without valid token",async t=>{
  const {post}=await setup(t);
  assert.equal((await post("/api/admin/join",{userId:"x",displayName:"X",content:"entrar"},"wrong")).status,401);
  assert.equal((await post("/api/admin/action",{action:"advance"},"wrong")).status,401);
});
test("POST with invalid comment does not register participant",async t=>{
  const {post,get}=await setup(t);
  const r=await post("/api/admin/join",{userId:"u1",displayName:"Ana",content:"quero entrar"});
  assert.equal(r.status,400);
  assert.equal((await get("/api/state")).body.state.active.length,0);
});
test("multiple repeated enrollments remain unique",async t=>{
  const {post,get}=await setup(t);
  const entries=await Promise.all(Array.from({length:5},()=>post("/api/admin/join",{userId:"u1",displayName:"Ana",content:" entrar "})));
  assert.equal(entries.filter(x=>x.body.registered).length,1);
  assert.equal((await get("/api/state")).body.state.active.length,1);
});
test("server assigns countdown and running joins to next race",async t=>{
  const {post,get}=await setup(t);
  await post("/api/admin/join",{userId:"first",displayName:"Ana",content:"entrar"});
  await post("/api/admin/action",{action:"advance"});
  const second=await post("/api/admin/join",{userId:"next",displayName:"Bia",content:"entrar"});
  assert.equal(second.body.result.round,2);
  assert.equal(second.body.state.next.length,1);
  await post("/api/admin/action",{action:"advance"});
  await post("/api/admin/join",{userId:"new",displayName:"Cida",content:"entrar"});
  let state=(await get("/api/state")).body.state;
  assert.equal(state.active.length,1);
  assert.equal(state.next.length,2);
  await post("/api/admin/action",{action:"advance"});
  await post("/api/admin/action",{action:"advance"});
  state=(await get("/api/state")).body.state;
  assert.equal(state.round,2);
  assert.equal(state.mapId,"desert");
  assert.deepEqual(state.active.map(x=>x.id),["next","new"]);
  assert.equal(state.next.length,0);
});
test("static page is served, internal files inaccessible",async t=>{
  const {base}=await setup(t);
  const page=await fetch(base+"/");
  assert.equal(page.status,200);
  assert.match(await page.text(),/CORRIDA DOS/);
  assert.equal((await fetch(base+"/server/index.js")).status,404);
  assert.equal((await fetch(base+"/.github/workflows/verify.yml")).status,404);
  assert.equal((await fetch(base+"/package.json")).status,404);
});
test("server-sent events emit authoritative state",async t=>{
  const {base}=await setup(t);
  const abort=new AbortController();
  try {
    const r=await fetch(base+"/api/stream",{signal:abort.signal});
    assert.equal(r.status,200);
    assert.match(r.headers.get("content-type"),/text\/event-stream/);
    const chunk=await r.body.getReader().read();
    assert.match(Buffer.from(chunk.value).toString(),/event: race/);
  }finally{abort.abort();}
});
