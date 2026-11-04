import * as THREE from "three";
import { TRACK_LENGTH, PREVIOUS_TRACK_LENGTH, STREAM_TILE_LENGTH, biome, laneX, obstaclesFor } from "./config.js";
import {QUALITY_SETTINGS} from "./performance.js";

const boxGeometry=new THREE.BoxGeometry(1,1,1);
const octahedronGeometry=new THREE.OctahedronGeometry(1,0);
export function createWorld(canvas,{quality="balanced"}={}) {
  const profile=QUALITY_SETTINGS[quality]??QUALITY_SETTINGS.balanced;
  const sceneDetail=i=>profile.sceneStep===1||i%4<2;
  const scene=new THREE.Scene();
  const finishGroup=new THREE.Group();finishGroup.name="absolute-finish-line";scene.add(finishGroup);
  const camera=new THREE.PerspectiveCamera(58,1,.1,360);
  // Third-person chase perspective for the vertical race format.
  camera.position.set(0,12.2,-24);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"low-power"});
  const baselinePixelRatio=Math.min(window.devicePixelRatio||1,profile.pixelRatio);
  let renderScale=1;
  renderer.setPixelRatio(baselinePixelRatio);
  renderer.shadowMap.enabled=profile.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const root=new THREE.Group();
  scene.add(root);
  const materials=new Map();
  let mapId="";
  let currentLength=TRACK_LENGTH;
  let renderedLength=PREVIOUS_TRACK_LENGTH;
  const streamingLength=STREAM_TILE_LENGTH*2;
  let weather=null,focusRing=null,boostTrails=null;
  const trailTransform=new THREE.Object3D();
  const trailColor=new THREE.Color();
  const cameraTarget=new THREE.Vector3(0,1,10);
  const positionTarget=new THREE.Vector3();
  const lookTarget=new THREE.Vector3();
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
    // For the 5km track only two reusable 300m tiles are resident in WebGL.
    // Batching merges equal geometry/material meshes to preserve draw-call budget.
    const sections=Math.ceil(renderedLength/150);
    for(let section=0;section<sections;section++){
      const base=section*150;
      if(id==="ice"){
        for(let i=0;i<40;i++)if(sceneDetail(i))pine(
          (i%2?-1:1)*(11+(i%6)*2.4),base+(i*21)%150,.65+(i%4)*.18,true);
        for(let i=0;i<30;i++)if(sceneDetail(i))crystal(
          (i%2?-1:1)*(9+(i%5)*3),base+(i*23+5)%150,.7+(i%5)*.19);
        for(const z of [29,81,123])block(root,-21,.02,base+z,12,.06,9,0x8acfe3);
      } else {
        for(let i=0;i<48;i++)if(sceneDetail(i))pine(
          (i%2?-1:1)*(10+(i%6)*2.5),base+(i*17+7)%150,.65+(i%5)*.16);
        block(root,17,.03,base+76,4,.06,150,0x48a4d2);
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
  function obstacleMesh(map){
    for(const h of obstaclesFor(map,renderedLength)){
      const x=laneX(h.lane);
      if(h.kind==="ice")crystal(x,h.z,.68,0x7ad9fa);
      else{
        block(root,x,.28,h.z,1.25,.58,.8,0x7d5237);
        block(root,x,.62,h.z,1,.18,.8,0xa8794f);
      }
    }
  }
  // Agrupa centenas de blocos voxel estáticos em InstancedMesh.
  // Renderiza cada cor/geometria em uma chamada, preservando transformações de árvores,
  // e cristais nos dois biomas. Os corredores animados são objetos separados.
  function batchStaticScenery(){
    root.updateWorldMatrix(true,true);
    const inverseRoot=new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups=new Map();
    root.traverse(obj=>{
      if(!obj.isMesh||obj.isInstancedMesh||!obj.material||
        (obj.geometry!==boxGeometry&&obj.geometry!==octahedronGeometry))return;
      const key=[obj.geometry.uuid,obj.material.uuid,obj.castShadow?"1":"0",obj.receiveShadow?"1":"0"].join(":");
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(obj);
    });
    const local=new THREE.Matrix4();
    for(const group of groups.values()){
      if(group.length<2)continue;
      const first=group[0];
      const instance=new THREE.InstancedMesh(first.geometry,first.material,group.length);
      instance.name="voxel-batch";
      instance.castShadow=first.castShadow&&profile.shadows;
      instance.receiveShadow=first.receiveShadow;
      instance.frustumCulled=false;
      for(let i=0;i<group.length;i++){
        const mesh=group[i];
        local.multiplyMatrices(inverseRoot,mesh.matrixWorld);
        instance.setMatrixAt(i,local);
        mesh.parent.remove(mesh);
      }
      instance.instanceMatrix.needsUpdate=true;
      root.add(instance);
    }
  }
  function setupAtmosphere(id){
    // Low-cost animated snowflakes on Ice; soft drifting leaves on Forest.
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
      color:id==="ice"?0xf6ffff:0xd6f2a1,
      size:id==="ice"?.30:.13,transparent:true,opacity:id==="ice"?.93:.62,
      depthWrite:false,sizeAttenuation:true
    }));
    weather.name="biome-weather-particles";
    weather.frustumCulled=false;
    root.add(weather);
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
      const progress=Math.max(0,Number(r.progress)||0);
      const stagger=Math.max(0,1-progress/30)*Math.floor(i/5)*1.48;
      const z=progress-stagger;
      trailColor.set(r.color||0x9dfaff);
      for(let j=0;j<3&&count<150;j++){
        trailTransform.position.set(laneX(r.lane),.22+.08*(j%2),z-root.position.z-.85-j*.72);
        trailTransform.scale.set(.20-j*.035,.10,.75);
        trailTransform.rotation.set(0,0,0);
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
    weather.position.z=Math.max(0,Math.min(renderedLength,z-root.position.z));
  }
  function clearMap() {
    for(const owner of [root,finishGroup])while(owner.children.length){
      const child=owner.children[0];owner.remove(child);
      child.traverse(obj=>{
        if(obj.isSprite){ if(obj.material?.map)obj.material.map.dispose();obj.material?.dispose(); }
        if(obj.isInstancedMesh&&typeof obj.dispose==="function")obj.dispose();
        if(obj.isPoints||obj.name==="leader-focus-ring"||obj.name==="boost-trails"){
          obj.geometry?.dispose();obj.material?.dispose();
        }
      });
    }
    for(const mat of materials.values())mat.dispose();materials.clear();
    weather=null;focusRing=null;boostTrails=null;
    // Remove old biome lighting but preserve runner meshes mounted directly in the scene.
    for(const child of [...scene.children])if(child.isLight)scene.remove(child);
  }
  function setMap(id,length=TRACK_LENGTH) {
    const settings=biome(id);
    const targetLength=[150,PREVIOUS_TRACK_LENGTH,TRACK_LENGTH].includes(length)?length:TRACK_LENGTH;
    if(mapId===settings.id&&currentLength===targetLength)return;
    clearMap();mapId=settings.id;currentLength=targetLength;
    // 5km is a logical distance, NOT the amount of geometry allocated.
    renderedLength=targetLength===TRACK_LENGTH?streamingLength:targetLength;
    root.position.z=0;
    scene.background=new THREE.Color(settings.sky);
    scene.fog=new THREE.Fog(settings.fog,30,109);
    const ambient=new THREE.HemisphereLight(settings.sky,settings.ground,1.7);
    scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xfff1d2,2.4);
    sun.position.set(-17,34,20);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
    sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;
    scene.add(sun);
    block(root,0,-.2,renderedLength/2,180,.4,renderedLength+100,settings.ground);
    // Five lanes, from 0 to the authoritative finish distance.
    block(root,0,.025,renderedLength/2,11.7,.1,renderedLength+4,settings.road);
    if(settings.id==="ice"){
      // Distinctive jagged snow banks at the sides of a wide grey snow raceway.
      for(let z=7;z<renderedLength;z+=14){
        for(const side of [-1,1]){
          const variation=((z*13+side*17)%7+7)%7;
          block(root,side*(6.8+variation*.2),.075,z,2.4+variation*.22,.12,5.5+variation,0xf0f4fc);
          if(variation%3===0)block(root,side*9.0,.13,z+2,1.7,.22,2.8,0xe6ecf8);
        }
      }
    }
    block(root,-6.0,.26,renderedLength/2,.38,.44,renderedLength+4,settings.trim);
    block(root,6.0,.26,renderedLength/2,.38,.44,renderedLength+4,settings.trim);
    for(const x of [-3.7,-1.85,0,1.85,3.7]) for(let z=5;z<renderedLength;z+=7.5){
      block(root,x,.086,z,.08,.02,2.2,0xece5c3);
    }
    // Only one finish at the true 5,000m mark, not at each streamed tile.
    if(targetLength===TRACK_LENGTH)arch(targetLength,0xffe7a4,finishGroup);
    else arch(targetLength,0xffe7a4);
    block(root,0,.09,0,11.5,.03,.65,settings.id==="ice"?0xf5faff:0xe2f2d4);
    if(targetLength===TRACK_LENGTH)
      block(finishGroup,0,.09,targetLength,11.5,.03,1.2,0xffecc3);
    else block(root,0,.09,targetLength,11.5,.03,1.2,0xffecc3);
    scenery(settings.id);obstacleMesh(settings.id);
    setupAtmosphere(settings.id);
    if(targetLength===TRACK_LENGTH)label("CHEGADA",0,7.2,targetLength,"#f5fbef",finishGroup);
    else label("CHEGADA",0,7.2,targetLength);
    batchStaticScenery();
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
      // Two matching 300m tiles overlap before/after each shift, so 5km
      // never creates 5km of geometry (or triggers a rebuild every frame).
      const nextBase=Math.max(0,Math.floor(Math.max(0,z-200)/STREAM_TILE_LENGTH)*STREAM_TILE_LENGTH);
      if(root.position.z!==nextBase)root.position.z=nextBase;
    }
    const alpha=1-Math.exp(-2.9*Math.min(dt,.2));
    positionTarget.set(0,12.2,Math.max(-24,z-24));
    lookTarget.set(0,1.4,Math.min(currentLength+10,z+12));
    // Network recovery and benchmark jumps can move several kilometers.
    // Avoid rendering an empty transient frame between streamed tiles.
    if(Math.abs(camera.position.z-positionTarget.z)>160){
      camera.position.copy(positionTarget);
      cameraTarget.copy(lookTarget);
    }else{
      camera.position.lerp(positionTarget,alpha);
      cameraTarget.lerp(lookTarget,alpha);
    }
    camera.lookAt(cameraTarget);
    animateAtmosphere(dt,z);
    updateSpeedTrails(race);
    if(focusRing){
      const leader=active.reduce((best,r)=>!best||r.progress>best.progress?r:best,null);
      focusRing.visible=Boolean(leader);
      if(leader){
        const index=active.indexOf(leader);
        const stagger=Math.max(0,1-Math.max(0,leader.progress)/30);
        focusRing.position.set(laneX(leader.lane),.12,
          Math.max(0,leader.progress-Math.floor(index/5)*1.48*stagger)-root.position.z);
      }
    }
    renderer.render(scene,camera);
  }
  function dispose(){
    clearMap();boxGeometry.dispose();octahedronGeometry.dispose();renderer.dispose();
  }
  return { scene, renderer, setMap, resize, render, dispose, quality:profile.name, setRenderScale,getRenderScale };
}
