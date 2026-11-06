import test from "node:test";
import assert from "node:assert/strict";
import {VEHICLES,CAR_COUNT,MOTO_COUNT,resolveVehicle,
  parseVehicleChoice,vehicleForBot} from "../src/vehicles.js";
import {createStudioState,studioJoin,studioFillBots,
  studioAdvance,studioTick} from "../src/studio-engine.js";
import {createStudioRuntime,validateStudioCheckpoint} from "../server/studio-runtime.js";
import {normalizeStudioChat,createStudioLiveBridge} from "../server/studio-live.js";

test("Veículos: catálogo fechado com vinte carros e dez motos distintos",()=>{
  assert.equal(CAR_COUNT,20);assert.equal(MOTO_COUNT,10);
  assert.equal(VEHICLES.length,30);
  assert.equal(new Set(VEHICLES.map(v=>v.id)).size,30);
  assert.equal(VEHICLES.filter(v=>v.kind==="car").length,20);
  assert.equal(VEHICLES.filter(v=>v.kind==="motorcycle").length,10);
  assert.ok(VEHICLES.every(v=>v.width>0&&v.length>0&&v.height>0));
  assert.equal(resolveVehicle("Civic").id,"car-civic");
  assert.equal(resolveVehicle("Gol").id,"car-gol");
  assert.equal(resolveVehicle("Uno").id,"car-uno");
  assert.equal(resolveVehicle("Strada").id,"car-strada");
  assert.equal(resolveVehicle("XRE 300").id,"moto-xre300");
  assert.equal(resolveVehicle("CB 300F Twister").id,"moto-cb300ftwister");
});

test("Chat: modelo exato ou entrar modelo, sem sorteio, nomes de pessoas rejeitados",()=>{
  for(const vehicle of VEHICLES){
    assert.equal(parseVehicleChoice(vehicle.name)?.id,vehicle.id);
    assert.equal(parseVehicleChoice("entrar "+vehicle.name.toUpperCase())?.id,
      vehicle.id);
    assert.equal(parseVehicleChoice("  "+vehicle.name+"  ")?.id,vehicle.id);
  }
  assert.equal(parseVehicleChoice("entrar cg160")?.name,"CG 160");
  assert.equal(parseVehicleChoice("CG 160")?.id,"moto-cg160");
  assert.equal(parseVehicleChoice("entrar S-10")?.id,"car-s10");
  assert.equal(parseVehicleChoice("entrar twister")?.id,"moto-cb300ftwister");
  for(const invalid of ["entrar","entrar Builderman","Ana","Roblox",
    "Civic Ferrari","entrar Ferrari","carro aleatorio","Civic Gol",
    "boa noite galera",""]){
    assert.equal(parseVehicleChoice(invalid),null,invalid);
  }
});

test("Escolha do usuário persiste no lobby, na fila seguinte e no pódio",()=>{
  const state=createStudioState({connected:true,seed:37});
  const first=studioJoin(state,{userId:"user-1",name:"Pessoa A",
    vehicleId:"car-civic"});
  const duplicateModel=studioJoin(state,{userId:"user-2",name:"Pessoa B",
    vehicleId:"car-civic"});
  const motorcycle=studioJoin(state,{userId:"user-3",name:"Pessoa C",
    vehicleId:"moto-xre300"});
  assert.equal(first.vehicleName,"Civic");
  assert.equal(duplicateModel.ok,true);
  assert.equal(motorcycle.vehicleName,"XRE 300");
  assert.deepEqual(state.active.map(x=>x.name),["Civic","Civic","XRE 300"]);
  assert.equal(new Set(state.active.map(x=>x.id)).size,3);
  assert.equal(studioJoin(state,{userId:"user-1",name:"Pessoa A",
    vehicleId:"car-uno"}).ok,false);
  assert.equal(studioJoin(state,{userId:"invalid",vehicleId:"car-ferrari"}).ok,false);
  studioAdvance(state);studioAdvance(state);
  const next=studioJoin(state,{userId:"late",name:"Pessoa T",
    vehicleId:"moto-cg160"});
  assert.deepEqual({ok:next.ok,queue:next.queue},
    {ok:true,queue:"próxima"});
  assert.equal(state.next[0].vehicleId,"moto-cg160");
  assert.equal(state.active.length,3);
  studioAdvance(state);
  assert.deepEqual(state.results.map(r=>r.vehicleId).sort(),
    ["car-civic","car-civic","moto-xre300"].sort());
  studioAdvance(state);
  assert.equal(state.active.length,1);
  assert.equal(state.active[0].vehicleId,"moto-cg160");
  assert.equal(state.active[0].name,"CG 160");
});

test("Bot de demonstração usa ordem fixa de 30 modelos, nunca sorteia seleção real",()=>{
  const state=createStudioState({seed:122});
  studioFillBots(state,{count:100});
  assert.equal(state.active.length,100);
  for(let index=0;index<100;index++){
    assert.equal(state.active[index].vehicleId,vehicleForBot(index).id);
    assert.equal(state.active[index].name,vehicleForBot(index).name);
  }
});

test("LIVE real inscreve pelo comentário com ID pseudônimo, sem avatar externo",async()=>{
  const runtime=createStudioRuntime({autoStart:false,sourceConnected:true});
  const bridge=createStudioLiveBridge({studio:runtime,identitySalt:
    "vehicle-test-salt-minimum-32-characters",enabled:false});
  const raw=(userId,comment,msgId)=>({
    user:{userId,nickname:"Usuário "+userId},comment,common:{msgId}
  });
  assert.equal(normalizeStudioChat(raw("a","Uno","1")).vehicleId,"car-uno");
  assert.equal(normalizeStudioChat(raw("b","entrar Biz 125","2")).vehicleId,
    "moto-biz125");
  const first=await bridge.chat(raw("a","Uno","join-1"));
  assert.equal(first.ok,true);
  assert.equal(runtime.snapshot().state.active[0].name,"Uno");
  assert.equal(runtime.snapshot().state.active[0].vehicleId,"car-uno");
  assert.equal((await bridge.chat(raw("b","entrar Biz 125","join-2"))).ok,true);
  assert.equal(runtime.snapshot().state.active[1].vehicleId,"moto-biz125");
  assert.equal((await bridge.chat(raw("a","Gol","join-3"))).ok,false);
  assert.equal((await bridge.chat(raw("c","Ferrari","join-4"))).ok,false);
  assert.equal(runtime.state().active.length,2);
  assert.ok(!JSON.stringify(runtime.snapshot()).includes('"userId":"a"'));
  await bridge.close();runtime.stop();
});

test("Checkpoint: seleção validada antes de ser armazenada ou restaurada",()=>{
  const state=createStudioState({connected:true});
  studioJoin(state,{userId:"abc",name:"Pessoa",vehicleId:"car-strada"});
  studioAdvance(state);studioAdvance(state);
  const runtime=createStudioRuntime({autoStart:false});
  const cp={format:"studio-v5-checkpoint",version:1,revision:3,
    savedAt:Date.now(),state,dedupe:[]};
  const restored=validateStudioCheckpoint(cp);
  assert.equal(restored.state.active[0].vehicleId,"car-strada");
  restored.state.active[0].vehicleId="car-madeup";
  assert.throws(()=>validateStudioCheckpoint(restored),/Checkpoint/);
  runtime.stop();
});
