import test from "node:test";
import assert from "node:assert/strict";
import {COURSE_LENGTH,COURSE_TILE_LENGTH,COURSE_MILESTONES,trackCenter,
  trackPoint,trackBounds,lapDistance,currentLap,courseSection} from "../src/track-path.js";
import {createState,register,advance} from "../src/engine.js";
test("W track is a physically closed 400m circuit with rounded bends",()=>{
  assert.equal(COURSE_LENGTH,400);assert.equal(COURSE_TILE_LENGTH,400);
  const a=trackCenter(0),b=trackCenter(400);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.01);
  assert.equal(a.y,b.y);
  const bounds=trackBounds();
  assert.ok(bounds.maxX-bounds.minX>50);
  assert.ok(bounds.maxZ-bounds.minZ>80);
  let total=0,sharpest=0;
  for(let d=0;d<400;d+=.5){
    const u=trackCenter(d),v=trackCenter(d+.5);
    const length=Math.hypot(v.x-u.x,v.z-u.z);
    assert.ok(length>.35&&length<.60,"Track discontinuity at "+d);
    total+=length;
    sharpest=Math.max(sharpest,Math.abs(v.heading-u.heading));
  }
  assert.ok(Math.abs(total-400)<5);
  assert.ok(sharpest<6.3);
});
test("Five lanes remain aligned with the centerline and checkpoint spacing",()=>{
  for(let d=0;d<=400;d+=5){
    const c=trackPoint(d,0),a=trackPoint(d,-3.7),b=trackPoint(d,3.7);
    assert.ok(Math.abs(Math.hypot(a.x-c.x,a.z-c.z)-3.7)<.001);
    assert.ok(Math.abs(Math.hypot(b.x-c.x,b.z-c.z)-3.7)<.001);
  }
  assert.deepEqual(COURSE_MILESTONES,[100,200,300]);
  assert.equal(typeof courseSection(180),"string");
});
test("Lap boundary wraps visually without changing total race progress",()=>{
  assert.equal(lapDistance(0,1200),0);
  assert.equal(lapDistance(400,1200),0);
  assert.equal(lapDistance(401,1200),1);
  assert.equal(lapDistance(800,1200),0);
  assert.equal(lapDistance(1200,1200),400);
  assert.equal(currentLap(400,3),2);
  assert.equal(currentLap(800,3),3);
  assert.equal(currentLap(1200,3),3);
  const state=createState(7);register(state,"r1","Runner","entrar");advance(state);advance(state);
  const before=structuredClone(state);
  for(let d=0;d<=400;d+=2)trackPoint(d,1.85);
  assert.deepEqual(state,before);
});
