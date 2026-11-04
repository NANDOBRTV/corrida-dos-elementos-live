import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTikTokGift} from "../server/tiktok.js";
import {applyGiftEvent,createGiftDeduplicator,GIFT_TURBO_MS} from "../src/gifts.js";
import {createState,register,advance} from "../src/engine.js";
import {createApp} from "../server/index.js";

const gift=(props={})=>({
  userId:"viewer-12",displayName:"Pessoa 12",giftId:"565",giftName:"Rosa",
  repeatCount:1,eventId:"a-1",...props
});
const liveGift=(props={})=>({
  giftId:"565",gift:{type:1,name:"Rosa",diamondCount:1},
  user:{userId:"viewer-12",nickname:"Pessoa 12"},
  repeatCount:3,repeatEnd:1,groupId:"combo-1",
  common:{msgId:"msg-901"},...props
});

test("Streak de presente só aplica evento após mensagem final",()=>{
  assert.equal(normalizeTikTokGift(liveGift({repeatEnd:0})),null);
  assert.equal(normalizeTikTokGift(liveGift({repeatEnd:false})),null);
  assert.equal(normalizeTikTokGift(liveGift({repeatEnd:1}))?.repeatCount,3);
  assert.equal(normalizeTikTokGift(liveGift({repeatEnd:true}))?.giftName,"Rosa");
});
test("Presente sem streak processa evento único",()=>{
  const normalized=normalizeTikTokGift(liveGift({gift:{type:2,name:"Coração"},repeatEnd:0,repeatCount:2}));
  assert.equal(normalized?.giftName,"Coração");
  assert.equal(normalized?.repeatCount,2);
});
test("Identificador e nome são normalizados com limite",()=>{
  const normalized=normalizeTikTokGift(liveGift({user:{uniqueId:"espectador_teste",nickname:"Abc"},giftId:42}));
  assert.equal(normalized.userId,"espectador_teste");
  assert.equal(normalized.giftId,"42");
  assert.equal(normalized.displayName,"Abc");
});
test("Eventos sem remetente ou giftId não são válidos",()=>{
  assert.equal(normalizeTikTokGift(liveGift({user:{}})),null);
  assert.equal(normalizeTikTokGift(liveGift({giftId:undefined,gift:{type:2}})),null);
});
test("Rejeita quantidade zero ou inválida",()=>{
  assert.equal(normalizeTikTokGift(liveGift({repeatCount:0})),null);
  assert.equal(normalizeTikTokGift(liveGift({repeatCount:Infinity})),null);
});
test("Combos com groupId são contados uma vez",()=>{
  const gate=createGiftDeduplicator();
  assert.equal(gate.accept(gift({groupId:"combo-9",eventId:"frame-a"}),1000),true);
  assert.equal(gate.accept(gift({groupId:"combo-9",eventId:"frame-b"}),1100),false);
  assert.equal(gate.accept(gift({groupId:"combo-10",eventId:"frame-c"}),1200),true);
});
test("Eventos repetidos por msgId são descartados",()=>{
  const gate=createGiftDeduplicator();
  assert.equal(gate.accept(gift({eventId:"same"}),1000),true);
  assert.equal(gate.accept(gift({eventId:"same"}),1001),false);
  assert.equal(gate.accept(gift({eventId:"new"}),1002),true);
});
test("Deduplicação mantém limite de memória e prazo",()=>{
  const gate=createGiftDeduplicator({max:2,ttlMs:500});
  assert.equal(gate.accept(gift({eventId:"a"}),1000),true);
  assert.equal(gate.accept(gift({eventId:"b"}),1100),true);
  assert.equal(gate.accept(gift({eventId:"c"}),1200),true);
  assert.equal(gate.size(),2);
  assert.equal(gate.accept(gift({eventId:"b"}),1800),true);
});
test("Gift Turbo: corredor recebe exatamente 4 segundos",()=>{
  const state=createState();
  assert.equal(register(state,"viewer-12","Pessoa 12","entrar").ok,true);
  advance(state);advance(state);
  const result=applyGiftEvent(state,gift());
  assert.equal(result.effect,"turbo");
  assert.equal(state.active[0].turboUntil-state.raceMs,GIFT_TURBO_MS);
  assert.equal(state.gifts[0].simulated,false);
});
test("Vários presentes não acumulam turbo na mesma rodada",()=>{
  const state=createState();
  register(state,"viewer-12","Pessoa 12","entrar");
  advance(state);advance(state);
  const r1=applyGiftEvent(state,gift());
  const until=state.active[0].turboUntil;
  const r2=applyGiftEvent(state,gift({eventId:"b-2",repeatCount:30}));
  assert.equal(r1.effect,"turbo");
  assert.equal(r2.effect,"agradecimento");
  assert.equal(state.active[0].turboUntil,until);
});
test("Durante lobby, gift é agradecido sem turbo",()=>{
  const state=createState();
  register(state,"viewer-12","Pessoa 12","entrar");
  assert.equal(applyGiftEvent(state,gift()).effect,"agradecimento");
  assert.equal(state.active[0].turboUntil,0);
});
test("Espectadores não inscritos não ganham corredor ou vantagens",()=>{
  const state=createState();
  advance(state);advance(state);
  const r=applyGiftEvent(state,gift());
  assert.equal(r.effect,"agradecimento");
  assert.equal(state.active.length,0);
});
test("Histórico visual de presentes é limitado e marcado como teste",()=>{
  const state=createState();
  for(let i=0;i<30;i++)applyGiftEvent(state,gift({eventId:"g-"+i,simulated:true}));
  assert.equal(state.gifts.length,8);
  assert.equal(state.messages.length,8);
  assert.equal(state.gifts[0].simulated,true);
});
test("API de presente simulado exige ADMIN_KEY",async t=>{
  const app=await createApp({adminKey:"gift-test-secret",storage:{
    enabled:false,load:async()=>null,close:async()=>{}
  },disableTikTok:true});
  const address=await app.listen(0);
  t.after(()=>app.close());
  const base="http://127.0.0.1:"+address.port;
  const attempt=await fetch(base+"/api/admin/action",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"gift-test"})
  });
  assert.equal(attempt.status,401);
  const good=await fetch(base+"/api/admin/action",{
    method:"POST",headers:{"Content-Type":"application/json","x-admin-key":"gift-test-secret"},
    body:JSON.stringify({action:"gift-test"})
  });
  assert.equal(good.status,200);
  const data=await good.json();
  assert.equal(data.simulated,true);
  assert.equal(data.state.gifts[0].giftName,"Rosa de teste");
});
