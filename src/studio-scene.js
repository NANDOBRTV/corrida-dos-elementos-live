// Studio V5 — complete, self-contained, 9:16 Three.js voxel race scene.
// One PerspectiveCamera; 100 avatars in ONE instanced draw call.
// One 300m rolling corridor (not 1500m allocated). UI/photos come in Part 5.
import * as THREE from "three";
import {LIVE_STUDIO,BIOME_ORDER,RUNNER_COLORS} from "./config.js";
import {
  STUDIO_CAMERA,studioCourseAt,studioPositionOnCourse,studioRunnerPose,
  advanceStudioCamera,studioVisibleNameplates
} from "./studio-camera.js";

export const STUDIO_SCENE_LIMITS=Object.freeze({
  maxRunners:100,avatarParts:14,roadSegments:78,
  segmentMeters:4,trees:76,hills:36,snowParticles:110,
  walls:22,qualityMinScale:.62,maxNameplates:12
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const isFiniteNumber=n=>typeof n==="number"&&Number.isFinite(n);
const colors={
  ice:{sky:0xc7dcf0,fog:0xc7dcf0,ground:0xe3edf5,
    road:0x829db8,edge:0xdde5ee,line:0xeaf1f3,
    trunk:0x485b67,crown:0x497484,hill:0xd0e1eb},
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
  {p:[0,2.53,-.22],s:[.93,.18,.47],style:"hair"}
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
  const skin=[0xf4c8a0,0xa16b4e,0xeac49f,0x795034,0xe6ac89][seed%5];
  const hair=[0x171f29,0x593b2b,0x916740,0x35252f,0xb9a385][seed%5];
  const pants=[0x232c41,0x473d52,0x2d444b,0x473e30][(seed>>>4)%4];
  return {
    shirt:new THREE.Color(color),
    skin:new THREE.Color(skin),
    hair:new THREE.Color(hair),
    sleeve:new THREE.Color(color),
    pants:new THREE.Color(pants),
    shoe:new THREE.Color(0x171c2a),
    eye:new THREE.Color(0x132232),
    mouth:new THREE.Color(0x834f46),
    pack:new THREE.Color(0x566780)
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
  const sphereGeometry=new THREE.IcosahedronGeometry(1,0);
  const makeMat=hex=>new THREE.MeshLambertMaterial({color:hex});
  const materials={
    road:makeMat(0xffffff),edge:makeMat(0xffffff),
    line:makeMat(0xffffff),trunk:makeMat(0xffffff),
    crown:makeMat(0xffffff),hill:makeMat(0xffffff),
    wall:makeMat(0xffffff),ground:makeMat(0xffffff),
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
    materials.crown,STUDIO_SCENE_LIMITS.trees*3);
  const hills=createBatch("studio-small-hills",fixedGeometry,
    materials.hill,STUDIO_SCENE_LIMITS.hills);
  const walls=createBatch("studio-start-walls",fixedGeometry,
    materials.wall,STUDIO_SCENE_LIMITS.walls*2);
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
    new THREE.BufferAttribute(snowPositions,3));
  const snow=new THREE.Points(snowGeometry,
    new THREE.PointsMaterial({color:0xffffff,size:.21,transparent:true,
      opacity:.72,depthWrite:false}));
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
    const start=Math.max(0,Math.floor((center-38)/4)*4);
    let rs=0,es=0,ls=0,ts=0,cs=0,hs=0,ws=0;
    for(let i=0;i<STUDIO_SCENE_LIMITS.roadSegments;i++){
      const meter=start+(i+.5)*STUDIO_SCENE_LIMITS.segmentMeters;
      if(meter>distance+7)break;
      const at=studioCourseAt(meter);
      put(road,rs++,{x:at.x,y:at.y-.17,z:at.z},
        {x:21,y:.28,z:4.15},at.heading);
      for(const side of [-1,1]){
        const edge=roadsidePoint(meter,side*10.8);
        put(shoulders,es++,{x:edge.x,y:edge.y-.1,z:edge.z},
          {x:.42,y:.34,z:4.15},edge.heading);
      }
      if(i%3===0){
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
      const lateral=side*(19+(i*37%21));
      const at=roadsidePoint(dist,lateral);
      const sz=1+((i*17)%7)*.16;
      put(trunks,ts++,{x:at.x,y:at.y+1.3*sz,z:at.z},
        {x:.55*sz,y:2.6*sz,z:.55*sz});
      for(let level=0;level<3;level++){
        put(crowns,cs++,{x:at.x,y:at.y+(2.3+level*.86)*sz,z:at.z},
          {x:(2.0-level*.50)*sz,y:(1.28-level*.15)*sz,
            z:(2.0-level*.50)*sz},Math.PI/4);
      }
    }
    for(let i=0;i<STUDIO_SCENE_LIMITS.hills;i++){
      const side=i%2===0?-1:1;
      const at=roadsidePoint(start+i*9,side*(51+(i*19%38)));
      const height=2.7+(i*13%7)*.65;
      put(hills,hs++,{x:at.x,y:at.y-.65+height*.34,z:at.z},
        {x:16+(i%5)*4,y:height,z:14+(i%4)*4});
    }
    for(const [mesh,count] of [[road,rs],[shoulders,es],[centerlines,ls],
      [trunks,ts],[crowns,cs],[hills,hs],[walls,ws]]){
      mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
    }
    const base=studioCourseAt(start+145);
    ground.position.set(base.x,-.62,base.z);
    courseBuilds++;previousCourseBucket=Math.floor(center/8);
  }

  function updateAvatars(state){
    const entries=Array.isArray(state.active)?
      state.active.slice(0,LIVE_STUDIO.maxRunners):[];
    const phase=String(state.phase??"LOBBY");
    const t=Number(state.raceMs)||0;
    const results=Array.isArray(state.results)?state.results:[];
    for(let i=0;i<entries.length;i++){
      const r=entries[i];
      const pose=studioRunnerPose(r,i,phase,results);
      const rootAngle=pose.heading;
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
    snow.rotation.y=(Number(state.raceMs)||0)*.00005;
    updateAvatars(state);
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
      renderScale,mapId:biomeId};
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const node of [road,shoulders,centerlines,trunks,crowns,hills,walls,
      avatars]){scene.remove(node);node.dispose();}
    scene.remove(ground);ground.geometry.dispose();
    scene.remove(snow);snow.geometry.dispose();snow.material.dispose();
    for(const child of podium.children)child.material.dispose();
    scene.remove(podium);
    fixedGeometry.dispose();sphereGeometry.dispose();
    for(const m of Object.values(materials))m.dispose();
    renderer.dispose();
    lastState=null;cameraPose=null;previousCourseBucket=null;
  }
  resize();
  return {scene,camera,renderer,update,resize,setRenderScale,nameplates,stats,
    dispose,limits:STUDIO_SCENE_LIMITS};
}
