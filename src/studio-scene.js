// Studio V5 — complete, self-contained, 9:16 Three.js voxel race scene.
// One PerspectiveCamera; 100 avatars in ONE instanced draw call.
// One 300m rolling corridor (not 1500m allocated). UI/photos come in Part 5.
import * as THREE from "three";
import {LIVE_STUDIO,BIOME_ORDER,RUNNER_COLORS} from "./config.js";
import {
  STUDIO_CAMERA,studioCourseAt,studioRunnerPose,studioCrowdPoses,
  advanceStudioCamera,studioVisibleNameplates
} from "./studio-camera.js";
import {buildStudioEffectParts,STUDIO_EFFECT_LIMITS} from "./studio-effects.js";
import {resolveVehicle,vehicleForBot} from "./vehicles.js";
import {createRealisticVehicleFleet} from "./studio-vehicle-models.js";

export const STUDIO_SCENE_LIMITS=Object.freeze({
  maxRunners:100,avatarParts:30,roadSegments:78,
  segmentMeters:4,trees:162,hills:52,snowParticles:430,
  walls:22,decorations:130,qualityMinScale:.62,maxNameplates:100
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const isFiniteNumber=n=>typeof n==="number"&&Number.isFinite(n);
const colors={
  ice:{sky:0xa9bad5,fog:0xb7c6dd,ground:0xe8effb,
    road:0xb5c0d5,edge:0xe5edf8,line:0xdce7f5,
    trunk:0x453b37,crown:0x174332,hill:0xdce6f6},
  forest:{sky:0xb9dfce,fog:0xb9dfce,ground:0x83ba87,
    road:0x9d9888,edge:0xd8c5a0,line:0xf5ead4,
    trunk:0x69513a,crown:0x306849,hill:0x78ad78}
};
// A single fixed 30-block InstancedMesh carries every car and motorcycle.
// Model-specific coordinates are cached once; no separate meshes per runner.
const VEHICLE_PARTS=30;
const vehicleShapes=new Map();
const hide=()=>({p:[0,0,0],s:[0,0,0],style:"body"});
function blocksFor(vehicle){
  const id=vehicle.id;
  if(vehicleShapes.has(id))return vehicleShapes.get(id);
  const out=[];
  const add=(p,s,style,role="")=>{
    if(out.length<VEHICLE_PARTS)out.push({p,s,style,role});
  };
  const w=vehicle.width,l=vehicle.length,h=vehicle.height;
  if(vehicle.kind==="car"){
    const isPickup=vehicle.shape==="pickup";
    const isSuv=vehicle.shape==="suv";
    const isClassic=vehicle.shape==="classic-round";
    const isSedan=/sedan|muscle/.test(vehicle.shape);
    const isCompact=vehicle.shape==="compact";
    const wheelZ=l*.32,wheelX=w*.49;
    const cabinLength=isPickup?l*.39:isSuv?l*.69:
      isSedan?l*.48:isCompact?l*.62:l*.57;
    const cabinCenter=isPickup?l*.16:isSedan?-.13:0;
    const cabinHeight=isSuv?.72:isCompact?.70:isPickup?.59:.54;
    // Front direction is +Z, the same heading as the race camera.
    add([0,.55,0],[w,.42,l],"body");
    add([0,.77,l*.34],[w*.92,.22,l*.30],"body");
    add([0,.77,-l*.33],[w*.90,isPickup?.15:.24,l*.30],
      isPickup?"trim":"body");
    if(isPickup){
      add([0,.66,-l*.30],[w*.88,.07,l*.44],"cargo");
      for(const sign of [-1,1])
        add([sign*w*.42,.86,-l*.30],[.10,.37,l*.43],"body");
    }else{
      add([0,1.00+h*.11,cabinCenter],
        [w*.77,cabinHeight,cabinLength],"glass");
      add([0,1.29+h*.17,cabinCenter],[w*.85,.17,cabinLength*.94],
        "roof");
    }
    if(isPickup){
      add([0,1.02+h*.08,cabinCenter],[w*.79,.46,cabinLength],"glass");
      add([0,1.30+h*.1,cabinCenter],[w*.85,.16,cabinLength*.94],"roof");
    }
    for(const side of [-1,1]){
      add([side*w*.43,1.05,cabinCenter],[.065,.35,cabinLength*.78],"glass");
      add([side*w*.46,.57,0],[.07,.08,l*.29],"trim");
      add([side*w*.39,.75,l*.43],[.15,.19,.11],"light");
      add([side*w*.39,.76,-l*.45],[.16,.17,.11],"tail");
      add([side*wheelX,.36,wheelZ],[.32,.63,.65],"wheel","wheel");
      add([side*wheelX,.36,-wheelZ],[.32,.63,.65],"wheel","wheel");
      add([side*(wheelX+.17),.36,wheelZ],[.035,.27,.27],"rim","spoke");
      add([side*(wheelX+.17),.36,-wheelZ],[.035,.27,.27],"rim","spoke");
    }
    add([0,.51,l*.49],[w*.90,.23,.13],"bumper");
    add([0,.51,-l*.49],[w*.91,.22,.13],"bumper");
    add([0,.73,l*.505],[w*.46,.17,.035],"grill");
    add([0,.56,-l*.506],[.48,.18,.038],"plate");
    if(isSuv)add([0,1.50+h*.16,cabinCenter],
      [w*.72,.10,cabinLength*.77],"trim");
    if(isClassic)add([0,1.38,cabinCenter],[w*.62,.24,cabinLength*.77],"roof");
    if(vehicle.shape==="muscle")
      add([0,.89,l*.13],[w*.60,.10,.50],"trim");
    // Original model-specific body cues, rather than identical colored boxes.
    // At most 30 voxel pieces per vehicle for 100-vehicle Android performance.
    if(isSedan){
      add([0,1.10,-l*.29],[w*.77,.11,l*.22],"body");
      add([0,1.05,l*.22],[w*.78,.08,l*.22],"glass","windshield");
    }else if(isPickup){
      add([0,.74,-l*.31],[w*.72,.08,l*.44],"cargo");
      add([0,1.00,-l*.49],[w*.90,.15,.11],"trim");
    }else if(isSuv){
      add([0,1.53,cabinCenter],[w*.86,.12,cabinLength*.78],"roof");
      add([0,1.14,-l*.32],[w*.78,.13,l*.18],"glass","rearWindow");
    }else if(isClassic){
      add([0,1.45,-.13],[w*.66,.19,cabinLength*.56],"roof");
      add([0,.93,l*.43],[w*.75,.14,l*.24],"body");
    }else if(isCompact){
      add([0,1.52,-l*.09],[w*.82,.12,cabinLength*.69],"roof");
      add([0,1.00,-l*.38],[w*.79,.10,l*.16],"glass","rearWindow");
    }else{
      add([0,.99,l*.31],[w*.79,.12,l*.20],"glass","windshield");
      add([0,.90,-l*.43],[w*.77,.11,l*.16],"tail");
    }
  }else{
    const isScooter=vehicle.shape==="scooter"||vehicle.shape==="step-through";
    const isTrail=vehicle.shape==="trail";
    const wheelZ=l*.32,wheelY=isTrail?.49:.42;
    const wheelSize=isTrail?.89:.72;
    // Two wheels, tank, seat, handlebar, suspension and lights.
    for(const z of [-wheelZ,wheelZ]){
      add([0,wheelY,z],[.29,wheelSize,wheelSize],"wheel","wheel");
      add([.165,wheelY,z],[.04,wheelSize*.63,wheelSize*.63],"rim","spoke");
      add([-.165,wheelY,z],[.04,wheelSize*.63,wheelSize*.63],"rim","spoke");
    }
    add([0,.78,0],[.40,.37,l*.70],"frame");
    add([0,.95,l*.12],[.57,.42,l*.35],"body");
    add([0,1.10,-l*.20],[.48,.17,l*.35],"seat");
    add([0,1.20,l*.36],[.14,.75,.15],"chrome");
    add([0,1.53,l*.35],[w*.95,.10,.12],"chrome");
    add([-.43,1.53,l*.34],[.10,.19,.10],"chrome");
    add([.43,1.53,l*.34],[.10,.19,.10],"chrome");
    add([0,1.18,l*.47],[.40,.35,.14],"light");
    add([0,.93,-l*.42],[.35,.20,.12],"tail");
    add([0,.65,l*.32],[.42,.12,.58],"body");
    add([0,.70,-l*.33],[.42,.12,.54],"body");
    add([.29,.52,-l*.10],[.14,.12,.73],"chrome");
    add([-.25,.55,0],[.08,.49,.50],"frame");
    add([.25,.55,0],[.08,.49,.50],"frame");
    if(isScooter){
      add([0,.93,l*.24],[.63,.68,.34],"body");
      add([0,.66,-.12],[.50,.20,.55],"trim");
      add([0,1.27,l*.32],[.62,.32,.11],"glass");
    }else{
      add([0,.91,l*.19],[.50,.15,.52],"trim");
      add([0,.58,l*.07],[.64,.22,.13],"chrome");
    }
    if(isTrail){
      add([0,1.18,l*.35],[.51,.19,.65],"body");
      add([0,.54,-l*.31],[.43,.12,.59],"trim");
      add([0,1.01,l*.39],[.12,.74,.12],"chrome");
      add([0,.58,l*.38],[.54,.09,.52],"body");
    }else if(isScooter){
      add([0,.87,l*.24],[.58,.34,.36],"body");
      add([0,1.36,l*.33],[.49,.28,.09],"glass","windshield");
    }else{
      add([0,1.02,l*.25],[.54,.14,.48],"body");
      add([0,.48,l*.35],[.39,.12,.45],"trim");
    }
    add([.32,.57,-l*.26],[.16,.13,l*.46],"chrome");
  }
  while(out.length<VEHICLE_PARTS)out.push(hide());
  vehicleShapes.set(id,out);
  return out;
}
function nameHash(value){
  let h=2166136261;
  for(const c of String(value??"")){
    h^=c.charCodeAt(0);h=Math.imul(h,16777619);
  }
  return h>>>0;
}
function paletteFor(r,vehicle){
  const seed=nameHash(r?.id??"");
  const paints=["#dc3e41","#42a9d3","#e5b843","#faf3e8","#3c7c5a",
    "#a759a3","#4e60ac","#e27740","#313f53","#a7c1ce"];
  const base=new THREE.Color(paints[seed%paints.length]);
  const dark=base.clone().multiplyScalar(.57);
  const light=base.clone().lerp(new THREE.Color(0xffffff),.25);
  return {
    body:base,roof:light,glass:new THREE.Color(0x243d51),
    wheel:new THREE.Color(0x14191c),rim:new THREE.Color(0xa9b5c0),
    trim:dark,bumper:new THREE.Color(0x20282f),
    light:new THREE.Color(0xf8ecc5),tail:new THREE.Color(0xe63238),
    grill:new THREE.Color(0x202c35),plate:new THREE.Color(0xf3f1df),
    cargo:dark,frame:new THREE.Color(0x2c353e),
    seat:new THREE.Color(0x1b242c),chrome:new THREE.Color(0xbec9d5)
  };
}
export function createStudioScene(canvas,{quality="balanced",
  pixelRatio=null,shadows=false}={}){
  if(!canvas||typeof canvas.getContext!=="function")
    throw new TypeError("É necessário um canvas WebGL");
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(STUDIO_CAMERA.fovPortrait,9/16,
    STUDIO_CAMERA.near,STUDIO_CAMERA.far);
  camera.name="studio-single-chase-camera";
  const renderer=new THREE.WebGLRenderer({
    canvas,antialias:quality==="high",alpha:false,powerPreference:"low-power"
  });
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=Boolean(shadows&&quality==="high");
  const maxPixelRatio=quality==="low"?1:quality==="high"?1.65:1.3;
  const deviceRatio=typeof window==="undefined"?1:window.devicePixelRatio||1;
  const ratio=Math.min(isFiniteNumber(pixelRatio)?pixelRatio:deviceRatio,maxPixelRatio);
  renderer.setPixelRatio(Math.max(.65,ratio));
  const fixedGeometry=new THREE.BoxGeometry(1,1,1);
  // Tiny generated pixel-noise maps give the snow and packed path actual
  // block-scale surface detail without external textures, downloads or IP.
  function noiseTexture(seed,grain=22){
    const el=document.createElement("canvas");
    el.width=64;el.height=64;
    const ctx=el.getContext("2d");
    const image=ctx.createImageData(64,64);
    let value=seed>>>0;
    for(let i=0;i<4096;i++){
      value=(Math.imul(value,1664525)+1013904223)>>>0;
      const v=228+((value>>>23)%grain)-Math.floor(grain/2);
      image.data[i*4]=Math.min(255,v);
      image.data[i*4+1]=Math.min(255,v+2);
      image.data[i*4+2]=Math.min(255,v+7);
      image.data[i*4+3]=255;
    }
    ctx.putImageData(image,0,0);
    const texture=new THREE.CanvasTexture(el);
    texture.magFilter=THREE.NearestFilter;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  const roadTexture=noiseTexture(90210,40);
  const groundTexture=noiseTexture(12831,28);
  roadTexture.repeat.set(5,1);
  groundTexture.repeat.set(65,65);
  const makeMat=hex=>new THREE.MeshLambertMaterial({color:hex});
  const materials={
    road:new THREE.MeshLambertMaterial({color:0xffffff,map:roadTexture}),
    edge:makeMat(0xffffff),
    line:makeMat(0xffffff),trunk:makeMat(0xffffff),
    crown:makeMat(0xffffff),hill:makeMat(0xffffff),
    wall:makeMat(0xffffff),
    ground:new THREE.MeshLambertMaterial({color:0xffffff,map:groundTexture}),
    avatar:new THREE.MeshLambertMaterial({color:0xffffff})
  };
  scene.add(new THREE.HemisphereLight(0xffffff,0x7c8794,2.1));
  const sunlight=new THREE.DirectionalLight(0xffffff,1.12);
  sunlight.position.set(-40,90,-70);
  scene.add(sunlight);
  const createBatch=(name,geometry,material,capacity)=>{
    const mesh=new THREE.InstancedMesh(geometry,material,capacity);
    mesh.name=name;mesh.count=0;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);return mesh;
  };
  const road=createBatch("studio-curved-asphalt",fixedGeometry,
    materials.road,STUDIO_SCENE_LIMITS.roadSegments);
  const shoulders=createBatch("studio-clean-road-edges",fixedGeometry,
    materials.edge,STUDIO_SCENE_LIMITS.roadSegments*2);
  const centerlines=createBatch("studio-lane-dashes",fixedGeometry,
    materials.line,STUDIO_SCENE_LIMITS.roadSegments*3);
  const trunks=createBatch("studio-voxel-tree-trunks",fixedGeometry,
    materials.trunk,STUDIO_SCENE_LIMITS.trees);
  const crowns=createBatch("studio-voxel-tree-crowns",fixedGeometry,
    materials.crown,STUDIO_SCENE_LIMITS.trees*4);
  const hills=createBatch("studio-small-hills",fixedGeometry,
    materials.hill,STUDIO_SCENE_LIMITS.hills);
  const walls=createBatch("studio-start-walls",fixedGeometry,
    materials.wall,STUDIO_SCENE_LIMITS.walls*2);
  // Crystals for Ice / bright undergrowth for Forest. Both live off asphalt.
  const decorations=createBatch("studio-scenery-crystals-and-shrubs",
    fixedGeometry,new THREE.MeshLambertMaterial({color:0xffffff}),
    STUDIO_SCENE_LIMITS.decorations);
  // Every temporary gift / follow animation shares a single GPU draw call.
  // No extra camera, scene objects, per-gift meshes or shader rebuild.
  const effects=createBatch("studio-bounded-gift-effects",
    fixedGeometry,new THREE.MeshBasicMaterial({
      color:0xffffff,transparent:true,opacity:.87,depthWrite:false
    }),STUDIO_EFFECT_LIMITS.maxParts);
  effects.renderOrder=3;
  const avatars=createBatch("studio-100-runner-voxel-batch",fixedGeometry,
    materials.avatar,LIVE_STUDIO.maxRunners*STUDIO_SCENE_LIMITS.avatarParts);
  // Replaces boxy silhouette, square tires and absent motorcycle pilots with
  // shared curved meshes and dedicated helmeted riders. No model downloads.
  const realFleet=createRealisticVehicleFleet(THREE,scene,{
    capacity:LIVE_STUDIO.maxRunners
  });
  // Visual-only leading-runner halo: a segmented orange floor ring and
  // tall icy speed streaks. It never alters speeds, prizes, or gifts.
  const spotlight=createBatch("studio-leader-spotlight-ring",fixedGeometry,
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
      opacity:.86,depthWrite:false}),48);
  spotlight.renderOrder=4;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(580,610),materials.ground);
  ground.name="studio-ground-below-asphalt";
  ground.rotation.x=-Math.PI/2;ground.position.y=-.65;
  scene.add(ground);
  const podium=new THREE.Group();
  podium.name="studio-winners-only-podium";
  for(const [x,width,height,color] of [[0,2.5,1.6,0xe8bd45],
    [-3.4,2.5,1.0,0xb7c5cf],[3.4,2.5,.65,0xc38c61]]){
    const m=new THREE.Mesh(fixedGeometry,new THREE.MeshLambertMaterial({color}));
    m.position.set(x,height/2,0);m.scale.set(width,height,2.45);
    podium.add(m);
  }
  podium.visible=false;scene.add(podium);

  const snowCount=STUDIO_SCENE_LIMITS.snowParticles;
  const snowGeometry=new THREE.BufferGeometry();
  const snowPositions=new Float32Array(snowCount*3);
  for(let i=0;i<snowCount;i++){
    snowPositions[i*3]=((i*41)%127-63)*.71;
    snowPositions[i*3+1]=1+(i*29%61)*.43;
    snowPositions[i*3+2]=((i*79)%149-74)*1.16;
  }
  snowGeometry.setAttribute("position",
    new THREE.BufferAttribute(snowPositions,3).setUsage(THREE.DynamicDrawUsage));
  const snow=new THREE.Points(snowGeometry,
    new THREE.PointsMaterial({color:0xffffff,size:.50,transparent:true,
      opacity:.90,depthWrite:false}));
  snow.frustumCulled=false;
  snow.name="studio-background-snowfall";
  scene.add(snow);

  const tmp=new THREE.Object3D();
  const rootMatrix=new THREE.Matrix4();
  const partMatrix=new THREE.Matrix4();
  const composed=new THREE.Matrix4();
  const localPos=new THREE.Vector3();
  const partScale=new THREE.Vector3();
  const noRotation=new THREE.Quaternion();
  const limbRotation=new THREE.Quaternion();
  const limbAxis=new THREE.Vector3(1,0,0);
  const faceVector=new THREE.Vector3();
  const lastAvatarIds=new Array(LIVE_STUDIO.maxRunners).fill(null);
  let lastFrame=null;
  let biomeId=null;
  let previousCourseBucket=null;
  let cameraPose=null;
  let lastState=null;
  let disposed=false;
  let renderScale=1;
  let courseBuilds=0;
  let avatarColorChanges=0;
  let effectParts=0;
  let snowfallTime=0;
  const currentColors={};

  function put(mesh,index,pos,scale,heading=0){
    tmp.position.set(pos.x,pos.y,pos.z);
    tmp.rotation.set(0,heading,0);
    tmp.scale.set(scale.x,scale.y,scale.z);
    tmp.updateMatrix();
    mesh.setMatrixAt(index,tmp.matrix);
  }
  function paint(id){
    const style=colors[id]??colors.ice;
    materials.road.color.setHex(style.road);
    materials.edge.color.setHex(style.edge);
    materials.line.color.setHex(style.line);
    materials.ground.color.setHex(style.ground);
    materials.trunk.color.setHex(style.trunk);
    materials.crown.color.setHex(style.crown);
    materials.hill.color.setHex(style.hill);
    materials.wall.color.setHex(id==="ice"?0xb2cfe0:0x8b7452);
    // Spruce branch colors vary per block instance, not pastel blue pines.
    materials.crown.color.setHex(0xffffff);
    for(const m of Object.values(materials))m.needsUpdate=true;
    scene.background=new THREE.Color(style.sky);
    scene.fog=new THREE.Fog(style.fog,115,425);
    snow.visible=id==="ice";
    biomeId=id;
    previousCourseBucket=null;
  }
  function roadsidePoint(distance,lateral){
    const p=studioCourseAt(distance);
    return {x:p.x+Math.cos(p.heading)*lateral,y:p.y,
      z:p.z-Math.sin(p.heading)*lateral,heading:p.heading};
  }
  function rebuildCourse(center,distance){
    // Only about 300m of asphalt/scenery on the GPU for a 1500m race.
    // Staging asphalt extends to -40m for all ten rows at GO.
    const start=Math.floor((center-38)/4)*4;
    let rs=0,es=0,ls=0,ts=0,cs=0,hs=0,ws=0,ds=0;
    for(let i=0;i<STUDIO_SCENE_LIMITS.roadSegments;i++){
      const meter=start+(i+.5)*STUDIO_SCENE_LIMITS.segmentMeters;
      if(meter>distance+7)break;
      const at=studioCourseAt(meter);
      // Snowy packed broad path, rather than painted blue asphalt.
      put(road,rs++,{x:at.x,y:at.y-.13,z:at.z},
        {x:21,y:.23,z:4.15},at.heading);
      for(const side of [-1,1]){
        const drift=(i*13+(side===1?7:0))%6;
        const edge=roadsidePoint(meter,side*(10.3+drift*.21));
        put(shoulders,es++,{x:edge.x,y:edge.y-.05,z:edge.z},
          {x:.75+drift*.2,y:.3+drift*.09,z:4.17},edge.heading);
      }
      if(biomeId!=="ice"&&i%3===0){
        for(const side of [-1,0,1]){
          const line=roadsidePoint(meter,side*3.5);
          put(centerlines,ls++,{x:line.x,y:line.y+.006,z:line.z},
            {x:.085,y:.026,z:2.6},line.heading);
        }
      }
      if(meter>=4&&meter<8){
        // Two monumental voxel gate pillars, just outside the start line.
        // They must be INSIDE the camera frustum at 9:16 (unlike the old
        // x=12.9m posts which were entirely off-screen).
        for(const side of [-1,1]){
          const atWall=roadsidePoint(meter,side*10.45);
          put(walls,ws++,{x:atWall.x,y:atWall.y+11.9,z:atWall.z},
            {x:2.35,y:23.8,z:2.3},atWall.heading);
        }
      }
    }
    for(let i=0;i<STUDIO_SCENE_LIMITS.trees;i++){
      const side=i%2===0?-1:1;
      const dist=start+(i*73%305);
      const lateral=side*(16.7+(i*37%25));
      const at=roadsidePoint(dist,lateral);
      const sz=.85+((i*17)%7)*.15;
      put(trunks,ts++,{x:at.x,y:at.y+1.65*sz,z:at.z},
        {x:.80*sz,y:3.3*sz,z:.80*sz});
      for(let level=0;level<4;level++){
        const size=3.8-level*.71;
        put(crowns,cs,{x:at.x,y:at.y+(2.75+level*.73)*sz,z:at.z},
          {x:size*sz,y:(.95-level*.06)*sz,z:size*sz});
        crowns.setColorAt(cs++,new THREE.Color(biomeId==="ice"?
          [0x143a30,0x1b463a,0x20483b,0x18372e][(i+level)%4]:
          [0x285b40,0x1d4f33,0x2c6547,0x234f39][(i+level)%4]));
      }
    }
    for(let i=0;i<STUDIO_SCENE_LIMITS.hills;i++){
      const side=i%2===0?-1:1;
      const at=roadsidePoint(start+i*9,side*(51+(i*19%38)));
      const height=2.7+(i*13%7)*.65;
      put(hills,hs++,{x:at.x,y:at.y-.65+height*.34,z:at.z},
        {x:16+(i%5)*4,y:height,z:14+(i%4)*4});
    }
    for(let i=0;i<STUDIO_SCENE_LIMITS.decorations;i++){
      const side=i%2===0?-1:1;
      const distance=start+6+(i*61%300);
      const lateral=side*(16.5+(i*11%13));
      const at=roadsidePoint(distance,lateral);
      const variant=i%4,size=.42+variant*.21;
      // Low voxel rocks and snow clumps by the shoulders; no giant gems.
      put(decorations,ds,{x:at.x,y:at.y+size*.32,z:at.z},
        {x:size*(variant===0?1.5:.9),y:size*(biomeId==="ice"?.8:.64),z:size*.9});
      decorations.setColorAt(ds++,new THREE.Color(
        biomeId==="ice"?[0xdfe9f7,0xaabed8,0xc4d4e8,0xf5f9ff][variant]:
          [0x4f9b5d,0x91d96b,0x7ebd50,0xdaa27a][variant]
      ));
    }
    decorations.count=ds;
    decorations.instanceColor.needsUpdate=true;
    for(const [mesh,count] of [[road,rs],[shoulders,es],[centerlines,ls],
      [trunks,ts],[crowns,cs],[hills,hs],[walls,ws],[decorations,ds]]){
      mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
    }
    const base=studioCourseAt(start+145);
    ground.position.set(base.x,base.y-.20,base.z);
    if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;
    courseBuilds++;previousCourseBucket=Math.floor(center/8);
  }

  function updateAvatars(state){
    const entries=Array.isArray(state.active)?
      state.active.slice(0,LIVE_STUDIO.maxRunners):[];
    const phase=String(state.phase??"LOBBY");
    const runningPhase=phase==="RUNNING";
    const t=Number(state.raceMs)||0;
    const results=Array.isArray(state.results)?state.results:[];
    const positions=studioCrowdPoses(state);
    realFleet.begin();
    for(let i=0;i<entries.length;i++){
      const r=entries[i],vehicle=resolveVehicle(r.vehicleId)||vehicleForBot(i);
      const parts=blocksFor(vehicle);
      const pose=positions.get(r.id)??studioRunnerPose(r,i,phase,results);
      const rootAngle=pose.heading+
        (phase==="LOBBY"||phase==="COUNTDOWN"?Math.PI:0);
      const running=runningPhase&&r.status==="running";
      const future=studioCourseAt((Number(r.progress)||0)+4);
      const angleDiff=Math.atan2(Math.sin(future.heading-pose.heading),
        Math.cos(future.heading-pose.heading));
      const lean=running?clamp(angleDiff*(vehicle.kind==="motorcycle"?2.0:.16),
        vehicle.kind==="motorcycle"?-.20:-.03,
        vehicle.kind==="motorcycle"?.20:.03):0;
      const bob=running?Math.abs(Math.sin(t*.012+nameHash(r.id)%30))*.028:0;
      const scale=vehicle.kind==="motorcycle"?.96:.79;
      tmp.position.set(pose.x,pose.y+bob,pose.z);
      tmp.rotation.set(0,rootAngle,lean);
      tmp.scale.set(scale,scale,scale);
      tmp.updateMatrix();rootMatrix.copy(tmp.matrix);
      realFleet.renderVehicle(vehicle,r.id,rootMatrix,
        Number(r.progress)||0,running);
      const colorKey=String(r.color)+"|"+vehicle.id;
      if(lastAvatarIds[i]!==r.id||currentColors[i]!==colorKey){
        const palette=paletteFor(r,vehicle);
        for(let part=0;part<VEHICLE_PARTS;part++){
          avatars.setColorAt(i*VEHICLE_PARTS+part,palette[parts[part].style]);
        }
        lastAvatarIds[i]=r.id;
        currentColors[i]=colorKey;
        avatarColorChanges++;
      }
      for(let part=0;part<VEHICLE_PARTS;part++){
        const meta=parts[part];
        localPos.set(meta.p[0],meta.p[1],meta.p[2]);
        // Keep original crisp headlamps, trim and details but let the smooth
        // body, curved tinted cabin and round tires replace opaque voxels.
        const replaced=vehicle.kind==="car"?
          ["body","glass","roof","wheel","rim"].includes(meta.style):
          ["wheel","rim"].includes(meta.style);
        partScale.set(replaced?0:meta.s[0],replaced?0:meta.s[1],
          replaced?0:meta.s[2]);
        const spinning=running&&(meta.role==="spoke"||meta.role==="wheel");
        const glassAngle=meta.role==="windshield"?-.34:
          meta.role==="rearWindow"?.27:0;
        if(spinning)limbRotation.setFromAxisAngle(limbAxis,
          t*.013*(vehicle.kind==="motorcycle"?1.2:1));
        else if(glassAngle)limbRotation.setFromAxisAngle(limbAxis,glassAngle);
        partMatrix.compose(localPos,(spinning||glassAngle)?limbRotation:noRotation,
          partScale);
        composed.multiplyMatrices(rootMatrix,partMatrix);
        avatars.setMatrixAt(i*VEHICLE_PARTS+part,composed);
      }
    }
    realFleet.finish();
    avatars.count=entries.length*VEHICLE_PARTS;
    avatars.instanceMatrix.needsUpdate=true;
    if(avatars.instanceColor)avatars.instanceColor.needsUpdate=true;
    for(let i=entries.length;i<lastAvatarIds.length;i++){
      lastAvatarIds[i]=null;delete currentColors[i];
    }
    return positions;
  }
  function updateEffects(state,center,poses){
    const list=buildStudioEffectParts(state,{
      centerMeters:center,maxParts:STUDIO_EFFECT_LIMITS.maxParts,poses
    });
    let index=0;
    for(const part of list){
      if(index>=STUDIO_EFFECT_LIMITS.maxParts)break;
      put(effects,index,part.position,{
        x:part.scale[0],y:part.scale[1],z:part.scale[2]
      },part.heading);
      effects.setColorAt(index,new THREE.Color(part.color));
      index++;
    }
    effects.count=index;effectParts=index;
    if(index){
      effects.instanceMatrix.needsUpdate=true;
      if(effects.instanceColor)effects.instanceColor.needsUpdate=true;
    }
  }
  function updateSpotlight(state,poses){
    if(state.phase!=="RUNNING"||!Array.isArray(state.active)){
      spotlight.count=0;return;
    }
    const runners=state.active.filter(r=>r.status==="running");
    if(!runners.length){spotlight.count=0;return;}
    // The reference marks a visible member of the peloton, not a tiny
    // distant leader. Follow a stable mid-pack ID during each round, without
    // altering the authoritative classification or pretending there was a gift.
    const ranked=[...runners].sort((a,b)=>
      Number(b.progress)-Number(a.progress)||
      String(a.id).localeCompare(String(b.id)));
    const featured=ranked[Math.floor(ranked.length*.53)];
    const p=poses.get(featured.id);
    if(!p){spotlight.count=0;return;}
    const t=Math.max(0,Number(state.raceMs)||0);
    const pulse=.94+.06*Math.sin(t*.008);
    let n=0;
    for(let k=0;k<18;k++){
      const angle=Math.PI*2*k/18;
      const radius=1.62*pulse;
      put(spotlight,n,{x:p.x+Math.cos(angle)*radius,
        y:p.y+.12,z:p.z+Math.sin(angle)*radius},
        {x:.68,y:.16,z:.24},-angle);
      spotlight.setColorAt(n++,new THREE.Color(k%3===0?0xffad44:0xf06537));
    }
    for(let k=0;k<10;k++){
      const a=Math.PI*2*k/10+t*.00027;
      const radius=1.75+((k*7)%3)*.20;
      const cycle=(t*.0015+k*.37)%1;
      const height=.35+cycle*6.3;
      put(spotlight,n,{x:p.x+Math.cos(a)*radius,
        y:p.y+height,z:p.z+Math.sin(a)*radius},
        {x:.09,y:.8+cycle*.5,z:.09});
      spotlight.setColorAt(n++,new THREE.Color(k%3===0?0xfff3aa:0xffffff));
    }
    spotlight.count=n;
    spotlight.instanceMatrix.needsUpdate=true;
    if(spotlight.instanceColor)spotlight.instanceColor.needsUpdate=true;
  }

  function updatePodium(state){
    const isResults=state.phase==="RESULTS"&&
      Array.isArray(state.results)&&state.results.length>0;
    podium.visible=Boolean(isResults);
    if(!isResults)return;
    const leader=state.active.find(r=>r.id===state.results[0].id);
    if(!leader)return;
    const p=studioCourseAt(Math.max(0,(Number(leader.progress)||0)-9));
    podium.position.set(p.x,p.y-.25,p.z);
    podium.rotation.y=p.heading;
  }
  function resize(){
    if(disposed)return;
    const width=Math.max(1,canvas.clientWidth||canvas.width||540);
    const height=Math.max(1,canvas.clientHeight||canvas.height||960);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.fov=STUDIO_CAMERA.fovPortrait;
    camera.updateProjectionMatrix();
  }
  function setRenderScale(value){
    if(disposed)return renderScale;
    const next=clamp(Number(value)||1,STUDIO_SCENE_LIMITS.qualityMinScale,1);
    if(Math.abs(next-renderScale)>.001){
      renderScale=next;renderer.setPixelRatio(ratio*next);resize();
    }
    return renderScale;
  }
  function update(snapshot,deltaSeconds=1/30){
    if(disposed)return;
    const state=snapshot?.state??snapshot;
    if(!state||typeof state!=="object")return;
    const map=BIOME_ORDER.includes(state.mapId)?state.mapId:"ice";
    if(map!==biomeId)paint(map);
    const dt=clamp(Number(deltaSeconds)||1/30,.001,.2);
    cameraPose=advanceStudioCamera(cameraPose,state,dt);
    camera.position.set(cameraPose.position.x,cameraPose.position.y,
      cameraPose.position.z);
    faceVector.set(cameraPose.target.x,cameraPose.target.y,
      cameraPose.target.z);
    camera.lookAt(faceVector);
    const runners=Array.isArray(state.active)?state.active:[];
    const meters=runners.map(r=>Math.max(0,Number(r.progress)||0))
      .sort((a,b)=>a-b);
    const mid=meters.length?meters[Math.floor(meters.length*.58)]:0;
    const raceDistance=clamp(Number(state.distance)||1200,1000,1500);
    if(previousCourseBucket!==Math.floor(mid/8)){
      rebuildCourse(mid,raceDistance);
    }
    const anchor=studioCourseAt(mid);
    snow.position.set(anchor.x,anchor.y+3,anchor.z);
    snowfallTime+=dt;
    if(snow.visible){
      // Individual square flakes move downward even while lobby time is 0.
      for(let i=0;i<snowCount;i++){
        const height=2+(i*29%83)*.47;
        snowPositions[i*3+1]=2+((height-snowfallTime*(1.2+i%5*.33)+52)%52);
      }
      snowGeometry.attributes.position.needsUpdate=true;
    }
    const crowdPoses=updateAvatars(state);
    updateEffects(state,mid,crowdPoses);
    updateSpotlight(state,crowdPoses);
    updatePodium(state);
    lastState=state;
    camera.updateMatrixWorld(true);
    renderer.render(scene,camera);
  }
  function nameplates({featuredId=null}={}){
    if(!lastState||disposed)return [];
    // Only vehicles within the camera view are exposed to HTML labels.
    // Max 100 anchors; DOM collision culling is handled by the overlay.
    const choices=studioVisibleNameplates(lastState,{
      max:STUDIO_SCENE_LIMITS.maxNameplates,featuredId
    });
    return choices.flatMap(item=>{
      const vehicle=resolveVehicle(item.vehicleId)||resolveVehicle(item.name);
      faceVector.set(item.pose.x,item.pose.y+(vehicle?.kind==="motorcycle"?2.0:1.85),item.pose.z);
      faceVector.project(camera);
      if(faceVector.z<-.9||faceVector.z>1||
        Math.abs(faceVector.x)>1.12||Math.abs(faceVector.y)>1.12)return [];
      return [{
        id:item.id,name:item.name,username:item.username,
        vehicleId:item.vehicleId,rank:item.rank,color:item.color,
        x:(faceVector.x+1)/2,y:(1-faceVector.y)/2
      }];
    });
  }
  function stats(){
    return {cameraCount:1,drawCalls:renderer.info.render.calls,
      triangles:renderer.info.render.triangles,
      runners:avatars.count/STUDIO_SCENE_LIMITS.avatarParts,
      courseRebuilds:courseBuilds,avatarColorChanges,
      effectParts,spotlightParts:spotlight.count,
      ...realFleet.stats(),
      decorations:decorations.count,renderScale,mapId:biomeId};
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const node of [road,shoulders,centerlines,trunks,crowns,hills,walls,
      avatars,decorations,effects,spotlight]){
      scene.remove(node);node.dispose();
    }
    realFleet.dispose();
    scene.remove(ground);ground.geometry.dispose();
    scene.remove(snow);snow.geometry.dispose();snow.material.dispose();
    for(const child of podium.children)child.material.dispose();
    scene.remove(podium);
    fixedGeometry.dispose();
    roadTexture.dispose();groundTexture.dispose();
    decorations.material.dispose();effects.material.dispose();
    spotlight.material.dispose();
    for(const m of Object.values(materials))m.dispose();
    renderer.dispose();
    lastState=null;cameraPose=null;previousCourseBucket=null;
  }
  resize();
  return {scene,camera,renderer,update,resize,setRenderScale,nameplates,stats,
    dispose,limits:STUDIO_SCENE_LIMITS};
}
