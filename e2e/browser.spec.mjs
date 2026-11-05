import {test,expect} from "@playwright/test";
import {createHash} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {join} from "node:path";

const root="e2e-artifacts";
const ADMIN="integration-test-only-not-for-real-render";
const maps=["ice","forest"];
async function reset(request){
  const response=await request.post("/api/admin/action",{
    headers:{"x-admin-key":ADMIN},
    data:{action:"reset",confirm:"RESET_DEMO"}
  });
  expect(response.ok()).toBeTruthy();
}
async function action(request,name,extra={}){
  const r=await request.post("/api/admin/action",{
    headers:{"x-admin-key":ADMIN},
    data:{action:name,...extra}
  });
  expect(r.ok(),name+" action").toBeTruthy();
  return r.json();
}
async function start(page,query="?view=operator&quality=low"){
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/"+query,{waitUntil:"domcontentloaded"});
  await expect(page.locator("#remoteMode")).toContainText("RENDER ONLINE",{timeout:25_000});
  await expect(page.locator("#canvasError")).toBeHidden();
  await page.locator("#raceCanvas").waitFor({state:"visible"});
  await page.waitForTimeout(1300);
  const webgl=await page.locator("#raceCanvas").evaluate(canvas=>{
    const gl=canvas.getContext("webgl2");
    return gl?String(gl.getParameter(gl.VERSION)):"unavailable";
  });
  expect(webgl).toContain("WebGL");
  expect(errors).toEqual([]);
  return errors;
}
test.beforeAll(async()=>{await mkdir(root,{recursive:true});});

test("both 3D biome screenshots differ in Android portrait",async({page,request})=>{
  await reset(request);
  const errors=await start(page);
  const hashes=new Set();
  for(const id of maps){
    await page.locator("#mapPreview").selectOption(id);
    await expect(page.locator("#arenaSub")).toContainText("PRÉVIA VISUAL");
    await page.waitForTimeout(350);
    const screenshot=await page.locator("#raceCanvas").screenshot({
      path:join(root,"biome-"+id+"-390x844.png"),timeout:25_000
    });
    expect(screenshot.length).toBeGreaterThan(1000);
    hashes.add(createHash("sha256").update(screenshot).digest("hex"));
  }
  expect(hashes.size,"Biomes should render as visually distinct environments").toBe(2);
  expect(errors).toEqual([]);
  await page.locator("#mapPreview").selectOption("");
  await expect(page.locator("#arenaSub")).not.toContainText("PRÉVIA VISUAL");
});

test("clean LIVE 9:16 view never shows operator token and does not overflow",async({page,request})=>{
  await reset(request);
  const errors=await start(page,"?view=live&quality=low");
  expect(await page.locator("#operatorPanel").isVisible()).toBe(false);
  await expect(page.locator("#joinCtaTitle")).toHaveText("PRÉ-LANÇAMENTO");
  await expect(page.locator("#tiktokStatus")).toContainText("CHAT REAL DESATIVADO");
  const widths=[320,390,430,768];
  for(const width of widths){
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(350);
    const sizing=await page.evaluate(()=>({
      viewport:document.documentElement.clientWidth,
      content:document.documentElement.scrollWidth,
      canvas:document.querySelector("#raceCanvas").getBoundingClientRect().width
    }));
    expect(sizing.content,"No horizontal overflow at "+width+"px").toBeLessThanOrEqual(sizing.viewport+1);
    expect(sizing.canvas).toBeGreaterThan(240);
    await page.screenshot({path:join(root,"broadcast-"+width+"x844.png"),fullPage:true,timeout:25_000});
  }
  expect(errors).toEqual([]);
});

test("fifty synthetic racers synchronize from server into LIVE viewer",async({page,request})=>{
  await reset(request);
  for(let i=10;i<50;i++){
    const response=await request.post("/api/admin/join",{
      headers:{"x-admin-key":ADMIN},
      data:{userId:"synthetic-"+i,displayName:"Jogador "+i,content:"entrar"}
    });
    expect(response.ok(),"Enrolled synthetic-"+i).toBeTruthy();
  }
  const backend=await (await request.get("/api/state")).json();
  expect(backend.state.active.length).toBe(50);
  await start(page,"?view=live&quality=low");
  await expect(page.locator("#playerCount")).toHaveText("50");
  await action(request,"advance");
  await action(request,"advance");
  await expect(page.locator("#phaseName")).toContainText("CORRIDA EM ANDAMENTO");
  await expect(page.locator("#rankingRows .rank-row")).toHaveCount(5);
  const result=await page.locator("#raceCanvas").screenshot({
    path:join(root,"fifty-runners.png"),timeout:25_000
  });
  expect(result.length).toBeGreaterThan(1000);
  await reset(request);
});

test("operator control displays real server status and prelaunch opt-out",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  await expect(page.locator("#operatorPanel")).toBeVisible();
  await expect(page.locator("#dbStatus")).toContainText("MEMÓRIA");
  await expect(page.locator("#tiktokStatus")).toContainText("CHAT REAL DESATIVADO");
  await expect(page.locator("#phaseName")).toContainText("LOBBY");
  const old=await (await request.get("/api/state")).json();
  const health=await (await request.get("/health")).json();
  expect(health.liveEventsMode).toBe("staged");
  expect(health.tiktokConnected).toBe(false);
  expect(old.state.round).toBeGreaterThan(0);
  await page.screenshot({path:join(root,"operator-390x844.png"),fullPage:true,timeout:25_000});
});


