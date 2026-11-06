// Download only the five legally credited high-fidelity cars during V5
// preview builds. A failed optional download NEVER breaks the running game;
// the six procedural silhouettes (including the real Gol, not Golf) remain.
import {mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {PREMIUM_HERO_MODELS,remoteModelUrl} from "../src/studio-premium-assets.js";

const enabled=process.env.STUDIO_V5_ENABLED==="true"||
  process.env.ENABLE_PREMIUM_MODELS==="1";
if(!enabled){
  console.log("[premium-models] disabled; no asset download needed");
}else{
  const base=resolve("assets/models");
  await mkdir(base,{recursive:true});
  const failures=[];
  for(const [id,model] of Object.entries(PREMIUM_HERO_MODELS)){
    const target=join(base,model.file);
    try{
      let bytes;
      try{
        bytes=await readFile(target);
      }catch{/* New free Render build. */}
      if(!bytes||bytes.length!==model.bytes||
        bytes.toString("utf8",0,4)!=="glTF"){
        const url=remoteModelUrl(id);
        const response=await fetch(url,{
          headers:{"User-Agent":"CorridaDosElementosLive/1.0 (CC BY credited)"},
          signal:AbortSignal.timeout(24000)
        });
        if(!response.ok)throw Error("HTTP "+response.status+" "+url);
        const raw=await response.arrayBuffer();
        bytes=Buffer.from(raw);
      }
      if(bytes.length!==model.bytes||
        bytes.toString("utf8",0,4)!=="glTF"||
        bytes.readUInt32LE(8)!==bytes.length)
        throw Error("Invalid GLB size/header for "+id);
      await writeFile(target,bytes);
      console.log("[premium-models] ready: "+id+" "+bytes.length+" bytes");
    }catch(error){
      failures.push(id);
      await rm(target,{force:true});
      console.warn("[premium-models] fallback procedural: "+id+" "+
        String(error?.message??error).slice(0,220));
    }
  }
  console.log("[premium-models] ready models: "+
    (Object.keys(PREMIUM_HERO_MODELS).length-failures.length)+"/"+
    Object.keys(PREMIUM_HERO_MODELS).length);
  if(failures.length&&process.env.REQUIRE_HERO_MODELS==="1")
    throw Error("Premium models missing: "+failures.join(", "));
}
