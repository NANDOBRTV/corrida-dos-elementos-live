import {test,expect} from "@playwright/test";

test.skip(process.env.TEST_PREMIUM_GLB!=="1",
  "GLB downloads are validated by the dedicated premium asset workflow");

test("Four intact licensed GLB cars load, and sculpted Opala/Gol remain and Uno retains its ladder",async({page,request})=>{
  for(const file of ["volkswagen-fusca.glb","fiat-uno.glb",
    "fiat-palio.glb","honda-civic.glb"]){
    const res=await request.get("/assets/models/"+file);
    expect(res.status(),file).toBe(200);
    const data=await res.body();
    expect(data.toString("utf8",0,4)).toBe("glTF");
  }
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:693});
  await page.goto("/?view=live&studioPreview=1&quality=high&crowd=6&hero=1&showcase=Uno",
    {waitUntil:"domcontentloaded"});
  await expect(page.locator("#studioLive")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.premiumReadyModels),
    {timeout:85000}).toBe(4);
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.premiumActiveVehicles),
    {timeout:85000}).toBe(4);
  const results=await page.evaluate(()=>
    window.__studioV5Debug.getSceneStats());
  expect(results.heroUniqueModels).toBe(6);
  expect(results.realCarModels).toBe(6);
  expect(results.unoLadderRungs).toBe(12);
  expect(results.premiumUnoLadders).toBe(1);
  expect(results.premiumFailedModels).toBe(0);
  console.log("PREMIUM_SOURCE_DIMS:"+JSON.stringify(results.premiumSourceDimensions));
  console.log("PREMIUM_ALIGNED_DIMS:"+JSON.stringify(results.premiumAlignedDimensions));
  expect(errors).toEqual([]);
  const lobby=await page.screenshot({path:"test-results/ultra-six-real-glb-cars.png",
    type:"jpeg",quality:68});
  console.log("VISUAL_IMAGE_PREMIUM_LOBBY:"+lobby.toString("base64"));
  await page.evaluate(async()=>{
    const engine=await import("/src/studio-engine.js");
    const state=window.__studioV5Debug.getState();
    engine.studioAdvance(state);engine.studioAdvance(state);
    engine.studioTick(state,4200);
  });
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug.getSceneStats().premiumActiveVehicles),
    {timeout:30000}).toBeGreaterThanOrEqual(1);
  const chosen=await page.evaluate(()=>{
    const state=window.__studioV5Debug.getState();
    const shot=window.__studioV5Debug.getCameraShot();
    return state.active.find(r=>r.id===shot.featuredId)?.vehicleId;
  });
  expect(chosen).toBe("car-uno");
  await page.waitForTimeout(900);
  const closeFov=await page.evaluate(()=>
    window.__studioV5Debug.getSceneStats().cameraFov);
  expect(closeFov).toBeLessThan(60);
  const close=await page.screenshot({path:"test-results/ultra-uno-ladder-close.jpg",
    type:"jpeg",quality:68});
  console.log("VISUAL_IMAGE_PREMIUM_CLOSE:"+close.toString("base64"));
  await page.evaluate(()=>{window.__studioV5Debug.getState().raceMs=12000;});
  await page.waitForTimeout(850);
  const topThree=await page.evaluate(()=>window.__studioV5Debug.getSceneStats());
  expect(topThree.cameraFov).toBeGreaterThan(60);
  const credits=await request.get("/assets/hero-credits.html");
  expect(credits.status()).toBe(200);
  const txt=await credits.text();
  expect(txt).toContain("subishi");
  expect(txt).toContain("cacatua");
  expect(txt).toContain("rifdanzz");
});