test("Android debug mode measures real rendered FPS without exposing controls",async({page,request})=>{
  await reset(request);
  await start(page,"?view=live&quality=low&debug=1");
  await expect(page.locator("#perfOverlay")).toBeVisible();
  await expect.poll(async()=>await page.locator("#perfOverlay").textContent(),
    {timeout:25_000,intervals:[500,1000]})
    .toMatch(/[0-9]+\/30 FPS/);
  expect(await page.locator("#operatorPanel").isVisible()).toBe(false);
  const stats=await page.locator("#perfOverlay").textContent();
  expect(stats).toMatch(/draw calls/);
  await page.screenshot({path:join(root,"live-fps-diagnostic-390x844.png"),fullPage:true});
});
test("Private Postgres check stays protected while preview server uses memory",async({request})=>{
  const denied=await request.get("/api/admin/storage-check");
  expect(denied.status()).toBe(401);
  const allowed=await request.get("/api/admin/storage-check",{headers:{"x-admin-key":ADMIN}});
  expect(allowed.ok()).toBeTruthy();
  const response=await allowed.json();
  expect(response.storage).toBe("memory");
  expect(response.readable).toBe(false);
});


test("LIVE display declares stale data while offline and recovers without a new local race",async({page,request})=>{
  await reset(request);
  await start(page,"?view=live&quality=low");
  await expect(page.locator("#remoteMode")).toContainText("RENDER ONLINE");
  const currentRound=await page.locator("#roundNumber").textContent();
  const context=page.context();
  await context.setOffline(true);
  // Some Chromium builds keep existing SSE sockets alive in offline emulation.
  // The offline event represents the actual browser network state transition.
  await page.evaluate(()=>window.dispatchEvent(new Event("offline")));
  await expect(page.locator("#connectionNotice")).toBeVisible({timeout:25_000});
  await expect(page.locator("#remoteMode")).toContainText(/RECONEXÃO|INTERROMPIDA/);
  await expect(page.locator("#connectionNotice")).toContainText(/congelad|não está respondendo/i,{timeout:25_000});
  await expect(page.locator("#roundNumber")).toHaveText(currentRound);
  await context.setOffline(false);
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(page.locator("#remoteMode")).toContainText("RENDER ONLINE",{timeout:35_000});
  await expect(page.locator("#connectionNotice")).toBeHidden({timeout:35_000});
  await expect(page.locator("#tiktokStatus")).toContainText("CHAT REAL DESATIVADO");
});
test("public state and SSE report a consistent opaque instance ID",async({request})=>{
  const h=await (await request.get("/health")).json();
  const state=await (await request.get("/api/state")).json();
  expect(h.instanceId).toMatch(/^[0-9a-f]{16}$/);
  expect(state.instanceId).toBe(h.instanceId);
});


test("adaptive WebGL resolution preserves scene geometry in all five biomes",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const result=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createAdaptiveQuality}=await import("/src/adaptive.js");
    const ids=["ice","forest"];
    const sampleCanvas=document.createElement("canvas");
    sampleCanvas.style.cssText="position:absolute;left:-9999px;top:0;width:320px;height:420px";
    document.body.appendChild(sampleCanvas);
    const world=createWorld(sampleCanvas,{quality:"balanced"});
    const results=[];
    try{
      for(const id of ids){
        world.setMap(id);
        world.resize();
        const before={color:world.scene.background.getHex(),
          objects:world.scene.children.length,
          meshes:0,ratio:world.renderer.getPixelRatio()};
        world.scene.traverse(x=>{if(x.isInstancedMesh)before.meshes+=x.count;else if(x.isMesh)before.meshes++;});
        world.setRenderScale(.76);
        const after={color:world.scene.background.getHex(),
          objects:world.scene.children.length,meshes:0,
          ratio:world.renderer.getPixelRatio(),scale:world.getRenderScale()};
        world.scene.traverse(x=>{if(x.isInstancedMesh)after.meshes+=x.count;else if(x.isMesh)after.meshes++;});
        results.push({id,before,after});
        world.setRenderScale(1);
      }
      const adaptive=createAdaptiveQuality({targetFps:30});
      let step;
      for(let t=1000;t<=3000;t+=1000)step=adaptive.update({
        samples:60,fps:12,p95FrameMs:91,slowFramePercent:100
      },t);
      return {results,autoStep:step};
    }finally{
      world.dispose();
      sampleCanvas.remove();
    }
  });
  expect(result.autoStep.reason).toBe("down");
  expect(result.autoStep.scale).toBe(.88);
  expect(result.results).toHaveLength(2);
  for(const entry of result.results){
    expect(entry.before.meshes).toBeGreaterThan(40);
    expect(entry.after.meshes).toBe(entry.before.meshes);
    expect(entry.after.objects).toBe(entry.before.objects);
    expect(entry.after.color).toBe(entry.before.color);
    expect(entry.after.scale).toBe(.76);
    expect(entry.after.ratio).toBeLessThan(entry.before.ratio);
  }
});

