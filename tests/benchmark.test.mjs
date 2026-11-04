import test from "node:test";
import assert from "node:assert/strict";
import {summarizeFrames,compareTrials,benchmarkSummary,interpretAdaptiveResult,formatBenchReport} from "../src/benchmark-math.js";

test("FPS is measured from actual rAF intervals, not a guessed device specification",()=>{
  const metric=summarizeFrames(Array(100).fill(20));
  assert.equal(metric.fps,50);
  assert.equal(metric.avgMs,20);
  assert.equal(metric.p95Ms,20);
  assert.equal(metric.frames,100);
});
test("Invalid, zero and paused frames never create invented speed",()=>{
  assert.deepEqual(summarizeFrames([0,-5,NaN,Infinity,2000]),{fps:0,avgMs:0,p95Ms:0,frames:0});
  assert.equal(summarizeFrames([16,20,32]).frames,3);
});
test("The percentile highlights slow frames with robust ordering",()=>{
  const metric=summarizeFrames([...Array(18).fill(20),60,20]);
  assert.equal(metric.p95Ms,20);
  assert.equal(metric.frames,20);
});
test("Comparison can report improvements, regressions and no measurable change",()=>{
  assert.equal(compareTrials({fps:30},{fps:36}).deltaPercent,20);
  assert.equal(compareTrials({fps:30},{fps:25}).deltaPercent,-16.7);
  assert.equal(compareTrials({fps:30},{fps:30}).deltaPercent,0);
  assert.equal(compareTrials({fps:0},{fps:30}).deltaPercent,null);
});
test("Summary computes paired biome averages without inventing absent trials",()=>{
  const rows=[
    {mapId:"forest",fixed:{fps:30},adaptive:{fps:36}},
    {mapId:"ice",fixed:{fps:20},adaptive:{fps:25}},
    {mapId:"hell",fixed:{fps:28},adaptive:null}
  ];
  assert.deepEqual(benchmarkSummary(rows),{maps:2,fixedFps:25,adaptiveFps:30.5,deltaPercent:22});
});
test("Device report includes map data but never asks for account secrets",()=>{
  const rows=[
    {name:"FLORESTA",fixed:{fps:28},adaptive:{fps:30,scale:.76}},
    {name:"GELO",fixed:{fps:24},adaptive:{fps:25,scale:1}}
  ];
  const report=formatBenchReport(rows,{device:"Android teste",quality:"balanced",date:"04/11/2026"});
  assert.match(report,/Android teste/);
  assert.match(report,/FLORESTA/);
  assert.match(report,/GELO/);
  assert.match(report,/76%/);
  assert.match(report,/nenhuma/i.test(report)?"nenhuma":/Sem conexão ao chat TikTok/);
  assert.ok(!report.includes("ADMIN_KEY"));
});

test("Do not attribute FPS differences to adaptive quality when all scales stay at 100%",()=>{
  const rows=[
    {name:"GELO",fixed:{fps:49.7},adaptive:{fps:48.6,scale:1,avgScale:1}},
    {name:"VULCÃO",fixed:{fps:50.4},adaptive:{fps:53.9,scale:1,avgScale:1}}
  ];
  const result=interpretAdaptiveResult(rows);
  assert.equal(result.adjustedMaps,0);
  assert.match(result.conclusion,/não comprova ganho causado/);
  const report=formatBenchReport(rows);
  assert.match(report,/Auto manteve 100%/);
});
test("Adaptive activation counts time spent below full resolution, not only final scale",()=>{
  const rows=[
    {name:"GELO",fixed:{fps:32},adaptive:{fps:39,scale:1,avgScale:.91}},
    {name:"VULCÃO",fixed:{fps:34},adaptive:{fps:40,scale:.88,avgScale:.92}}
  ];
  const result=interpretAdaptiveResult(rows);
  assert.equal(result.adjustedMaps,2);
  assert.match(result.conclusion,/2 de 2 mapas/);
});
test("Frame cost metadata is shown only when measured",()=>{
  const rows=[{name:"GELO",fixed:{fps:50},adaptive:{
    fps:51,scale:1,avgScale:1,avgDrawCalls:78,avgTriangles:19000
  }}];
  const report=formatBenchReport(rows);
  assert.match(report,/draw calls médios: 78/);
  assert.match(report,/triângulos médios: 19000/);
});
