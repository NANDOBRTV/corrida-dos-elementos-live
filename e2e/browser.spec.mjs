import {test,expect} from "@playwright/test";
import {createHash} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {join} from "node:path";

const root="e2e-artifacts";
const ADMIN="integration-test-only-not-for-real-render";
const maps=["forest","desert","volcano","ice","hell"];
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

test("five actual 3D biome screenshots differ in Android portrait",async({page,request})=>{
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
  expect(hashes.size,"Biomes should render as visually distinct environments").toBe(5);
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