test("automatic graphics mode explains its live resolution and fixed low remains fixed",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=auto&debug=1");
  await expect(page.locator("#graphicsInfo")).toContainText("Auto adaptativo");
  await expect(page.locator("#performanceReport")).toContainText("Automático");
  await expect(page.locator("#perfOverlay")).toContainText("% resolução");
  await page.goto("/?view=operator&quality=low",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#remoteMode")).toContainText("RENDER ONLINE",{timeout:25_000});
  await expect(page.locator("#graphicsInfo")).toContainText("Perfil fixo");
  await expect(page.locator("#performanceReport")).toContainText("100%");
});


test("on-device benchmark completes Gelo and Floresta without TikTok, admin or horizontal overflow",async({page,request})=>{
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/benchmark.html?qa=1",{waitUntil:"domcontentloaded"});
  await expect(page.getByRole("heading",{name:"Teste de FPS no seu celular"})).toBeVisible();
  await expect(page.locator("#testStatus")).toHaveText("Pronto para começar");
  await expect(page.locator("#startTest")).toBeEnabled();
  const width=await page.evaluate(()=>({
    outer:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.outer+1);
  const health=await (await request.get("/health")).json();
  expect(health.liveEventsMode).toBe("staged");
  await page.locator("#startTest").click();
  await expect(page.locator("#testStatus")).toContainText("Teste concluído",{timeout:75_000});
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#benchmarkRows .result-row")).toHaveCount(2);
  await expect(page.locator("#reportText")).toHaveValue(/Mapas testados: 2/);
  await expect(page.locator("#interpretation")).toContainText(/Auto (manteve 100%|reduziu a resolução)/);
  await expect(page.locator("#reportText")).toHaveValue(/Interpretação:/);
  await expect(page.locator("#reportText")).toHaveValue(/draw calls médios:/);
  await expect(page.locator("#reportText")).toHaveValue(/FLORESTA/);
  await expect(page.locator("#reportText")).toHaveValue(/GELO/);
  await expect(page.locator("#startTest")).toBeEnabled();
  await page.screenshot({path:join(root,"benchmark-local-390x844.png"),fullPage:true});
  expect(errors).toEqual([]);
});


test("v2.3 batches fifty animated runners without losing colors or movement",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=balanced");
  const result=await page.evaluate(async()=>{
    const THREE=await import("three");
    const {createAvatars}=await import("/src/avatars.js");
    const {appearanceForRunner}=await import("/src/cosmetics.js");
    const {createState,register,advance}=await import("/src/engine.js");
    const state=createState(42719);
    for(let i=0;i<50;i++)register(state,"runner-"+i,"Runner "+i,"entrar");
    advance(state);advance(state);
    state.active.forEach((r,i)=>{r.progress=20+i*.02;r.status="running";});
    const scene=new THREE.Scene();
    const avatars=createAvatars(scene,{quality:"balanced"});
    avatars.sync(state.active);
    avatars.animate(state.active,"RUNNING",.016,1000);
    const batch=scene.getObjectByName("runner-voxel-batch");
    const first=new THREE.Matrix4(),second=new THREE.Matrix4();
    const color=new THREE.Color();
    batch.getMatrixAt(0,first);
    batch.getColorAt(0,color);
    // Instance colors are stored as Float32; exact double equality is too strict.
    const expectedColor=new THREE.Color(state.active[0].color);
    const colorDelta=Math.max(
      Math.abs(color.r-expectedColor.r),
      Math.abs(color.g-expectedColor.g),
      Math.abs(color.b-expectedColor.b)
    );
    const colorsPreserved=colorDelta<1e-5;
    const originalCount=batch.count;
    const soloScene=new THREE.Scene();
    const solo=createAvatars(soloScene,{quality:"balanced"});
    solo.sync([state.active[49]]);
    const individualParts=soloScene.getObjectByName("runner-voxel-batch").count;
    solo.clear();
    const expectedAfter=originalCount-individualParts;
    const vehicleCounts={
      kart:state.active.filter(r=>appearanceForRunner(r.id).vehicle==="kart").length,
      moto:state.active.filter(r=>appearanceForRunner(r.id).vehicle==="moto").length
    };
    avatars.animate(state.active,"RUNNING",.016,1100);
    batch.getMatrixAt(0,second);
    const articulated=!first.equals(second);
    const groupCount=scene.children.filter(x=>x.isGroup).length;
    avatars.sync(state.active.slice(0,49));
    avatars.animate(state.active.slice(0,49),"RUNNING",.016,1150);
    const afterRemoval=scene.getObjectByName("runner-voxel-batch").count;
    avatars.clear();
    return {originalCount,expectedAfter,vehicleCounts,
      groupCount,colorsPreserved,colorDelta,articulated,afterRemoval,
      cleaned:scene.getObjectByName("runner-voxel-batch")===undefined};
  });
  expect(result.originalCount).toBeGreaterThan(50*17); // Full humanoid wardrobe remains GPU batched
  expect(result.groupCount).toBe(50);
  expect(result.colorsPreserved,"GPU color delta "+result.colorDelta).toBe(true);
  expect(result.articulated).toBe(true);
  expect(result.afterRemoval).toBe(result.expectedAfter);
  expect(result.vehicleCounts.kart).toBe(0);
  expect(result.vehicleCounts.moto).toBe(0);
  expect(result.cleaned).toBe(true);
});


test("reference-inspired 9:16 LIVE HUD overlays race image with ranking and timer",async({page,request})=>{
  await reset(request);
  await action(request,"advance");
  await action(request,"advance");
  await start(page,"?view=live&quality=low");
  await expect(page.locator("#liveTimer")).toBeVisible();
  await expect(page.locator("#liveRemaining")).toContainText("m até a chegada");
  await expect(page.locator(".live-minimap")).toBeVisible();
  await expect(page.locator(".live-chat-messages")).toBeVisible();
  await expect(page.locator(".ranking-panel")).toBeVisible();
  await expect(page.locator("#liveMiniMapName")).toContainText(/GELO|FLORESTA/);
  const positions=await page.evaluate(()=>{
    const arena=document.querySelector(".arena").getBoundingClientRect();
    const ranking=document.querySelector(".ranking-panel").getBoundingClientRect();
    const timer=document.querySelector(".live-timer-card").getBoundingClientRect();
    return {arenaHeight:arena.height,arenaTop:arena.top,
      viewportHeight:innerHeight,rankingTop:ranking.top,rankingBottom:ranking.bottom,
      timerTop:timer.top,timerBottom:timer.bottom,
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
  });
  expect(positions.arenaHeight).toBeGreaterThanOrEqual(positions.viewportHeight-2);
  expect(positions.arenaTop).toBe(0);
  expect(positions.rankingBottom).toBeLessThan(positions.viewportHeight);
  expect(positions.timerBottom).toBeLessThan(positions.viewportHeight);
  expect(positions.horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({path:join(root,"reference-hud-live-390x844.png"),fullPage:true});
  await reset(request);
});

test("50-runner showcase is explicitly fictional and independent of the real Render motor",async({page,request})=>{
  const before=await (await request.get("/api/state")).json();
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25_000});
  await expect(page.locator("#phaseName")).toContainText("CORRIDA EM ANDAMENTO");
  await expect(page.locator("#remoteMode")).toContainText("PRÉVIA VISUAL LOCAL");
  await expect(page.locator("#tiktokStatus")).toContainText("SEM CONEXÃO COM O TIKTOK");
  await expect(page.locator(".ranking-panel")).toBeVisible();
  await expect(page.locator(".rank-row")).toHaveCount(5);
  await expect(page.locator("#liveTimer")).toBeVisible();
  await expect(page.locator("#raceCanvas")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({path:join(root,"reference-50-runners-showcase.png"),fullPage:true});
  const after=await (await request.get("/api/state")).json();
  expect(after.state.active.length).toBe(before.state.active.length);
  expect(after.state.round).toBe(before.state.round);
  expect(after.liveEventsMode).toBe("staged");
  expect(errors).toEqual([]);
});


test("v2.5 turbo visuals follow the official state and disappear after cooldown",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const observed=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const sampleCanvas=document.createElement("canvas");
    sampleCanvas.style.cssText="position:absolute;left:-9999px;top:0;width:320px;height:420px";
    document.body.appendChild(sampleCanvas);
    const world=createWorld(sampleCanvas,{quality:"low"});
    const data={phase:"RUNNING",raceMs:1000,active:[{
      id:"boost-test",lane:1,progress:40,color:"#65d9fa",
      status:"running",turboUntil:8000
    }]};
    try{
      world.setMap("ice");
      world.resize();
      world.render(data,.016);
      const ice=world.scene.getObjectByName("boost-trails");
      const first=ice.count;
      const visible=ice.visible;
      data.raceMs=9000;
      world.render(data,.016);
      const expired=ice.count;
      data.turboUntil=11000;
      data.active[0].turboUntil=11000;
      world.setMap("forest");
      world.render(data,.016);
      const forest=world.scene.getObjectByName("boost-trails");
      const second=forest.count;
      data.phase="RESULTS";
      world.render(data,.016);
      return {first,visible,expired,second,afterResult:forest.count,
        uniqueBatch:forest!==ice,weather:world.scene.getObjectByName("biome-weather-particles")?.count??1};
    }finally{world.dispose();sampleCanvas.remove();}
  });
  expect(observed.first).toBe(3);
  expect(observed.visible).toBe(true);
  expect(observed.expired).toBe(0);
  expect(observed.second).toBe(3);
  expect(observed.afterResult).toBe(0);
  expect(observed.uniqueBatch).toBe(true);
});

