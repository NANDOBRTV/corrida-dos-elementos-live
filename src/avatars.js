import * as THREE from "three";
import {laneX} from "./config.js";
import {rank} from "./engine.js";
import {appearanceForRunner} from "./cosmetics.js";
import {gridTrackPoint,visualStartingDistance} from "./start-grid.js";

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
    return visualStartingDistance(r,index);
  }
  function labelTexture(text,accent="#c9f86e") {
    const key=text.slice(0,14)+"|"+accent;
    if(textureCache.has(key)){
      const entry=textureCache.get(key);entry.refs++;return entry.texture;
    }
    const canvas=document.createElement("canvas");canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="rgba(17,24,40,.91)";
    ctx.beginPath();ctx.roundRect(1,2,254,59,15);ctx.fill();
    ctx.fillStyle=accent;ctx.fillRect(3,12,7,39);
    ctx.fillStyle=accent;ctx.fillRect(14,3,225,3);
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
    const vehicleKind=r.vehicleKind==="kart"||r.vehicleKind==="moto"
      ?r.vehicleKind:appearance.vehicle;
    // Referência visual: roupas, acessórios e proporções de avatares humanoides blocados.
    // Modelos originais; nenhum asset/modelo oficial de outro jogo é importado.
    const skin=[0xf4caa5,0x986244,0xf6d6b4,0xc38a61,0x6e4735][style];
    const pants=[0x293247,0x2d3036,0x4a355b,0x293e39,0x473645,0x34506a,0x35404a,0x5e4837][appearance.outfit];
    const hair=[0x171b27,0x5d3528,0x2d2122,0xb87833,0x9c8ba7][appearance.hairStyle];
    const hoodie=[0x27334c,0x542b5a,0x233c33,0x7f343e,0x345781,0x7f6e47,0x333538,0x624959][appearance.outfit];
    const jacket=[0xe7caa6,0xb69ce9,0x8be2c4,0xffb3bb,0x7db9ff,0xeec784,0xbdbbce,0xdb94af][appearance.outfit];
    const shoes=[0xffffff,0x303340,0xf2d48b,0xb2f1e4,0xe8bed9][style];
    const pack=[0x393f70,0x7d4a39,0x225f65,0x5b3965,0x345a37][style];
    const group=new THREE.Group();
    group.name="blocky-runner-"+index;
    const initial=gridTrackPoint(visualProgress(r,index),laneX(r.lane),.76);
    group.position.set(initial.x,initial.y,initial.z);
    group.rotation.y=initial.heading;
    const body=new THREE.Group();group.add(body);
    // First instance deliberately preserves the official player's color.
    part(body,[0,.87,0],[.92,.96,.55],r.color); // R6-like rectangular torso
    part(body,[0,1.72,0],[.84,.82,.80],skin); // oversized cuboid head
    // Add clearly visible front-facing features. Without these cubes the
    // countdown frontal shot looked like the back of a featureless head.
    // Instanced into the existing single voxel draw call.
    part(body,[-.19,1.83,.425],[.115,.13,.035],0x192029);
    part(body,[.19,1.83,.425],[.115,.13,.035],0x192029);
    part(body,[0,1.54,.425],[.22,.048,.025],0x80564c);
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.65,1.22,0);body.add(arm);
      part(arm,[0,-.36,0],[.33,.78,.44],appearance.outfit%3===0?skin:hoodie);
      arms.push(arm);
      const leg=new THREE.Group();leg.position.set(side*.255,.38,0);body.add(leg);
      part(leg,[0,-.30,0],[.39,.66,.46],pants);
      legs.push(leg);
    }
    if(!simple){
      // Back of jacket is visible from the third-person follow camera.
      part(body,[0,.89,-.298],[.82,.79,.055],hoodie);
      part(body,[0,1.15,-.341],[.72,.12,.06],jacket);
      part(body,[0,.57,-.341],[.68,.085,.06],jacket);
      // Hood on the back, differentiated from a plain Minecraft cube.
      part(body,[0,1.38,-.33],[.55,.21,.30],hoodie);
      // Front neckline, drawn even when the character turns.
      part(body,[0,1.31,.30],[.53,.14,.06],jacket);
      for(let side=0;side<2;side++){
        const sign=side===0?-1:1;
        part(arms[side],[0,-.63,0],[.345,.15,.45],appearance.outfit%3===0?hoodie:skin);
        part(legs[side],[0,-.63,.085],[.41,.17,.56],shoes);
        part(body,[sign*.41,.77,-.34],[.085,.6,.05],jacket);
        // Raised shoulder seam, sneaker color and pant stripe.
        part(body,[sign*.70,1.22,-.01],[.13,.10,.43],jacket);
        part(legs[side],[sign*.18,-.33,-.238],[.06,.47,.04],hoodie);
      }
      // Blocky hair is intentionally multiple cuboids for a humanoid outline.
      const headgear=appearance.headwear;
      if(headgear===0){ // full hair
        part(body,[0,2.20,-.06],[.90,.22,.82],hair);
        part(body,[-.35,1.98,-.28],[.16,.33,.30],hair);
        part(body,[.35,1.98,-.28],[.16,.33,.30],hair);
      }else if(headgear===1){ // baseball cap with visor
        part(body,[0,2.20,-.04],[.91,.24,.84],hoodie);
        part(body,[0,2.17,.48],[.83,.10,.31],hoodie);
        part(body,[0,2.31,-.04],[.45,.08,.40],jacket);
      }else if(headgear===2){ // beanie
        part(body,[0,2.23,-.02],[.92,.27,.86],hoodie);
        part(body,[0,2.10,-.02],[.94,.12,.88],jacket);
        part(body,[0,2.39,-.02],[.23,.15,.23],hoodie);
      }else if(headgear===3){ // hair with side sweep
        part(body,[0,2.19,-.05],[.91,.23,.82],hair);
        part(body,[-.24,2.08,.32],[.46,.31,.23],hair);
        part(body,[.37,2.03,-.12],[.16,.35,.34],hair);
      }else{ // headphones and back hair
        part(body,[0,2.15,-.13],[.82,.18,.73],hair);
        part(body,[-.45,1.77,0],[.12,.41,.46],hoodie);
        part(body,[.45,1.77,0],[.12,.41,.46],hoodie);
      }
      // Facial eyes face forward (+Z), so the chase camera sees the wardrobe.
      part(body,[-.18,1.74,.413],[.08,.105,.04],0x21222a);
      part(body,[.18,1.74,.413],[.08,.105,.04],0x21222a);
      part(body,[0,1.56,.413],[.25,.045,.045],0x8b5346);
      if(appearance.accessory===0){
        // Backpack and straps.
        part(body,[0,.90,-.52],[.62,.72,.30],pack);
        part(body,[-.29,1.01,-.36],[.12,.72,.07],jacket);
        part(body,[.29,1.01,-.36],[.12,.72,.07],jacket);
      }else if(appearance.accessory===1){
        // Long scarf, no extra mesh draw calls.
        part(body,[0,1.34,.10],[.78,.17,.68],jacket);
        part(body,[.28,.93,.36],[.17,.68,.09],jacket);
      }else if(appearance.accessory===2){
        // Mini satchel on one shoulder.
        part(body,[.38,.81,-.52],[.34,.52,.24],pack);
        part(body,[.19,1.25,-.39],[.14,.51,.07],jacket);
      }
    }
    // Karts, motos e jetpacks são aparências visuais; não alteram o motor de corrida.
    if(vehicleKind==="kart"){
      part(group,[0,-.50,.02],[1.35,.30,1.45],r.color);
      part(group,[0,-.23,.68],[1.08,.23,.27],0xcfd8e5);
      for(const side of [-1,1])for(const zz of [-.53,.49])
        part(group,[side*.72,-.62,zz],[.29,.40,.39],0x222936);
      part(group,[0,.06,.57],[.70,.10,.12],0x273743);
      if(!simple){
        part(group,[0,-.40,-.73],[.90,.21,.25],0x283e52);
        for(const side of [-1,1])
          part(group,[side*.41,-.29,.82],[.24,.14,.09],0xf8edb0);
      }
    }else if(vehicleKind==="moto"){
      part(group,[0,-.46,.05],[.48,.36,1.20],r.color);
      for(const zz of [-.68,.69])
        part(group,[0,-.62,zz],[.45,.56,.27],0x252935);
      part(group,[0,-.12,.56],[.86,.13,.16],0xb5c4cf);
      if(!simple){
        part(group,[0,-.18,-.36],[.45,.19,.49],0x324652);
        part(group,[.27,-.49,-.20],[.14,.16,.60],0xe6bf78);
        part(group,[0,-.27,.85],[.28,.22,.16],0xf5ecd2);
      }
    }else if(vehicleKind==="jetpack"){
      part(body,[-.27,.92,-.55],[.28,.65,.32],0x6c8596);
      part(body,[.27,.92,-.55],[.28,.65,.32],0x6c8596);
      part(body,[0,.77,-.59],[.60,.22,.35],0x2c404c);
      if(!simple){
        part(body,[-.27,.49,-.55],[.16,.24,.23],0xffb76f);
        part(body,[.27,.49,-.55],[.16,.24,.23],0xffb76f);
      }
    }
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(r.name,r.color),depthWrite:false,transparent:true}));
    label.position.set(0,3.17,0);label.scale.set(1.95,.48,1);label.visible=false;group.add(label);
    if(!simple){
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(.65,12),new THREE.MeshBasicMaterial({color:0x15271c,transparent:true,opacity:.2,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=-.70;group.add(shadow);
    }
    scene.add(group);
    return {group,body,arms,legs,parts,vehicleKind,lastX:laneX(r.lane),lastZ:visualProgress(r,index),label,labelKey:r.name.slice(0,14)+"|"+r.color};
  }
  function sync(runners,raceMs=0,phase="LOBBY") {
    const ids=new Set(runners.map(r=>r.id));
    let changed=false;
    for(const [id,item] of meshes){
      const r=runners.find(x=>x.id===id);
      const expected=r&&phase==="RUNNING"&&r.vehicleUntil>raceMs&&
        (r.vehicleKind==="kart"||r.vehicleKind==="moto")
        ?r.vehicleKind:appearanceForRunner(id).vehicle;
      if(!ids.has(id)||item.vehicleKind!==expected){
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
        const effective=r&&phase==="RUNNING"&&r.vehicleUntil>raceMs&&
          (r.vehicleKind==="kart"||r.vehicleKind==="moto")
          ?r.vehicleKind:appearanceForRunner(r.id).vehicle;
        meshes.set(r.id,build({...r,vehicleKind:effective},i));
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
      const visualZ=visualProgress(r,i);
      if(Math.abs(item.lastZ-visualZ)>25)item.lastZ=visualZ; // Snap after reconnect or benchmark segment jump.
      item.lastZ+=Math.min(1,dt*8)*(visualZ-item.lastZ);
      const route=gridTrackPoint(item.lastZ,item.lastX,.76);
      item.group.position.set(route.x,route.y,route.z);
      item.group.rotation.y=route.heading;
      item.label.visible=labeled.has(r.id);
      const moving=phase==="RUNNING"&&r.status==="running";
      const t=now*.012+i*.77;
      const tempo=moving?(r.slowUntil>0&&r.speed<r.baseSpeed?.45:1):0;
      const riding=item.vehicleKind==="kart"||item.vehicleKind==="moto";
      const rideOffset=item.vehicleKind==="kart"?-.40:item.vehicleKind==="moto"?-.22:0;
      item.body.position.y=rideOffset+(moving?Math.abs(Math.sin(t))*(riding?.025:.13)*tempo:0);
      item.body.rotation.z=moving&&tempo<1?Math.sin(t)*.15:0;
      item.body.rotation.x=moving&&item.vehicleKind==="jetpack"?-.12:0;
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
