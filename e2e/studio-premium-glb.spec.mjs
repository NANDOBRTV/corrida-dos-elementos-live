import {test,expect} from "@playwright/test";

test.skip(process.env.TEST_PREMIUM_GLB!=="1",
  "GLB downloads are validated by the dedicated premium asset workflow");

test("Fusca, Uno, Palio, Civic, Opala load real licensed GLB models and Uno retains its ladder",async({page,request})=>{
  for(const file of ["volkswagen-fusca.glb","fiat-uno.glb",
    "fiat-palio.glb","honda-civic.glb","chevrolet-opala.glb"]){
    const res=await request.get("/assets/models/"+file);
    expect(res.status(),file).toBe(200);
    const data=await res.body();
    expect(data.toString("utf8",0,4)).toBe("glTF");
  }
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:693});
  await page.goto("/?view=live&studioPreview=1&quality=high&crowd=6&hero=1",
    {waitUntil:"domcontentloaded"});
  await expect(page.locator("#studioLive")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.premiumReadyModels),
    {timeout:85000}).toBe(5);
  await expect.poll(()=>page.evaluate(()=>
    window.__studioV5Debug?.getSceneStats()?.premiumActiveVehicles),
    {timeout:85000}).toBe(5);
  const results=await page.evaluate(()=>
    window.__studioV5Debug.getSceneStats());
  expect(results.heroUniqueModels).toBe(6);
  expect(results.realCarModels).toBe(6);
  expect(results.unoLadderRungs).toBe(12);
  expect(results.premiumFailedModels).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({path:"test-results/ultra-six-real-glb-cars.png"});
  const credits=await request.get("/assets/hero-credits.html");
  expect(credits.status()).toBe(200);
  const txt=await credits.text();
  expect(txt).toContain("subishi");
  expect(txt).toContain("cacatua");
  expect(txt).toContain("coptrum");
});
