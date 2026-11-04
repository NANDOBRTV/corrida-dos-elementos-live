import test from "node:test";
import assert from "node:assert/strict";
import {resolveQuality,qualityFromUrl,QUALITY_SETTINGS,shouldRender} from "../src/performance.js";
import {createState,register,advance,tick,rank} from "../src/engine.js";
import {BIOME_ORDER,mapForRound,TRACK_LENGTH} from "../src/config.js";
import {createApp} from "../server/index.js";

test("Android com 4 GB de memória escolhe perfil Leve automaticamente",()=>{
  assert.equal(resolveQuality("auto",{memory:4,cores:8}),"low");
  assert.equal(resolveQuality("auto",{memory:8,cores:4}),"low");
  assert.equal(resolveQuality("auto",{memory:8,cores:8}),"balanced");
  assert.equal(resolveQuality("auto",{memory:16,cores:8}),"high");
});
test("A preferência explícita respeita o URL da transmissão",()=>{
  for(const key of ["low","balanced","high"]){
    assert.equal(qualityFromUrl("?view=live&quality="+key,{memory:2}),key);
  }
  assert.equal(qualityFromUrl("?quality=invalid",{memory:4}),"low");
  assert.equal(qualityFromUrl("?view=operator",{memory:4}),"low");
});
test("Limites de FPS priorizam perfil Leve",()=>{
  assert.equal(QUALITY_SETTINGS.low.targetFps,30);
  assert.equal(QUALITY_SETTINGS.low.shadows,false);
  assert.equal(QUALITY_SETTINGS.low.pixelRatio,1);
  assert.equal(QUALITY_SETTINGS.balanced.targetFps,45);
  assert.equal(QUALITY_SETTINGS.high.targetFps,60);
  assert.equal(QUALITY_SETTINGS.low.sceneStep,2);
});
test("Agendador de frames desacopla 30 FPS do motor da corrida",()=>{
  assert.equal(shouldRender(20,0,30),false);
  assert.equal(shouldRender(34,0,30),true);
  assert.equal(shouldRender(17,0,60),true);
  assert.equal(shouldRender(17,0,30),false);
  assert.equal(shouldRender(40,0,0),true);
});
test("Dez rodadas com cinquenta corredores alternam Gelo e Floresta",()=>{
  const game=createState(123);
  for(let round=1;round<=10;round++){
    assert.equal(game.phase,"LOBBY");
    assert.equal(game.round,round);
    assert.equal(game.mapId,mapForRound(round));
    for(let index=0;index<50;index++){
      assert.equal(register(game,"player-"+index,"Atleta "+index,"entrar").ok,true);
    }
    assert.equal(game.active.length,50);
    assert.equal(register(game,"player-50","Extra","entrar").ok,false);
    advance(game);advance(game);
    // Finish-location fast-forward keeps this deterministic 10-round test fast.
    for(const r of game.active)r.progress=TRACK_LENGTH-3;
    let steps=0;
    while(game.phase==="RUNNING"&&steps++<150)tick(game,100);
    assert.equal(game.phase,"RESULTS");
    assert.equal(game.results.length,50);
    assert.equal(rank(game.active)[0].progress,TRACK_LENGTH);
    assert.equal(game.history[0].mapId,BIOME_ORDER[(round-1)%BIOME_ORDER.length]);
    assert.equal(game.history[0].round,round);
    assert.ok(game.history.length<=12);
    assert.ok(game.seasonLeaders.length<=100);
    advance(game);
    assert.equal(game.active.length,0,"Ninguém entra automaticamente na próxima rodada");
  }
  assert.equal(game.round,11);
  assert.equal(game.mapId,"ice");
  assert.equal(game.history.length,10);
});
test("Render em pré-lançamento não conecta o chat real por padrão",async()=>{
  const previous=process.env.TIKTOK_LIVE_MODE;
  process.env.TIKTOK_LIVE_MODE="disabled";
  const storage={enabled:false,load:async()=>null,close:async()=>{}};
  let app;
  try{
    app=await createApp({adminKey:"prelaunch-test",storage,seedDemo:false});
    const address=await app.listen(0);
    const url="http://127.0.0.1:"+address.port;
    const health=await (await fetch(url+"/health")).json();
    assert.equal(health.liveEventsMode,"staged");
    assert.equal(health.tiktokConnected,false);
    const state=await (await fetch(url+"/api/state")).json();
    assert.equal(state.liveEventsMode,"staged");
    assert.equal(state.tiktokConnected,false);
    assert.equal(state.ok,true);
  }finally{
    if(app)await app.close();
    if(previous===undefined)delete process.env.TIKTOK_LIVE_MODE;
    else process.env.TIKTOK_LIVE_MODE=previous;
  }
});
