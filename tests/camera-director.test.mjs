import test from "node:test";
import assert from "node:assert/strict";
import {createCameraDirector,chooseCloseup,eligibleForCloseup,
  closeupWaitMs,CLOSEUP_WAIT_MIN_MS,CLOSEUP_WAIT_MAX_MS,
  CLOSEUP_DURATION_MS} from "../src/camera-director.js";
import {createState,register,advance} from "../src/engine.js";

function race(){
  const state=createState(9921);
  for(let i=0;i<30;i++)register(state,"runner-"+i,"Corredor "+i,"entrar");
  advance(state);advance(state);
  state.active.forEach((r,i)=>{r.progress=100+(i%10)*.6;});
  return state;
}
test("Each pause is independently randomized within 0 to 10 seconds",()=>{
  const s=race();
  assert.equal(CLOSEUP_WAIT_MIN_MS,0);
  assert.equal(CLOSEUP_WAIT_MAX_MS,10000);
  assert.equal(CLOSEUP_DURATION_MS,3200);
  const waits=Array.from({length:150},(_,i)=>closeupWaitMs(s,i));
  assert.ok(waits.every(n=>Number.isInteger(n)&&n>=0&&n<=10000));
  assert.ok(new Set(waits).size>110,"Pauses must vary, not stay at 10 seconds");
  assert.ok(waits.some(n=>n<1000));
  assert.ok(waits.some(n=>n>9000));
  assert.deepEqual(waits,Array.from({length:150},(_,i)=>closeupWaitMs(s,i)));
});
test("A random pause follows each complete 3.2 second spotlight, with no overlap",()=>{
  const s=race(),director=createCameraDirector();
  const firstStart=closeupWaitMs(s,0);
  if(firstStart>0){s.raceMs=firstStart-1;assert.equal(director.update(s),null);}
  s.raceMs=firstStart;const first=director.update(s);
  assert.ok(first);assert.equal(first.slot,1);assert.equal(first.blend,0);
  s.raceMs=firstStart+900;assert.ok(director.update(s).blend>.99);
  s.raceMs=firstStart+2600;assert.ok(director.update(s).blend>0);
  const secondStart=firstStart+CLOSEUP_DURATION_MS+closeupWaitMs(s,1);
  if(secondStart>firstStart+CLOSEUP_DURATION_MS){
    s.raceMs=firstStart+CLOSEUP_DURATION_MS;
    assert.equal(director.update(s),null);
    s.raceMs=secondStart-1;assert.equal(director.update(s),null);
  }
  s.raceMs=secondStart;const second=director.update(s);
  assert.ok(second);assert.equal(second.slot,2);
  assert.notEqual(second.id,first.id);
  s.raceMs=secondStart+850;assert.ok(director.update(s).blend>.99);
});
test("Random selection stays in the visible pack and avoids consecutive repeats",()=>{
  const s=race();
  const chosen=chooseCloseup(s,3);
  assert.equal(chooseCloseup(s,3).id,chosen.id);
  assert.equal(eligibleForCloseup(s).length,30);
  s.active[0].progress=4900;s.active[1].status="finished";
  assert.equal(eligibleForCloseup(s).length,28);
  const names=new Set(Array.from({length:30},(_,i)=>chooseCloseup(s,i+1).id));
  assert.ok(names.size>7);
});
test("Camera timing is deterministic after reconnect, and huge timestamp jumps are safe",()=>{
  const s=race();
  const a=createCameraDirector(),b=createCameraDirector();
  for(const ms of [0,1200,3999,10000,25000,57000,151000,638000]){
    s.raceMs=ms;
    assert.deepEqual(a.update(s),b.update(s),"Reconnect must give same shot at "+ms);
  }
  const before=structuredClone(s);
  a.update(s);
  assert.deepEqual(s,before);
});
test("Closeups stop during results/lobby; an absent runner cannot cause a crash",()=>{
  const s=race(),d=createCameraDirector();
  s.raceMs=closeupWaitMs(s,0)+900;
  const selected=d.update(s);
  assert.ok(selected);
  s.active=s.active.filter(r=>r.id!==selected.id);
  assert.equal(d.update(s),null);
  s.phase="RESULTS";assert.equal(d.update(s),null);
  s.phase="RUNNING";s.raceMs=closeupWaitMs(s,0)+900;
  assert.ok(d.update(s));
  s.phase="LOBBY";assert.equal(d.update(s),null);
});
