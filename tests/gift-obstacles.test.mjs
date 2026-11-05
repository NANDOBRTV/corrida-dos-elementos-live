import test from "node:test";
import assert from "node:assert/strict";
import {createState,register,advance,tick,nextRound} from "../src/engine.js";
import {applyGiftEvent,createGiftDeduplicator} from "../src/gifts.js";
import {activeGiftObstacles,MAX_ACTIVE_GIFT_OBSTACLES,MAX_GIFT_OBSTACLES_PER_ROUND,
  GIFT_OBSTACLE_LIFETIME_MS} from "../src/gift-obstacles.js";
import {createApp} from "../server/index.js";
const gift=(id,simulated=false)=>({userId:id,displayName:"Espectador",giftName:"Rosa",giftId:"rose",repeatCount:1,simulated});
function running(){
  const s=createState(16);
  for(let i=0;i<10;i++)register(s,"runner-"+i,"Corredor "+i,"entrar");
  advance(s);advance(s);
  return s;
}
test("Zero gifts means zero obstacles, including after > 2000m of a live race",()=>{
  const s=running();
  assert.deepEqual(activeGiftObstacles(s),[]);
  assert.deepEqual(s.giftObstacles,[]);
  for(const r of s.active)r.progress=200;
  for(let i=0;i<40;i++)tick(s,50);
  assert.deepEqual(activeGiftObstacles(s),[]);
  assert.ok(s.active.every(r=>r.slowUntil===0&&r.passed.length===0));
});
test("Each final gift event may spawn exactly one short-lived obstacle, even for a viewer outside the race",()=>{
  const s=running();
  const result=applyGiftEvent(s,gift("viewer-not-registered"));
  assert.equal(result.ok,true);
  assert.equal(result.entry.obstacleSpawned,true);
  assert.equal(s.active.length,10);
  assert.equal(s.giftObstacles.length,1);
  assert.equal(s.giftObstacles[0].lane,0);
  assert.equal(s.giftObstacles[0].z,16);
  assert.equal(s.giftObstacles[0].expiresAt,GIFT_OBSTACLE_LIFETIME_MS);
  assert.equal(result.effect,"agradecimento");
});
test("Gift obstacle collision is deterministic and affects ONLY a matching lane",()=>{
  const s=running();
  applyGiftEvent(s,gift("viewer-outside"));
  const h=s.giftObstacles[0];
  for(const r of s.active){r.progress=15.90;r.lane=1;}
  s.active[0].lane=h.lane;
  tick(s,50);
  assert.equal(s.active[0].passed.includes(h.id),true);
  assert.ok(s.active[0].lane!==h.lane||s.active[0].slowUntil>0);
  assert.ok(s.active.slice(1).every(r=>!r.passed.includes(h.id)));
});
test("Obstacles expire and reset between races; lobby gifts produce none",()=>{
  const s=createState(7);
  register(s,"r0","Runner","entrar");
  assert.equal(applyGiftEvent(s,gift("viewer")).entry.obstacleSpawned,false);
  advance(s);advance(s);
  assert.equal(applyGiftEvent(s,gift("viewer")).entry.obstacleSpawned,true);
  s.raceMs+=GIFT_OBSTACLE_LIFETIME_MS+1;
  assert.deepEqual(activeGiftObstacles(s),[]);
  advance(s);nextRound(s);
  assert.deepEqual(s.giftObstacles,[]);
  assert.equal(s.giftObstacleSequence,0);
});
test("Only a bounded number of gifts create simultaneous obstacles; quantity does not buy more",()=>{
  const s=running();
  const first=applyGiftEvent(s,{...gift("viewer0"),repeatCount:900});
  assert.equal(first.entry.obstacleSpawned,true);
  assert.equal(s.giftObstacles.length,1);
  for(let i=1;i<100;i++)applyGiftEvent(s,gift("viewer"+i));
  assert.equal(s.giftObstacles.length,MAX_ACTIVE_GIFT_OBSTACLES);
  assert.ok(s.giftObstacleSequence<=MAX_GIFT_OBSTACLES_PER_ROUND);
});
test("Simulated and real gifts are distinguished, and the event deduplicator gates retries",()=>{
  const s=running(),guard=createGiftDeduplicator();
  const payload={...gift("userA",true),eventId:"same",giftId:"rose"};
  assert.equal(guard.accept(payload,100),true);
  applyGiftEvent(s,payload);
  assert.equal(guard.accept(payload,110),false);
  assert.equal(s.giftObstacles.length,1);
  assert.equal(s.giftObstacles[0].simulated,true);
  assert.equal(applyGiftEvent(s,gift("userB")).obstacle.simulated,false);
});
test("Admin gift-test is authenticated and creates one test-only obstacle",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({adminKey:"gift-secret",storage,disableTikTok:true,seedDemo:false});
  const addr=await app.listen(0);t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  const unauth=await fetch(base+"/api/admin/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"gift-test"})});
  assert.equal(unauth.status,401);
  const join=await fetch(base+"/api/admin/join",{method:"POST",headers:{"x-admin-key":"gift-secret","content-type":"application/json"},
    body:JSON.stringify({userId:"runner",displayName:"Runner",content:"entrar"})});
  assert.equal(join.status,200);
  for(let i=0;i<2;i++)await fetch(base+"/api/admin/action",{method:"POST",headers:{"x-admin-key":"gift-secret","content-type":"application/json"},
    body:JSON.stringify({action:"advance"})});
  const sent=await fetch(base+"/api/admin/action",{method:"POST",headers:{"x-admin-key":"gift-secret","content-type":"application/json"},
    body:JSON.stringify({action:"gift-test",userId:"runner"})});
  const data=await sent.json();
  assert.equal(data.ok,true);
  assert.equal(data.simulated,true);
  assert.equal(data.obstacle.simulated,true);
  assert.equal(data.state.giftObstacles.length,1);
});
