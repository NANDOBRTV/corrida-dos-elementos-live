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
  expect(result.vehicleCounts.kart).toBeGreaterThan(0);
  expect(result.vehicleCounts.moto).toBeGreaterThan(0);
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
  await expect(page.locator(".live-mini-finish")).toContainText("5000 m");
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
  await expect(page.locator("#liveMiniFinish")).toHaveText("🏁 5000 m");
  await expect(page.locator("#liveRemaining")).toContainText("m até a chegada");
});


test("v2.7 streams only a 600m scenery window over a real 5km course",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const measurements=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const c=document.createElement("canvas");
    c.style.cssText="position:absolute;left:-9999px;top:0;width:280px;height:440px";
    document.body.append(c);
    const world=createWorld(c,{quality:"low"});
    const race={phase:"RUNNING",raceMs:1000,active:[{id:"test",lane:2,progress:0,
      color:"#65d9fa",turboUntil:0,status:"running"}]};
    const data=[];
    try{
      for(const map of ["ice","forest"]){
        world.setMap(map,5000);
        world.resize();
        const root=world.scene.children.find(x=>x.isGroup&&x.name!=="absolute-finish-line");
        const finish=world.scene.getObjectByName("absolute-finish-line");
        const labels=[];
        finish.traverse(o=>{if(o.isSprite)labels.push(o.position.z+finish.position.z)});
        const initial=world.scene.children.length;
        let count=0;
        root.traverse(o=>{if(o.isInstancedMesh)count+=o.count;else if(o.isMesh)count++;});
        const positions=[];
        for(const z of [0,299,499,500,780,4900,4998]){
          race.active[0].progress=z;
          world.render(race,.016);
          positions.push(root.userData.baseDistance);
          let afterCount=0;
          root.traverse(o=>{if(o.isInstancedMesh)afterCount+=o.count;else if(o.isMesh)afterCount++;});
          if(afterCount!==count)throw Error("GPU objects unexpectedly grow during 5km stream");
          if(world.scene.children.length!==initial)throw Error("Scene nodes leaked while streaming");
        }
        data.push({map,labels,positions,count,finishObjects:finish.children.length});
      }
    }finally{world.dispose();c.remove();}
    return data;
  });
  expect(measurements).toHaveLength(2);
  for(const m of measurements){
    expect(m.count).toBeGreaterThan(100);
    expect(m.count).toBeLessThan(2500);
    expect(m.labels[0]).toEqual(expect.any(Number));
    expect(Math.abs(m.labels[0])).toBeGreaterThan(100);
    expect(m.finishObjects).toBeGreaterThan(1);
    expect(m.positions[0]).toBe(0);
    expect(m.positions[3]).toBe(300);
    expect(m.positions[5]).toBeGreaterThanOrEqual(4500);
    expect(m.positions[6]).toBeLessThanOrEqual(4800);
  }
});

test("v3.1 5km bends actually deform lane asphalt, scenery, avatars and finish",async({page,request})=>{
  await reset(request);
  await start(page,"?view=operator&quality=low");
  const observed=await page.evaluate(async()=>{
    const {createWorld}=await import("/src/world.js");
    const {createAvatars}=await import("/src/avatars.js");
    const {trackPoint,trackCenter}=await import("/src/track-path.js");
    const THREE=await import("three");
    const c=document.createElement("canvas");
    c.style.cssText="position:absolute;left:-9999px;top:0;width:280px;height:440px";
    document.body.append(c);
    const world=createWorld(c,{quality:"low"});
    const race={phase:"RUNNING",raceMs:5000,active:[
      {id:"curve-guest",name:"Curva",lane:3,progress:900,color:"#65d9fa",turboUntil:0,status:"running"}
    ]};
    const avatars=createAvatars(world.scene,{quality:"low"});
    const frames=[];
    try{
      for(const biome of ["ice","forest"]){
        world.setMap(biome,5000);
        for(const dist of [0,300,900,1500,2700,3900,4950]){
          race.active[0].progress=dist;
          world.render(race,.016);
          avatars.sync(race.active);avatars.animate(race.active,"RUNNING",.016,1000);
          const runner=world.scene.getObjectByName("blocky-runner-0");
          const asphalt=world.scene.getObjectByName("course-asphalt");
          const milestones=world.scene.getObjectByName("course-milestones");
          const finish=world.scene.getObjectByName("absolute-finish-line");
          const expected=trackPoint(dist,1.85,.76);
          const batch=world.scene.getObjectByName("voxel-batch");
          frames.push({
            biome,dist,runnerX:runner.position.x,runnerY:runner.position.y,
            yaw:runner.rotation.y,expectedX:expected.x,expectedY:expected.y,
            asphaltX:asphalt.geometry.attributes.position.array[0],
            base:world.scene.getObjectByName("streamed-course").userData.baseDistance,
            finishX:finish.position.x,finishZ:finish.position.z,
            checkpointCount:milestones.children.length,
            batchCount:batch.count
          });
        }
      }
    }finally{avatars.clear();world.dispose();c.remove();}
    return {frames,finishX:trackCenter(5000).x,finishZ:trackCenter(5000).z};
  });
  for(const x of observed.frames){
    expect(Math.abs(x.runnerX-x.expectedX)).toBeLessThan(2);
    expect(Math.abs(x.runnerY-x.expectedY)).toBeLessThan(.01);
    expect(x.checkpointCount).toBe(9);
    expect(x.finishZ).toBeCloseTo(observed.finishZ,3);
    expect(x.finishX).toBeCloseTo(observed.finishX,3);
    expect(x.batchCount).toBeGreaterThan(0);
  }
  expect(new Set(observed.frames.filter(x=>x.biome==="ice").map(x=>Math.round(x.asphaltX))).size).toBeGreaterThan(2);
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

test("v3.2 hairpin showcase opens inside the U-turn without changing the real server",async({page,request})=>{
  const before=await (await request.get("/api/state")).json();
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  await page.goto("/?view=live&quality=low&showcase=1&section=hairpin&biome=ice",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#playerCount")).toHaveText("50",{timeout:25_000});
  await expect(page.locator("#remoteMode")).toContainText("PRÉVIA VISUAL LOCAL");
  await expect(page.locator("#phaseName")).toContainText("CORRIDA EM ANDAMENTO");
  await page.waitForTimeout(1000);
  const info=await page.evaluate(async()=>{
    const {trackCenter}=await import("/src/track-path.js");
    const a=trackCenter(1400),b=trackCenter(1770);
    return {turn:Math.abs(b.heading-a.heading),
      progress:document.getElementById("liveRemaining").textContent,
      map:document.getElementById("liveMiniMapName").textContent,
      path:document.getElementById("liveCoursePath").getAttribute("d")?.length,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  expect(info.turn).toBeGreaterThan(3);
  expect(info.progress).toContain("m até a chegada");
  expect(info.map).toContain("GELO");
  expect(info.path).toBeGreaterThan(2000);
  expect(info.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({path:join(root,"reference-hairpin-50-runners.png"),fullPage:true});
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
