// Verify the isolated Render preview over HTTP, without credentials or mutations.
// Designed for GitHub Actions and Node.js 20+.
import assert from "node:assert/strict";

const base=process.env.STUDIO_PREVIEW_URL||
  "https://corrida-elementos-v5-preview.onrender.com";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function get(path,{method="GET"}={}){
  const response=await fetch(new URL(path,base),{
    method,
    headers:{"Accept":"application/json"},
    signal:AbortSignal.timeout(20000),
    cache:"no-store"
  });
  let body;
  try{body=await response.json();}catch{body=null;}
  return {status:response.status,body};
}

async function withRetry(path,predicate){
  let last,reason;
  for(let attempt=1;attempt<=10;attempt++){
    try{
      last=await get(path);
      if(predicate(last))return last;
      reason="HTTP "+last.status;
    }catch(error){
      reason=String(error?.message||error).slice(0,140);
    }
    console.log("Tentativa "+attempt+"/10 de "+path+": "+reason);
    if(attempt<10)await delay(12000);
  }
  throw new Error("Preview não respondeu corretamente em "+path+"; última causa: "+reason);
}

const health=await withRetry("/health",r=>r.status===200&&r.body?.ok===true);
assert.equal(health.body.service,"corrida-dos-elementos-live");
assert.equal(health.body.liveEventsMode,"staged");
assert.equal(health.body.studio?.mode,"memory-isolated");
console.log("✓ Saúde geral: ambiente isolado, eventos reais desativados");

const studio=await withRetry("/api/studio/health",r=>r.status===200&&r.body?.enabled===true);
assert.equal(studio.body.persistence,"memory-isolated");
assert.equal(studio.body.connected,false);
console.log("✓ Studio V5 ativo e desconectado de transmissão externa");

const current=await withRetry("/api/studio/state",r=>r.status===200&&r.body?.mode==="studio-v5");
assert.ok(Array.isArray(current.body.state?.active));
assert.ok(current.body.state.active.length<=100);
assert.ok(["LOBBY","COUNTDOWN","RUNNING","RESULTS"].includes(current.body.state.phase));
assert.equal(current.body.state.connected,false);
console.log("✓ Estado Studio legível sem mutações");

for(const endpoint of ["/api/studio/admin/action","/api/studio/admin/event"]){
  const response=await get(endpoint,{method:"POST"});
  assert.equal(response.status,401,"Endpoint privado: "+endpoint);
}
console.log("✓ Rotas de mutação administrativa protegidas");
console.log("RESULTADO: prévia validada, sem credenciais ou LIVE real.");
