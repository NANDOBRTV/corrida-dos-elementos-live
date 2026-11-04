import * as THREE from "three";
import { TRACK_LENGTH, biome, laneX, obstaclesFor } from "./config.js";
import {QUALITY_SETTINGS} from "./performance.js";

const boxGeometry=new THREE.BoxGeometry(1,1,1);
const octahedronGeometry=new THREE.OctahedronGeometry(1,0);
const sphereGeometry=new THREE.SphereGeometry(1,8,6);
export function createWorld(canvas,{quality="balanced"}={}) {
  const profile=QUALITY_SETTINGS[quality]??QUALITY_SETTINGS.balanced;
  const sceneDetail=i=>profile.sceneStep===1||i%4<2;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(58,1,.1,210);
  camera.position.set(13,13,-19);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,profile.pixelRatio));
  renderer.shadowMap.enabled=profile.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const root=new THREE.Group();
  scene.add(root);
  const materials=new Map();
  let mapId="";
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
  function label(text,x,y,z,color="#f5fbef") {
    const c=document.createElement("canvas");c.width=512;c.height=128;
    const ctx=c.getContext("2d");
    ctx.fillStyle="rgba(8,25,21,.85)";ctx.fillRect(12,14,488,101);
    ctx.strokeStyle=color;ctx.lineWidth=6;ctx.strokeRect(12,14,488,101);
    ctx.fillStyle=color;ctx.font="bold 54px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(text,256,65,470);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
    sprite.position.set(x,y,z);sprite.scale.set(8,2,1);
    root.add(sprite);
  }
  function pine(x,z,size=1,snow=false) {
    const t=new THREE.Group();t.position.set(x,0,z);t.scale.setScalar(size);root.add(t);
    block(t,0,1,0,.58,2,.58,0x69503a);
    block(t,0,2.4,0,2.2,1.8,2.2,snow?0xe4f8ff:0x2e8551);
    block(t,0,3.5,0,1.55,1.3,1.55,snow?0xb7e6ed:0x37a665);
    block(t,0,4.4,0,.88,.95,.88,snow?0xf3ffff:0x53bb71);
  }
  function cactus(x,z,size=1) {
    const t=new THREE.Group();t.position.set(x,0,z);t.scale.setScalar(size);root.add(t);
    block(t,0,1.5,0,.7,3,.7,0x367f57);
    block(t,-.65,1.7,0,.95,.4,.47,0x438d63);
    block(t,-1,2.2,0,.45,1.3,.48,0x428b5d);
    block(t,.65,1.15,0,.95,.4,.47,0x438d63);
    block(t,1,1.6,0,.45,1.3,.48,0x428b5d);
  }
  function pillar(x,z,h,color,glowColor) {
    block(root,x,h/2,z,1.4,h,1.3,color);
    block(root,x,h+.42,z,1.85,.75,1.7,glowColor,.4);
  }
  function crystal(x,z,size=1,color=0x95eaff) {
    const m=new THREE.Mesh(octahedronGeometry,material(color,.18));
    m.position.set(x,size*.9,z);m.scale.set(size*.72,size*1.25,size*.72);m.rotation.z=.18;
    root.add(m);
    block(root,x,.18,z,size*1.35,.34,size*1.35,0x91cad2);
  }
  function lavaRiver(x,width,color) {
    block(root,x,-.008,74,width,.04,152,color,1.15);
    for(let i=0;i<14;i++)block(root,x+(i%3-1)*width*.23,.04,6+i*10,width*.6,.06,.9,0xffb64c,1);
  }
  function arch(z,c) {
    block(root,-6.15,3.1,z,.7,6.2,.8,0x2a3d38);
    block(root,6.15,3.1,z,.7,6.2,.8,0x2a3d38);
    block(root,0,6.25,z,13,1.0,.85,c,.15);
  }
  function scenery(id) {
    if(id==="forest") {
      for(let i=0;i<48;i++)if(sceneDetail(i))pine((i%2?-1:1)*(10+(i%6)*2.5),(i*17+7)%150,.65+(i%5)*.16);
      block(root,17,.03,76,4,.06,152,0x48a4d2);
      for(const z of [29,70,115]) {
        block(root,17,.35,z,7,.6,3.6,0xa07849);
        block(root,13.8,.9,z,.18,1,3.6,0x704e31);
        block(root,20.2,.9,z,.18,1,3.6,0x704e31);
      }
      for(let i=0;i<24;i++)if(sceneDetail(i))rock(root,(i%2?-1:1)*(8+(i%5)*2.6),(i*29)%150,.65,0x87938c);
    } else if(id==="desert") {
      for(let i=0;i<28;i++){
        if(!sceneDetail(i))continue;
        const x=(i%2?-1:1)*(13+(i%5)*3),z=(i*17)%150;
        const h=1+i%4*.6;
        for(let layer=0;layer<3;layer++)block(root,x,layer*.65+.23,z,6-layer*1.25,h*.55,4-layer*.6,layer===2?0xe9bd75:0xc69456);
      }
      for(let i=0;i<30;i++)if(sceneDetail(i))cactus((i%2?-1:1)*(10+(i%5)*2.9),(i*23+13)%150,.7+(i%4)*.17);
      for(const z of [37,100]){
        for(let i=0;i<4;i++)block(root,-23,i*1.28+.65,z,10-i*2,1.3,10-i*2,i%2?0xd4a770:0xbd8853);
      }
      block(root,21,.03,68,7,.07,13,0x4e9dae);
    } else if(id==="volcano") {
      lavaRiver(18,6.7,0xe64c29);
      lavaRiver(-20,7.4,0xff6a2d);
      for(let i=0;i<38;i++){
        if(!sceneDetail(i))continue;
        const x=(i%2?-1:1)*(10+(i%6)*2.6),z=(i*19)%150,h=1.8+(i%6);
        block(root,x,h/2,z,1.3,h,1.5,i%4?0x312c32:0x604149);
        if(i%4===0)block(root,x,h+.13,z,1.5,.26,1.7,0xf6703f,1);
      }
      for(const z of [28,88,128]){
        for(let i=0;i<3;i++)block(root,-28,(i+.5)*1.7,z,9-i*2,1.8,9-i*2,0x3a3037);
        const fire=new THREE.Mesh(sphereGeometry,material(0xff7d35,1.6));
        fire.position.set(-28,6,z);fire.scale.set(2,1.2,2);root.add(fire);
      }
    } else if(id==="ice") {
      for(let i=0;i<40;i++)if(sceneDetail(i))pine((i%2?-1:1)*(11+(i%6)*2.4),(i*21)%150,.65+(i%4)*.18,true);
      for(let i=0;i<30;i++)if(sceneDetail(i))crystal((i%2?-1:1)*(9+(i%5)*3),(i*23+5)%150,.7+(i%5)*.19);
      for(const z of [29,81,123])block(root,-21,.02,z,12,.06,9,0x8acfe3);
    } else if(id==="hell") {
      lavaRiver(18,7,0xe43c41);
      lavaRiver(-22,7,0xd65a2e);
      for(let i=0;i<35;i++)if(sceneDetail(i))pillar((i%2?-1:1)*(10+(i%6)*2.8),(i*21)%150,1.9+(i%6)*.75,0x241e2c,0xff724f);
      for(const z of [22,52,90,125]){
        pillar(-7.5,z,5.6,0x201b28,0xfc553b);
        pillar(7.5,z,5.6,0x201b28,0xfc553b);
      }
    }
  }
  function obstacleMesh(map) {
    for(const h of obstaclesFor(map)) {
      const x=laneX(h.lane);
      if(h.kind==="log") {
        block(root,x,.28,h.z,1.25,.58,.8,0x7d5237);
        block(root,x,.62,h.z,1,.18,.8,0xa8794f);
      } else if(h.kind==="rock")rock(root,x,h.z,.74,0x9f6d45);
      else if(h.kind==="ice")crystal(x,h.z,.68,0x7ad9fa);
      else {
        block(root,x,.32,h.z,1,.65,1,map==="hell"?0x27202a:0x353039);
        const glow=new THREE.Mesh(octahedronGeometry,material(0xff7e44,1.2));
        glow.position.set(x,.94,h.z);glow.scale.set(.48,.7,.48);root.add(glow);
      }
    }
  }
  // Agrupa centenas de blocos voxel estáticos em InstancedMesh.
  // Renderiza cada cor/geometria em uma chamada, preservando transformações de árvores,
  // cactos, vulcões e cristais. Os corredores animados são objetos separados da cena.
  function batchStaticScenery(){
    root.updateWorldMatrix(true,true);
    const inverseRoot=new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups=new Map();
    root.traverse(obj=>{
      if(!obj.isMesh||obj.isInstancedMesh||!obj.material||
        (obj.geometry!==boxGeometry&&obj.geometry!==octahedronGeometry&&obj.geometry!==sphereGeometry))return;
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
  function clearMap() {
    while(root.children.length){
      const child=root.children[0];root.remove(child);
      child.traverse(obj=>{
        if(obj.isSprite){ if(obj.material?.map)obj.material.map.dispose();obj.material?.dispose(); }
        if(obj.isInstancedMesh&&typeof obj.dispose==="function")obj.dispose();
      });
    }
    for(const mat of materials.values())mat.dispose();materials.clear();
    // Remove old biome lighting but preserve runner meshes mounted directly in the scene.
    for(const child of [...scene.children])if(child.isLight)scene.remove(child);
  }
  function setMap(id) {
    const settings=biome(id);
    if(mapId===settings.id)return;
    clearMap();mapId=settings.id;
    scene.background=new THREE.Color(settings.sky);
    scene.fog=new THREE.Fog(settings.fog,30,109);
    const ambient=new THREE.HemisphereLight(settings.sky,settings.ground,id==="hell"?.9:1.7);
    scene.add(ambient);
    const sun=new THREE.DirectionalLight(id==="volcano"||id==="hell"?0xffa078:0xfff1d2,id==="hell"?1.7:2.4);
    sun.position.set(-17,34,20);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
    sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;
    scene.add(sun);
    block(root,0,-.2,75,180,.4,250,settings.ground);
    // The five-lane arena runs from z=0 to z=150.
    block(root,0,.025,TRACK_LENGTH/2,11.7,.1,TRACK_LENGTH+4,settings.road);
    block(root,-6.0,.26,TRACK_LENGTH/2,.38,.44,TRACK_LENGTH+4,settings.trim);
    block(root,6.0,.26,TRACK_LENGTH/2,.38,.44,TRACK_LENGTH+4,settings.trim);
    for(const x of [-3.7,-1.85,0,1.85,3.7]) for(let z=5;z<TRACK_LENGTH;z+=7.5){
      block(root,x,.086,z,.08,.02,2.2,0xece5c3);
    }
    arch(0,settings.id==="volcano"?0xff9955:0xc6fb65);
    arch(TRACK_LENGTH,0xffe7a4);
    block(root,0,.09,0,11.5,.03,1.2,0xc9f66b);
    block(root,0,.09,TRACK_LENGTH,11.5,.03,1.2,0xffecc3);
    scenery(settings.id);obstacleMesh(settings.id);
    label("LARGADA",0,7.2,0);label("CHEGADA",0,7.2,TRACK_LENGTH);
    batchStaticScenery();
  }
  function resize() {
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.fov=w<h?64:57;camera.updateProjectionMatrix();
  }
  function render(race,dt) {
    const progress=Math.max(0,...race.active.map(r=>r.progress));
    const z=Math.min(TRACK_LENGTH+5,progress);
    const alpha=1-Math.exp(-2.8*Math.min(dt,.2));
    positionTarget.set(12.8,13.5,Math.max(-19,z-21));
    lookTarget.set(0,1.3,Math.min(TRACK_LENGTH,z+9));
    camera.position.lerp(positionTarget,alpha);
    cameraTarget.lerp(lookTarget,alpha);
    camera.lookAt(cameraTarget);
    renderer.render(scene,camera);
  }
  function dispose(){
    clearMap();boxGeometry.dispose();octahedronGeometry.dispose();sphereGeometry.dispose();renderer.dispose();
  }
  return { scene, renderer, setMap, resize, render, dispose, quality:profile.name };
}
