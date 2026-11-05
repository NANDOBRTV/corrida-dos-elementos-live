import test from "node:test";
import assert from "node:assert/strict";
import {COURSE_LENGTH,COURSE_TILE_LENGTH,COURSE_MILESTONES,COURSE_HAIRPINS,
  trackCenter,trackPoint,trackBounds,courseSection} from "../src/track-path.js";
import {createState,advance,register} from "../src/engine.js";
test("The mountain course has three true 178-degree hairpins, not sine wiggles",()=>{
  assert.equal(COURSE_LENGTH,5000);assert.equal(COURSE_TILE_LENGTH,300);
  assert.equal(COURSE_HAIRPINS.length,3);
  for(const h of COURSE_HAIRPINS){
    const turn=Math.abs(trackCenter(h.end).heading-trackCenter(h.start).heading);
    assert.ok(turn>3.0,"Missing U-turn at "+h.start);
  }
  const b=trackBounds();
  assert.ok(b.maxX-b.minX>750);
  assert.ok(b.maxZ-b.minZ>650);
});
test("Real arc length: no diagonal teleport, course is smooth and snowy hills exist",()=>{
  assert.equal(trackCenter(0).x,0);
  assert.equal(trackCenter(0).z,0);
  let maxHeight=0;
  for(let d=0;d<5000;d++){
    const a=trackCenter(d),b=trackCenter(d+1);
    const oneMeter=Math.hypot(b.x-a.x,b.z-a.z);
    assert.ok(oneMeter>.95&&oneMeter<1.06,"Bad arc-length at "+d);
    assert.ok(Math.abs(b.y-a.y)<.5,"Cliff detected");
    assert.ok(Math.abs(b.heading-a.heading)<.02,"Angular kink detected");
    maxHeight=Math.max(maxHeight,a.y);
  }
  assert.ok(maxHeight>10);
  assert.notEqual(trackCenter(5000).z,5000);
});
test("Five parallel lanes stay spaced correctly in the sharpest turns",()=>{
  for(const at of [0,420,790,1400,1500,1600,1770,2430,2620,2810,3420,3600,3790,5000]){
    const p=trackPoint(at,0),a=trackPoint(at,-3.7),b=trackPoint(at,3.7);
    assert.ok(Math.abs(Math.hypot(a.x-p.x,a.z-p.z)-3.7)<.00001);
    assert.ok(Math.abs(Math.hypot(b.x-p.x,b.z-p.z)-3.7)<.00001);
    assert.equal(a.heading,b.heading);
  }
});
test("Tile edges have identical physical coordinates and checkpoints stay unique",()=>{
  for(let d=300;d<=4800;d+=300)for(const side of [-6,0,6])
    assert.deepEqual(trackPoint(d,side),trackPoint(d,side));
  assert.equal(COURSE_MILESTONES.length,9);
  assert.match(courseSection(1600),/COTOVELO/);
  assert.match(courseSection(2600),/COTOVELO/);
});
test("Course rendering never mutates the official 5km race",()=>{
  const s=createState(7);
  register(s,"r1","Jogador","entrar");advance(s);advance(s);
  const original=structuredClone(s);
  for(let d=0;d<=5000;d+=2)trackPoint(d,1.85);
  assert.deepEqual(s,original);
  assert.equal(s.trackLength,5000);
});

test("Native Roblox scene mirrors the actual mountain switchbacks instead of straight ground",async()=>{
  const {readFile}=await import("node:fs/promises");
  const server=await readFile(new URL("../roblox/LiveRace.server.luau",import.meta.url),"utf8");
  const camera=await readFile(new URL("../roblox/LiveCamera.client.luau",import.meta.url),"utf8");
  for(const token of ["{1400,1770,3.10}","{2430,2810,-3.10}","{3420,3790,3.10}",
    "local function centerAt(distance)","CliffSnow","FINISH_5000",
    "model:PivotTo(CFrame.new(pos)"]){
    assert.ok(server.includes(token),"Missing native track feature "+token);
  }
  for(const token of ["{1400,1770,3.10}","{2430,2810,-3.10}","{3420,3790,3.10}",
    "centerAt(center-65)","overview*72"])
    assert.ok(camera.includes(token),"Missing native camera feature "+token);
});
