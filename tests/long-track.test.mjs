import test from "node:test";
import assert from "node:assert/strict";
import {TRACK_LENGTH,PREVIOUS_LONG_TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,LEGACY_TRACK_LENGTH,
  LONG_RACE_TIMEOUT,obstaclesFor,BIOME_ORDER} from "../src/config.js";
import {createState,register,advance,tick,migrateSavedState,validateSavedState,
  raceLength,rank,phaseDuration,configureNextLaps} from "../src/engine.js";
import {appearanceForRunner} from "../src/cosmetics.js";
import {applyGiftEvent,GIFT_VEHICLE_MS} from "../src/gifts.js";
import {createApp} from "../server/index.js";

test("400m W course has no automatic obstacles in either biome",()=>{
  assert.equal(TRACK_LENGTH,400);
  for(const id of BIOME_ORDER)for(const n of [400,800,5000,300,150])
    assert.deepEqual(obstaclesFor(id,n),[]);
});
test("One-lap default race finishes at 400m and preserves official ranking",()=>{
  const s=createState(42);
  register(s,"one","Ana","entrar");register(s,"two","Bia","entrar");
  const speeds=s.active.map(r=>r.baseSpeed);
  advance(s);advance(s);
  assert.equal(s.trackLength,400);assert.equal(s.laps,1);
  assert.ok(phaseDuration(s)>=85000);
  for(const r of s.active)r.progress=392;
  for(let i=0;i<120&&s.phase==="RUNNING";i++)tick(s,100);
  assert.equal(s.phase,"RESULTS");
  assert.equal(rank(s.active)[0].progress,400);
  assert.deepEqual(s.active.map(r=>r.baseSpeed),speeds);
});
test("Operator chooses next race laps without changing a race already in progress",()=>{
  const s=createState(1);
  register(s,"runner","Runner","entrar");advance(s);advance(s);
  assert.equal(configureNextLaps(s,3).ok,true);
  assert.equal(s.trackLength,400);
  assert.equal(s.nextLaps,3);
  register(s,"future","Future","entrar");
  advance(s);advance(s);
  assert.equal(s.trackLength,1200);assert.equal(s.laps,3);
  assert.equal(s.active[0].id,"future");
  assert.equal(s.nextLaps,1);
  assert.ok(phaseDuration(s)>=85000||s.phase==="LOBBY");
});
test("Lobby choice applies to the imminent race; invalid laps are rejected",()=>{
  const s=createState(2);
  assert.equal(configureNextLaps(s,10).ok,true);
  assert.equal(s.trackLength,4000);
  assert.equal(s.laps,10);
  for(const bad of [0,11,-1,1.5,"zero",null,{},NaN])
    assert.equal(configureNextLaps(s,bad).ok,false);
  assert.equal(validateSavedState(s),true);
});
test("Saved 150m and 300m old rounds keep their finish; the following round is 400m",()=>{
  for(const distance of [LEGACY_TRACK_LENGTH,PREVIOUS_TRACK_LENGTH]){
    const old=createState(9);
    old.round=471;old.trackLength=distance;
    register(old,"vintage","Old","entrar");advance(old);advance(old);
    old.active[0].progress=distance-2;
    if(distance===150)delete old.trackLength;
    const restored=migrateSavedState(old);
    assert.equal(raceLength(restored),distance);
    assert.equal(validateSavedState(restored),true);
    for(let i=0;i<50&&restored.phase==="RUNNING";i++)tick(restored,100);
    assert.equal(restored.phase,"RESULTS");
    advance(restored);
    assert.equal(restored.trackLength,400);
    assert.equal(restored.history[0].round,471);
  }
});
test("A saved 5km race is resumed at original 5km, never reset",()=>{
  const saved=createState(3);saved.trackLength=5000;saved.round=47;
  register(saved,"old","Old","entrar");advance(saved);advance(saved);
  saved.active[0].progress=2300;
  const recovered=migrateSavedState(saved);
  assert.equal(raceLength(recovered),PREVIOUS_LONG_TRACK_LENGTH);
  assert.equal(validateSavedState(recovered),true);
  assert.equal(recovered.active[0].progress,2300);
  assert.equal(phaseDuration(recovered),LONG_RACE_TIMEOUT);
  advance(recovered);advance(recovered);
  assert.equal(recovered.trackLength,400);
});
test("A persisted legacy snapshot restores without deleting entrants",async()=>{
  let saved=createState(8);saved.round=200;saved.mapId="forest";
  register(saved,"old-1","Old","entrar");advance(saved);advance(saved);
  saved.active[0].progress=42;delete saved.trackLength;
  const storage={enabled:true,async load(){return structuredClone(saved);},
    async save(next){saved=structuredClone(next);},async close(){}};
  const app=await createApp({adminKey:"test-only",storage,seedDemo:false,disableTikTok:true});
  try{
    const addr=await app.listen(0);
    const data=await (await fetch("http://127.0.0.1:"+addr.port+"/api/state")).json();
    assert.equal(data.state.trackLength,150);
    assert.equal(data.state.round,200);
    assert.equal(data.state.active[0].id,"old-1");
    assert.ok(data.state.active[0].progress>=42&&data.state.active[0].progress<150);
  }finally{await app.close();}
});
test("Cars and motorcycles never appear without presents; gifts never change baseSpeed",()=>{
  for(let i=0;i<50;i++)assert.ok(!["kart","moto"].includes(appearanceForRunner("runner-"+i).vehicle));
  const s=createState(12);register(s,"first","First","entrar");advance(s);advance(s);
  const prior=s.active[0].baseSpeed;
  const result=applyGiftEvent(s,{userId:"first",displayName:"First",
    giftId:"motorcycle",giftName:"Moto",repeatCount:1,simulated:true});
  assert.equal(result.vehicle.kind,"moto");
  assert.equal(s.active[0].vehicleKind,"moto");
  assert.equal(s.active[0].vehicleUntil-s.raceMs,GIFT_VEHICLE_MS);
  assert.equal(s.active[0].baseSpeed,prior);
});
test("Protected operator can configure the next race laps",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({adminKey:"test-only",storage,seedDemo:false,disableTikTok:true});
  const addr=await app.listen(0);t.after(()=>app.close());
  const url="http://127.0.0.1:"+addr.port+"/api/admin/action";
  const post=(laps,key)=>fetch(url,{method:"POST",headers:{"content-type":"application/json",...(key?{"x-admin-key":key}:{})},
    body:JSON.stringify({action:"set-next-laps",laps})});
  assert.equal((await post(4,null)).status,401);
  assert.equal((await post(50,"test-only")).status,400);
  const ok=await (await post(4,"test-only")).json();
  assert.equal(ok.ok,true);assert.equal(ok.state.trackLength,1600);
  assert.equal(ok.state.laps,4);
});