test("v2.7 mobile 5000 m straight minimap tracks top three racers",async({page,request})=>{
  await reset(request);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#remoteMode")).toContainText("PRÉVIA VISUAL LOCAL",{timeout:25_000});
  await expect(page.locator("#liveMiniMapName")).toContainText("GELO");
  await expect(page.locator(".live-mini-finish")).toContainText("400 m");
  await expect(page.locator(".live-mini-start")).toContainText("0 m");
  for(const id of ["#liveMapDot","#liveMapRival2","#liveMapRival3"])
    await expect(page.locator(id)).toBeVisible();
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>{
      const a=document.querySelector(".ranking-panel").getBoundingClientRect();
      const b=document.querySelector(".live-minimap").getBoundingClientRect();
      const c=document.querySelector(".live-minimap-road").getBoundingClientRect();
      return {rankingRight:a.right,minimapLeft:b.left,roadWidth:c.width,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    });
    expect(layout.rankingRight).toBeLessThan(layout.minimapLeft);
    expect(layout.roadWidth).toBeGreaterThan(35);
    expect(layout.overflow).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});


test("v2.6 300m courses render a real finish in both biomes and retain old 150m rounds",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const scene=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;top:0;width:280px;height:440px";
    document.body.appendChild(canvas);
    const world=createWorld(canvas,{quality:"low"});
    const stages=[];
    try{
      for(const [id,distance] of [["ice",300],["forest",300],["ice",150]]){
        world.setMap(id,distance);
        world.resize();
        const labels=[];
        world.scene.traverse(o=>{if(o.isSprite&&o.position.y===7.2)labels.push(o.position.z);});
        stages.push({id,distance,labels,background:world.scene.background.getHex()});
      }
    }finally{world.dispose();canvas.remove();}
    return stages;
  });
  expect(scene).toHaveLength(3);
  expect(scene[0].labels).toContain(300);
  expect(scene[1].labels).toContain(300);
  expect(scene[2].labels).toContain(150);
  expect(scene[0].background).not.toBe(scene[1].background);
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#liveMiniFinish")).toHaveText("🏁 400 m");
  await expect(page.locator("#liveRemaining")).toContainText("m até a chegada");
});



