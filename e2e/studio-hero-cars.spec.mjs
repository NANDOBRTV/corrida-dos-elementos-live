import {test,expect} from "@playwright/test";

test("Seis carros principais têm malhas individuais; Uno mostra escada com 12 degraus",async({page})=>{
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:693});
  await page.goto("/?view=live&studioPreview=1&quality=low&crowd=6&hero=1",
    {waitUntil:"domcontentloaded"});
  await expect(page.locator("#studioLive")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.heroUniqueModels),
    {timeout:30000}).toBe(6);
  const expected=["Fusca","Uno","Palio","Gol","Civic","Opala"];
  const data=await page.evaluate(()=>{
    const state=window.__studioV5Debug.getState();
    return {names:state.active.map(r=>r.name),
      ids:state.active.map(r=>r.vehicleId),
      kinds:state.active.map(r=>r.vehicleKind),
      stats:window.__studioV5Debug.getSceneStats()};
  });
  expect(data.names).toEqual(expected);
  expect(new Set(data.ids).size).toBe(6);
  expect(data.kinds.every(k=>k==="car")).toBe(true);
  expect(data.stats.realCarModels).toBe(6);
  expect(data.stats.realMotorcycleModels).toBe(0);
  expect(data.stats.heroModels).toBe(6);
  expect(data.stats.heroUniqueModels).toBe(6);
  expect(data.stats.unoLadderRungs).toBe(12);
  expect(data.stats.heroDetailParts).toBeGreaterThan(30);
  expect(data.stats.realWheels).toBe(24);
  expect(errors).toEqual([]);
  await page.screenshot({path:"test-results/hero-six-lobby.png"});

  await page.evaluate(async()=>{
    const {studioAdvance,studioTick}=await import("/src/studio-engine.js");
    const s=window.__studioV5Debug.getState();
    studioAdvance(s);studioAdvance(s);studioTick(s,4500);
  });
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getCameraShot().mode)).toBe("VEHICLE_CLOSEUP");
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getSceneStats().unoLadderRungs)).toBe(12);
  await expect(page.locator(".studio-vehicle-mini")).toBeVisible();
  await page.screenshot({path:"test-results/hero-six-closeup.png"});
});

test("Frota completa de 100 carros e motos mantém renderização otimizada",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto("/?view=live&studioPreview=1&quality=low&crowd=100",
    {waitUntil:"domcontentloaded"});
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.runners),
    {timeout:30000}).toBe(100);
  const s=await page.evaluate(()=>window.__studioV5Debug.getSceneStats());
  expect(s.heroUniqueModels).toBe(6);
  expect(s.unoLadderRungs).toBeGreaterThanOrEqual(12);
  expect(s.realCarModels+s.realMotorcycleModels).toBe(100);
  expect(s.motorcycleRiders).toBe(s.realMotorcycleModels);
  expect(s.cameraCount).toBe(1);
  expect(s.drawCalls).toBeLessThan(80);
  expect(s.triangles).toBeLessThan(250000);
});
