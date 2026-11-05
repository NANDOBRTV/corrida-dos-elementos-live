import test from "node:test";
import assert from "node:assert/strict";
import {TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,LEGACY_TRACK_LENGTH,LONG_RACE_TIMEOUT,obstaclesFor,BIOME_ORDER} from "../src/config.js";
import {createState,register,advance,tick,migrateSavedState,validateSavedState,raceLength,rank,phaseDuration} from "../src/engine.js";
import {appearanceForRunner} from "../src/cosmetics.js";
import {createApp} from "../server/index.js";

test("Gelo and Floresta run 5km with NO automatic hazards, including restored old distances",()=>{
  assert.equal(TRACK_LENGTH,5000);
  for(const id of BIOME_ORDER)
    for(const length of [TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,600,LEGACY_TRACK_LENGTH])
      assert.deepEqual(obstaclesFor(id,length),[],"No procedural hazards without gifts");
});
test("New races finish at 5km; vehicle appearance does not affect speed or ranking",()=>{
  const state=createState(42);
  register(state,"stable-kart","Ana","entrar");
  register(state,"stable-moto","Bia","entrar");
  const first=state.active.map(r=>({id:r.id,baseSpeed:r.baseSpeed}));
  assert.equal(state.trackLength,5000);
  advance(state);advance(state);
  assert.equal(phaseDuration(state),LONG_RACE_TIMEOUT);
  for(const runner of state.active)runner.progress=TRACK_LENGTH-8;
  let frames=0;
  while(state.phase==="RUNNING"&&frames++<120)tick(state,100);
  assert.equal(state.phase,"RESULTS");
  assert.equal(rank(state.active)[0].progress,5000);
  assert.equal(state.results.length,2);
  for(const before of first){
    const after=state.active.find(r=>r.id===before.id);
    assert.equal(after.baseSpeed,before.baseSpeed);
  }
  assert.equal(state.history.length,1);
});
test("A saved 150m race finishes at 150m, then next round starts at 5000m",()=>{
  const old=createState(9);
  old.round=471;
  register(old,"vintage","Corredor Antigo","entrar");
  advance(old);advance(old);
  old.active[0].progress=148;
  old.active[0].passed=Array.from({length:12},(_,i)=>i);
  delete old.trackLength;
  const restored=migrateSavedState(old);
  assert.equal(restored.trackLength,150);
  assert.equal(raceLength(restored),150);
  assert.equal(validateSavedState(restored),true);
  assert.equal(restored.active[0].progress,148);
  for(let i=0;i<80&&restored.phase==="RUNNING";i++)tick(restored,100);
  assert.equal(restored.phase,"RESULTS");
  assert.equal(restored.active[0].progress,150);
  assert.equal(restored.results[0].finished,true);
  advance(restored);
  assert.equal(restored.round,472);
  assert.equal(restored.trackLength,5000);
  assert.equal(raceLength(restored),5000);
  assert.equal(restored.history[0].round,471);
});
test("An old PostgreSQL snapshot is recovered with its original distance without erasing entrants",async()=>{
  let saved=createState(8);saved.round=200;saved.mapId="forest";
  register(saved,"old-1","Jogador","entrar");
  advance(saved);advance(saved);
  saved.active[0].progress=42;
  delete saved.trackLength;
  const storage={enabled:true,async load(){return structuredClone(saved);},
    async save(next){saved=structuredClone(next);},async close(){}};
  const app=await createApp({adminKey:"test-only",storage,seedDemo:false,disableTikTok:true});
  try{
    const address=await app.listen(0);
    const data=await (await fetch("http://127.0.0.1:"+address.port+"/api/state")).json();
    assert.equal(data.state.trackLength,150);
    assert.equal(data.state.round,200);
    assert.equal(data.state.active[0].id,"old-1");
    assert.ok(data.state.active[0].progress>=42&&data.state.active[0].progress<150,
      "Recovered runner must not reset or finish prematurely; the live server may advance it after load");
    await app.flush();
    assert.equal(saved.trackLength,150);
    assert.equal(saved.active[0].id,"old-1");
    assert.equal(data.liveEventsMode,"staged");
  }finally{await app.close();}
});
test("Kart and motorcycle appearances are stable visual-only choices",()=>{
  const a=appearanceForRunner("runner-11");
  const b=appearanceForRunner("runner-1");
  assert.equal(a.vehicle,"kart");
  assert.equal(b.vehicle,"moto");
  assert.deepEqual(appearanceForRunner("runner-11"),a);
  assert.equal(a.variant>=0&&a.variant<5,true);
  const sample=Array.from({length:50},(_,i)=>appearanceForRunner("runner-"+i).vehicle);
  assert.ok(sample.includes("foot"));
  assert.ok(sample.includes("kart"));
  assert.ok(sample.includes("moto"));
});

test("A persisted 300m round stays 300m after a 5km rollout",()=>{
  const old=createState(7);old.round=999;old.trackLength=300;
  register(old,"previous","Jogador do 300m","entrar");
  advance(old);advance(old);old.active[0].progress=293;
  const restored=migrateSavedState(old);
  assert.equal(restored.trackLength,300);
  assert.equal(phaseDuration(restored),85000);
  assert.equal(validateSavedState(restored),true);
  for(let i=0;i<100&&restored.phase==="RUNNING";i++)tick(restored,100);
  assert.equal(restored.phase,"RESULTS");
  assert.equal(restored.active[0].progress,300);
  advance(restored);
  assert.equal(restored.trackLength,5000);
});
test("The 5km race does not end after the former 85-second running limit",()=>{
  const state=createState(77);
  register(state,"distance-1","Corredor de longa distância","entrar");
  advance(state);advance(state);
  for(let i=0;i<360;i++)tick(state,250); // 90 seconds
  assert.equal(state.phase,"RUNNING");
  assert.equal(state.trackLength,5000);
  assert.ok(state.active[0].progress>0&&state.active[0].progress<5000);
  assert.ok(phaseDuration(state)>=15*60*1000);
});