test("v4.0 only allocates one 400m circuit, with stable GPU instance count across laps",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const outcome=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;width:280px;height:440px";
    document.body.append(canvas);
    const world=createWorld(canvas,{quality:"low"});
    const samples=[];
    try{
      for(const map of ["ice","forest"]){
        world.setMap(map,400);
        const root=world.scene.getObjectByName("streamed-course");
        const finish=world.scene.getObjectByName("absolute-finish-line");
        const count=()=>{
          let n=0;root.traverse(o=>{if(o.isInstancedMesh)n+=o.count;else if(o.isMesh)n++;});
          return n;
        };
        const startCount=count();
        const progress=[];
        for(const distance of [0,95,200,350,400]){
          world.render({phase:"RUNNING",raceMs:4000,active:[
            {id:"runner",name:"Runner",lane:2,progress:distance,status:"running"}
          ]},.016);
          progress.push(root.userData.baseDistance);
          if(count()!==startCount)throw Error("GPU resource count changed during a lap");
        }
        samples.push({map,startCount,progress,finishX:finish.position.x,
          finishZ:finish.position.z,finishObjects:finish.children.length});
      }
    }finally{world.dispose();canvas.remove();}
    return samples;
  });
  expect(outcome).toHaveLength(2);
  for(const row of outcome){
    expect(row.startCount).toBeGreaterThan(60);
    expect(row.startCount).toBeLessThan(3500);
    expect(row.progress).toEqual([0,0,0,0,0]);
    expect(row.finishObjects).toBeGreaterThan(1);
  }
});

test("v4.0 400m W circuit aligns 3D lanes, scenery and finish in both biomes",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const result=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createAvatars}=await import("/src/avatars.js");
    const {trackPoint,trackCenter}=await import("/src/track-path.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;width:280px;height:440px";
    document.body.append(canvas);
    const world=createWorld(canvas,{quality:"low"});
    const avatars=createAvatars(world.scene,{quality:"low"});
    const samples=[];
    try{
      for(const map of ["ice","forest"]){
        world.setMap(map,400);
        for(const dist of [0,40,90,160,230,310,399]){
          const active=[{id:"curve-guest",name:"Test",lane:3,
            progress:dist,color:"#65d9fa",status:"running",baseSpeed:5,passed:[]}];
          world.render({phase:"RUNNING",round:1,raceMs:1000,trackLength:400,active},.016);
          avatars.sync(active);avatars.animate(active,"RUNNING",.016,1000);
          const model=world.scene.getObjectByName("blocky-runner-0");
          const finish=world.scene.getObjectByName("absolute-finish-line");
          const expected=trackPoint(dist,1.85,.76);
          samples.push({map,dist,x:model.position.x,y:model.position.y,
            expectedX:expected.x,expectedY:expected.y,
            checkpoints:world.scene.getObjectByName("course-milestones").children.length,
            finishX:finish.position.x,finishZ:finish.position.z,
            officialX:trackCenter(400).x,officialZ:trackCenter(400).z,
            asphalt:!!world.scene.getObjectByName("course-asphalt")});
        }
      }
    }finally{avatars.clear();world.dispose();canvas.remove();}
    return samples;
  });
  expect(result).toHaveLength(14);
  for(const x of result){
    expect(Math.abs(x.x-x.expectedX)).toBeLessThan(2);
    expect(Math.abs(x.y-x.expectedY)).toBeLessThan(.01);
    expect(x.checkpoints).toBe(3);
    expect(x.finishX).toBeCloseTo(x.officialX,3);
    expect(x.finishZ).toBeCloseTo(x.officialZ,3);
    expect(x.asphalt).toBe(true);
  }
});
test("v3.2 mobile minimap actually outlines three mountain hairpins",async({page,request})=>{
  await reset(request);
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#remoteMode")).toContainText("PRÉVIA VISUAL LOCAL",{timeout:25_000});
  const observed=await page.evaluate(()=>{
    const path=document.querySelector("#liveCoursePath");
    const svg=document.querySelector("#liveCourseSvg");
    const road=document.querySelector(".live-minimap-road");
    return {path:path?.getAttribute("d")||"",shown:svg?.style.display!=="none",
      width:road.getBoundingClientRect().width,
      markers:[...document.querySelectorAll("#liveMapDot,#liveMapRival2,#liveMapRival3")].length};
  });
  expect(observed.shown).toBe(true);
  expect(observed.path.match(/L/g)?.length).toBeGreaterThan(300);
  expect(observed.width).toBeGreaterThan(40);
  expect(observed.markers).toBe(3);
});


