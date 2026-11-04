import test from "node:test";
import assert from "node:assert/strict";
import {createFrameMonitor,gradePerformance} from "../src/metrics.js";

test("FPS sampler records real draw intervals instead of assuming target FPS",()=>{
  const meter=createFrameMonitor({targetFps:30});
  for(let i=0;i<61;i++)meter.frame(1000+i*33.333,{render:{calls:25,triangles:3200}});
  const v=meter.snapshot();
  assert.equal(v.fps,30);
  assert.equal(v.targetFps,30);
  assert.equal(v.samples,60);
  assert.equal(v.drawCalls,25);
  assert.equal(v.triangles,3200);
  assert.equal(v.slowFramePercent,0);
  assert.equal(gradePerformance(v).level,"good");
});
test("Slow frames produce a truthful warning",()=>{
  const meter=createFrameMonitor({targetFps:30});
  for(let i=0;i<26;i++)meter.frame(1000+i*80,{render:{calls:100,triangles:12000}});
  const v=meter.snapshot();
  assert.equal(v.fps,13);
  assert.equal(v.slowFramePercent,100);
  assert.equal(gradePerformance(v).level,"low");
});
test("Long page suspension resets samples rather than inventing a huge stutter",()=>{
  const meter=createFrameMonitor({targetFps:30});
  for(let i=0;i<20;i++)meter.frame(1000+i*34);
  assert.ok(meter.snapshot().samples>0);
  meter.frame(15000);
  assert.equal(meter.snapshot().samples,0);
  meter.frame(15034);
  assert.equal(meter.snapshot().samples,1);
});
test("Statistics are bounded, handle missing WebGL data and can reset",()=>{
  const meter=createFrameMonitor({targetFps:60,sampleSize:20});
  for(let i=0;i<100;i++)meter.frame(1000+i*16.667);
  const v=meter.snapshot();
  assert.equal(v.samples,20);
  assert.equal(v.drawCalls,0);
  assert.equal(v.triangles,0);
  assert.equal(gradePerformance(v).level,"good");
  meter.reset();
  assert.equal(meter.snapshot().samples,0);
  assert.equal(gradePerformance(meter.snapshot()).level,"sampling");
});
test("95th percentile reveals intermittent slow frames",()=>{
  const meter=createFrameMonitor({targetFps:60,sampleSize:60});
  const intervals=[...Array(18).fill(16),50,16];
  let now=1000;meter.frame(now);
  for(const interval of intervals){now+=interval;meter.frame(now)}
  const v=meter.snapshot();
  assert.equal(v.p95FrameMs,16);
  assert.equal(v.slowFramePercent,5);
  assert.equal(v.drawCalls,0);
});
