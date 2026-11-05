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

export const STUDIO_SCENE_LIMITS=Object.freeze({
  maxRunners:100,avatarParts:19,roadSegments:78,
  segmentMeters:4,trees:112,hills:46,snowParticles:310,
  walls:22,decorations:100,qualityMinScale:.62,maxNameplates:12
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
const avatarPart=[
  {p:[0,1.15,0],s:[.83,.98,.51],style:"shirt"},
  {p:[0,2.04,0],s:[.76,.78,.72],style:"skin"},
  {p:[0,2.49,-.03],s:[.80,.17,.78],style:"hair"},
  {p:[-.56,1.22,0],s:[.32,.89,.39],style:"sleeve",swing:-1},
  {p:[ .56,1.22,0],s:[.32,.89,.39],style:"sleeve",swing:1},
  {p:[-.23,.33,0],s:[.32,.69,.40],style:"pants",swing:1},
  {p:[ .23,.33,0],s:[.32,.69,.40],style:"pants",swing:-1},
  {p:[-.23,.05,.10],s:[.34,.18,.59],style:"shoe",swing:1},
  {p:[ .23,.05,.10],s:[.34,.18,.59],style:"shoe",swing:-1},
  {p:[-.14,2.14,.365],s:[.105,.12,.035],style:"eye"},
  {p:[ .14,2.14,.365],s:[.105,.12,.035],style:"eye"},
  {p:[0,1.88,.365],s:[.20,.05,.03],style:"mouth"},
  {p:[0,.98,-.32],s:[.47,.66,.27],style:"pack"},
  {p:[0,2.53,-.22],s:[.93,.18,.47],style:"hair"},
  {p:[-.27,1.35,-.28],s:[.19,.67,.065],style:"stripe"},
  {p:[ .27,1.35,-.28],s:[.19,.67,.065],style:"stripe"},
  {p:[-.58,.62,.02],s:[.35,.18,.43],style:"wrist"},
  {p:[ .58,.62,.02],s:[.35,.18,.43],style:"wrist"},
  {p:[0,1.11,-.478],s:[.52,.16,.05],style:"emblem"}
];
function nameHash(value){
  let h=2166136261;
  for(const c of String(value??"")){
    h^=c.charCodeAt(0);h=Math.imul(h,16777619);
  }
  return h>>>0;
}
function paletteFor(r){
  const seed=nameHash(r?.id);
  const color=String(r?.color??RUNNER_COLORS[seed%RUNNER_COLORS.length]);
  // Original, deterministic voxel costumes: high-contrast blocky outfits,
  // not imported platform skins or copies of another game's characters.
  const outfits=[
    [0x162a32,0x18222e,0x25bac3,0x113f52],
    [0x9b275c,0x542445,0xffa1cf,0x682b75],
    [0xebb743,0x915a30,0xffe58b,0xc36b2c],
    [0x9e3344,0x24483d,0xd9bf7a,0x264d38],
    [0x45c1b5,0x245e65,0x89f5e7,0x308c86],
    [0x6548aa,0x342854,0xc9a5ff,0x453086],
    [0xb7b7bf,0x586474,0xe5e9eb,0x414e60],
    [0x30373c,0x171c27,0x7ad1df,0x25404e],
    [0xd58b30,0x644a2f,0xffd46a,0x9c6330],
    [0x5c934d,0x284a32,0xb8dc65,0x3b694a],
    [0xd0b9a2,0x7d4751,0xffd8bf,0x7e6d74],
    [0x2748a6,0x1c2862,0x91dcf7,0x30367b]
  ];
  const outfit=outfits[(seed>>>3)%outfits.length];
  const skin=[0xf4c8a0,0xa16b4e,0xeac49f,0x795034,0xc1c3ca,0xd5a999][seed%6];
  const hair=[0x171f29,0x593b2b,0x916740,0x35252f,0xe5d36a,0x222b38][seed%6];
  const primary=seed%5===0?new THREE.Color(color):new THREE.Color(outfit[0]);
  return {
    shirt:primary,
    skin:new THREE.Color(skin),
    hair:new THREE.Color(hair),
    sleeve:primary,
    pants:new THREE.Color(outfit[1]),
    shoe:new THREE.Color((seed%3===0)?0xe1e6ed:0x171c2a),
    eye:new THREE.Color(0x132232),
    mouth:new THREE.Color(0x834f46),
    pack:new THREE.Color(outfit[3]),
    stripe:new THREE.Color(outfit[2]),
    wrist:new THREE.Color(outfit[2]),
    emblem:new THREE.Color(outfit[2])
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
      if(meter<50&&i%3===0){
        for(const side of [-1,1]){
          const atWall=roadsidePoint(meter,side*12.3);
          put(walls,ws++,{x:atWall.x,y:atWall.y+1.35,z:atWall.z},
            {x:.9,y:2.9,z:11.6},atWall.heading);
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
    ground.position.set(base.x,base.y-.48,base.z);
    if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;
    courseBuilds++;previousCourseBucket=Math.floor(center/8);
  }

  function updateAvatars(state){
    const entries=Array.isArray(state.active)?
      state.active.slice(0,LIVE_STUDIO.maxRunners):[];
    const phase=String(state.phase??"LOBBY");
    const t=Number(state.raceMs)||0;
    const results=Array.isArray(state.results)?state.results:[];
    const positions=studioCrowdPoses(state);
    for(let i=0;i<entries.length;i++){
      const r=entries[i];
      const pose=positions.get(r.id)??studioRunnerPose(r,i,phase,results);
      // During registration the runners face the audience; when the
      // countdown ends they turn and run forward, using the same camera.
      const rootAngle=pose.heading+
        (phase==="LOBBY"||phase==="COUNTDOWN"?Math.PI:0);
      const running=phase==="RUNNING"&&r.status==="running";
      const seed=nameHash(r.id)%1000;
      const gait=running?Math.sin(t*.013+seed)*.22:0;
      const bob=running?Math.abs(Math.sin(t*.013+seed))*.085:0;
      tmp.position.set(pose.x,pose.y+bob,pose.z);
      tmp.rotation.set(0,rootAngle,0);
      tmp.scale.set(1,1,1);
      tmp.updateMatrix();rootMatrix.copy(tmp.matrix);
      if(lastAvatarIds[i]!==r.id||currentColors[i]!==r.color){
        const palette=paletteFor(r);
        for(let part=0;part<avatarPart.length;part++){
          avatars.setColorAt(i*avatarPart.length+part,
            palette[avatarPart[part].style]);
        }
        lastAvatarIds[i]=r.id;
        currentColors[i]=r.color;
        avatarColorChanges++;
      }
      for(let part=0;part<avatarPart.length;part++){
        const meta=avatarPart[part];
        localPos.set(meta.p[0],meta.p[1],meta.p[2]+
          (meta.swing?meta.swing*gait:0));
        partScale.set(meta.s[0],meta.s[1],meta.s[2]);
        partMatrix.compose(localPos,noRotation,partScale);
        composed.multiplyMatrices(rootMatrix,partMatrix);
        avatars.setMatrixAt(i*avatarPart.length+part,composed);
      }
    }
    avatars.count=entries.length*avatarPart.length;
    avatars.instanceMatrix.needsUpdate=true;
    if(avatars.instanceColor)avatars.instanceColor.needsUpdate=true;
    // No stale names or old characters persist after the round resets.
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
    updatePodium(state);
    lastState=state;
    camera.updateMatrixWorld(true);
    renderer.render(scene,camera);
  }
  function nameplates({featuredId=null}={}){
    if(!lastState||disposed)return [];
    const choices=studioVisibleNameplates(lastState,{
      max:STUDIO_SCENE_LIMITS.maxNameplates,featuredId
    });
    return choices.flatMap(item=>{
      faceVector.set(item.pose.x,item.pose.y+2.95,item.pose.z);
      faceVector.project(camera);
      if(faceVector.z<-.9||faceVector.z>1||
        Math.abs(faceVector.x)>1.12||Math.abs(faceVector.y)>1.12)return [];
      return [{
        id:item.id,name:item.name,rank:item.rank,color:item.color,
        x:(faceVector.x+1)/2,y:(1-faceVector.y)/2
      }];
    });
  }
  function stats(){
    return {cameraCount:1,drawCalls:renderer.info.render.calls,
      triangles:renderer.info.render.triangles,
      runners:avatars.count/STUDIO_SCENE_LIMITS.avatarParts,
      courseRebuilds:courseBuilds,avatarColorChanges,
      effectParts,decorations:decorations.count,
      renderScale,mapId:biomeId};
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const node of [road,shoulders,centerlines,trunks,crowns,hills,walls,
      avatars,decorations,effects]){
      scene.remove(node);node.dispose();
    }
    scene.remove(ground);ground.geometry.dispose();
    scene.remove(snow);snow.geometry.dispose();snow.material.dispose();
    for(const child of podium.children)child.material.dispose();
    scene.remove(podium);
    fixedGeometry.dispose();
    roadTexture.dispose();groundTexture.dispose();
    decorations.material.dispose();effects.material.dispose();
    for(const m of Object.values(materials))m.dispose();
    renderer.dispose();
    lastState=null;cameraPose=null;previousCourseBucket=null;
  }
  resize();
  return {scene,camera,renderer,update,resize,setRenderScale,nameplates,stats,
    dispose,limits:STUDIO_SCENE_LIMITS};
}
