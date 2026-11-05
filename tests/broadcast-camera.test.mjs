import test from "node:test";
import assert from "node:assert/strict";
import {cameraShot,CAMERA_CYCLE_MS} from "../src/broadcast-camera.js";
test("Video-matched camera begins rear-follow after GO and alternates aerial/drone views",()=>{
  assert.equal(CAMERA_CYCLE_MS,50000);
  const start=cameraShot(0,0);
  const close=cameraShot(9000,0);
  const high=cameraShot(20000,0);
  const next=cameraShot(32000,0);
  const aerial=cameraShot(41000,0);
  assert.ok(start.back>=20&&start.back<=35);
  assert.equal(start.mode,"ACOMPANHAMENTO");
  assert.equal(close.mode,"PELOTÃO");
  assert.equal(high.mode,"AÉREA");
  assert.equal(aerial.mode,"AÉREA");
  assert.ok(high.back>close.back+30);
  assert.ok(high.height>close.height+20);
  assert.ok(next.height<high.height);
  assert.deepEqual(cameraShot(0,0),cameraShot(50000,0));
});
test("Camera progression is continuous, finite and bounded on slow Android GPUs",()=>{
  for(let ms=0;ms<100000;ms+=137){
    const s=cameraShot(ms,.5);
    assert.ok([s.back,s.height,s.ahead,s.lateral].every(Number.isFinite));
    assert.ok(s.back>=20&&s.back<=108);
    assert.ok(s.height>=10&&s.height<=85);
    assert.ok(Math.abs(s.lateral)<=5.5);
    const next=cameraShot(ms+16,.5);
    assert.ok(Math.abs(s.back-next.back)<2);
    assert.ok(Math.abs(s.height-next.height)<2);
  }
});
