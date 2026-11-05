// Efficient, original low-poly automotive renderer for Studio V5.
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
  const ownedMeshes=[],ownedGeometries=[],ownedMaterials=[
    shellMaterial,glassMaterial,tireMaterial,hubMaterial,tankMaterial,
    jacketMaterial,helmetMaterial,visorMaterial
  ];
  const body=new Map(),windows=new Map();
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
  const tireGeometry=new THREE.CylinderGeometry(.5,.5,1,14,1);
  tireGeometry.rotateZ(Math.PI/2);
  const rimGeometry=new THREE.CylinderGeometry(.5,.5,1,12,1);
  rimGeometry.rotateZ(Math.PI/2);
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
  const local=new THREE.Matrix4(),combined=new THREE.Matrix4();
  const pos=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const xAxis=new THREE.Vector3(1,0,0);
  const start=new THREE.Vector3(),end=new THREE.Vector3(),
    diff=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  let renderedCars=0,renderedMotorcycles=0,totalWheels=0,totalRiders=0;
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
  function begin(){
    for(const mesh of ownedMeshes)counts.set(mesh,0);
    renderedCars=0;renderedMotorcycles=0;totalWheels=0;totalRiders=0;
  }
  function renderVehicle(vehicle,userId,root,progress=0,running=false){
    const paint=new THREE.Color(paintFor(userId));
    const profile=pickProfile(vehicle.shape);
    const w=vehicle.width,l=vehicle.length;
    if(vehicle.kind==="car"){
      renderedCars++;
      const high=profile==="suv"||profile==="pickup";
      const cabinScale=profile==="pickup"?.52:
        profile==="suv"?.70:profile==="compact"?.60:
        profile==="hatch"?.63:profile==="classic"?.58:.56;
      const cabinCenter=profile==="pickup"?.17:
        profile==="sedan"?-.07:profile==="muscle"?-.11:0;
      const cabinHeight=profile==="suv"?.85:
        profile==="pickup"?.70:profile==="compact"?.76:.66;
      push(body.get(profile),root,0,.35,0,w,.78+(high?.13:0),l,paint);
      push(windows.get(profile),root,0,1.05,cabinCenter,
        w*.81,cabinHeight,l*cabinScale);
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
    realDetailMeshes:ownedMeshes.filter(mesh=>mesh.count>0).length
  };}
  function dispose(){
    for(const mesh of ownedMeshes){scene.remove(mesh);mesh.dispose();}
    for(const geo of ownedGeometries)geo.dispose();
    for(const mat of ownedMaterials)mat.dispose();
  }
  return {begin,renderVehicle,finish,stats,dispose};
}
