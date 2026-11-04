import test from "node:test";
import assert from "node:assert/strict";
import {createApp} from "../server/index.js";

test("persists latest enrollment after previous write is still in-flight",async()=>{
  let disk=null;let writes=0;
  const storage={enabled:true,load:async()=>disk,
    async save(snapshot){
      const value=structuredClone(snapshot);
      writes++;
      await new Promise(r=>setTimeout(r,55));
      disk=value;
    },
    close:async()=>{}
  };
  const app=await createApp({adminKey:"test-secret",storage,seedDemo:false,disableTikTok:true});
  const address=await app.listen(0);
  const url="http://127.0.0.1:"+address.port+"/api/admin/join";
  const join=async(id)=>{
    const response=await fetch(url,{method:"POST",headers:{
      "Content-Type":"application/json","x-admin-key":"test-secret"
    },body:JSON.stringify({userId:id,displayName:id,content:"entrar"})});
    assert.equal(response.status,200);
  };
  try{
    await join("before-save");
    const pending=app.flush();
    await join("during-save");
    await app.close();
    await pending;
    assert.ok(writes>=2);
    assert.deepEqual(disk.active.map(p=>p.id),["before-save","during-save"]);
    const restarted=await createApp({adminKey:"test-secret",storage,seedDemo:false,disableTikTok:true});
    assert.deepEqual(restarted.state().active.map(p=>p.id),["before-save","during-save"]);
    await restarted.close();
  }finally{await app.close();}
});

test("transient Postgres errors remain unsaved and can be retried",async()=>{
  let failures=1,saved=null;
  const storage={enabled:true,load:async()=>null,close:async()=>{},
    async save(value){
      if(failures-->0)throw Error("Temporary outage");
      saved=structuredClone(value);
    }
  };
  const app=await createApp({adminKey:"test-secret",storage,seedDemo:false,disableTikTok:true});
  const address=await app.listen(0);
  const url="http://127.0.0.1:"+address.port+"/health";
  // Pause the simulated race before asserting "no pending writes".
  // Otherwise the normal 50 ms motor tick can create a new revision after flush.
  const pause=await fetch("http://127.0.0.1:"+address.port+"/api/admin/action",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-admin-key":"test-secret"},
    body:JSON.stringify({action:"pause"})
  });
  assert.equal(pause.status,200);
  try{
    assert.equal(await app.flush(),false);
    const bad=await (await fetch(url)).json();
    assert.equal(bad.storage,"postgres");
    assert.equal(bad.storageHealthy,false);
    assert.equal(bad.unflushedChanges,true);
    assert.equal(await app.flush(),true);
    const good=await (await fetch(url)).json();
    assert.equal(good.storageHealthy,true);
    assert.equal(good.unflushedChanges,false);
    assert.ok(saved);
  }finally{await app.close();}
});
