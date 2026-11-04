import test from "node:test";
import assert from "node:assert/strict";
import {createLiveDiagnostics} from "../server/telemetry.js";
import {createApp} from "../server/index.js";

test("Diagnóstico não armazena nomes, IDs ou conteúdo das mensagens",()=>{
  const diagnostics=createLiveDiagnostics({clock:()=>new Date("2026-11-04T10:00:00Z").toISOString()});
  diagnostics.connection({phase:"connecting"});
  diagnostics.observed({type:"chat",recognized:true,userId:"private-user-id",content:"entrar"});
  diagnostics.registration({ok:true,id:"private-user-id"});
  const report=diagnostics.snapshot({bridge:{enabled:true,connected:false}});
  assert.equal(report.connector.attempts,1);
  assert.equal(report.events.chatObserved,1);
  assert.equal(report.events.enterRecognized,1);
  assert.equal(report.events.registrationsAccepted,1);
  assert.ok(!JSON.stringify(report).includes("private-user-id"));
  assert.ok(!JSON.stringify(report).includes('"content"'));
});

test("Contadores de presentes simulados são separados dos presentes reais",()=>{
  const diagnostics=createLiveDiagnostics();
  diagnostics.observed({type:"gift",recognized:true});
  diagnostics.gift({ok:true,effect:"turbo"},false);
  diagnostics.gift({ok:true,effect:"agradecimento"},true);
  diagnostics.gift({ok:false,reason:"Evento duplicado"});
  const {events}=diagnostics.snapshot();
  assert.equal(events.giftObserved,1);
  assert.equal(events.giftsApplied,1);
  assert.equal(events.turbosApplied,1);
  assert.equal(events.simulatedGifts,1);
  assert.equal(events.duplicateGifts,1);
});

test("Última causa de desconexão é substituída após conexão",()=>{
  const diagnostics=createLiveDiagnostics();
  diagnostics.connection({phase:"connecting"});
  diagnostics.connection({phase:"retrying",reason:"live_not_active",connected:false});
  assert.equal(diagnostics.snapshot().connector.lastIssue,"live_not_active");
  diagnostics.connection({phase:"connected",connected:true});
  const snap=diagnostics.snapshot();
  assert.equal(snap.connector.lastIssue,null);
  assert.ok(snap.connector.lastConnectedAt);
});

test("API de diagnóstico exige autenticação e não revela tokens",async t=>{
  const secret="long-and-private-admin-secret-for-integration-testing";
  let handlers;
  const bridgeFactory=opts=>{
    handlers=opts;
    opts.onStatus({enabled:true,connected:true,phase:"connected"});
    return {enabled:true,status:()=>({enabled:true,connected:true}),close:async()=>{}};
  };
  const app=await createApp({adminKey:secret,storage:{
    enabled:false,load:async()=>null,close:async()=>{}
  },seedDemo:false,bridgeFactory});
  const address=await app.listen(0);
  t.after(()=>app.close());
  const base="http://127.0.0.1:"+address.port;
  const endpoint=base+"/api/admin/diagnostics";
  assert.equal((await fetch(endpoint)).status,401);
  assert.equal((await fetch(endpoint,{headers:{"x-admin-key":"invalid"}})).status,401);
  assert.equal((await fetch(endpoint,{method:"POST",headers:{"x-admin-key":secret}})).status,405);
  const getReport=async()=>{
    const response=await fetch(endpoint,{headers:{"x-admin-key":secret}});
    assert.equal(response.status,200);
    return (await response.json()).diagnostics;
  };
  handlers.onEvent({type:"chat",recognized:true});
  handlers.onChat({userId:"private-platform-identifier",displayName:"Ana",content:"entrar",eventId:"chat-1"});
  const joined=await getReport();
  assert.equal(joined.connector.connected,true);
  assert.equal(joined.events.chatObserved,1);
  assert.equal(joined.events.registrationsAccepted,1);
  assert.equal(joined.game.current,1);
  // Complete the countdown so the gift can boost the registered runner.
  for(let i=0;i<2;i++) {
    const response=await fetch(base+"/api/admin/action",{
      method:"POST",headers:{"Content-Type":"application/json","x-admin-key":secret},
      body:JSON.stringify({action:"advance"})
    });
    assert.equal(response.status,200);
  }
  const gift={userId:"private-platform-identifier",displayName:"Ana",giftId:"565",
    giftName:"Rosa",repeatCount:1,groupId:"combo-42",eventId:"gift-1"};
  handlers.onEvent({type:"gift",recognized:true});
  handlers.onGift(gift);
  handlers.onEvent({type:"gift",recognized:true});
  handlers.onGift({...gift,eventId:"gift-2"});
  const report=await getReport();
  assert.equal(report.events.giftObserved,2);
  assert.equal(report.events.giftFinalized,2);
  assert.equal(report.events.giftsApplied,1);
  assert.equal(report.events.duplicateGifts,1);
  assert.equal(report.events.turbosApplied,1);
  const json=JSON.stringify(report);
  assert.ok(!json.includes("private-platform-identifier"));
  assert.ok(!json.includes(secret));
  // Simulated presents are not counted as received from TikTok.
  const simulated=await fetch(base+"/api/admin/action",{
    method:"POST",headers:{"Content-Type":"application/json","x-admin-key":secret},
    body:JSON.stringify({action:"gift-test"})
  });
  assert.equal(simulated.status,200);
  const afterTest=await getReport();
  assert.equal(afterTest.events.simulatedGifts,1);
  assert.equal(afterTest.events.giftsApplied,1);
});
