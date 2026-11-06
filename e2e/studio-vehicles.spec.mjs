import {test,expect} from "@playwright/test";

test("Frota original de 30 modelos: 20 carros, 10 motos visíveis em 9:16",async({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:693});
  await page.goto("/?view=live&studioPreview=1&quality=low&crowd=30",
    {waitUntil:"domcontentloaded"});
  await expect(page.locator("#studioLive")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.runners)).toBe(30);
  const snapshot=await page.evaluate(()=>({
    vehicles:window.__studioV5Debug.getState().active.map(v=>({
      vehicleId:v.vehicleId,kind:v.vehicleKind,name:v.name
    })),
    stats:window.__studioV5Debug.getSceneStats()
  }));
  expect(snapshot.vehicles).toHaveLength(30);
  expect(new Set(snapshot.vehicles.map(v=>v.vehicleId)).size).toBe(30);
  expect(snapshot.vehicles.filter(v=>v.kind==="car")).toHaveLength(20);
  expect(snapshot.vehicles.filter(v=>v.kind==="motorcycle")).toHaveLength(10);
  expect(snapshot.vehicles[0].name).toBe("Civic");
  expect(snapshot.vehicles[2].name).toBe("CG 160");
  expect(snapshot.stats.realCarModels).toBe(20);
  expect(snapshot.stats.realMotorcycleModels).toBe(10);
  // Every motorcycle has exactly one modeled, helmeted rider.
  expect(snapshot.stats.motorcycleRiders).toBe(10);
  expect(snapshot.stats.realWheels).toBe(20*4+10*2);
  expect(snapshot.stats.realDetailMeshes).toBeGreaterThan(10);
  expect(snapshot.stats.cameraCount).toBe(1);
  expect(snapshot.stats.drawCalls).toBeLessThan(60);
  expect(snapshot.stats.triangles).toBeLessThan(200000);
  expect(errors).toEqual([]);
  await page.screenshot({path:"test-results/frota-30-carros-motos.png"});
  await page.evaluate(async()=>{
    const {studioAdvance,studioTick}=await import("/src/studio-engine.js");
    const state=window.__studioV5Debug.getState();
    studioAdvance(state);studioAdvance(state);
    studioTick(state,5000);
  });
  await expect.poll(()=>page.evaluate(
    ()=>window.__studioV5Debug.getState().phase)).toBe("RUNNING");
  await expect(page.locator("#studioRunnerCount")).toHaveText("30/100");
  await expect(page.locator(".studio-ranking")).toBeVisible();
  const names=await page.evaluate(()=>[...document.querySelectorAll(".studio-rank-name")]
    .map(n=>n.textContent));
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(n=>snapshot.vehicles.some(v=>v.name===n))).toBe(true);
  await page.screenshot({path:"test-results/corrida-veiculos-30.png"});
});

test("100 veículos são renderizados sem voltar a aparecer personagem humano",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto("/?view=live&studioPreview=1&quality=low&crowd=100",
    {waitUntil:"domcontentloaded"});
  await expect(page.locator("#studioLive")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.runners)).toBe(100);
  const x=await page.evaluate(()=>({
    ids:window.__studioV5Debug.getState().active.map(r=>r.vehicleId),
    stats:window.__studioV5Debug.getSceneStats()
  }));
  expect(new Set(x.ids).size).toBe(30);
  expect(x.ids).toHaveLength(100);
  expect(x.stats.realCarModels+x.stats.realMotorcycleModels).toBe(100);
  expect(x.stats.motorcycleRiders).toBe(x.stats.realMotorcycleModels);
  expect(x.stats.realWheels).toBe(x.stats.realCarModels*4+
    x.stats.realMotorcycleModels*2);
  expect(x.stats.cameraCount).toBe(1);
  expect(x.stats.drawCalls).toBeLessThan(60);
  expect(x.stats.triangles).toBeLessThan(200000);
});


test("Prévia: o usuário digita CG 160 no simulador de chat e entra exatamente com a moto",async({page})=>{
  await page.setViewportSize({width:390,height:693});
  await page.goto("/?view=live&studioPreview=1&quality=low&crowd=20",
    {waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getState()?.active?.length)).toBe(20);
  page.once("dialog",dialog=>dialog.accept("CG 160"));
  await page.locator("#studioJoin").click();
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getState().active.find(x=>x.id==="demo-selecao")?.vehicleId
  )).toBe("moto-cg160");
  await expect(page.locator("#studioToast")).toContainText("CG 160");
  const record=await page.evaluate(()=>
    window.__studioV5Debug.getState().active.find(x=>x.id==="demo-selecao"));
  expect(record.name).toBe("CG 160");
  expect(record.isBot).toBe(false);
  expect(record.vehicleKind).toBe("motorcycle");
  await expect(page.locator("#studioRunnerCount")).toHaveText("20/100");
});


test("Câmera 10s de close, depois top 3; mini lista e @usuário sobre o carro",async({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:693});
  await page.goto("/?view=live&studioPreview=1&quality=low&crowd=30",
    {waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.runners)).toBe(30);
  await page.evaluate(async()=>{
    const {studioAdvance,studioTick}=await import("/src/studio-engine.js");
    const state=window.__studioV5Debug.getState();
    studioAdvance(state);studioAdvance(state);studioTick(state,1500);
  });
  await expect(page.locator(".studio-vehicle-mini")).toBeVisible();
  await expect.poll(()=>page.locator("#studioVehicleList li").count()).toBe(7);
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getCameraShot().mode)).toBe("VEHICLE_CLOSEUP");
  const closeup=await page.evaluate(()=>{
    const state=window.__studioV5Debug.getState();
    const shot=window.__studioV5Debug.getCameraShot();
    const car=state.active.find(r=>r.id===shot.featuredId);
    car.driverName="@pilotoTeste";
    return {id:car.id,model:car.name,kind:car.vehicleKind};
  });
  expect(closeup.kind).toBe("car");
  await expect.poll(()=>page.locator(".studio-nameplate").filter({
    hasText:"@pilotoTeste"
  }).count(),{timeout:10000}).toBeGreaterThan(0);
  const first=await page.evaluate(()=>window.__studioV5Debug.getCameraShot());
  await page.evaluate(()=>{window.__studioV5Debug.getState().raceMs=10300;});
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getCameraShot().mode)).toBe("TOP_THREE");
  const leaders=await page.evaluate(()=>window.__studioV5Debug.getCameraShot());
  expect(leaders.focusIds).toHaveLength(3);
  expect(first.featuredId).not.toBe(null);
  await expect(page.locator("#studioCameraLabel")).toContainText("3 PRIMEIROS");
  await page.evaluate(()=>{window.__studioV5Debug.getState().raceMs=18300;});
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getCameraShot().mode)).toBe("VEHICLE_CLOSEUP");
  await expect(page.locator("#studioCameraLabel")).toContainText("CLOSE");
  expect(errors).toEqual([]);
  await page.screenshot({path:"test-results/closeup-username-mini-list.png"});
});
