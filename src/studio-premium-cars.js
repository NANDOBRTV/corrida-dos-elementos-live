// Optional licensed-GLB close-up layer for the V5 3D broadcast.
//
// This module is lightweight unless quality=high/ultra. It loads real artist-
// authored car meshes only for the featured model(s), never all 100 at once.
// If an asset is unavailable the original optimized procedural car remains.
// Attribution is always visible in the UI (see assets/hero-credits.html).
import {PREMIUM_HERO_MODELS,premiumModelUrl} from "./studio-premium-assets.js";
import {roofLadderParts} from "./studio-hero-cars.js";
import {resolveVehicle} from "./vehicles.js";

const round=(x,min,max)=>Math.min(max,Math.max(min,Number(x)||0));
export function createPremiumCars(THREE,scene,{
  enabled=false,maxDetailed=6
}={}){
  const templates=new Map(),promises=new Map(),failures=new Map();
  const sourceDimensions=new Map(),normalizedDimensions=new Map();
  const instances=new Map(),visible=new Set();
  const ladderGeometry=new THREE.BoxGeometry(1,1,1);
  const ladderMaterial=new THREE.MeshStandardMaterial({
    color:0xc3ccd4,metalness:.75,roughness:.26
  });
  const matrix=new THREE.Matrix4(),v=new THREE.Vector3(),q=new THREE.Quaternion(),
    scale=new THREE.Vector3();
  let closed=false;
  let loader=null;
  let addonPromise=null;

  async function obtainLoader(){
    if(!addonPromise){
      addonPromise=Promise.all([
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/libs/meshopt_decoder.module.js")
      ]).then(([a,b])=>{
        loader=new a.GLTFLoader();
        loader.setMeshoptDecoder(b.MeshoptDecoder);
        return loader;
      });
    }
    return addonPromise;
  }
  function warm(id){
    if(!enabled||!PREMIUM_HERO_MODELS[id]||promises.has(id)||
      failures.has(id)||closed)return;
    const promise=obtainLoader()
      .then(instance=>instance.loadAsync(premiumModelUrl(id)))
      .then(gltf=>{
        if(closed)return;
        templates.set(id,gltf.scene);
        const bounds=new THREE.Box3().setFromObject(gltf.scene);
        const size=bounds.getSize(new THREE.Vector3());
        sourceDimensions.set(id,{
          x:Number(size.x.toFixed(3)),y:Number(size.y.toFixed(3)),
          z:Number(size.z.toFixed(3))
        });
      }).catch(error=>{
        failures.set(id,String(error?.message||error).slice(0,200));
        console.warn("[studio-v5/premium] fallback procedural for "+id);
      });
    promises.set(id,promise);
  }
  function warmAll(){
    if(!enabled)return;
    // Four verified CC BY originals. The rejected Opala and mislabeled Golf are
    // intentionally NOT used; both Opala and Gol retain sculpted 3D models.
    for(const id of Object.keys(PREMIUM_HERO_MODELS))warm(id);
  }
  function buildLadder(holder){
    const parts=roofLadderParts("car-uno");
    const ladder=new THREE.InstancedMesh(
      ladderGeometry,ladderMaterial,parts.length);
    ladder.name="studio-premium-uno-roof-ladder";
    for(let i=0;i<parts.length;i++){
      const item=parts[i];
      v.set(...item.p);q.identity();scale.set(...item.s);
      matrix.compose(v,q,scale);ladder.setMatrixAt(i,matrix);
    }
    // In licensed Uno GLB the roof reaches approximately 1.65m.
    // Shift the separately modeled ladder ABOVE it (not hidden inside).
    ladder.position.y=.29;
    ladder.instanceMatrix.needsUpdate=true;
    ladder.frustumCulled=false;holder.add(ladder);
  }
  function instanceFor(r){
    const key=r.id;
    if(instances.has(key))return instances.get(key);
    const original=templates.get(r.vehicleId);
    if(!original)return null;
    const vehicle=resolveVehicle(r.vehicleId);
    if(!vehicle)return null;
    const holder=new THREE.Group();
    holder.name="studio-premium-"+r.vehicleId+"-"+key;
    const obj=original.clone(true);
    const pivot=new THREE.Group();
    pivot.add(obj);pivot.updateMatrixWorld(true);
    let bbox=new THREE.Box3().setFromObject(pivot);
    let dim=bbox.getSize(new THREE.Vector3());
    // Source author axes vary; orient long axis to the track's Z direction.
    if(dim.x>dim.z*1.1){
      pivot.rotation.y=Math.PI/2;
      pivot.updateMatrixWorld(true);
      bbox=new THREE.Box3().setFromObject(pivot);
      dim=bbox.getSize(new THREE.Vector3());
    }
    // Real sources can be authored with -Z as the nose direction.
    // Palio currently drives backwards unless its rear-lights side is
    // turned away from the camera; correct it on the model, not track.
    const correction=Number(PREMIUM_HERO_MODELS[r.vehicleId]?.yawCorrection)||0;
    if(correction){
      pivot.rotation.y+=correction;
      pivot.updateMatrixWorld(true);
      bbox=new THREE.Box3().setFromObject(pivot);
      dim=bbox.getSize(new THREE.Vector3());
    }
    normalizedDimensions.set(r.vehicleId,{
      x:Number(dim.x.toFixed(3)),y:Number(dim.y.toFixed(3)),
      z:Number(dim.z.toFixed(3)),
      rotationY:Number(pivot.rotation.y.toFixed(3))
    });
    const targetH=vehicle.id==="car-uno"?1.65:
      vehicle.id==="car-fusca"?1.54:
      vehicle.id==="car-opala"?1.47:1.49;
    const prepared=new THREE.Group();
    prepared.scale.set(
      round(vehicle.width/Math.max(dim.x,.001),.001,1e3),
      round(targetH/Math.max(dim.y,.001),.001,1e3),
      round(vehicle.length/Math.max(dim.z,.001),.001,1e3)
    );
    const center=bbox.getCenter(new THREE.Vector3());
    pivot.position.set(-center.x,-bbox.min.y,-center.z);
    prepared.add(pivot);holder.add(prepared);
    if(r.vehicleId==="car-uno")buildLadder(holder);
    holder.visible=false;scene.add(holder);
    instances.set(key,holder);
    return holder;
  }
  function update(state,poses,shot){
    if(!enabled||closed)return;
    visible.clear();
    const list=Array.isArray(state?.active)?state.active:[];
    if(!list.length){
      for(const holder of instances.values())holder.visible=false;
      return;
    }
    let featured=[];
    if(state.phase==="LOBBY"&&list.length<=8)
      featured=list;
    else if(shot?.mode==="VEHICLE_CLOSEUP")
      featured=list.filter(r=>r.id===shot.featuredId);
    else if(shot?.mode==="TOP_THREE")
      featured=list.filter(r=>(shot.focusIds||[]).includes(r.id));
    featured=featured.filter(r=>PREMIUM_HERO_MODELS[r.vehicleId])
      .slice(0,maxDetailed);
    const requested=new Set(featured.map(r=>r.id));
    for(const [id,holder] of instances){
      if(!requested.has(id))holder.visible=false;
      if(!list.some(r=>r.id===id)){
        scene.remove(holder);instances.delete(id);
      }
    }
    for(const r of featured){
      warm(r.vehicleId);
      const holder=instanceFor(r),pose=poses.get(r.id);
      if(!holder||!pose)continue;
      const rootAngle=pose.heading+
        (state.phase==="LOBBY"||state.phase==="COUNTDOWN"?Math.PI:0);
      holder.position.set(pose.x,pose.y,pose.z);
      holder.rotation.set(0,rootAngle,0);
      holder.scale.setScalar(.79);
      holder.visible=true;visible.add(r.id);
    }
  }
  function isVisible(runnerId){
    return visible.has(runnerId);
  }
  function stats(){
    return {
      premiumEnabled:enabled,premiumReadyModels:templates.size,
      premiumActiveVehicles:visible.size,premiumFailedModels:failures.size,
      premiumUnoLadders:[...instances.entries()].filter(([id,group])=>
        visible.has(id)&&group.children.some(child=>
          child.name==="studio-premium-uno-roof-ladder"||
          child.getObjectByName("studio-premium-uno-roof-ladder"))).length,
      premiumSourceDimensions:Object.fromEntries(sourceDimensions),
      premiumAlignedDimensions:Object.fromEntries(normalizedDimensions)
    };
  }
  function dispose(){
    closed=true;visible.clear();
    for(const holder of instances.values())scene.remove(holder);
    instances.clear();templates.clear();promises.clear();
    ladderGeometry.dispose();ladderMaterial.dispose();
  }
  return {warmAll,warm,update,isVisible,stats,dispose};
}
