// Optimized premium procedural body renderer for Studio V5.
import {isHeroCar} from "./vehicles.js";
import {createHeroCarGeometries,roofLadderParts,heroSignatureParts} from "./studio-hero-cars.js";
// This is NOT a set of licensed/manufacturer CAD models. Realistic vehicle
// proportions and smooth curved panels replace the former rectangular boxes.
// Geometry/materials are reused in InstancedMeshes, even with 100 drivers.
export const REALISTIC_PROFILES=Object.freeze([
  "sedan","hatch","compact","pickup","suv","classic","muscle"
]);
export const REALISTIC_PARTS=Object.freeze({
  wheelsPerCar:4,wheelsPerMotorcycle:2,riderOnEveryMotorcycle:true
});
const pickProfile=shape=>shape==="classic-round"?"classic":
  shape==="sedan-old"?"sedan":
  REALISTIC_PROFILES.includes(shape)?shape:"hatch";
// Styling cues are intentionally tuned per real model family, instead of
// renaming one generic mesh 20 times. These are dimensional interpretations,
// not copyrighted/official manufacturer CAD files.
export const CAR_STYLE_HINTS=Object.freeze({
 "car-civic":    {cabin:.52,height:.61,offset:-.075,lights:"slim"},
 "car-gol":      {cabin:.63,height:.66,offset:-.015,lights:"rect"},
 "car-uno":      {cabin:.72,height:.80,offset:-.015,lights:"vertical"},
 "car-strada":   {cabin:.51,height:.71,offset:.195,lights:"rect"},
 "car-palio":    {cabin:.65,height:.69,offset:0,lights:"round"},
 "car-corsa":    {cabin:.64,height:.68,offset:.025,lights:"rect"},
 "car-onix":     {cabin:.62,height:.67,offset:.015,lights:"slim"},
 "car-hb20":     {cabin:.61,height:.68,offset:.005,lights:"slim"},
 "car-corolla":  {cabin:.55,height:.68,offset:-.035,lights:"slim"},
 "car-fiesta":   {cabin:.63,height:.69,offset:0,lights:"round"},
 "car-ka":       {cabin:.70,height:.71,offset:0,lights:"round"},
 "car-saveiro":  {cabin:.46,height:.64,offset:.19,lights:"rect"},
 "car-s10":      {cabin:.48,height:.79,offset:.20,lights:"rect"},
 "car-hilux":    {cabin:.47,height:.82,offset:.21,lights:"rect"},
 "car-duster":   {cabin:.74,height:.88,offset:0,lights:"rect"},
 "car-renegade": {cabin:.76,height:.91,offset:-.02,lights:"round"},
 "car-fusca":    {cabin:.67,height:.79,offset:-.035,lights:"round"},
 "car-monza":    {cabin:.54,height:.66,offset:-.065,lights:"rect"},
 "car-opala":    {cabin:.49,height:.63,offset:-.09,lights:"rect"},
 "car-santana":  {cabin:.52,height:.64,offset:-.07,lights:"rect"}
});
const clamp=(value,a,b)=>Math.max(a,Math.min(b,value));
function hash(str){
  let h=2166136261;
  for(const c of String(str)){h=Math.imul(h^c.charCodeAt(0),16777619);}
  return h>>>0;
}
function surface(THREE,levels,sections){
  const positions=[],uvs=[],indices=[];
  for(let i=0;i<sections.length;i++){
    const section=sections[i];
    for(let k=0;k<levels;k++){
      const v=section.points[k];
      positions.push(v[0],v[1],section.z);
      uvs.push(k/(levels-1),i/Math.max(1,sections.length-1));
    }
  }
  for(let i=0;i<sections.length-1;i++){
    for(let j=0;j<levels;j++){
      const next=(j+1)%levels,a=i*levels+j,b=i*levels+next,
        c=(i+1)*levels+j,d=(i+1)*levels+next;
      indices.push(a,c,b,b,c,d);
    }
  }
  for(let k=1;k<levels-1;k++){
    indices.push(0,k,k+1);
    const end=(sections.length-1)*levels;
    indices.push(end,end+k+1,end+k);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",
    new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function bodyGeometry(THREE,profile){
  const round=profile==="classic";
  const high=profile==="suv"||profile==="pickup";
  const sharp=profile==="compact";
  const muscle=profile==="muscle";
  const z=[-.5,-.46,-.36,-.23,.08,.34,.45,.5];
  const sections=z.map((v,i)=>{
    const taper=(i===0||i===7)?(round?.80:.88):
      (i===1||i===6? .94:1);
    const front=(i>=5);
    const back=(i<=1);
    const top=high?.81:muscle?.69:round?.74:sharp?.79:.68;
    const h=top-(front?(muscle?.12:.10):back?.07:0);
    const wide=1*taper;
    return {z:v,points:[
      [-wide*.42,.04],[-wide*.50,.20],
      [-wide*.49,h*.76],[-wide*.40,h],
      [wide*.40,h],[wide*.49,h*.76],
      [wide*.50,.20],[wide*.42,.04]
    ]};
  });
  return surface(THREE,8,sections);
}
function glassGeometry(THREE,profile){
  // Each profile has its own windshield/rear-window slope and roofline.
  const params={
    sedan:{bottom:.90,roof:.88,front:.42,rear:.28},
    hatch:{bottom:1.00,roof:.88,front:.38,rear:.20},
    compact:{bottom:.98,roof:.95,front:.28,rear:.15},
    pickup:{bottom:.89,roof:.95,front:.30,rear:.25},
    suv:{bottom:1.00,roof:.98,front:.23,rear:.17},
    classic:{bottom:.95,roof:.94,front:.34,rear:.32},
    muscle:{bottom:.78,roof:.79,front:.44,rear:.37}
  }[profile];
  const z=[-.5,-.5+params.rear,-.18,.18,.5-params.front,.5];
  const y=[.03,.72,.99,.99,.72,.03];
  const sections=z.map((v,i)=>({
    z:v,points:[
      [-params.bottom*.50,.02],
      [params.bottom*.50,.02],
      [params.roof*.43,y[i]],
      [-params.roof*.43,y[i]]
    ]
  }));
  return surface(THREE,4,sections);
}
function createBatch(THREE,scene,name,geometry,material,limit){
  const mesh=new THREE.InstancedMesh(geometry,material,limit);
  mesh.name=name;mesh.count=0;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return mesh;
}
// The vehicle palette is deterministic to avoid every player looking identical.
// It is an optional paint color; the model selection itself is never random.
function paintFor(name){
  const palette=[0xe74947,0x3b9ac4,0xced6da,0xf1b345,0x26374b,
    0x416d57,0xb96452,0xe4ded4,0x8e4c98,0x7a8a93];
  return palette[hash(name)%palette.length];
}
export function createRealisticVehicleFleet(THREE,scene,{capacity=100}={}){
  const shellMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.31,metalness:.31,side:THREE.DoubleSide});
  const glassMaterial=new THREE.MeshStandardMaterial({
    color:0x718fa8,roughness:.16,metalness:.28,
    transparent:false,side:THREE.DoubleSide});
  const tireMaterial=new THREE.MeshStandardMaterial({
    color:0x20252a,roughness:.88,metalness:0});
  const hubMaterial=new THREE.MeshStandardMaterial({
    color:0xb8c1cc,roughness:.31,metalness:.65});
  const tankMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.40,metalness:.28});
  const jacketMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.93,metalness:0});
  const helmetMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.22,metalness:.20});
  const visorMaterial=new THREE.MeshStandardMaterial({
    color:0x0d1d2a,roughness:.08,metalness:.4});
  const lampMaterial=new THREE.MeshBasicMaterial({color:0xffedbf});
  const tailMaterial=new THREE.MeshBasicMaterial({color:0xd82e39});
  const bootMaterial=new THREE.MeshStandardMaterial({
    color:0x202632,roughness:.78,metalness:0});
  const ownedMeshes=[],ownedGeometries=[],ownedMaterials=[
    shellMaterial,glassMaterial,tireMaterial,hubMaterial,tankMaterial,
    jacketMaterial,helmetMaterial,visorMaterial,
    lampMaterial,tailMaterial,bootMaterial
  ];
  const body=new Map(),windows=new Map();
  const heroBody=new Map(),heroWindows=new Map(),heroRoofs=new Map();
  const allHeroShapes=createHeroCarGeometries(THREE);
  const counts=new Map();
  const batch=(name,geometry,mat,max=capacity)=>{
    ownedGeometries.push(geometry);
    const mesh=createBatch(THREE,scene,name,geometry,mat,max);
    ownedMeshes.push(mesh);counts.set(mesh,0);return mesh;
  };
  for(const profile of REALISTIC_PROFILES){
    body.set(profile,batch("studio-real-car-shell-"+profile,
      bodyGeometry(THREE,profile),shellMaterial));
    windows.set(profile,batch("studio-real-glass-"+profile,
      glassGeometry(THREE,profile),glassMaterial));
  }
  for(const [id,shape] of allHeroShapes){
    heroBody.set(id,batch("studio-hero-body-"+id,
      shape.body,shellMaterial));
    heroWindows.set(id,batch("studio-hero-windows-"+id,
      shape.glass,glassMaterial));
    heroRoofs.set(id,batch("studio-hero-roof-"+id,
      shape.roof,shellMaterial));
  }
  const detailMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,metalness:.62,roughness:.32
  });
  ownedMaterials.push(detailMaterial);
  const heroTrim=batch("studio-hero-model-body-trim",
    new THREE.BoxGeometry(1,1,1),detailMaterial,capacity*58);
  const heroRound=batch("studio-fusca-rounded-wheel-fenders",
    new THREE.SphereGeometry(.5,12,10),shellMaterial,capacity*4);
  const tireGeometry=new THREE.CylinderGeometry(.5,.5,1,14,1);
  tireGeometry.rotateZ(Math.PI/2);
  const rimGeometry=new THREE.CylinderGeometry(.5,.5,1,12,1);
  rimGeometry.rotateZ(Math.PI/2);
  const roofs=batch("studio-real-painted-roofs",
    new THREE.BoxGeometry(1,1,1),shellMaterial);
  const tires=batch("studio-real-rubber-tires",tireGeometry,
    tireMaterial,capacity*4);
  const hubs=batch("studio-real-metal-hubs",rimGeometry,
    hubMaterial,capacity*4);
  const tank=batch("studio-motorcycle-rounded-tanks",
    new THREE.SphereGeometry(.5,12,8),tankMaterial);
  const helmet=batch("studio-motorcycle-rider-helmets",
    new THREE.SphereGeometry(.5,12,8),helmetMaterial);
  const visor=batch("studio-motorcycle-rider-visors",
    new THREE.SphereGeometry(.5,10,6),visorMaterial);
  const torso=batch("studio-motorcycle-rider-jackets",
    new THREE.SphereGeometry(.5,12,8),jacketMaterial);
  const limbs=batch("studio-motorcycle-rider-arms-and-legs",
    new THREE.CylinderGeometry(.5,.5,1,8),jacketMaterial,capacity*4);
  const riderGloves=batch("studio-motorcycle-rider-gloves-and-boots",
    new THREE.SphereGeometry(.5,8,6),bootMaterial,capacity*4);
  const headlights=batch("studio-real-front-headlamps",
    new THREE.SphereGeometry(.5,8,6),lampMaterial,capacity*4);
  const taillights=batch("studio-real-rear-taillamps",
    new THREE.SphereGeometry(.5,8,6),tailMaterial,capacity*2);
  const local=new THREE.Matrix4(),combined=new THREE.Matrix4();
  const pos=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const xAxis=new THREE.Vector3(1,0,0);
  const start=new THREE.Vector3(),end=new THREE.Vector3(),
    diff=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  let renderedCars=0,renderedMotorcycles=0,totalWheels=0,totalRiders=0;
  let heroModels=0,ladderRungs=0,heroDetailParts=0;
  const heroIds=new Set();
  function push(mesh,root,x,y,z,sx,sy,sz,color=null,pitch=0){
    const slot=counts.get(mesh);
    if(slot>=mesh.instanceMatrix.count)return;
    pos.set(x,y,z);scale.set(sx,sy,sz);
    rotation.setFromAxisAngle(xAxis,pitch);
    local.compose(pos,rotation,scale);
    combined.multiplyMatrices(root,local);
    mesh.setMatrixAt(slot,combined);
    if(color!==null)mesh.setColorAt(slot,color);
    counts.set(mesh,slot+1);
  }
  function segment(root,ax,ay,az,bx,by,bz,radius,color){
    start.set(ax,ay,az);end.set(bx,by,bz);
    diff.subVectors(end,start);
    const length=diff.length();
    if(length<.01)return;
    pos.copy(start).add(end).multiplyScalar(.5);
    rotation.setFromUnitVectors(up,diff.clone().normalize());
    scale.set(radius,length,radius);
    local.compose(pos,rotation,scale);
    combined.multiplyMatrices(root,local);
    const slot=counts.get(limbs);
    if(slot>=limbs.instanceMatrix.count)return;
    limbs.setMatrixAt(slot,combined);limbs.setColorAt(slot,color);
    counts.set(limbs,slot+1);
  }
  const CHROME=new THREE.Color(0xc3ccd4);
  const DARK=new THREE.Color(0x192531);
  const BLACK=new THREE.Color(0x141b25);
  function addHeroDetails(vehicle,root,paint){
    const w=vehicle.width,l=vehicle.length,id=vehicle.id;
    heroModels++;heroIds.add(id);
    const parts=heroSignatureParts(id,w,l);
    for(const part of parts){
      const color=part.mat==="chrome"?CHROME:
        part.mat==="paint"?paint:DARK;
      push(heroTrim,root,...part.p,...part.s,color);
      heroDetailParts++;
    }
    // All Uno instances (regardless of player color) have a visible
    // polished metal roof ladder: 2 rails, 12 rungs, 4 mounts.
    const ladder=roofLadderParts(id);
    for(const part of ladder){
      push(heroTrim,root,...part.p,...part.s,CHROME,part.tilt);
      heroDetailParts++;
      if(part.name.startsWith("rung-"))ladderRungs++;
    }
    if(id==="car-fusca"){
      // Pronounced rounded wheel arches and curved front/rear wings.
      for(const side of [-1,1])for(const z of [-l*.31,l*.31]){
        push(heroRound,root,side*w*.44,.46,z,
          .48,.50,.70,paint);
        heroDetailParts++;
      }
      // The rear-engined Fusca has two dark rear ventilation strips.
      for(let z=-l*.45;z<=-l*.38;z+=.075){
        push(heroTrim,root,0,.78,z,w*.28,.026,.033,BLACK);
        heroDetailParts++;
      }
    }else if(id==="car-opala"){
      // Double round headlamps and longer bright rear chrome bumper.
      for(const side of [-1,1]){
        push(headlights,root,side*w*.19,.74,l*.49,
          .26,.24,.11);
        heroDetailParts++;
      }
      push(heroTrim,root,0,.67,l*.498,w*.66,.05,.045,CHROME);
      heroDetailParts++;
    }else if(id==="car-civic"){
      // A low, long leading-edge grille and narrow sporty front spoiler.
      push(heroTrim,root,0,.48,l*.499,w*.86,.045,.07,BLACK);
      heroDetailParts++;
    }else if(id==="car-gol"||id==="car-palio"){
      // Hatch versions have distinct upright rear silhouettes in
      // the hero cabin mesh; keep a small rear wiper and hatch handle.
      push(heroTrim,root,0,1.03,-l*.445,w*.31,.035,.04,BLACK);
      heroDetailParts++;
    }
  }

  function begin(){
    for(const mesh of ownedMeshes)counts.set(mesh,0);
    renderedCars=0;renderedMotorcycles=0;totalWheels=0;totalRiders=0;
    heroModels=0;ladderRungs=0;heroDetailParts=0;heroIds.clear();
  }
  function idToCabin(id){
    return {
      "car-fusca":.71,"car-uno":.67,"car-palio":.64,
      "car-gol":.62,"car-civic":.61,"car-opala":.52
    }[id]??null;
  }
  function renderVehicle(vehicle,userId,root,progress=0,running=false,
    hiddenByPremium=false){
    if(hiddenByPremium&&vehicle.kind==="car"){
      // Counts describe all competitors even when a high-fidelity asset
      // replaces this player's procedural draw calls for the camera.
      renderedCars++;totalWheels+=4;
      if(isHeroCar(vehicle.id)){
        heroModels++;heroIds.add(vehicle.id);
      }
      return;
    }
    const paint=new THREE.Color(paintFor(userId));
    const profile=pickProfile(vehicle.shape);
    const w=vehicle.width,l=vehicle.length;
    if(vehicle.kind==="car"){
      renderedCars++;
      const high=profile==="suv"||profile==="pickup";
      const hint=CAR_STYLE_HINTS[vehicle.id]||{};
      const cabinScale=hint.cabin??.59;
      const cabinCenter=hint.offset??0;
      const cabinHeight=hint.height??.70;
      const hero=isHeroCar(vehicle.id);
      const mainBody=hero?heroBody.get(vehicle.id):body.get(profile);
      push(mainBody,root,0,.35,0,w,.78+(high?.13:0),l,paint);
      // For the six featured models, glass and metal roof contours are
      // separately sculpted; all others retain the light shared meshes.
      const glassY=.79;
      if(hero){
        const glassLen=l*(idToCabin(vehicle.id)??cabinScale);
        const heroLen=glassLen*1.08;
        const heroHeight=cabinHeight*(vehicle.id==="car-uno"?1.08:1);
        push(heroWindows.get(vehicle.id),root,0,glassY,cabinCenter,
          w*.83,heroHeight,heroLen);
        push(heroRoofs.get(vehicle.id),root,0,glassY,cabinCenter,
          w*.83,heroHeight,heroLen,paint);
        addHeroDetails(vehicle,root,paint);
      }else{
        push(windows.get(profile),root,0,glassY,cabinCenter,
          w*.81,cabinHeight,l*cabinScale);
        push(roofs,root,0,glassY+cabinHeight*.98,cabinCenter,
          w*.73,.085,l*cabinScale*.70,paint);
      }
      const classic=profile==="classic";
      const sport=hint.lights==="slim";
      const upright=hint.lights==="vertical";
      for(const side of [-1,1]){
        // Different profiles receive differently sized light assemblies.
        push(headlights,root,side*w*.35,high?.86:.73,l*.49,
          classic?.32:sport?.45:upright?.23:.31,
          classic?.28:sport?.11:upright?.29:.18,.11);
        push(taillights,root,side*w*.37,high?.91:.74,-l*.49,
          profile==="compact"?.22:.34,profile==="compact"?.39:.16,.1);
      }
    }else{
      renderedMotorcycles++;totalRiders++;
      const isScooter=["scooter","step-through"].includes(vehicle.shape);
      const isTrail=vehicle.shape==="trail";
      const seatY=isTrail?1.17:isScooter?1.07:1.12;
      const jersey=new THREE.Color(paintFor(userId+"-rider"));
      const helmetColor=new THREE.Color(paintFor(userId+"-helmet"));
      const gripZ=l*.37;
      const lean=isScooter?.06:isTrail?.21:.33;
      push(tank,root,0,.97,l*.12,
        isScooter?.53:.68,isScooter?.61:.43,
        isScooter?.91:.93,paint);
      // Every motorcycle has one helmeted rider, no rider on cars.
      push(torso,root,0,seatY+.48,-l*.16+lean*.30,
        .68,.92,.42,jersey,-lean);
      push(helmet,root,0,seatY+1.17,l*.01+lean*.36,
        .65,.70,.67,helmetColor,-lean*.45);
      push(visor,root,0,seatY+1.18,l*.01+.29+lean*.34,
        .53,.27,.22);
      for(const side of [-1,1]){
        segment(root,side*.28,seatY+.78,-l*.13,
          side*.39,1.53,gripZ,.12,jersey);
        segment(root,side*.20,seatY+.10,-l*.26,
          side*.33,.67,l*.06,.17,jersey);
        push(riderGloves,root,side*.39,1.53,gripZ,
          .21,.18,.27);
        push(riderGloves,root,side*.33,.67,l*.06,
          .23,.27,.33);
      }
    }
    const wheelY=vehicle.kind==="motorcycle"?
      vehicle.shape==="trail"?.49:.42:.37;
    const radius=vehicle.kind==="motorcycle"?
      vehicle.shape==="trail"?.44:.36:.34;
    const wheelZ=l*(vehicle.kind==="motorcycle"?.32:.32);
    const sides=vehicle.kind==="motorcycle"?[0]:[-1,1];
    const zOffsets=[wheelZ,-wheelZ];
    for(const side of sides)for(const z of zOffsets){
      const x=vehicle.kind==="motorcycle"?0:side*w*.51;
      const tireThickness=vehicle.kind==="motorcycle"?.22:.26;
      const spin=running?progress*.32:0;
      push(tires,root,x,wheelY,z,tireThickness,radius*2,radius*2,null,spin);
      const hubX=vehicle.kind==="motorcycle"?x+.13:x+side*.15;
      push(hubs,root,hubX,wheelY,z,.035,radius*.98,radius*.98,null,spin);
      totalWheels++;
    }
  }
  function finish(){
    for(const mesh of ownedMeshes){
      mesh.count=counts.get(mesh);
      if(mesh.count){
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      }
    }
  }
  function stats(){return {
    realCarModels:renderedCars,realMotorcycleModels:renderedMotorcycles,
    motorcycleRiders:totalRiders,realWheels:totalWheels,
    heroModels,heroUniqueModels:heroIds.size,
    unoLadderRungs:ladderRungs,heroDetailParts,
    realDetailMeshes:ownedMeshes.filter(mesh=>mesh.count>0).length
  };}
  function dispose(){
    for(const mesh of ownedMeshes){scene.remove(mesh);mesh.dispose();}
    for(const geo of ownedGeometries)geo.dispose();
    for(const mat of ownedMaterials)mat.dispose();
  }
  return {begin,renderVehicle,finish,stats,dispose};
}
