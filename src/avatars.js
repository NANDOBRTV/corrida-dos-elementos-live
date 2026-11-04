import * as THREE from "three";
import {laneX} from "./config.js";
import {rank} from "./engine.js";
import {appearanceForRunner} from "./cosmetics.js";

export function createAvatars(scene,{quality="balanced"}={}) {
  const simple=quality==="low";
  const meshes=new Map();
  const geometry=new THREE.BoxGeometry(1,1,1);
  const textureCache=new Map();
  // One GPU batch for every articulated runner voxel. Individual groups remain
  // responsible for animation, so transforms, colors, poses and name sprites stay intact.
  const voxelMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72});
  let voxelBatch=null;
  let batchedParts=[];
  function flushVoxelBatch(){
    if(!voxelBatch)return;
    // Update only moving runner hierarchies, not every static map object.
    for(const item of meshes.values())item.group.updateWorldMatrix(true,true);
    for(let i=0;i<batchedParts.length;i++)
      voxelBatch.setMatrixAt(i,batchedParts[i].node.matrixWorld);
    voxelBatch.instanceMatrix.needsUpdate=true;
  }
  function rebuildVoxelBatch(){
    if(voxelBatch){
      scene.remove(voxelBatch);
      voxelBatch.dispose(); // Releases instance buffers, not shared cube geometry.
      voxelBatch=null;
    }
    batchedParts=[...meshes.values()].flatMap(item=>item.parts);
    if(!batchedParts.length)return;
    voxelBatch=new THREE.InstancedMesh(geometry,voxelMaterial,batchedParts.length);
    voxelBatch.name="runner-voxel-batch";
    voxelBatch.castShadow=true;
    voxelBatch.frustumCulled=false;
    for(let i=0;i<batchedParts.length;i++)
      voxelBatch.setColorAt(i,new THREE.Color(batchedParts[i].color));
    if(voxelBatch.instanceColor)voxelBatch.instanceColor.needsUpdate=true;
    scene.add(voxelBatch);
    flushVoxelBatch();
  }
  function visualProgress(r,index){
    // Only visual: a ten-row starting grid does not alter racing physics.
    const row=Math.floor(index/5);
    const taper=Math.max(0,1-Math.max(0,r.progress)/30);
    return r.progress-row*1.48*taper;
  }
  function labelTexture(text,accent="#c9f86e") {
    const key=text.slice(0,14)+"|"+accent;
    if(textureCache.has(key)){
      const entry=textureCache.get(key);entry.refs++;return entry.texture;
    }
    const canvas=document.createElement("canvas");canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="rgba(7,19,28,.90)";ctx.fillRect(0,3,256,57);
    ctx.fillStyle=accent;ctx.fillRect(0,3,10,57);
    ctx.fillStyle=accent;ctx.fillRect(11,3,245,3);
    ctx.font="bold 31px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#ffffff";
    ctx.fillText(text.slice(0,14),128,31,240);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    textureCache.set(key,{texture:tex,refs:1});return tex;
  }
  function cube(parent,pos,scale,color,parts) {
    // Animation anchors are lightweight; the visible cubes are GPU instances.
    const node=new THREE.Object3D();node.position.set(...pos);node.scale.set(...scale);
    parent.add(node);parts.push({node,color});return node;
  }
  function build(r,index) {
    const parts=[];
    const part=(parent,pos,scale,color)=>cube(parent,pos,scale,color,parts);
    // Small original outfit variations, with no additional draw calls or geometry.
    const appearance=appearanceForRunner(r.id);
    const style=appearance.variant;
    const vehicleKind=appearance.vehicle;
    const skin=[0xf0c59e,0xb57950,0xffd9b2,0xdba67f,0x946448][style];
    const pants=[0x273b44,0x443755,0x28333e,0x556b51,0x373038][style];
    const hair=[0x26333c,0x6a432d,0x191d27,0xb16b31,0x474b69][style];
    const sleeved=style%3!==0;
    const shoes=[0xffffff,0xe8bd71,0x4ef0db,0xf2a8db,0xb7d2fb][style];
    const backpack=[0x393f70,0x7d4a39,0x225f65,0x5b3965,0x345a37][style];
    const group=new THREE.Group();
    group.position.set(laneX(r.lane),.76,visualProgress(r,index));
    const body=new THREE.Group();group.add(body);
    part(body,[0,.78,0],[.72,1,.55],r.color);
    part(body,[0,1.57,0],[.76,.76,.7],skin);
    if(!simple){
      part(body,[0,2.02,0],[.83,.18,.75],style%3===0?r.color:hair);
      // Faces point forward (+Z); the broadcast camera follows the runners from behind.
      part(body,[-.17,1.62,.37],[.095,.11,.04],0x22373d);
      part(body,[.17,1.62,.37],[.095,.11,.04],0x22373d);
      // Original character silhouettes stay in the same GPU instance batch.
      const headwearColor=style===0?r.color:style===1?hair:style===2?0xe1d9ba:style===3?0x434f70:0xf3db9a;
      part(body,[0,style===2?2.10:2.18,style===2?.17:0],
        style===2?[.86,.12,.9]:style===3?[.88,.38,.78]:[.79,.18,.76],
        headwearColor);
      part(body,[0,.82,-.40],[.54,.64,.21],backpack);
    }
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.54,1.2,0);body.add(arm);
      part(arm,[0,-.34,0],[.23,.69,.35],sleeved?r.color:skin);arms.push(arm);
      const leg=new THREE.Group();leg.position.set(side*.23,.32,0);body.add(leg);
      part(leg,[0,-.25,0],[.3,.52,.42],pants);
      if(!simple)part(leg,[0,-.51,.08],[.34,.17,.51],shoes);
      legs.push(leg);
    }
    // Original low-poly vehicle appearances are cosmetic only. The authoritative
    // physics, speed, turbo, collisions and results stay entirely on the server.
    if(vehicleKind==="kart"){
      part(group,[0,-.50,.02],[1.25,.30,1.37],r.color); // chassis
      part(group,[0,-.23,.64],[.96,.24,.25],0xced9e0); // nose
      for(const side of [-1,1])for(const zz of [-.50,.46])
        part(group,[side*.65,-.62,zz],[.29,.37,.35],0x202936);
      part(group,[0,.05,.55],[.59,.10,.11],0x193340); // steering
      if(!simple){
        part(group,[0,-.40,-.70],[.85,.22,.22],0x2d4051);
        for(const side of [-1,1])
          part(group,[side*.39,-.29,.78],[.24,.14,.09],0xf7f0b8);
      }
    }else if(vehicleKind==="moto"){
      part(group,[0,-.44,.04],[.45,.36,1.12],r.color);
      for(const zz of [-.65,.66])
        part(group,[0,-.63,zz],[.42,.52,.24],0x20242d);
      part(group,[0,-.12,.49],[.81,.10,.13],0xa9bac5); // handlebar
      if(!simple){
        part(group,[0,-.18,-.32],[.43,.18,.43],0x324a50);
        part(group,[.25,-.48,-.20],[.13,.15,.55],0xe5c580);
        part(group,[0,-.28,.83],[.28,.22,.14],0xf5efcf);
      }
    }
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(r.name,r.color),depthWrite:false,transparent:true}));
    label.position.set(0,2.95,0);label.scale.set(1.75,.44,1);label.visible=false;group.add(label);
    if(!simple){
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(.65,12),new THREE.MeshBasicMaterial({color:0x15271c,transparent:true,opacity:.2,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=-.70;group.add(shadow);
    }
    scene.add(group);
    return {group,body,arms,legs,parts,vehicleKind,lastX:laneX(r.lane),lastZ:visualProgress(r,index),label,labelKey:r.name.slice(0,14)+"|"+r.color};
  }
  function sync(runners) {
    const ids=new Set(runners.map(r=>r.id));
    let changed=false;
    for(const [id,item] of meshes){
      if(!ids.has(id)){
        changed=true;
        scene.remove(item.group);
        item.group.traverse(obj=>{
          if(obj.isSprite)obj.material.dispose();
          if(obj.isMesh&&obj.geometry?.type==="CircleGeometry"){
            obj.geometry.dispose();obj.material.dispose();
          }
        });
        const entry=textureCache.get(item.labelKey);
        if(entry&&--entry.refs<=0){entry.texture.dispose();textureCache.delete(item.labelKey);}
        meshes.delete(id);
      }
    }
    for(let i=0;i<runners.length;i++){
      const r=runners[i];
      if(!meshes.has(r.id)){
        meshes.set(r.id,build(r,i));
        changed=true;
      }
    }
    if(changed)rebuildVoxelBatch();
  }
  function animate(runners,phase,dt,now) {
    // Full names remain readable in the ranking; only leaders get floating labels.
    const show=phase==="RUNNING"?(simple?8:14):phase==="RESULTS"?5:0;
    const labeled=new Set(rank(runners).slice(0,show).map(r=>r.id));
    for(let i=0;i<runners.length;i++){
      const r=runners[i],item=meshes.get(r.id);if(!item)continue;
      const wanted=laneX(r.lane);
      item.lastX+=Math.min(1,dt*7)*(wanted-item.lastX);
      item.group.position.x=item.lastX;
      const visualZ=visualProgress(r,i);
      if(item.lastZ-visualZ>25)item.lastZ=visualZ; // Snap after a new round.
      item.lastZ+=Math.min(1,dt*8)*(visualZ-item.lastZ);
      item.group.position.z=item.lastZ;
      item.label.visible=labeled.has(r.id);
      const moving=phase==="RUNNING"&&r.status==="running";
      const t=now*.012+i*.77;
      const tempo=moving?(r.slowUntil>0&&r.speed<r.baseSpeed?.45:1):0;
      const riding=item.vehicleKind!=="foot";
      const rideOffset=item.vehicleKind==="kart"?-.40:item.vehicleKind==="moto"?-.22:0;
      item.body.position.y=rideOffset+(moving?Math.abs(Math.sin(t))*(riding?.025:.13)*tempo:0);
      item.body.rotation.z=moving&&tempo<1?Math.sin(t)*.15:0;
      for(let s=0;s<2;s++){
        const swing=moving?Math.sin(t+s*Math.PI)*.65*tempo:0;
        item.arms[s].rotation.x=riding?-.45:(phase==="RESULTS"&&i<3?-2.6:swing);
        item.legs[s].rotation.x=riding?.55:-swing;
      }
    }
    flushVoxelBatch();
  }
  function clear(){
    sync([]);
    for(const entry of textureCache.values())entry.texture.dispose();
    textureCache.clear();
    voxelMaterial.dispose();
    geometry.dispose();
  }
  return {sync,animate,clear};
}