test("A 5km lobby upgrades to 400m without losing participants, but an active 5km race is preserved",()=>{
  const saved=createState(55);
  saved.trackLength=5000;saved.round=12;
  register(saved,"ready","Pronto","entrar");
  const migrated=migrateSavedState(saved);
  assert.equal(migrated.trackLength,400);
  assert.equal(migrated.active.length,1);
  assert.equal(migrated.active[0].id,"ready");
  assert.equal(migrated.laps,1);
  const running=structuredClone(saved);
  running.phase="RUNNING";running.active[0].progress=2800;
  const untouched=migrateSavedState(running);
  assert.equal(untouched.trackLength,5000);
  assert.equal(untouched.active[0].progress,2800);
});

test("Registration window stays open for 60 seconds, plus five-second start countdown",()=>{
  const s=createState(56);
  register(s,"first","First","entrar");
  for(let i=0;i<59;i++)tick(s,1000);
  assert.equal(s.phase,"LOBBY");assert.equal(s.phaseMs,59000);
  register(s,"late","Late","entrar");
  tick(s,1000);
  assert.equal(s.phase,"COUNTDOWN");assert.equal(s.active.length,2);
  tick(s,4000);assert.equal(s.phase,"COUNTDOWN");
  tick(s,1000);assert.equal(s.phase,"RUNNING");
  assert.equal(s.raceMs,0);
  assert.equal(register(s,"after","After","entrar").queue,"próxima");
});
test("Authenticated operator can request a manual camera close shared in public state",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const app=await createApp({adminKey:"manual-camera-test",storage,seedDemo:false,disableTikTok:true});
  const addr=await app.listen(0);t.after(()=>app.close());
  const base="http://127.0.0.1:"+addr.port;
  const post=(action,userId,key="manual-camera-test")=>fetch(base+"/api/admin/action",{
    method:"POST",headers:{"content-type":"application/json",...(key?{"x-admin-key":key}:{})},
    body:JSON.stringify({action,userId})});
  assert.equal((await post("camera-focus","one",null)).status,401);
  assert.equal((await post("camera-focus","one")).status,400);
  const join=await fetch(base+"/api/admin/join",{
    method:"POST",headers:{"content-type":"application/json","x-admin-key":"manual-camera-test"},
    body:JSON.stringify({userId:"one",displayName:"Runner",content:"entrar"})});
  assert.equal(join.status,200);
  await post("advance");await post("advance");
  assert.equal((await post("camera-focus","unknown")).status,400);
  const result=await (await post("camera-focus","one")).json();
  assert.equal(result.ok,true);assert.equal(result.name,"Runner");
  const publicState=await (await fetch(base+"/api/state")).json();
  assert.equal(publicState.state.manualCamera.id,"one");
  assert.equal(publicState.state.manualCamera.untilRaceMs-publicState.state.manualCamera.startRaceMs,5000);
});
