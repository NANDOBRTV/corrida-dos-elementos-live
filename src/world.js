import * as THREE from "three";
import { TRACK_LENGTH, biome, laneX, obstaclesFor } from "./config.js";
import {QUALITY_SETTINGS} from "./performance.js";

const boxGeometry=new THREE.BoxGeometry(1,1,1);
const octahedronGeometry=new THREE.OctahedronGeometry(1,0);
export function createWorld(canvas,{quality="balanced"}={}) {
  const profile=QUALITY_SETTINGS[quality]??QUALITY_SETTINGS.balanced;
  const sceneDetail=i=>profile.sceneStep===1||i%4<2;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(58,1,.1,210);
  camera.position.set(10.8,11.5,-15);
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
  function crystal(x,z,size=1,color=0x95eaff) {
    const m=new THREE.Mesh(octahedronGeometry,material(color,.18));
    m.position.set(x,size*.9,z);m.scale.set(size*.72,size*1.25,size*.72);m.rotation.z=.18;
    root.add(m);
    block(root,x,.18,z,size*1.35,.34,size*1.35,0x91cad2);
  }
  function arch(z,c) {
    block(root,-6.15,3.1,z,.7,6.2,.8,0x2a3d38);
    block(root,6.15,3.1,z,.7,6.2,.8,0x2a3d38);
    block(root,0,6.25,z,13,1.0,.85,c,.15);
  }
  function scenery(id) {
    if(id==="ice"){
      for(let i=0;i<40;i++)if(sceneDetail(i))pine((i%2?-1:1)*(11+(i%6)*2.4),(i*21)%150,.65+(i%4)*.18,true);
      for(let i=0;i<30;i++)if(sceneDetail(i))crystal((i%2?-1:1)*(9+(i%5)*3),(i*23+5)%150,.7+(i%5)*.19);
      for(const z of [29,81,123])block(root,-21,.02,z,12,.06,9,0x8acfe3);
    } else {
      for(let i=0;i<48;i++)if(sceneDetail(i))pine((i%2?-1:1)*(10+(i%6)*2.5),(i*17+7)%150,.65+(i%5)*.16);
      block(root,17,.03,76,4,.06,152,0x48a4d2);
      for(const z of [29,70,115]){
        block(root,17,.35,z,7,.6,3.6,0xa07849);
        block(root,13.8,.9,z,.18,1,3.6,0x704e31);
        block(root,20.2,.9,z,.18,1,3.6,0x704e31);
      }
      for(let i=0;i<24;i++)if(sceneDetail(i))rock(root,(i%2?-1:1)*(8+(i%5)*2.6),(i*29)%150,.65,0x87938c);
    }
  }
  function obstacleMesh(map){
    for(const h of obstaclesFor(map)){
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
    const ambient=new THREE.HemisphereLight(settings.sky,settings.ground,1.7);
    scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xfff1d2,2.4);
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
    arch(0,0xc6fb65);
    arch(TRACK_LENGTH,0xffe7a4);
    block(root,0,.09,0,11.5,.03,1.2,0xc9f66b);
    block(root,0,.09,TRACK_LENGTH,11.5,.03,1.2,0xffecc3);
    scenery(settings.id);obstacleMesh(settings.id);
    label("LARGADA",0,7.2,0);label("CHEGADA",0,7.2,TRACK_LENGTH);
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
    camera.aspect=w/h;camera.fov=w<h?64:57;camera.updateProjectionMatrix();
  }
  function render(race,dt) {
    const progress=Math.max(0,...race.active.map(r=>r.progress));
    const z=Math.min(TRACK_LENGTH+5,progress);
    const alpha=1-Math.exp(-2.8*Math.min(dt,.2));
    positionTarget.set(10.9,11.7,Math.max(-15,z-16));
    lookTarget.set(0,1.3,Math.min(TRACK_LENGTH,z+7.6));
    camera.position.lerp(positionTarget,alpha);
    cameraTarget.lerp(lookTarget,alpha);
    camera.lookAt(cameraTarget);
    renderer.render(scene,camera);
  }
  function dispose(){
    clearMap();boxGeometry.dispose();octahedronGeometry.dispose();renderer.dispose();
  }
  return { scene, renderer, setMap, resize, render, dispose, quality:profile.name, setRenderScale,getRenderScale };
}