test("v4.0 W-turn showcase opens directly in the curve without changing the database",async({page,request})=>{
  const before=await (await request.get("/api/state")).json();
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  await page.goto("/?view=live&quality=low&showcase=1&section=hairpin&biome=ice",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25_000});
  const info=await page.evaluate(async()=>{
    const {trackCenter}=await import("/src/track-path.js");
    const a=trackCenter(30),b=trackCenter(120);
    return {turn:Math.abs(a.heading-b.heading),
      label:document.getElementById("liveLapInfo").textContent,
      path:document.getElementById("liveCoursePath").getAttribute("d")?.length,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  expect(info.turn).toBeGreaterThan(.3);
  expect(info.label).toContain("1/1");
  expect(info.path).toBeGreaterThan(2000);
  expect(info.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({path:join(root,"reference-W-track-50-runners.png"),fullPage:true});
  const after=await (await request.get("/api/state")).json();
  expect(after.state.round).toBe(before.state.round);
  expect(after.state.active.length).toBe(before.state.active.length);
  expect(errors).toEqual([]);
});
test("v3.3 minimap is ONLY route and markers, without either rectangular card",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25000});
  const visual=await page.evaluate(()=>{
    const outer=getComputedStyle(document.querySelector(".live-minimap"));
    const inner=getComputedStyle(document.querySelector(".live-minimap-road"));
    return {
      outerBorder:outer.borderTopWidth,innerBorder:inner.borderTopWidth,
      outerBackground:outer.backgroundColor,innerBackground:inner.backgroundColor,
      svg:getComputedStyle(document.querySelector(".live-course-svg")).display,
      path:document.querySelector("#liveCoursePath").getAttribute("d").length,
      finish:getComputedStyle(document.querySelector(".live-mini-finish")).display,
      start:getComputedStyle(document.querySelector(".live-mini-start")).display
    };
  });
  expect(visual.outerBorder).toBe("0px");
  expect(visual.innerBorder).toBe("0px");
  expect(visual.outerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(visual.innerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(visual.svg).not.toBe("none");
  expect(visual.path).toBeGreaterThan(1000);
  expect(visual.finish).toBe("none");expect(visual.start).toBe("none");
});
test("v3.3 only gift events create 3D obstacles; no generated track obstacles",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25000});
  const counts=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createState,register,advance}=await import("/src/engine.js");
    const {applyGiftEvent}=await import("/src/gifts.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;width:280px;height:440px";
    document.body.append(canvas);
    const world=createWorld(canvas,{quality:"low"});
    try{
      const s=createState(4);
      register(s,"one","One","entrar");advance(s);advance(s);
      world.setMap("ice",5000);
      world.render(s,.016);
      const mesh=world.scene.getObjectByName("gift-obstacle-batch");
      const before=mesh.count;
      applyGiftEvent(s,{userId:"viewer",giftId:"rose",giftName:"Rosa",repeatCount:1,simulated:true});
      world.render(s,.016);
      const withGift=mesh.count;
      s.giftObstacles=[];world.render(s,.016);
      return {before,withGift,after:mesh.count};
    }finally{world.dispose();canvas.remove();}
  });
  expect(counts).toEqual({before:0,withGift:1,after:0});
});

