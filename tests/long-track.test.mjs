import test from "node:test";
import assert from "node:assert/strict";
import {TRACK_LENGTH,LEGACY_TRACK_LENGTH,obstaclesFor,BIOME_ORDER} from "../src/config.js";
import {createState,register,advance,tick,migrateSavedState,validateSavedState,raceLength,rank} from "../src/engine.js";
import {appearanceForRunner} from "../src/cosmetics.js";
import {createApp} from "../server/index.js";

test("Gelo e Floresta now have 300m of real race physics and 24 hazards",()=>{
  assert.equal(TRACK_LENGTH,300);
  for(const id of BIOME_ORDER){
    const hazards=obstaclesFor(id,TRACK_LENGTH);
    assert.equal(hazards.length,24);
    assert.ok(hazards.every(x=>x.z>0&&x.z<TRACK_LENGTH));
    assert.equal(obstaclesFor(id,LEGACY_TRACK_LENGTH).length,12);
  }
});
test("New races finish at 300m; vehicles do not influence speed, lap time or ranking",()=>{
  const state=createState(42);
  register(state,"stable-kart","Ana","entrar");
  register(state,"stable-moto","Bia","entrar");
  const first=state.active.map(r=>({id:r.id,baseSpeed:r.baseSpeed}));
  assert.equal(state.trackLength,300);
  advance(state);advance(state);
  let frames=0;
  while(state.phase==="RUNNING"&&frames++<900)tick(state,100);
  assert.equal(state.phase,"RESULTS");
  assert.equal(rank(state.active)[0].progress,300);
  assert.equal(state.results.length,2);
  for(const before of first){
    const after=state.active.find(r=>r.id===before.id);
    assert.equal(after.baseSpeed,before.baseSpeed);
  }
  assert.equal(state.history.length,1);
});
test("A saved 150m race finishes at its original line, then new round starts at 300m",()=>{
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
  assert.equal(restored.trackLength,300);
  assert.equal(raceLength(restored),300);
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
    assert.equal(data.state.active[0].progress,42);
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
