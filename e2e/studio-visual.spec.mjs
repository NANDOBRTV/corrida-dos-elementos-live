import {test,expect} from "@playwright/test";
import {
  STUDIO_CAMERA,STUDIO_COURSE_TOTAL,studioCourseAt,studioRunnerPose,
  studioCrowdPoses,studioPositionOnCourse,cameraTargetFor,
  studioCameraShot,STUDIO_SHOTS,advanceStudioCamera,studioVisibleNameplates
} from "../src/studio-camera.js";
import {createStudioState,studioJoin,studioFillBots,studioAdvance,
  studioTick} from "../src/studio-engine.js";

const sceneUrl="/?view=live&quality=low&showcase=1";
function hundred({phase="LOBBY"}={}){
  const state=createStudioState({seed:143,connected:false});
  studioFillBots(state,{count:100});
  if(phase==="COUNTDOWN"||phase==="RUNNING"||phase==="RESULTS")studioAdvance(state);
  if(phase==="RUNNING"||phase==="RESULTS")studioAdvance(state);
  if(phase==="RESULTS")studioAdvance(state);
  return state;
}
test("Studio V5 follows a real long winding course without alloc-heavy 1500m geometry",()=>{
  expect(STUDIO_COURSE_TOTAL).toBeGreaterThan(1550);
  const distances=Array.from({length:1501},(_,i)=>studioCourseAt(i));
  for(let i=1;i<distances.length;i++){
    const d=Math.hypot(distances[i].x-distances[i-1].x,
      distances[i].y-distances[i-1].y,
      distances[i].z-distances[i-1].z);
    expect(d).toBeGreaterThan(.95);
    expect(d).toBeLessThan(1.02);
    expect(distances[i].z).toBeGreaterThan(distances[i-1].z);
  }
  const xPositions=distances.map(v=>v.x);
  expect(Math.max(...xPositions)-Math.min(...xPositions)).toBeGreaterThan(38);
  expect(Math.abs(studioCourseAt(450).heading-studioCourseAt(100).heading))
    .toBeGreaterThan(.04);
  expect(studioCourseAt(1500).z).toBeGreaterThan(1000);
});
test("Exactly 100 voxel runners remain ten across and ten deep on the start grid",()=>{
  const state=hundred();
  const poses=[...studioCrowdPoses(state).values()];
  expect(poses).toHaveLength(100);
  const keys=new Set(poses.map(p=>p.x.toFixed(3)+"/"+p.z.toFixed(3)));
  expect(keys.size).toBe(100);
  const first=state.active.map((r,i)=>studioRunnerPose(r,i,"LOBBY"));
  expect(first[0].x).toBeLessThan(first[9].x);
  const rowDepth=Math.hypot(first[90].x-first[0].x,first[90].z-first[0].z);
  expect(rowDepth).toBeGreaterThan(24);
  expect(rowDepth).toBeLessThan(29);
  for(const p of poses){
    expect(Number.isFinite(p.x+p.y+p.z+p.heading)).toBe(true);
  }
});
test("When GO fires, player bodies retain spacing without modifying official distances",()=>{
  const s=hundred({phase:"RUNNING"});
  const saved=JSON.stringify(s.active);
  const poses=studioCrowdPoses(s);
  expect([...poses.values()]).toHaveLength(100);
  for(let i=0;i<100;i++){
    const r=s.active[i],p=poses.get(r.id);
    expect(p).toBeDefined();
    for(let j=i+1;j<100;j++){
      const other=poses.get(s.active[j].id);
      const gap=Math.hypot(p.x-other.x,p.z-other.z);
      expect(gap).toBeGreaterThan(.81);
    }
  }
  expect(JSON.stringify(s.active)).toBe(saved);
  studioTick(s,500);
  expect(studioCrowdPoses(s).size).toBe(100);
});
test("One camera alternates 10-second deterministic vehicle closeups and top three",()=>{
  const s=hundred({phase:"RUNNING"});
  const check=(raceMs,expected)=>{
    s.raceMs=raceMs;
    const shot=studioCameraShot(s);
    const target=cameraTargetFor(s);
    expect(shot.mode).toBe(expected);
    expect(target.mode).toBe(expected);
    expect(Number.isFinite(target.position.x+target.position.y+
      target.position.z+target.target.x+target.target.y+target.target.z))
      .toBe(true);
    return shot;
  };
  const first=check(0,"VEHICLE_CLOSEUP");
  expect(first.featuredId).toBeTruthy();
  expect(check(9999,"VEHICLE_CLOSEUP").featuredId).toBe(first.featuredId);
  const leaders=check(10000,"TOP_THREE");
  expect(leaders.focusIds).toHaveLength(3);
  expect(new Set(leaders.focusIds).size).toBe(3);
  expect(check(17999,"TOP_THREE").focusIds).toEqual(leaders.focusIds);
  expect(check(18000,"VEHICLE_CLOSEUP").featuredId).toBeTruthy();
  expect(STUDIO_SHOTS.closeupMs).toBe(10000);
  expect(STUDIO_SHOTS.topThreeMs).toBe(8000);
  expect(STUDIO_CAMERA.fovPortrait).toBeGreaterThan(70);
});
test("Frame-based smoothing is deterministic and never cuts to random or aerial shot",()=>{
  const s=hundred({phase:"RUNNING"});
  const first=cameraTargetFor(s);
  for(const progress of [0,30,80,170,340,520]){
    for(const r of s.active)r.progress=progress+r.gridPosition/200;
    const next=cameraTargetFor(s);
    const a=advanceStudioCamera(first,s,1/60);
    const b=advanceStudioCamera(first,s,1/60);
    expect(a).toEqual(b);
    expect(["VEHICLE_CLOSEUP","TOP_THREE"]).toContain(a.mode);
    expect(a.leaderId).toBeTruthy();
    const total=Math.hypot(next.position.x-first.position.x,
      next.position.y-first.position.y,next.position.z-first.position.z);
    const moved=Math.hypot(a.position.x-first.position.x,
      a.position.y-first.position.y,a.position.z-first.position.z);
    expect(moved).toBeLessThanOrEqual(total+.001);
  }
});
test("Podium winner closes RESULTS; named anchors can cover all visible vehicles",()=>{
  const state=hundred({phase:"RUNNING"});
  state.active.forEach((r,i)=>{r.progress=300+i;});
  const before=studioVisibleNameplates(state,{featuredId:state.active[0].id});
  expect(before.length).toBe(13);
  expect(new Set(before.map(x=>x.id)).size).toBe(13);
  expect(before[0].rank).toBe(1);
  expect(cameraTargetFor(state).mode).toBe("VEHICLE_CLOSEUP");
  studioAdvance(state);
  expect(state.phase).toBe("RESULTS");
  const shot=cameraTargetFor(state);
  expect(shot.mode).toBe("WINNER_PODIUM");
  expect(shot.leaderId).toBe(state.results[0].id);
  const winner=state.active.find(r=>r.id===shot.leaderId);
  expect(studioRunnerPose(winner,0,"RESULTS",state.results).podium).toBe(1);
  const podiumPlates=studioVisibleNameplates(state);
  expect(podiumPlates.length).toBeLessThanOrEqual(12);
});
async function mount(page,{width=390,height=693,phase="RUNNING"}={}){
  await page.goto(sceneUrl,{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async({width,height,phase})=>{
    const [{createStudioScene},{createStudioState,studioFillBots,studioAdvance,
      studioTick}]=await Promise.all([
        import("/src/studio-scene.js"),import("/src/studio-engine.js")
      ]);
    const canvas=document.createElement("canvas");
    canvas.id="studio-v5-scene-test";
    canvas.style.cssText="position:fixed;inset:0;z-index:20000;display:block;"+
      "background:#d9e4f0;width:"+width+"px;height:"+height+"px";
    document.body.append(canvas);
    const s=createStudioState({seed:222,connected:false});
    studioFillBots(s,{count:100});
    if(phase==="COUNTDOWN"||phase==="RUNNING"||phase==="RESULTS")studioAdvance(s);
    if(phase==="RUNNING"||phase==="RESULTS")studioAdvance(s);
    if(phase==="RESULTS")studioAdvance(s);
    if(phase==="RUNNING")studioTick(s,5000);
    const scene=createStudioScene(canvas,{quality:"low",pixelRatio:1});
    scene.update(s,1/30);
    window.__studioTest={scene,state:s};
    return {stats:scene.stats(),labels:scene.nameplates(),
      angle:scene.camera.fov,aspect:scene.camera.aspect,
      hasCanvas:!!document.getElementById(canvas.id)};
  },{width,height,phase});
  return result;
}
async function unmount(page){
  await page.evaluate(()=>{
    window.__studioTest?.scene?.dispose();
    document.getElementById("studio-v5-scene-test")?.remove();
    delete window.__studioTest;
  });
}
test("Android 9:16 WebGL renders 100 avatars in one batch and twelve nameplate anchors",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  const out=await mount(page,{width:390,height:693});
  expect(out.hasCanvas).toBe(true);
  expect(out.stats.cameraCount).toBe(1);
  expect(out.stats.runners).toBe(100);
  expect(out.stats.drawCalls).toBeLessThan(30);
  expect(out.stats.triangles).toBeGreaterThan(1500);
  expect(out.stats.triangles).toBeLessThan(55000);
  expect(out.labels.length).toBeLessThanOrEqual(100);
  expect(out.labels.every(plate=>typeof plate.username==="string")).toBe(true);
  expect(out.angle).toBe(STUDIO_CAMERA.fovPortrait);
  expect(out.aspect).toBeCloseTo(390/693,3);
  expect(errors).toEqual([]);
  await page.locator("#studio-v5-scene-test").screenshot({
    path:"test-results/studio-v5-android-100-runners.png"
  });
  const after=await page.evaluate(()=>{
    const scene=window.__studioTest.scene,s=window.__studioTest.state;
    const start=performance.now();
    for(let i=0;i<30;i++){
      studioTickOnly(s,100);
      scene.update(s,1/30);
    }
    function studioTickOnly(state,ms){
      state.raceMs+=ms;
      for(const r of state.active)r.progress+=(Number(r.speed)||9)*(ms/1000);
    }
    return {elapsedMs:performance.now()-start,stats:scene.stats()};
  });
  expect(after.stats.runners).toBe(100);
  expect(after.stats.courseRebuilds).toBeLessThan(25);
  expect(after.stats.drawCalls).toBeLessThan(30);
  await unmount(page);
});
test("1080x1920 landscape-free 9:16 portrait renders Ice, Forest and winner podium",async({page})=>{
  await page.setViewportSize({width:1080,height:1920});
  const result=await mount(page,{width:1080,height:1920,phase:"COUNTDOWN"});
  expect(result.aspect).toBeCloseTo(1080/1920,3);
  expect(result.stats.runners).toBe(100);
  const phases=await page.evaluate(()=>{
    const {scene,state}=window.__studioTest;
    const opening=scene.stats();
    // Advance to the race with one camera and no close-up.
    state.phase="RUNNING";
    scene.update(state,1/30);
    const racing=scene.stats();
    state.phase="RESULTS";
    state.results=state.active.map((r,i)=>({id:r.id,name:r.name,
      position:i+1,meters:r.progress,finishMs:null}));
    state.mapId="forest";
    scene.update(state,1/30);
    const finish=scene.stats();
    return {opening,racing,finish,
      podiumVisible:scene.scene.getObjectByName("studio-winners-only-podium").visible,
      snowVisible:scene.scene.getObjectByName("studio-background-snowfall").visible};
  });
  expect(phases.opening.cameraCount).toBe(1);
  expect(phases.racing.cameraCount).toBe(1);
  expect(phases.finish.cameraCount).toBe(1);
  expect(phases.finish.mapId).toBe("forest");
  expect(phases.podiumVisible).toBe(true);
  expect(phases.snowVisible).toBe(false);
  await page.locator("#studio-v5-scene-test").screenshot({
    path:"test-results/studio-v5-1080x1920-winner-podium.png"
  });
  await unmount(page);
});


