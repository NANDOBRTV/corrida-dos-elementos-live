import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createStudioState,studioJoin,studioAdvance,studioGift,studioFollow,
  studioLike,studioTick} from "../src/studio-engine.js";
import {buildStudioEffectParts,STUDIO_EFFECT_LIMITS} from "../src/studio-effects.js";

function running(count=3){
  const s=createStudioState({connected:true,seed:616});
  for(let i=0;i<count;i++){
    const id="player-"+i;
    assert.equal(studioJoin(s,{userId:id,name:"Jogador "+i}).ok,true);
  }
  studioAdvance(s);studioAdvance(s);
  assert.equal(s.phase,"RUNNING");
  return s;
}
function has(parts,kind){return parts.some(p=>p.kind===kind);}
function quality(parts){
  assert.ok(parts.length<=STUDIO_EFFECT_LIMITS.maxParts);
  for(const p of parts){
    assert.ok(["kind","position","heading","scale","color"].every(k=>k in p));
    assert.ok([p.position.x,p.position.y,p.position.z,p.heading,
      ...p.scale,p.color].every(Number.isFinite));
    assert.ok(p.scale.every(n=>n>0));
  }
}
test("All gift effects are authoritative; lobby and podium have no VFX",()=>{
  const s=createStudioState({connected:true});
  assert.deepEqual(buildStudioEffectParts(s),[]);
  studioJoin(s,{userId:"a",name:"A"});
  studioAdvance(s);studioAdvance(s);
  assert.deepEqual(buildStudioEffectParts({...s,phase:"RESULTS"}),[]);
});
test("Rose starts vivid turbo flames only near the camera; no physical stat changes",()=>{
  const s=running();
  const before=s.active[0].progress;
  assert.equal(studioGift(s,{userId:"player-0",name:"Rosa",coins:1}).type,"turbo");
  const parts=buildStudioEffectParts(s,{centerMeters:0});
  assert.ok(has(parts,"turbo-flame"));
  assert.equal(s.active[0].progress,before);
  assert.ok(parts.some(p=>p.color===0xff642b));
  assert.deepEqual(buildStudioEffectParts(s,{centerMeters:900}),[]);
  quality(parts);
});
test("Jetpack smoke puffs and 30-coin rain are drawn from gift event snapshots",()=>{
  const s=running();
  assert.equal(studioGift(s,{userId:"player-1",name:"Pórtico",coins:10}).type,"jetpack");
  assert.equal(studioGift(s,{userId:"player-1",name:"Chuva",coins:30}).type,"turbo-rain");
  const remote=structuredClone(s);
  // Public snapshots intentionally do not include the live turbo timers.
  remote.active=remote.active.map(r=>({
    id:r.id,lane:r.lane,gridPosition:r.gridPosition,
    progress:r.progress,status:r.status
  }));
  const parts=buildStudioEffectParts(remote);
  assert.ok(has(parts,"jetpack-smoke"));
  assert.ok(has(parts,"turbo-rain"));
  quality(parts);
});
test("Large gifts create visible track obstacles at the correct lane and biomes",()=>{
  const s=running();
  const result=studioGift(s,{userId:"player-0",name:"Grande",coins:100});
  assert.equal(result.type,"obstacle");
  const ice=buildStudioEffectParts(s,{centerMeters:20});
  assert.ok(has(ice,"obstacle"));
  assert.ok(ice.some(p=>p.color===0x7ddaf2));
  s.mapId="forest";
  const forest=buildStudioEffectParts(s,{centerMeters:20});
  assert.ok(forest.some(p=>p.color===0x886040));
  quality(forest);
});
test("Follow torpedo moves toward another runner then triggers one explosion",()=>{
  const s=running();
  const result=studioFollow(s,{userId:"player-0",name:"Seguidor"});
  assert.equal(result.ok,true);
  const first=buildStudioEffectParts(s);
  assert.ok(has(first,"torpedo"));
  studioTick(s,1600);
  const travel=buildStudioEffectParts(s);
  assert.ok(has(travel,"torpedo"));
  assert.notDeepEqual(first.filter(p=>p.kind==="torpedo").map(p=>p.position),
    travel.filter(p=>p.kind==="torpedo").map(p=>p.position));
  studioTick(s,250);
  const explosion=buildStudioEffectParts(s);
  assert.ok(has(explosion,"torpedo-explosion"));
  assert.equal(has(explosion,"torpedo"),false);
  quality(explosion);
});
test("20 likes create a distinct lightweight boost spark effect",()=>{
  const s=running();
  const boosted=studioLike(s,{count:20,userId:"player-0"});
  assert.equal(boosted.ok,true);
  const parts=buildStudioEffectParts(s);
  assert.ok(has(parts,"like-boost"));
  quality(parts);
});
test("Bounded 100-player storm cannot overflow memory, draws or effect parts",()=>{
  const s=running(100);
  for(let i=0;i<300;i++){
    studioGift(s,{userId:"player-"+(i%100),name:"Rosa",coins:1});
    if(i%4===0)studioGift(s,{userId:"player-"+(i%100),name:"Grande",coins:80});
  }
  const parts=buildStudioEffectParts(s,{centerMeters:0,maxParts:999999});
  assert.ok(s.effects.length<=60);
  quality(parts);
  const small=buildStudioEffectParts(s,{maxParts:9});
  assert.equal(small.length,9);
  quality(small);
  const capped=buildStudioEffectParts(s,{maxParts:-100});
  assert.equal(capped.length,0);
});
test("Graphics are deterministic and release after expiry and round transitions",()=>{
  const s=running();
  studioGift(s,{userId:"player-0",name:"Rosa",coins:1});
  const before=buildStudioEffectParts(s);
  assert.deepEqual(before,buildStudioEffectParts(s));
  studioTick(s,5000);
  const next=buildStudioEffectParts(s);
  assert.equal(has(next,"turbo-flame"),false);
  studioAdvance(s);
  assert.equal(s.phase,"RESULTS");
  assert.deepEqual(buildStudioEffectParts(s),[]);
});
test("WebGL uses one bounded instanced batch and foliage off the drivable asphalt",async()=>{
  const src=await readFile(new URL("../src/studio-scene.js",import.meta.url),"utf8");
  assert.ok(src.includes('studio-bounded-gift-effects'));
  assert.ok(src.includes("buildStudioEffectParts(state,"));
  assert.ok(src.includes("effects.count=index;effectParts=index"));
  assert.ok(src.includes('studio-scenery-crystals-and-shrubs'));
  assert.ok(src.includes("const lateral=side*(16.5+"));
  assert.ok(src.includes("decorations.material.dispose();effects.material.dispose()"));
  assert.equal(STUDIO_EFFECT_LIMITS.maxParts<=200,true);
});