test("v3.4.1 randomized 0–10 second pauses between spotlight cuts",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25_000});
  const outcome=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createState,register,advance}=await import("/src/engine.js");
    const {closeupWaitMs,CLOSEUP_DURATION_MS}=await import("/src/camera-director.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;width:300px;height:600px";
    document.body.append(canvas);
    const world=createWorld(canvas,{quality:"low"});
    const state=createState(77);
    for(let i=0;i<20;i++)register(state,"guest-"+i,"Guest "+i,"entrar");
    advance(state);advance(state);
    state.active.forEach((r,i)=>{r.progress=360+(i%5)*1.1;});
    const rows=[];
    try{
      world.setMap("ice",5000);
      const first=closeupWaitMs(state,0);
      const second=first+CLOSEUP_DURATION_MS+closeupWaitMs(state,1);
      for(const ms of [first,first+900,first+2600,
        first+CLOSEUP_DURATION_MS,second,second+900]){
        state.raceMs=ms;
        world.render(state,.22);
        const detail=world.getCameraFocus();
        const cam=world.camera.position;
        rows.push({ms,focused:detail?.id||null,slot:detail?.slot||0,blend:detail?.blend||0,
          pos:[cam.x,cam.y,cam.z],visible:detail!==null});
      }
    }finally{world.dispose();canvas.remove();}
    return {rows,spotlightElement:!!document.getElementById("cameraSpotlight")};
  });
  expect(outcome.spotlightElement).toBe(true);
  expect(outcome.rows[0].slot).toBe(1);
  expect(outcome.rows[1].blend).toBeGreaterThan(.95);
  expect(outcome.rows[2].focused).toBeTruthy();
  expect(outcome.rows[3].focused).toBe(null);
  expect(outcome.rows[4].slot).toBe(2);
  expect(outcome.rows[5].blend).toBeGreaterThan(.95);
  expect(outcome.rows[4].focused).not.toBe(outcome.rows[0].focused);
  expect(outcome.rows.every(r=>r.pos.every(Number.isFinite))).toBe(true);
});

test("v4.0 lap select is actionable and preserves a race when applied mid-round",async({page,request})=>{
  await reset(request);
  await page.goto("/?view=operator&quality=low",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#nextLapCount")).toBeVisible();
  await page.locator("#nextLapCount").selectOption("3");
  // Operator action is covered server-side with key; verify the new UI and
  // that its select remains usable on Android sizes.
  const box=await page.locator("#saveNextLaps").boundingBox();
  expect(box?.width).toBeGreaterThan(50);
  expect(await page.locator("#nextLapCount").inputValue()).toBe("3");
});
test("v4.0 no random cars or motorcycles; one accepted present adds a temporary ride",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async()=>{
    const {createState,register,advance}=await import("/src/engine.js");
    const {applyGiftEvent}=await import("/src/gifts.js");
    const {appearanceForRunner}=await import("/src/cosmetics.js");
    const state=createState(3);
    for(let i=0;i<8;i++)register(state,"v"+i,"Runner "+i,"entrar");
    advance(state);advance(state);
    const noGift=state.active.every(r=>appearanceForRunner(r.id).vehicle!=="kart"&&
      appearanceForRunner(r.id).vehicle!=="moto"&&r.vehicleUntil===0);
    const result=applyGiftEvent(state,{userId:"v0",displayName:"Runner 0",giftId:"motorcycle",
      giftName:"Moto",repeatCount:1,simulated:true});
    return {noGift,vehicle:result.vehicle,kind:state.active[0].vehicleKind,
      until:state.active[0].vehicleUntil};
  });
  expect(result.noGift).toBe(true);
  expect(result.vehicle.kind).toBe("moto");
  expect(result.kind).toBe("moto");
  expect(result.until).toBe(12000);
});