test("Reference visual: tall starting pillars, colorful voxel accessories and mid-pack light-ring",async({page})=>{
  await page.setViewportSize({width:390,height:693});
  const mounted=await mount(page,{width:390,height:693,phase:"LOBBY"});
  expect(mounted.stats.runners).toBe(100);
  const results=await page.evaluate(()=>{
    const data=window.__studioTest;
    const scene=data.scene;
    const walls=scene.scene.getObjectByName("studio-start-walls");
    const avatarMesh=scene.scene.getObjectByName("studio-100-runner-voxel-batch");
    const halo=scene.scene.getObjectByName("studio-leader-spotlight-ring");
    const before={wallCount:walls.count,avatarPartsPerRunner:scene.limits.avatarParts,
      spotlight:halo.count};
    data.state.phase="RUNNING";
    for(let index=0;index<data.state.active.length;index++){
      const r=data.state.active[index];
      r.progress=70+(index%12)*1.2;
      r.status="running";
    }
    data.state.raceMs=8500;
    scene.update(data.state,1/30);
    return {...before,ringParts:halo.count,
      ringColor:halo.instanceColor!==null,
      triangles:scene.stats().triangles,
      drawCalls:scene.stats().drawCalls,
      avatarInstances:avatarMesh.count,
      cameraCount:scene.stats().cameraCount
    };
  });
  expect(results.wallCount).toBeGreaterThanOrEqual(2);
  expect(results.avatarPartsPerRunner).toBeGreaterThanOrEqual(28);
  expect(results.spotlight).toBe(0);
  expect(results.ringParts).toBeGreaterThanOrEqual(25);
  expect(results.ringColor).toBe(true);
  expect(results.avatarInstances).toBe(100*results.avatarPartsPerRunner);
  expect(results.cameraCount).toBe(1);
  expect(results.drawCalls).toBeLessThan(30);
  expect(results.triangles).toBeLessThan(55000);
  await page.locator("#studio-v5-scene-test").screenshot({
    path:"test-results/reference-new-voxel-spotlight.png"
  });
  await unmount(page);
});
