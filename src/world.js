import * as THREE from "three";
import { TRACK_LENGTH, PREVIOUS_TRACK_LENGTH, STREAM_TILE_LENGTH, biome, laneX, LANES, LANE_WIDTH } from "./config.js";
import {activeGiftObstacles,MAX_ACTIVE_GIFT_OBSTACLES} from "./gift-obstacles.js";
import {QUALITY_SETTINGS} from "./performance.js";
import {trackCenter,trackPoint,trackBounds,COURSE_MILESTONES} from "./track-path.js";
import {visualStartingDistance,gridTrackPoint,GRID_COLUMNS,GRID_ROW_GAP} from "./start-grid.js";
import {createCameraDirector} from "./camera-director.js";
import {snowbankProfile,clearOfWTrack} from "./snow-clearance.js";

const boxGeometry=new THREE.BoxGeometry(1,1,1);
const octahedronGeometry=new THREE.OctahedronGeometry(1,0);
export function createWorld(canvas,{quality="balanced"}={}) {
  const profile=QUALITY_SETTINGS[quality]??QUALITY_SETTINGS.balanced;
  const sceneDetail=i=>profile.sceneStep===1||i%4<2;
  const scene=new THREE.Scene();
  const finishGroup=new THREE.Group();finishGroup.name="absolute-finish-line";scene.add(finishGroup);
  const camera=new THREE.PerspectiveCamera(58,1,.1,700);
  // Third-person chase perspective for the vertical race format.
  camera.position.set(0,12.2,-24);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"low-power"});
  const baselinePixelRatio=Math.min(window.devicePixelRatio||1,profile.pixelRatio);
  let renderScale=1;
  renderer.setPixelRatio(baselinePixelRatio);
  renderer.shadowMap.enabled=profile.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const root=new THREE.Group();
  root.name="streamed-course";
  scene.add(root);
  const courseMilestones=new THREE.Group();
  courseMilestones.name="course-milestones";
  scene.add(courseMilestones);
  const courseStart=new THREE.Group();
  courseStart.name="course-start";
  scene.add(courseStart);
  const terrainGroup=new THREE.Group();
  terrainGroup.name="winter-terrain";
  scene.add(terrainGroup);
  const materials=new Map();
  let mapId="";
  let currentLength=TRACK_LENGTH;
  let renderedLength=PREVIOUS_TRACK_LENGTH;
  const streamingLength=STREAM_TILE_LENGTH*2;
  let weather=null,focusRing=null,boostTrails=null,giftObstacleMesh=null;
  let cameraInitialized=false;
  let lastCameraPhase=null;
  let visibleCloseup=null;
  let curvedCourse=false;
  let ribbons=[],curvedBatches=[],curvedSingles=[];
  const upAxis=new THREE.Vector3(0,1,0);
  const reusableMatrix=new THREE.Matrix4();
  const reusableRotation=new THREE.Quaternion();
  const reusablePosition=new THREE.Vector3();
  const reusableScale=new THREE.Vector3();
  const baseRotation=new THREE.Quaternion();
  const trailTransform=new THREE.Object3D();
  const trailColor=new THREE.Color();
  const cameraTarget=new THREE.Vector3(0,1,10);
  const positionTarget=new THREE.Vector3();
  const lookTarget=new THREE.Vector3();
  const director=createCameraDirector();
  const closePosition=new THREE.Vector3();
  const closeLook=new THREE.Vector3();
  function material(color,emissive=0) {
    const key=String(color)+"/"+emissive;
    if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({
      color,roughness:emissive?.57:.91,metalness:emissive?.10:0,
      emissive:emissive?color:0x000000,emissiveIntensity:emissive
    }));
    return materials.get(key);
  }
  function block(parent,x,y,z,w,h,d,color,glow=0) {
    const obj=new THREE.Mesh(boxGeometry,material(color,glow));
    obj.position.set(x,y,z); obj.scale.set(w,h,d);
    obj.castShadow=h>.3 && glow===0;obj.receiveShadow=true;
    parent.add(obj);return obj;
  }
  function rock(parent,x,z,size,color) {
    const obj=new THREE.Mesh(octahedronGeometry,material(color));
    obj.position.set(x,size*.42,z);obj.scale.set(size,size*.63,size);
    obj.rotation.y=(Math.abs(x*47+z*13)%50)/37;
    obj.castShadow=true;parent.add(obj);
  }
  function label(text,x,y,z,color="#f5fbef",parent=root) {
    const c=document.createElement("canvas");c.width=512;c.height=128;
    const ctx=c.getContext("2d");
    ctx.fillStyle="rgba(8,25,21,.85)";ctx.fillRect(12,14,488,101);
    ctx.strokeStyle=color;ctx.lineWidth=6;ctx.strokeRect(12,14,488,101);
    ctx.fillStyle=color;ctx.font="bold 54px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(text,256,65,470);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
    sprite.position.set(x,y,z);sprite.scale.set(8,2,1);
    parent.add(sprite);
  }
  function pine(x,z,size=1,snow=false) {
    if(snow&&curvedCourse&&!clearOfWTrack(z,{x,width:5*size,depth:5*size}))return;
    const t=new THREE.Group();t.position.set(x,0,z);t.scale.setScalar(size);root.add(t);
    block(t,0,1,0,.58,2,.58,0x69503a);
    block(t,0,2.4,0,2.2,1.8,2.2,snow?0x34584b:0x2e8551);
    block(t,0,3.5,0,1.55,1.3,1.55,snow?0x426b56:0x37a665);
    block(t,0,4.4,0,.88,.95,.88,snow?0x567766:0x53bb71);
    if(snow){
      // White snow caps + dark evergreen branches like the supplied winter race.
      block(t,0,3.34,0,2.32,.22,2.32,0xeaf2fb);
      block(t,0,4.23,0,1.70,.18,1.70,0xf4f7fc);
      block(t,0,4.88,0,.99,.17,.99,0xffffff);
    }
  }
  function crystal(x,z,size=1,color=0x95eaff) {
    if(curvedCourse&&!clearOfWTrack(z,{x,width:4*size,depth:4*size}))return;
    const m=new THREE.Mesh(octahedronGeometry,material(color,.18));
    m.position.set(x,size*.9,z);m.scale.set(size*.72,size*1.25,size*.72);m.rotation.z=.18;
    root.add(m);
    block(root,x,.18,z,size*1.35,.34,size*1.35,0x91cad2);
  }
  function arch(z,c,parent=root) {
    block(parent,-6.15,3.1,z,.7,6.2,.8,0x2a3d38);
    block(parent,6.15,3.1,z,.7,6.2,.8,0x2a3d38);
    block(parent,0,6.25,z,13,1.0,.85,c,.15);
  }
  function scenery(id) {
    // Static winter scenery stays outside EVERY arm of the drivable route.
    // Batching merges equal geometry/material meshes to preserve draw-call budget.
    const sections=Math.ceil(renderedLength/150);
    for(let section=0;section<sections;section++){
      const base=section*150;
      if(id==="ice"){
        for(let i=0;i<40;i++)if(sceneDetail(i))pine(
          (i%2?-1:1)*(11+(i%6)*2.4),base+(i*21)%150,.65+(i%4)*.18,true);
        for(let i=0;i<30;i++)if(sceneDetail(i))crystal(
          (i%2?-1:1)*(9+(i%5)*3),base+(i*23+5)%150,.7+(i%5)*.19);
        // Frozen water remains beyond the roadside, never painted across
        // a crossing section of the W-shaped asphalt.
        for(const z of [29,81,123]){
          const icePatch={x:-24,width:6,depth:7};
          if(!curvedCourse||clearOfWTrack(base+z,icePatch))
            block(root,icePatch.x,.02,base+z,icePatch.width,.06,icePatch.depth,0x8acfe3);
        }
      } else {
        for(let i=0;i<48;i++)if(sceneDetail(i))pine(
          (i%2?-1:1)*(10+(i%6)*2.5),base+(i*17+7)%150,.65+(i%5)*.16);
        for(let z=0;z<150;z+=15)
          block(root,17,.03,base+z+7.5,4,.06,15,0x48a4d2);
        for(const z of [29,70,115]){
          block(root,17,.35,base+z,7,.6,3.6,0xa07849);
          block(root,13.8,.9,base+z,.18,1,3.6,0x704e31);
          block(root,20.2,.9,base+z,.18,1,3.6,0x704e31);
        }
        for(let i=0;i<24;i++)if(sceneDetail(i))rock(root,
          (i%2?-1:1)*(8+(i%5)*2.6),base+(i*29)%150,.65,0x87938c);
      }
    }
  }
  // Gift-triggered obstacles use exactly one instanced draw call. None at rest.
  function makeGiftObstacleMesh(id){
    giftObstacleMesh=new THREE.InstancedMesh(
      id==="ice"?octahedronGeometry:boxGeometry,
      material(id==="ice"?0x65daf6:0x8c6139,.07),
      MAX_ACTIVE_GIFT_OBSTACLES
    );
    giftObstacleMesh.name="gift-obstacle-batch";
    giftObstacleMesh.count=0;
    giftObstacleMesh.frustumCulled=false;
    giftObstacleMesh.castShadow=profile.shadows;
    root.add(giftObstacleMesh);
  }
  function drawGiftObstacles(state){
    if(!giftObstacleMesh)return;
    const hazards=activeGiftObstacles(state);
    let count=0;
    for(const h of hazards){
      if(count>=MAX_ACTIVE_GIFT_OBSTACLES)break;
      const p=curvedCourse?trackPoint(h.z,laneX(h.lane),.65):
        {x:laneX(h.lane),y:.65,z:h.z,heading:0};
      trailTransform.position.set(p.x-root.position.x,p.y,p.z-root.position.z);
      trailTransform.rotation.set(0,p.heading,0);
      trailTransform.scale.set(h.kind==="ice"?.85:1.3,h.kind==="ice"?1.35:.85,
        h.kind==="ice"?.85:.95);
      trailTransform.updateMatrix();
      giftObstacleMesh.setMatrixAt(count++,trailTransform.matrix);
    }
    giftObstacleMesh.count=count;
    giftObstacleMesh.visible=count>0;
    if(count)giftObstacleMesh.instanceMatrix.needsUpdate=true;
  }
  // Agrupa centenas de blocos voxel estáticos em InstancedMesh.
  // Renderiza cada cor/geometria em uma chamada, preservando transformações de árvores,
  // e cristais nos dois biomas. Os corredores animados são objetos separados.
  // All props keep their original relative positions. When a 300m tile rolls
  // forward, only cached GPU matrices change; no fresh trees or draw calls.
  function courseMatrix(original,base,target=new THREE.Matrix4()){
    original.decompose(reusablePosition,reusableRotation,reusableScale);
    const p=trackPoint(base+reusablePosition.z,reusablePosition.x,reusablePosition.y);
    const origin=trackCenter(base);
    const localZ=p.z-origin.z;
    baseRotation.setFromAxisAngle(upAxis,p.heading);
    reusableRotation.premultiply(baseRotation);
    return target.compose(new THREE.Vector3(p.x-origin.x,p.y,localZ),reusableRotation,reusableScale);
  }
  function batchStaticScenery(){
    root.updateWorldMatrix(true,true);
    const inverseRoot=new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups=new Map();
    const singles=[];
    root.traverse(obj=>{
      if(!obj.isMesh||obj.isInstancedMesh||obj.userData?.noCourseWarp||
        !obj.material||(obj.geometry!==boxGeometry&&obj.geometry!==octahedronGeometry))return;
      const key=[obj.geometry.uuid,obj.material.uuid,obj.castShadow?"1":"0",
        obj.receiveShadow?"1":"0"].join(":");
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(obj);
    });
    const local=new THREE.Matrix4();
    for(const group of groups.values()){
      if(group.length<2){
        if(curvedCourse){
          const mesh=group[0];
          const source=local.multiplyMatrices(inverseRoot,mesh.matrixWorld).clone();
          mesh.parent.remove(mesh);root.add(mesh);
          singles.push({mesh,source});
        }
        continue;
      }
      const first=group[0];
      const instance=new THREE.InstancedMesh(first.geometry,first.material,group.length);
      instance.name="voxel-batch";
      instance.castShadow=first.castShadow&&profile.shadows;
      instance.receiveShadow=first.receiveShadow;
      instance.frustumCulled=false;
      const sources=[];
      for(let i=0;i<group.length;i++){
        const mesh=group[i];
        local.multiplyMatrices(inverseRoot,mesh.matrixWorld);
        sources.push(local.clone());
        instance.setMatrixAt(i,local);
        mesh.parent.remove(mesh);
      }
      instance.instanceMatrix.needsUpdate=true;
      root.add(instance);
      if(curvedCourse)curvedBatches.push({instance,sources});
    }
    curvedSingles=singles;
  }
  function makeRibbon(name,left,right,y,color){
    const step=4,segments=Math.ceil(renderedLength/step);
    const positions=new Float32Array((segments+1)*6);
    const normals=new Float32Array(positions.length);
    const indices=[];
    for(let i=0;i<=segments;i++){
      normals[i*6+1]=1;normals[i*6+4]=1;
      if(i<segments){
        const a=2*i;
        indices.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
    geometry.setAttribute("normal",new THREE.BufferAttribute(normals,3));
    const mat=new THREE.MeshStandardMaterial({color,roughness:.87,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.name=name;mesh.frustumCulled=false;mesh.receiveShadow=true;
    mesh.userData.courseRibbon=true;
    root.add(mesh);
    ribbons.push({mesh,left,right,y,segments,step});
  }
  function updateCurvedCourse(base){
    if(!curvedCourse)return;
    const origin=trackCenter(base);
    root.position.set(origin.x,0,origin.z);
    root.userData.baseDistance=base;
    for(const r of ribbons){
      const attr=r.mesh.geometry.attributes.position;
      const arr=attr.array;
      for(let i=0;i<=r.segments;i++){
        const dist=base+Math.min(renderedLength,i*r.step);
        const left=trackPoint(dist,r.left,r.y),right=trackPoint(dist,r.right,r.y);
        const j=i*6;
        arr[j]=left.x-origin.x;arr[j+1]=left.y;arr[j+2]=left.z-origin.z;
        arr[j+3]=right.x-origin.x;arr[j+4]=right.y;arr[j+5]=right.z-origin.z;
      }
      attr.needsUpdate=true;
    }
    for(const {instance,sources} of curvedBatches){
      for(let i=0;i<sources.length;i++)instance.setMatrixAt(i,courseMatrix(sources[i],base,reusableMatrix));
      instance.instanceMatrix.needsUpdate=true;
    }
    for(const {mesh,source} of curvedSingles){
      courseMatrix(source,base,reusableMatrix);
      reusableMatrix.decompose(mesh.position,mesh.quaternion,mesh.scale);
    }
  }
  function addCourseMilestones(){
    const start=trackCenter(0);
    courseStart.position.set(start.x,start.y,start.z);
    courseStart.rotation.y=start.heading;
    // Video reference: ten avatars across each row, five rows for 50 players.
    // The dark 21m-wide staging strip keeps everyone on snow-free asphalt.
    const staging=block(courseStart,0,.07,-25,20.2,.12,52,
      biome(mapId).road);
    staging.name="starting-grid-asphalt";
    for(let column=1;column<GRID_COLUMNS;column++){
      const x=(column-GRID_COLUMNS/2)*LANE_WIDTH;
      for(let row=1;row<=5;row++){
        block(courseStart,x,.145,-row*GRID_ROW_GAP+.6,.065,.012,1.20,0xb3bcc7);
      }
    }
    block(courseStart,0,.16,0,19.8,.05,.9,0xeef7ff);
    const gantry=trackCenter(TRACK_LENGTH);
    finishGroup.position.set(gantry.x,gantry.y,gantry.z);
    finishGroup.rotation.y=gantry.heading;
    arch(0,0xffe7a4,finishGroup);
    block(finishGroup,0,.14,0,19.8,.05,1.2,0xfff5c6);
    label("CHEGADA",0,7.2,0,"#f5fbef",finishGroup);
    for(const km of COURSE_MILESTONES){
      const c=trackCenter(km);
      const group=new THREE.Group();
      group.position.set(c.x,c.y,c.z);
      group.rotation.y=c.heading;
      group.name="checkpoint-"+km;
      courseMilestones.add(group);
      // Checkpoint stripe and distance sign live at the unique absolute kilometer,
      // never at the start of every streamed tile.
      block(group,0,.12,0,19.8,.045,.5,0xffe8a2);
      block(group,12,1.9,0,.32,3.8,.32,0x36515f);
      label(km%1000===0?"KM "+km/1000:String(km)+" m",12,4.0,0,
        "#fff2b3",group);
    }
  }
  function setupAtmosphere(id){
    // Ice: no airborne snow over the racetrack. Snow remains in mountains,
    // pine branches and protected outer banks, but the asphalt stays clean.
    // Forest keeps its inexpensive falling-leaf ambient particles.
    if(id==="forest"){
      const count=profile.sceneStep>1?95:170;
      const positions=new Float32Array(count*3);
      for(let i=0;i<count;i++){
        const seed=((i*97+13)%131)/131;
        positions[i*3]=(seed-.5)*29;
        positions[i*3+1]=((i*67)%109)/109*15+.3;
        positions[i*3+2]=((i*47)%127)/127*65-16;
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
      weather=new THREE.Points(geometry,new THREE.PointsMaterial({
        color:0xd6f2a1,size:.13,transparent:true,opacity:.62,
        depthWrite:false,sizeAttenuation:true
      }));
      weather.name="biome-weather-particles";
      weather.frustumCulled=false;
      root.add(weather);
    }
    focusRing=new THREE.Mesh(new THREE.RingGeometry(.70,1.02,32),
      new THREE.MeshBasicMaterial({color:0xff7f45,transparent:true,opacity:.8,
        depthWrite:false,side:THREE.DoubleSide}));
    focusRing.name="leader-focus-ring";
    focusRing.rotation.x=-Math.PI/2;
    focusRing.visible=false;
    root.add(focusRing);
    // Single draw call for up to fifty active turbos, three glow streaks each.
    boostTrails=new THREE.InstancedMesh(
      new THREE.BoxGeometry(1,1,1),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.72,
        depthWrite:false,blending:THREE.AdditiveBlending}),
      150
    );
    boostTrails.name="boost-trails";
    boostTrails.count=0;
    boostTrails.visible=false;
    boostTrails.frustumCulled=false;
    root.add(boostTrails);
  }
  function updateSpeedTrails(race){
    if(!boostTrails)return;
    const active=Array.isArray(race.active)?race.active:[];
    if(race.phase!=="RUNNING"){boostTrails.count=0;boostTrails.visible=false;return;}
    let count=0;
    for(let i=0;i<active.length&&count<150;i++){
      const r=active[i];
      if(r.status!=="running"||!(r.turboUntil>race.raceMs))continue;
      const z=visualStartingDistance(r,i);
      trailColor.set(r.color||0x9dfaff);
      for(let j=0;j<3&&count<150;j++){
        const v=curvedCourse?gridTrackPoint(z-.85-j*.72,laneX(r.lane),.22+.08*(j%2)):
          {x:laneX(r.lane),y:.22+.08*(j%2),z:z-.85-j*.72,heading:0};
        trailTransform.position.set(v.x-root.position.x,v.y,v.z-root.position.z);
        trailTransform.scale.set(.20-j*.035,.10,.75);
        trailTransform.rotation.set(0,v.heading,0);
        trailTransform.updateMatrix();
        boostTrails.setMatrixAt(count,trailTransform.matrix);
        boostTrails.setColorAt(count,trailColor);
        count++;
      }
    }
    boostTrails.count=count;
    boostTrails.visible=count>0;
    if(count){
      boostTrails.instanceMatrix.needsUpdate=true;
      if(boostTrails.instanceColor)boostTrails.instanceColor.needsUpdate=true;
    }
  }
  function animateAtmosphere(dt,z){
    if(!weather)return;
    const arr=weather.geometry.attributes.position.array;
    for(let i=0;i<arr.length;i+=3){
      arr[i+1]-=Math.min(.2,dt)*(mapId==="ice"?1.9:.65);
      if(arr[i+1]<.25)arr[i+1]+=14.5;
      arr[i]+=(mapId==="ice"?.07:.19)*dt;
      if(arr[i]>15)arr[i]-=30;
    }
    weather.geometry.attributes.position.needsUpdate=true;
    // Drift follows the race without rebuilding or reallocating geometry.
    const p=curvedCourse?trackCenter(z):{x:0,y:0,z};
    weather.position.z=p.z-root.position.z;
    weather.position.x=p.x-root.position.x;
    weather.position.y=p.y;
  }
  function clearMap() {
    for(const owner of [root,finishGroup,courseStart,courseMilestones,terrainGroup])while(owner.children.length){
      const child=owner.children[0];owner.remove(child);
      child.traverse(obj=>{
        if(obj.isSprite){ if(obj.material?.map)obj.material.map.dispose();obj.material?.dispose(); }
        if(obj.isInstancedMesh&&typeof obj.dispose==="function")obj.dispose();
        if(obj.userData?.courseRibbon){obj.geometry.dispose();obj.material.dispose();}
        if(obj.isPoints||obj.name==="leader-focus-ring"||obj.name==="boost-trails"){
          obj.geometry?.dispose();obj.material?.dispose();
        }
      });
    }
    for(const mat of materials.values())mat.dispose();materials.clear();
    weather=null;focusRing=null;boostTrails=null;giftObstacleMesh=null;
    ribbons=[];curvedBatches=[];curvedSingles=[];
    finishGroup.position.set(0,0,0);finishGroup.rotation.set(0,0,0);
    courseStart.position.set(0,0,0);courseStart.rotation.set(0,0,0);
    // Remove old biome lighting but preserve runner meshes mounted directly in the scene.
    for(const child of [...scene.children])if(child.isLight)scene.remove(child);
  }
  function setMap(id,length=TRACK_LENGTH) {
    const settings=biome(id);
    const targetLength=[150,PREVIOUS_TRACK_LENGTH,TRACK_LENGTH].includes(length)?length:TRACK_LENGTH;
    if(mapId===settings.id&&currentLength===targetLength)return;
    clearMap();mapId=settings.id;currentLength=targetLength;
    director.reset();visibleCloseup=null;cameraInitialized=false;lastCameraPhase=null;
    curvedCourse=targetLength===TRACK_LENGTH;
    // A 400m lap fits in memory as one complete circuit; legacy races
    // also reuse the same 400m circuit without loading repeated geometry.
    renderedLength=targetLength===TRACK_LENGTH?TRACK_LENGTH:targetLength;
    root.position.set(0,0,0);root.userData.baseDistance=0;
    scene.background=new THREE.Color(settings.sky);
    scene.fog=new THREE.Fog(settings.fog,curvedCourse?85:30,curvedCourse?300:109);
    const ambient=new THREE.HemisphereLight(settings.sky,settings.ground,1.7);
    scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xfff1d2,2.4);
    sun.position.set(-17,34,20);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
    sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;
    scene.add(sun);
    if(curvedCourse){
      // Previous 125m snow slabs overlapped OTHER arms of the W road. Use
      // ONE static snow field whose top is below the lowest asphalt point.
      // This guarantees no white ground can project through the road.
      const bounds=trackBounds(2);
      const terrain=block(terrainGroup,
        (bounds.minX+bounds.maxX)/2,-1.4,(bounds.minZ+bounds.maxZ)/2,
        bounds.maxX-bounds.minX+240,2,bounds.maxZ-bounds.minZ+240,
        settings.ground);
      terrain.name="winter-terrain-floor";
      terrain.castShadow=false;
      // Decorative peaks are allowed only after a footprint-distance test
      // against the ENTIRE closed course, including its tight return bends.
      for(let dz=30;dz<renderedLength;dz+=60){
        for(const side of [-1,1]){
          const bump=((dz*7+(side+2)*13)%5);
          for(const [offset,shift,size] of [
            [38+bump*4,0,6+bump*1.2],
            [64+bump*4,13,9+bump*1.7],
            [94+bump*5,-8,17+bump*2.5]
          ]){
            const x=side*offset,z=dz+shift;
            if(clearOfWTrack(z,{x,width:size*2.4,depth:size*2.4}))
              rock(root,x,z,size,settings.id==="ice"?0xdce7f2:0x698e74);
          }
        }
      }
    }else{
      const ground=block(root,0,-.25,renderedLength/2,180,.5,renderedLength+100,settings.ground);
      ground.userData.noCourseWarp=true;
    }
    // Bend lanes, shoulders, barriers and scenery along the same W circuit.
    // Older 150m/300m snapshots retain their straight layout.
    if(curvedCourse){
      makeRibbon("course-shoulder",-11.6,11.6,-.055,settings.id==="ice"?0x66798e:0x728e6b);
      makeRibbon("course-asphalt",-9.45,9.45,.078,settings.road);
      for(const side of [-1,1]){
        makeRibbon("course-edge-"+side,side*9.40,side*9.82,.22,settings.trim);
        makeRibbon("course-guardrail-"+side,side*10.15,side*10.55,.37,
          settings.id==="ice"?0xdbe9f3:0xb7a077);
      }
      for(let z=10;z<renderedLength;z+=24)for(const side of [-1,1])
        block(root,side*10.35,.45,z,.15,.78,.17,0x718897);
    }else{
      block(root,0,.025,renderedLength/2,11.7,.1,renderedLength+4,settings.road);
    }
    if(settings.id==="ice"){
      // Distinctive jagged snow banks at the sides of a wide grey snow raceway.
      for(let z=7;z<renderedLength;z+=14){
        for(const side of [-1,1]){
          const variation=((z*13+side*17)%7+7)%7;
          const bank=snowbankProfile(side,variation);
          // Never allow a white snow polygon to intrude into any lane, even
          // when another arm of the closed W passes nearby.
          if(!curvedCourse||clearOfWTrack(z,bank))
            block(root,bank.x,.075,z,bank.width,.12,bank.depth,0xf0f4fc);
        }
      }
    }
    if(!curvedCourse){
      block(root,-6.0,.26,renderedLength/2,.38,.44,renderedLength+4,settings.trim);
      block(root,6.0,.26,renderedLength/2,.38,.44,renderedLength+4,settings.trim);
    }
    // Thin dashed lane dividers keep 10 competitors readable without
    // adding dynamic geometry (GPU batching handles the static stripes).
    for(let divider=1;divider<LANES;divider++){
      const x=(divider-LANES/2)*LANE_WIDTH;
      for(let z=5;z<renderedLength;z+=10)
        block(root,x,.086,z,.07,.02,2.0,0xece5c3);
    }
    // One start/finish location on the continuous 400m circuit.
    if(curvedCourse) addCourseMilestones();
    else{
      arch(targetLength,0xffe7a4);
      block(root,0,.09,0,11.5,.03,.65,settings.id==="ice"?0xf5faff:0xe2f2d4);
      block(root,0,.09,targetLength,11.5,.03,1.2,0xffecc3);
    }
    scenery(settings.id);
    setupAtmosphere(settings.id);
    if(!curvedCourse)label("CHEGADA",0,7.2,targetLength);
    batchStaticScenery();
    updateCurvedCourse(0);
    makeGiftObstacleMesh(settings.id);
  }
  function setRenderScale(value) {
    const next=Math.max(.65,Math.min(1,Number(value)||1));
    if(Math.abs(next-renderScale)<.001)return renderer.getPixelRatio();
    renderScale=next;
    renderer.setPixelRatio(baselinePixelRatio*renderScale);
    resize(); // Keeps the existing CSS canvas size and camera perspective.
    return renderer.getPixelRatio();
  }
  function getRenderScale(){return renderScale;}
  function resize() {
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.fov=w<h?68:57;camera.updateProjectionMatrix();
  }
  function render(race,dt) {
    const active=Array.isArray(race.active)?race.active:[];
    // Follow the middle of the pack, so racers stay visible ahead of the camera.
    const distances=active.map(r=>Math.max(0,Number(r.progress)||0)).sort((a,b)=>a-b);
    const middle=distances.length?distances[Math.floor(distances.length*.45)]:0;
    const z=Math.min(currentLength,middle);
    if(currentLength===TRACK_LENGTH){
      // A full 400m closed circuit is rendered once; no streaming roll
      // or scenery rebuild on each additional lap.
      if(root.userData.baseDistance!==0)updateCurvedCourse(0);
    }
    const alpha=1-Math.exp(-5.8*Math.min(dt,.2));
    const center=curvedCourse?trackCenter(z):{x:0,y:0,z,heading:0};
    const before=curvedCourse?trackCenter(Math.max(0,z-72)):center;
    const after=curvedCourse?trackCenter(Math.min(currentLength,z+72)):center;
    const yawDelta=curvedCourse?Math.abs(after.heading-before.heading):0;
    const overview=Math.min(1,Math.max(0,(yawDelta-.22)/1.30));
    // Camera remains anchored to the pack's own tangent, not a different arm
    // of a hairpin. This keeps 50 avatars in frame during 180° turns.
    const backDistance=26+overview*40;
    const height=13+overview*50;
    const forwardDistance=12+overview*13;
    const forwardX=Math.sin(center.heading),forwardZ=Math.cos(center.heading);
    positionTarget.set(center.x-forwardX*backDistance,
      center.y+height,center.z-forwardZ*backDistance);
    lookTarget.set(center.x+forwardX*forwardDistance,
      center.y+1.5,center.z+forwardZ*forwardDistance);
    // From opening the registration lobby until the countdown reaches zero:
    // one stable frontal wide camera, all 10 columns within the portrait frame.
    // At GO, cut immediately behind the pack, matching the reference video.
    const opening=race.phase==="LOBBY"||race.phase==="COUNTDOWN"?1:0;
    if(opening>0){
      const first=curvedCourse?trackCenter(z):{x:0,y:0,z,heading:0};
      const forwardX=Math.sin(first.heading),forwardZ=Math.cos(first.heading);
      const sideX=Math.cos(first.heading),sideZ=-Math.sin(first.heading);
      const gridDepth=Math.ceil(active.length/GRID_COLUMNS)*GRID_ROW_GAP;
      const frontDistance=30+Math.min(3,gridDepth*.18);
      const frontHeight=8.8+Math.min(2,gridDepth*.10);
      // Move AROUND the runners on a half-circle, not straight THROUGH them
      // as the opening frontal shot transitions into the chase camera.
      const orbitAngle=(1-opening)*Math.PI;
      const radius=opening*frontDistance+(1-opening)*backDistance;
      const front=Math.cos(orbitAngle)*radius,side=Math.sin(orbitAngle)*radius;
      closePosition.set(first.x+forwardX*front+sideX*side,
        first.y+opening*frontHeight+(1-opening)*height,
        first.z+forwardZ*front+sideZ*side);
      const lookAhead=(1-opening)*forwardDistance-opening*Math.min(9,gridDepth*.55);
      closeLook.set(first.x+forwardX*lookAhead,first.y+1.5,
        first.z+forwardZ*lookAhead);
      positionTarget.copy(closePosition);
      lookTarget.copy(closeLook);
    }
    // Close-ups only take control after the opening shot, and keep the
    // existing randomized 0–10-second interval between selections.
    const focus=director.update(race);
    // Protect the first three seconds after GO for a clear rear shot.
    // Manual spotlight requested by the operator is still allowed immediately.
    const protectStart=race.phase==="RUNNING"&&(Number(race.raceMs)||0)<3000&&!focus?.manual;
    visibleCloseup=opening<.01&&!protectStart?focus:null;
    if(visibleCloseup&&visibleCloseup.blend>0){
      const point=curvedCourse?trackPoint(visibleCloseup.progress,laneX(visibleCloseup.lane)):
        {x:laneX(focus.lane),y:0,z:focus.progress,heading:0};
      const fx=Math.sin(point.heading),fz=Math.cos(point.heading);
      const sideX=Math.cos(point.heading),sideZ=-Math.sin(point.heading);
      // Camera is ahead of the avatar, looking back at their face and clothes.
      closePosition.set(point.x+fx*5.8+sideX*2.0,
        point.y+3.65,point.z+fz*5.8+sideZ*2.0);
      closeLook.set(point.x,point.y+1.8,point.z);
      positionTarget.lerp(closePosition,visibleCloseup.blend);
      lookTarget.lerp(closeLook,visibleCloseup.blend);
    }
    // Network recovery and benchmark jumps can move several kilometers.
    // Avoid rendering an empty transient frame between streamed tiles.
    // At the exact start of RUNNING: switch to the behind-the-runners
    // chase camera immediately, instead of lingering in the frontal shot.
    const raceStarted=(lastCameraPhase==="LOBBY"||lastCameraPhase==="COUNTDOWN")&&
      race.phase==="RUNNING";
    if(raceStarted||!cameraInitialized||camera.position.distanceTo(positionTarget)>170){
      cameraInitialized=true;
      camera.position.copy(positionTarget);
      cameraTarget.copy(lookTarget);
    }else{
      camera.position.lerp(positionTarget,alpha);
      cameraTarget.lerp(lookTarget,alpha);
    }
    camera.lookAt(cameraTarget);
    lastCameraPhase=race.phase;
    animateAtmosphere(dt,z);
    updateSpeedTrails(race);
    drawGiftObstacles(race);
    if(focusRing){
      const leader=active.reduce((best,r)=>!best||r.progress>best.progress?r:best,null);
      focusRing.visible=Boolean(leader);
      if(leader){
        const index=active.indexOf(leader);
        const finish= visualStartingDistance(leader,index);
        const ring=curvedCourse?gridTrackPoint(finish,laneX(leader.lane),.12):
          {x:laneX(leader.lane),y:.12,z:finish};
        focusRing.position.set(ring.x-root.position.x,ring.y,ring.z-root.position.z);
      }
    }
    renderer.render(scene,camera);
  }
  function dispose(){
    clearMap();boxGeometry.dispose();octahedronGeometry.dispose();renderer.dispose();
  }
  return { scene, renderer, camera, getCameraFocus:()=>visibleCloseup,
    setMap, resize, render, dispose, quality:profile.name, setRenderScale,getRenderScale };
}
