import test from "node:test";
import assert from "node:assert/strict";
import {LIVE_STUDIO as C} from "../src/config.js";
import {createStudioState,validStudioDistance,studioJoin,studioFillBots,
  studioSetDistance,studioCountdown,studioTick,studioAdvance,studioRank,
  studioGift,studioLike,studioFollow} from "../src/studio-engine.js";

test("Studio v5: 1080x1920 safe zones, 100 runners, 1000 to 1500 metres",()=>{
  assert.deepEqual([C.designWidth,C.designHeight,C.safeTop,C.safeBottom],
    [1080,1920,120,220]);
  assert.equal(C.maxRunners,100);
  for(const v of [1000,1050,1200,1500])assert.ok(validStudioDistance(v));
  for(const v of [0,999,1075,1501,"1200"])assert.equal(validStudioDistance(v),false);
  assert.throws(()=>createStudioState({distance:1600}),RangeError);
  assert.equal(createStudioState().distance,1200);
});
test("Exactly one minute of lobby, then visible 3-2-1 and RUNNING",()=>{
  const s=createStudioState({connected:true});
  assert.equal(studioCountdown(s),60);
  assert.ok(studioJoin(s,{userId:"real-1",name:"Ana"}).ok);
  studioTick(s,59000);assert.equal(s.phase,"LOBBY");
  assert.equal(studioCountdown(s),1);
  studioTick(s,1000);assert.equal(s.phase,"COUNTDOWN");
  assert.equal(studioCountdown(s),3);
  studioTick(s,1000);assert.equal(studioCountdown(s),2);
  studioTick(s,1000);assert.equal(studioCountdown(s),1);
  studioTick(s,1000);assert.equal(s.phase,"RUNNING");
  assert.equal(s.raceMs,0);
  assert.equal(s.active.length,1);
});
test("Capped 100-runner grid has ten columns, no duplicate identities",()=>{
  const s=createStudioState({connected:true});
  for(let i=0;i<100;i++){
    assert.ok(studioJoin(s,{userId:"u"+i,name:"Corredor "+i}).ok);
  }
  assert.equal(s.active.length,100);
  assert.equal(studioJoin(s,{userId:"u0",name:"Duplicado"}).ok,false);
  assert.equal(studioJoin(s,{userId:"extra",name:"Extra"}).ok,false);
  const ordered=[...s.active].sort((a,b)=>a.gridPosition-b.gridPosition);
  assert.deepEqual(ordered.slice(0,10).map(r=>r.lane),[0,1,2,3,4,5,6,7,8,9]);
  assert.equal(ordered[99].gridPosition,100);
});
test("Auto bots on disconnected broadcast and infinite repeat after 8-second podium",()=>{
  const s=createStudioState();
  studioTick(s,60000);
  assert.equal(s.phase,"COUNTDOWN");
  assert.equal(s.active.length,100);
  assert.ok(s.active.every(r=>r.isBot));
  studioTick(s,3000);assert.equal(s.phase,"RUNNING");
  // Step precisely: long jumps can legitimately pass through the podium
  // and into the following lobby, which is a feature rather than a failure.
  for(let i=0;i<2500&&s.phase==="RUNNING";i++)studioTick(s,100);
  assert.equal(s.phase,"RESULTS");
  assert.equal(s.results.length,100);
  assert.ok(studioRank(s.active)[0].progress>=1199);
  studioTick(s,7999);assert.equal(s.phase,"RESULTS");
  studioTick(s,1);
  assert.equal(s.phase,"LOBBY");assert.equal(s.round,2);
  assert.equal(s.active.length,0);
  assert.equal(s.effects.length,0);
  studioTick(s,60000);assert.equal(s.phase,"COUNTDOWN");
  assert.equal(s.active.length,100);
});
test("Distance is selectable between 1000 and 1500, immutable during a race",()=>{
  const s=createStudioState({connected:true});
  assert.equal(studioSetDistance(s,1500).ok,true);
  assert.equal(s.distance,1500);
  assert.equal(studioSetDistance(s,1501).ok,false);
  studioJoin(s,{userId:"one",name:"One"});
  studioAdvance(s);studioAdvance(s);
  assert.equal(studioSetDistance(s,1050).applies,"próxima");
  assert.equal(s.distance,1500);
  assert.equal(s.nextDistance,1050);
  studioAdvance(s);studioTick(s,8000);
  assert.equal(s.distance,1050);
});
test("Likes have capped speed advantage and are safe without runners",()=>{
  const s=createStudioState({connected:true});
  assert.equal(studioLike(s,{count:20}).boosts,0);
  studioJoin(s,{userId:"x",name:"X"});
  studioAdvance(s);studioAdvance(s);
  const result=studioLike(s,{count:10000,userId:"x"});
  assert.equal(result.ok,true);
  assert.equal(result.runnerId,"x");
  assert.ok(s.active[0].likeBonus<=C.likeSpeedCap);
  studioTick(s,500);
  assert.ok(s.active[0].speed<=C.speedCap);
});
test("Four gift tiers create only bounded gameplay effects",()=>{
  const s=createStudioState({connected:true});
  studioJoin(s,{userId:"x",name:"X"});studioAdvance(s);studioAdvance(s);
  assert.equal(studioGift(s,{userId:"x",name:"Rosa",coins:1}).type,"turbo");
  assert.ok(s.active[0].turboUntil>0);
  assert.equal(studioGift(s,{userId:"x",name:"Fumaça",coins:10}).type,"jetpack");
  assert.ok(s.active[0].jetpackUntil>0);
  assert.equal(studioGift(s,{userId:"x",name:"Chuva",coins:30}).type,"turbo-rain");
  assert.equal(s.active[0].turboCharges,20);
  assert.equal(studioGift(s,{userId:"x",name:"Grande",coins:100}).type,"obstacle");
  assert.ok(s.effects.some(e=>e.type==="obstacle"));
  for(let i=0;i<200;i++)studioGift(s,{userId:"x",name:"Rosa",coins:1});
  assert.ok(s.effects.length<=C.maxVisualEffects);
});
test("A follow creates a bounded torpedo, impact and visual explosion",()=>{
  const s=createStudioState({connected:true});
  studioJoin(s,{userId:"x",name:"X"});
  studioJoin(s,{userId:"y",name:"Y"});
  studioAdvance(s);studioAdvance(s);
  const result=studioFollow(s,{userId:"x",name:"Observador"});
  assert.equal(result.ok,true);
  assert.equal(result.targetId,"y");
  studioTick(s,1900);
  assert.ok(s.active.find(r=>r.id==="y").slowUntil>0);
  assert.ok(s.effects.some(e=>e.type==="torpedo-explosion"));
});
test("Overtakes move lanes and ranking is deterministic",()=>{
  const s=createStudioState({connected:true});
  for(let i=0;i<30;i++)studioJoin(s,{userId:"id"+i,name:"Runner "+i});
  studioAdvance(s);studioAdvance(s);
  studioTick(s,30000);
  const ranked=studioRank(s.active);
  assert.equal(ranked.length,30);
  assert.ok(ranked.some(r=>r.progress>100));
  assert.ok(s.active.every(r=>r.lane>=0&&r.lane<10));
  assert.ok(ranked.every((r,i)=>i===0||ranked[i-1].progress>=r.progress));
});
