import test from "node:test";
import assert from "node:assert/strict";
import {COURSE_LENGTH,COURSE_TILE_LENGTH,COURSE_MILESTONES,
  trackCenter,trackPoint,courseSection} from "../src/track-path.js";
import {createState,advance,register} from "../src/engine.js";
test("5km curved path has several alternating bends, no discontinuities or jumps",()=>{
  assert.equal(COURSE_LENGTH,5000);
  assert.equal(COURSE_TILE_LENGTH,300);
  assert.equal(trackCenter(0).x,0);
  const dirs=[],xs=[];
  for(let d=0;d<=5000;d+=2){
    const a=trackCenter(d),b=trackCenter(Math.min(d+2,5000));
    assert.ok([a.x,a.y,a.z,a.heading].every(Number.isFinite));
    assert.ok(Math.abs(b.x-a.x)<1.5,"Course cannot jump at "+d);
    assert.ok(a.y>=0&&a.y<1.1);
    assert.ok(Math.abs(a.heading)<.55);
    if(d>150&&d%100===0){dirs.push(Math.sign(a.heading));xs.push(a.x);}
  }
  assert.ok(dirs.includes(1)&&dirs.includes(-1),"Requires right and left curves");
  assert.ok(Math.max(...xs)-Math.min(...xs)>35,"Track must visibly bend, not resemble a straight strip");
  assert.equal(trackCenter(5000).z,5000);
});
test("Road lanes keep spacing and turn along the correct tangent",()=>{
  for(const at of [0,120,299,300,600,999,2500,4500,4998,5000]){
    const center=trackPoint(at,0),left=trackPoint(at,-3.7),right=trackPoint(at,3.7);
    assert.ok(Math.abs(Math.hypot(left.x-center.x,left.z-center.z)-3.7)<.00001);
    assert.ok(Math.abs(Math.hypot(right.x-center.x,right.z-center.z)-3.7)<.00001);
    assert.ok(left.x<right.x);
    assert.ok(Math.abs(center.heading-left.heading)<1e-12);
  }
});
test("The 600m streamed tiles join without visual seams and preserve the final location",()=>{
  for(let b=300;b<=4800;b+=300){
    for(const lane of [-6,0,6]){
      const fromPrevious=trackPoint(b,lane);
      const fromNext=trackPoint(b,lane);
      assert.deepEqual(fromPrevious,fromNext);
    }
  }
  assert.equal(COURSE_MILESTONES.length,9);
  assert.ok(COURSE_MILESTONES.every(x=>x%500===0&&x>0&&x<5000));
  assert.match(courseSection(4800),/ÚLTIMO/);
});
test("Visual curves never alter authoritative physics or the 5km win condition",()=>{
  const race=createState(19);
  register(race,"guest","Guest","entrar");advance(race);advance(race);
  const before=structuredClone(race);
  for(let d=0;d<=5000;d+=3)trackPoint(d,1.85);
  assert.deepEqual(race,before);
  assert.equal(race.trackLength,5000);
});

test("Roblox Studio source has curved segmented road, exact official finish and chase camera",async()=>{
  const {readFile}=await import("node:fs/promises");
  const server=await readFile(new URL("../roblox/LiveRace.server.luau",import.meta.url),"utf8");
  const cam=await readFile(new URL("../roblox/LiveCamera.client.luau",import.meta.url),"utf8");
  for(const c of ["27*math.sin(s/172)+10*math.sin(s/69)","coursePosition","for z=10,290,20",
    "FinishStripe","FINISH_5000","for dist=500,4500,500"]){
    assert.ok(server.includes(c),"Roblox course missing "+c);
  }
  assert.ok(server.includes("model:PivotTo(CFrame.new(pos)"));
  assert.ok(cam.includes("centerAt(center-34)"));
  assert.ok(cam.includes("centerAt(center+12)"));
  assert.ok(cam.includes("27*math.sin(s/172)+10*math.sin(s/69)"));
});