test("v4.0.2 Ice stays snow-free over the W asphalt and starts with a frontal camera",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1&biome=ice&v=4.0.2",{
    waitUntil:"domcontentloaded"
  });
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25000});
  const observed=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createAvatars}=await import("/src/avatars.js");
    const {trackCenter}=await import("/src/track-path.js");
    const {createState,register,advance,rank}=await import("/src/engine.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;width:350px;height:700px";
    document.body.append(canvas);
    const world=createWorld(canvas,{quality:"low"});
    const avatars=createAvatars(world.scene,{quality:"low"});
    const s=createState(71);
    for(const id of ["z9","c8","a1","b3","t7","d0","f4","e5","x6"])
      register(s,id,id,"entrar");
    advance(s); // Countdown must show the runners facing the camera.
    const leaders=rank(s.active).slice(0,3);
    try{
      world.setMap("ice",400);
      avatars.sync(s.active,0,"COUNTDOWN");
      avatars.animate(s.active,"COUNTDOWN",.016,10);
      world.render(s,.016);
      const first=trackCenter(0);
      const direction={x:Math.sin(first.heading),z:Math.cos(first.heading)};
      const front=(world.camera.position.x-first.x)*direction.x+
        (world.camera.position.z-first.z)*direction.z;
      const pack=s.active.map((r,i)=>{
        const object=world.scene.getObjectByName("blocky-runner-"+i);
        return {id:r.id,position:r.gridPosition,lane:r.lane,
          relative:(object.position.x-first.x)*direction.x+
                   (object.position.z-first.z)*direction.z};
      });
      const ground=world.scene.getObjectByName("winter-terrain-floor");
      const groundTop=ground.position.y+ground.scale.y/2;
      const staging=world.scene.getObjectByName("starting-grid-asphalt");
      let minRoadHeight=Infinity;
      for(let d=0;d<=400;d+=2)minRoadHeight=Math.min(minRoadHeight,trackCenter(d).y+.078);
      const snowParticles=Boolean(world.scene.getObjectByName("biome-weather-particles"));
      // Mid-transition camera must swing AROUND, rather than clip through the pack.
      s.phase="RUNNING";s.raceMs=5550;
      for(let j=0;j<20;j++)world.render(s,.2);
      const orbitRadius=Math.hypot(world.camera.position.x-first.x,
        world.camera.position.z-first.z);
      return {front,pack,topIds:leaders.map(r=>r.id),groundTop,minRoadHeight,
        stagingWidth:staging.scale.x,stagingLength:staging.scale.z,
        stagingRoadTop:staging.position.y+staging.scale.y/2,
        snowParticles,orbitRadius};
    }finally{avatars.clear();world.dispose();canvas.remove();}
  });
  expect(observed.front).toBeGreaterThan(15);
  const leaders=observed.pack.filter(r=>r.position<=3);
  expect(leaders.map(r=>r.id).sort()).toEqual([...observed.topIds].sort());
  expect(leaders.map(r=>r.lane).sort()).toEqual([1,2,3]);
  expect(leaders.every(r=>Math.abs(r.relative)<.5)).toBe(true);
  const second=observed.pack.filter(r=>r.position>=4&&r.position<=6);
  const third=observed.pack.filter(r=>r.position>=7&&r.position<=9);
  expect(second.every(r=>r.relative<-2.4&&r.relative>-3.0)).toBe(true);
  expect(third.every(r=>r.relative<-5&&r.relative>-5.6)).toBe(true);
  expect(observed.groundTop).toBeLessThan(observed.minRoadHeight);
  expect(observed.stagingLength).toBeGreaterThan(48);
  expect(observed.stagingWidth).toBeGreaterThan(10);
  expect(observed.stagingRoadTop).toBeGreaterThan(observed.groundTop);
  expect(observed.snowParticles).toBe(false);
  expect(observed.orbitRadius).toBeGreaterThan(12);
});
test("v4.0.2 live preview opens in a front-facing three-column starting formation",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1&biome=ice&v=4.0.2",{
    waitUntil:"domcontentloaded"
  });
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25000});
  await page.waitForTimeout(700);
  await page.screenshot({path:join(root,"reference-ice-clean-road-frontal-grid.png"),fullPage:true});
  const event=await page.evaluate(()=>({
    phase:document.body.dataset.phase,
    snowNotice:document.getElementById("liveWeatherTag").textContent,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  }));
  expect(event.phase).toBe("running");
  expect(event.overflow).toBeLessThanOrEqual(1);
});

test("v4.0.3 Android operator can manually spotlight a chosen active participant",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  await expect(page.locator("#focusRunnerSelect")).toBeVisible();
  await expect(page.locator("#focusRunnerButton")).toBeDisabled();
  const stateBefore=await (await request.get("/api/state")).json();
  expect(stateBefore.state.phase).toBe("LOBBY");
  const runner=stateBefore.state.active[0];
  expect(runner).toBeTruthy();
  await action(request,"advance");
  await action(request,"advance");
  await expect(page.locator("#focusRunnerButton")).toBeEnabled({timeout:25000});
  await page.locator("#focusRunnerSelect").selectOption(runner.id);
  await page.locator("#adminKey").fill(ADMIN);
  await page.locator("#focusRunnerButton").click();
  await expect(page.locator("#manualFocusStatus")).toContainText("Close manual",{timeout:12000});
  const after=await (await request.get("/api/state")).json();
  expect(after.state.manualCamera.id).toBe(runner.id);
  expect(after.state.manualCamera.untilRaceMs-after.state.manualCamera.startRaceMs).toBe(5000);
  expect(after.state.active.find(r=>r.id===runner.id).baseSpeed).toBe(runner.baseSpeed);
});
test("v4.0.3 camera switches from front to behind the pack on the exact start frame",async({page})=>{
  await page.goto("/?view=live&quality=low&showcase=1",{waitUntil:"domcontentloaded"});
  const positions=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createState,register,advance}=await import("/src/engine.js");
    const {trackCenter}=await import("/src/track-path.js");
    const canvas=document.createElement("canvas");
    canvas.style.cssText="position:absolute;left:-9999px;width:320px;height:620px";
    document.body.append(canvas);
    const world=createWorld(canvas,{quality:"low"});
    const state=createState(13);
    for(let i=0;i<9;i++)register(state,"p"+i,"Player "+i,"entrar");
    advance(state);
    try{
      world.setMap("ice",400);
      const origin=trackCenter(0),dx=Math.sin(origin.heading),dz=Math.cos(origin.heading);
      const signed=()=>((world.camera.position.x-origin.x)*dx+
        (world.camera.position.z-origin.z)*dz);
      world.render(state,.016);
      const countdown=signed();
      advance(state);
      world.render(state,.016);
      return {countdown,launched:signed(),phase:state.phase};
    }finally{world.dispose();canvas.remove();}
  });
  expect(positions.countdown).toBeGreaterThan(15);
  expect(positions.launched).toBeLessThan(-15);
  expect(positions.phase).toBe("RUNNING");
});
