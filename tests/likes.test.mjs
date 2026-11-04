import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTikTokLike} from "../server/tiktok.js";
import {createLikeBuffer,applyLikeBatch} from "../src/likes.js";
import {createState,register,advance} from "../src/engine.js";
import {createApp} from "../server/index.js";

test("TikTok likes are normalized without storing sender identity",()=>{
  assert.deepEqual(normalizeTikTokLike({count:17,user:{userId:"private"},common:{msgId:"m1"}}),
    {source:"tiktok",count:17,eventId:"m1"});
  assert.equal(normalizeTikTokLike({likeCount:8})?.count,8);
  for(const ev of [null,{}, {count:0},{count:-2},{count:1.2},{count:Infinity},{count:100001}])
    assert.equal(normalizeTikTokLike(ev),null);
});
test("Like packets are deduplicated and batched every two seconds",()=>{
  const b=createLikeBuffer();
  assert.equal(b.accept({count:12,eventId:"a"},100),true);
  assert.equal(b.accept({count:12,eventId:"a"},110),false);
  assert.equal(b.accept({count:5},120),true);
  assert.equal(b.drain(300),null);
  assert.deepEqual(b.drain(2100),{count:17,events:2});
  assert.equal(b.drain(2200),null);
  assert.equal(b.accept({count:2,eventId:"b"},2300),true);
  assert.equal(b.drain(2400),null);
  assert.deepEqual(b.drain(4200),{count:2,events:1});
});
test("Likes never change speed, race order, entrants or track length",()=>{
  const s=createState(10);
  register(s,"r1","Corredor","entrar");advance(s);advance(s);
  const original=structuredClone(s.active);
  assert.deepEqual(applyLikeBatch(s,{count:77,events:3}),{count:77,total:77});
  assert.deepEqual(s.active,original);
  assert.equal(s.next.length,0);assert.equal(s.trackLength,5000);
  assert.ok(!JSON.stringify(s).includes("private"));
});
test("Server exposes aggregated likes in official state, no duplicate processing",async t=>{
  let callbacks;
  const bridgeFactory=opts=>{callbacks=opts;return {enabled:true,status:()=>({enabled:true,connected:true}),close:async()=>{}};};
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({adminKey:"test-only",storage,seedDemo:false,bridgeFactory});
  const addr=await app.listen(0);t.after(()=>app.close());
  const like=normalizeTikTokLike({count:15,common:{msgId:"e1"}});
  callbacks.onLike(like);callbacks.onLike(like);
  await new Promise(resolve=>setTimeout(resolve,120));
  const data=await (await fetch("http://127.0.0.1:"+addr.port+"/api/state")).json();
  assert.equal(data.state.observedLikes,15);
  assert.equal(data.state.active.length,0);
});

test("Admin can simulate likes separately without implying real TikTok likes",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({adminKey:"test-only",storage,seedDemo:false,disableTikTok:true});
  const addr=await app.listen(0);t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  const endpoint=base+"/api/admin/action";
  const unauth=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"like-test"})});
  assert.equal(unauth.status,401);
  const ok=await (await fetch(endpoint,{method:"POST",
    headers:{"content-type":"application/json","x-admin-key":"test-only"},
    body:JSON.stringify({action:"like-test"})})).json();
  assert.equal(ok.simulated,true);
  assert.equal(ok.state.simulatedLikes,10);
  assert.equal(ok.state.observedLikes??0,0);
  assert.match(ok.state.messages[0].text,/\[TESTE\]/);
  const report=await (await fetch(base+"/api/admin/diagnostics",{headers:{"x-admin-key":"test-only"}})).json();
  assert.equal(report.diagnostics.events.simulatedLikes,10);
  assert.equal(report.diagnostics.events.likeCountObserved,0);
});
