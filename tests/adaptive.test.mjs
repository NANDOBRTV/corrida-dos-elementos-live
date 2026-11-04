import test from "node:test";
import assert from "node:assert/strict";
import {ADAPTIVE_SCALES,createAdaptiveQuality} from "../src/adaptive.js";

function metrics({fps=30,slowFramePercent=0,p95FrameMs=34,samples=90}={}){
  return {fps,slowFramePercent,p95FrameMs,samples};
}
test("Auto starts with full resolution and ignores loading/noisy samples",()=>{
  const a=createAdaptiveQuality({targetFps:30});
  assert.deepEqual(a.status(),{enabled:true,scale:1,level:0,maxLevel:3});
  for(let n=0;n<40;n++){
    const r=a.update(metrics({fps:8,samples:20}),n*1000);
    assert.equal(r.changed,false);
  }
  assert.equal(a.status().scale,1);
});
test("Persistent poor FPS lowers only one resolution tier at a time",()=>{
  const a=createAdaptiveQuality({targetFps:30});
  assert.equal(a.update(metrics({fps:15}),1000).changed,false);
  assert.equal(a.update(metrics({fps:15}),2000).changed,false);
  const first=a.update(metrics({fps:15}),3000);
  assert.equal(first.reason,"down");
  assert.equal(first.scale,.88);
  for(let t=4000;t<11000;t+=1000)assert.equal(a.update(metrics({fps:15}),t).changed,false);
  assert.equal(a.update(metrics({fps:15}),11000).scale,.76);
});
test("Stable FPS restores pixels slowly after extended cooldown",()=>{
  const a=createAdaptiveQuality({targetFps:30});
  for(let t=1000;t<=3000;t+=1000)a.update(metrics({fps:14}),t);
  assert.equal(a.status().scale,.88);
  for(let t=4000;t<23000;t+=1000)a.update(metrics({fps:30,slowFramePercent:0,p95FrameMs:33}),t);
  assert.equal(a.status().scale,.88);
  const restored=a.update(metrics({fps:30,slowFramePercent:0,p95FrameMs:33}),23000);
  assert.equal(restored.changed,true);
  assert.equal(restored.reason,"up");
  assert.equal(restored.scale,1);
});
test("Borderline performance cannot oscillate between levels",()=>{
  const a=createAdaptiveQuality({targetFps:30});
  for(let t=1000;t<=3000;t+=1000)a.update(metrics({fps:15}),t);
  for(let t=4000;t<60000;t+=1000)a.update(metrics({fps:26,slowFramePercent:12,p95FrameMs:42}),t);
  assert.equal(a.status().scale,.88);
});
test("At minimum pixels, poor FPS never removes scenery or drops scale further",()=>{
  const a=createAdaptiveQuality({targetFps:30});
  for(let t=1000;t<120000;t+=1000)a.update(metrics({fps:8,slowFramePercent:100,p95FrameMs:120}),t);
  assert.equal(a.status().scale,ADAPTIVE_SCALES.at(-1));
  assert.equal(a.status().level,3);
});
test("Manual profiles remain locked at 100% even during bad FPS",()=>{
  const a=createAdaptiveQuality({targetFps:45,enabled:false});
  for(let t=1000;t<120000;t+=1000){
    assert.equal(a.update(metrics({fps:4,slowFramePercent:100,p95FrameMs:250}),t).changed,false);
  }
  assert.equal(a.status().scale,1);
  assert.equal(a.status().enabled,false);
});
test("Resuming from background resets trend but preserves chosen resolution",()=>{
  const a=createAdaptiveQuality({targetFps:30});
  for(let t=1000;t<=3000;t+=1000)a.update(metrics({fps:12}),t);
  assert.equal(a.status().scale,.88);
  a.reset();
  assert.equal(a.status().scale,.88);
  assert.equal(a.update(metrics({fps:12}),4000).changed,false);
  assert.equal(a.update(metrics({fps:12}),5000).changed,false);
  assert.equal(a.update(metrics({fps:12}),6000).scale,.76);
});
test("Rejects invalid scale configurations",()=>{
  assert.throws(()=>createAdaptiveQuality({scales:[.8,.7]}),/inválida/);
  assert.equal(createAdaptiveQuality({scales:[1,1.1]}).status().scale,1); // Invalid step ignored
});
