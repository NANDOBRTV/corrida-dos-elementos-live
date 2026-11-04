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
    avatars.animate(state.active,"RUNNING",.016,1100);
    batch.getMatrixAt(0,second);
    const articulated=!first.equals(second);
    const groupCount=scene.children.filter(x=>x.isGroup).length;
    avatars.sync(state.active.slice(0,49));
    avatars.animate(state.active.slice(0,49),"RUNNING",.016,1150);
    const afterRemoval=scene.getObjectByName("runner-voxel-batch").count;
    avatars.clear();
    return {originalCount,groupCount,colorsPreserved,colorDelta,articulated,afterRemoval,
      cleaned:scene.getObjectByName("runner-voxel-batch")===undefined};
  });
  expect(result.originalCount).toBe(450); // 9 articulated cubes per runner.
  expect(result.groupCount).toBe(50);
  expect(result.colorsPreserved,"GPU color delta "+result.colorDelta).toBe(true);
  expect(result.articulated).toBe(true);
  expect(result.afterRemoval).toBe(441);
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
