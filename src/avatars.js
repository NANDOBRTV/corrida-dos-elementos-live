import * as THREE from "three";
import {laneX} from "./config.js";
import {rank} from "./engine.js";

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
  function labelTexture(text) {
    const key=text.slice(0,14);
    if(textureCache.has(key)){
      const entry=textureCache.get(key);entry.refs++;return entry.texture;
    }
    const canvas=document.createElement("canvas");canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="rgba(7,19,16,.86)";ctx.fillRect(0,3,256,57);
    ctx.font="bold 31px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#ffffff";
    ctx.fillText(key,128,31,240);
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
    const group=new THREE.Group();
    group.position.set(laneX(r.lane),.76,visualProgress(r,index));
    const body=new THREE.Group();group.add(body);
    part(body,[0,.78,0],[.72,1,.55],r.color);
    part(body,[0,1.57,0],[.76,.76,.7],0xf0c59e);
    if(!simple){
      part(body,[0,2.02,0],[.83,.18,.75],r.color);
      part(body,[-.17,1.62,-.37],[.095,.11,.04],0x22373d);
      part(body,[.17,1.62,-.37],[.095,.11,.04],0x22373d);
    }
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.54,1.2,0);body.add(arm);
      part(arm,[0,-.34,0],[.23,.69,.35],0xe6ad84);arms.push(arm);
      const leg=new THREE.Group();leg.position.set(side*.23,.32,0);body.add(leg);
      part(leg,[0,-.25,0],[.3,.52,.42],0x273b44);legs.push(leg);
    }
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(r.name),depthWrite:false,transparent:true}));
    label.position.set(0,2.95,0);label.scale.set(1.75,.44,1);label.visible=false;group.add(label);
    if(!simple){
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(.65,12),new THREE.MeshBasicMaterial({color:0x15271c,transparent:true,opacity:.2,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=-.70;group.add(shadow);
    }
    scene.add(group);
    return {group,body,arms,legs,parts,lastX:laneX(r.lane),lastZ:visualProgress(r,index),label,labelKey:r.name.slice(0,14)};
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
    const show=phase==="RUNNING"?(simple?3:5):phase==="RESULTS"?3:0;
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
      item.body.position.y=moving?Math.abs(Math.sin(t))* .13*tempo:0;
      item.body.rotation.z=moving&&tempo<1?Math.sin(t)*.15:0;
      for(let s=0;s<2;s++){
        const swing=moving?Math.sin(t+s*Math.PI)*.65*tempo:0;
        item.arms[s].rotation.x=phase==="RESULTS"&&i<3?-2.6:swing;
        item.legs[s].rotation.x=-swing;
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
