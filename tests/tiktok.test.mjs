import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTikTokChat,startTikTokBridge} from "../server/tiktok.js";

test("TikTok CHAT aceita somente entrar isolado",()=>{
  const evt={content:"  ENTRAR  ",user:{id:"987654321012345678",nickname:"Espectador"}};
  const normalized=normalizeTikTokChat(evt);
  assert.equal(normalized.userId,"987654321012345678");
  assert.equal(normalized.displayName,"Espectador");
  assert.equal(normalized.content,"entrar");
  assert.equal(normalized.source,"tiktok");
});
test("Ignora outros comentários",()=>{
  for(const content of ["!entrar","quero entrar","entrando","entrar dois nomes"]){
    assert.equal(normalizeTikTokChat({content,user:{id:"123"}}),null);
  }
});
test("Não inventa ID TikTok quando estiver ausente",()=>{
  assert.equal(normalizeTikTokChat({content:"entrar",user:{displayId:"teste"}}),null);
  assert.equal(normalizeTikTokChat({content:"entrar"}),null);
});
test("Não arredonda IDs numéricos não seguros",()=>{
  assert.equal(normalizeTikTokChat({content:"entrar",user:{id:Number.MAX_SAFE_INTEGER+12}}),null);
});
test("IDs em bigint são preservados como string",()=>{
  const evt={content:"entrar",user:{id:12345678901234567890n},common:{msgId:"789"}};
  const v=normalizeTikTokChat(evt);
  assert.equal(v.userId,"12345678901234567890");
  assert.equal(v.eventId,"789");
});
test("Conector não se inicia sem usuário configurado",async()=>{
  const bridge=startTikTokBridge({username:""});
  assert.equal(bridge.enabled,false);
  assert.equal(bridge.status().connected,false);
  await bridge.close();
});

test("TikTok LIVE 2.5: aceita comentário real com comment e user.userId",()=>{
  const event={comment:" EnTrAr ",user:{userId:"7298881234567891012",uniqueId:"espectador_teste",nickname:"Visitante"},common:{msgId:"msg-real-01"}};
  const parsed=normalizeTikTokChat(event);
  assert.ok(parsed);
  assert.equal(parsed.userId,"7298881234567891012");
  assert.equal(parsed.displayName,"Visitante");
  assert.equal(parsed.content,"entrar");
  assert.equal(parsed.eventId,"msg-real-01");
});
test("TikTok LIVE 2.5: aceita fallback uniqueId sem inventar perfil",()=>{
  const event={comment:"entrar",user:{uniqueId:"usuario_teste_1"}};
  const parsed=normalizeTikTokChat(event);
  assert.ok(parsed);
  assert.equal(parsed.userId,"usuario_teste_1");
  assert.equal(parsed.displayName,"usuario_teste_1");
});
test("TikTok LIVE 2.5: ignora outros comentários no campo comment",()=>{
  assert.equal(normalizeTikTokChat({comment:"curti",user:{userId:"123"}}),null);
});

test("Comando Roblox informado no chat é reconhecido, mas não comprova posse da conta",()=>{
  const v=normalizeTikTokChat({comment:" entrar NomeTeste_123 ",user:{userId:"55",nickname:"Visitante"}});
  assert.equal(v.robloxUsername,"NomeTeste_123");
  assert.equal(v.content,"entrar NomeTeste_123");
});
