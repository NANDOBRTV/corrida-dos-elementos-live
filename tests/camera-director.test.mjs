import test from "node:test";
import assert from "node:assert/strict";
import {createCameraDirector,chooseCloseup,eligibleForCloseup,
  CLOSEUP_EVERY_MS,CLOSEUP_DURATION_MS} from "../src/camera-director.js";
import {createState,register,advance} from "../src/engine.js";
function race(){
  const state=createState(9921);
  for(let i=0;i<30;i++)register(state,"runner-"+i,"Corredor "+i,"entrar");
  advance(state);advance(state);
  state.active.forEach((r,i)=>{r.progress=100+(i%10)*.6;});
  return state;
}
test("A new camera close begins at 10s, lasts 3.2s and repeats every 10s",()=>{
  const s=race(),director=createCameraDirector();
  assert.equal(CLOSEUP_EVERY_MS,10000);
  assert.equal(CLOSEUP_DURATION_MS,3200);
  for(const ms of [0,1000,9900]){s.raceMs=ms;assert.equal(director.update(s),null);}
  s.raceMs=10000;const first=director.update(s);
  assert.ok(first);assert.equal(first.slot,1);assert.equal(first.blend,0);
  s.raceMs=10800;assert.ok(director.update(s).blend>.99);
  s.raceMs=12600;assert.ok(director.update(s).blend>0);
  s.raceMs=13200;assert.equal(director.update(s),null);
  s.raceMs=19999;assert.equal(director.update(s),null);
  s.raceMs=20800;const second=director.update(s);
  assert.equal(second.slot,2);assert.notEqual(second.id,first.id);
  s.raceMs=30100;assert.equal(director.update(s).slot,3);
});
test("Random-looking deterministic selection uses running near-pack avatars only",()=>{
  const s=race();
  const selection=chooseCloseup(s,4);
  assert.ok(selection);
  assert.equal(chooseCloseup(s,4).id,selection.id);
  const nearby=eligibleForCloseup(s);
  assert.equal(nearby.length,30);
  s.active[0].progress=4900;s.active[1].status="finished";
  const changed=eligibleForCloseup(s);
  assert.equal(changed.length,28);
  assert.ok(!changed.some(r=>r.id===s.active[0].id||r.id===s.active[1].id));
  const a=new Set(Array.from({length:30},(_,i)=>chooseCloseup(s,i+1).id));
  assert.ok(a.size>7,"The camera should not always feature the same runner");
});
test("Closeups do not mutate the authoritative race and stop during results or lobby",()=>{
  const s=race(),original=structuredClone(s);
  const d=createCameraDirector();
  s.raceMs=10040;const before=structuredClone(s);
  assert.ok(d.update(s));assert.deepEqual(s,before);
  s.phase="RESULTS";assert.equal(d.update(s),null);
  s.phase="RUNNING";s.raceMs=11000;assert.ok(d.update(s));
  assert.deepEqual(original.active,s.active);
  s.active=[];assert.equal(d.update(s),null);
  s.phase="LOBBY";assert.equal(d.update(s),null);
});
test("Disconnected/stale or missing runner does not crash the camera director",()=>{
  const s=race(),d=createCameraDirector();
  s.raceMs=11000;const first=d.update(s);assert.ok(first);
  s.active=s.active.filter(r=>r.id!==first.id);
  assert.equal(d.update(s),null);
  s.raceMs=20000;assert.ok(d.update(s));
  s.round++;s.phase="LOBBY";assert.equal(d.update(s),null);
});
