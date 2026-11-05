import {test,expect} from '@playwright/test';

// Isolated browser preview: it never registers real viewers, sends gifts,
// changes server state or enables a streaming account.
const URL='/?view=live&studioPreview=1&quality=low';
const CHECKS=[
  '.studio-channel','.studio-viewers','.studio-ranking',
  '.studio-race-data','.studio-chat','.studio-interactions'
];

async function openPreview(page,width,height){
  await page.setViewportSize({width,height});
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#studioLive')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__studioV5Debug?.getSceneStats()?.runners),
    {timeout:30000}).toBe(100);
  await expect(page.locator('#studioRunnerCount')).toHaveText('100/100');
}

async function inspectHud(page){
  return page.evaluate(selectors=>{
    const stage=document.querySelector('#studioLive');
    const b=stage.getBoundingClientRect();
    const box=selector=>{
      const node=document.querySelector(selector);
      if(!node)return null;
      const r=node.getBoundingClientRect();
      return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,
        width:r.width,height:r.height,visible:r.width>0&&r.height>0};
    };
    const boxes=Object.fromEntries(selectors.map(s=>[s,box(s)]));
    const intersect=(a,c)=>Math.max(0,Math.min(a.right,c.right)-Math.max(a.left,c.left))*
      Math.max(0,Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top));
    const overlap=[];
    for(let i=0;i<selectors.length;i++)for(let j=i+1;j<selectors.length;j++){
      const area=intersect(boxes[selectors[i]],boxes[selectors[j]]);
      if(area>4)overlap.push({a:selectors[i],b:selectors[j],px2:Math.round(area)});
    }
    const topLimit=b.top+b.height*(120/1920)-1.5;
    const bottomLimit=b.bottom-b.height*(220/1920)+1.5;
    const outOfSafe=selectors.filter(s=>boxes[s].visible&&
      (boxes[s].top<topLimit||boxes[s].bottom>bottomLimit));
    return {
      viewport:{width:innerWidth,height:innerHeight},
      body:{scrollWidth:document.body.scrollWidth,scrollHeight:document.body.scrollHeight},
      stage:{left:b.left,top:b.top,width:b.width,height:b.height},
      overlap,outOfSafe,boxes,
      nameplates:document.querySelectorAll('.studio-nameplate').length,
      mapPath:document.getElementById('studioMapPath')?.getAttribute('d')?.length||0,
      stats:window.__studioV5Debug.getSceneStats(),
      watchdog:window.__studioV5Debug.getWatchdog()
    };
  },CHECKS);
}

for(const profile of [
  {name:'transmissão nativa 1080x1920',width:1080,height:1920},
  {name:'Android intermediário emulado 360x800',width:360,height:800}
]){
  test('Parte 9: HUD seguro e sem sobreposição — '+profile.name,async({page})=>{
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await openPreview(page,profile.width,profile.height);
    const audit=await inspectHud(page);
    expect(audit.stage.width/audit.stage.height).toBeCloseTo(9/16,2);
    expect(audit.body.scrollWidth).toBeLessThanOrEqual(profile.width+2);
    expect(audit.body.scrollHeight).toBeLessThanOrEqual(profile.height+2);
    expect(audit.overlap).toEqual([]);
    expect(audit.outOfSafe).toEqual([]);
    expect(audit.nameplates).toBeLessThanOrEqual(12);
    expect(audit.mapPath).toBeGreaterThan(40);
    expect(audit.stats.cameraCount).toBe(1);
    expect(audit.stats.runners).toBe(100);
    expect(audit.stats.drawCalls).toBeLessThan(30);
    expect(audit.stats.triangles).toBeLessThan(55000);
    expect(audit.watchdog.renderErrors).toBe(0);
    expect(errors).toEqual([]);
    await page.screenshot({path:'test-results/parte9-'+profile.width+'x'+profile.height+'.png'});
    await test.info().attach('parte9-hud-'+profile.width+'x'+profile.height+'.json',{
      body:Buffer.from(JSON.stringify(audit,null,2)),contentType:'application/json'
    });
  });
}

test('Parte 9: medir FPS real do navegador, qualidade adaptativa e recuperação',async({page})=>{
  await openPreview(page,360,800);
  const before=await page.evaluate(()=>({
    state:window.__studioV5Debug.getState(),
    stats:window.__studioV5Debug.getSceneStats()
  }));
  expect(before.state.active).toHaveLength(100);
  const frames=await page.evaluate(async()=>{
    const duration=5500;
    return await new Promise(resolve=>{
      let start=0,last=0,n=0,longFrames=0;
      function frame(now){
        if(!start)start=now;
        if(last&&now-last>50)longFrames++;
        last=now;n++;
        if(now-start>=duration){
          resolve({durationMs:now-start,frames:n-1,
            fps:Math.round((n-1)*1000/(now-start)*10)/10,longFrames});
        }else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  });
  const after=await inspectHud(page);
  const report={profile:'Android emulado 360x800, Chromium headless',
    frames,sceneBefore:before.stats,sceneAfter:after.stats,
    watchdog:after.watchdog,observedAt:new Date().toISOString()};
  await test.info().attach('parte9-fps.json',{
    body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'
  });
  expect(frames.frames).toBeGreaterThan(0);
  expect(after.stats.cameraCount).toBe(1);
  expect(after.stats.runners).toBe(100);
  expect(after.stats.drawCalls).toBeLessThan(30);
  expect(after.stats.renderScale).toBeGreaterThanOrEqual(.62);
  expect(after.stats.renderScale).toBeLessThanOrEqual(1);
  expect(after.watchdog.renderErrors).toBe(0);
  const minimum=Number(process.env.STUDIO_MIN_FPS||0);
  if(Number.isFinite(minimum)&&minimum>0)expect(frames.fps).toBeGreaterThanOrEqual(minimum);
});


test('Vídeo referência: lobby mantém apenas inscrição e corrida exibe HUD completo',async({page})=>{
  await openPreview(page,390,693);
  await expect(page.locator('#studioGuide')).toBeVisible();
  await expect(page.locator('.studio-ranking')).toBeHidden();
  await expect(page.locator('.studio-race-data')).toBeHidden();
  await expect(page.locator('.studio-minimap')).toBeHidden();
  await page.evaluate(async()=>{
    const engine=await import('/src/studio-engine.js');
    const current=window.__studioV5Debug.getState();
    engine.studioAdvance(current);engine.studioAdvance(current);
    engine.studioTick(current,1500);
  });
  await expect(page.locator('.studio-ranking')).toBeVisible();
  await expect(page.locator('.studio-race-data')).toBeVisible();
  await expect(page.locator('.studio-minimap')).toBeVisible();
  await expect(page.locator('#studioGuide')).toBeHidden();
});

test('Vídeo referência: prévia com 20 participantes mantém capacidade 100',async({page})=>{
  await page.setViewportSize({width:390,height:693});
  await page.goto('/?view=live&studioPreview=1&quality=low&crowd=20',{
    waitUntil:'domcontentloaded'
  });
  await expect(page.locator('#studioLive')).toBeVisible();
  await expect.poll(()=>page.evaluate(
    ()=>window.__studioV5Debug?.getSceneStats()?.runners),{timeout:30000}).toBe(20);
  const result=await page.evaluate(()=>({
    count:window.__studioV5Debug.getState()?.active?.length,
    capacity:document.getElementById('studioRunnerCount')?.textContent,
    phase:window.__studioV5Debug.getState()?.phase
  }));
  expect(result.count).toBe(20);
  expect(result.capacity).toBe('20/100');
  expect(result.phase).toBe('LOBBY');
});
