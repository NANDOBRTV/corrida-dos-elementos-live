// Six original, hand-directed automotive body shapes for broadcast closeups.
// Not manufacturer CAD assets. Coordinates are normalized around the chassis:
// front = +Z, rear = -Z, wheel centres near +/-0.32 in longitudinal space.
//
// The six variants have different roofline, bonnet, tail and shoulder forms.
// Sharing one geometry per hero model allows 100 vehicles on mobile WebGL.
import {HERO_CAR_IDS,HERO_CAR_SPECS} from "./vehicles.js";

const STATIONS=Object.freeze([-.50,-.46,-.40,-.33,-.25,-.16,-.07,
  .03,.13,.24,.34,.43,.48,.50]);
const STYLE={
  "car-fusca":{
    widths:[.73,.77,.82,.90,.95,.98,1,1,.98,.95,.90,.84,.77,.70],
    shoulders:[.48,.55,.61,.67,.69,.70,.70,.68,.64,.58,.53,.48,.44,.40],
    bonnet:[.03,.03,.04,.04,.05,.05,.04,.035,.03,.025,.02,.02,.018,.01],
    cabin:[0,.25,.53,.77,.95,1,1,.99,.88,.66,.43,.16,0,0],
    canopyWidth:[.65,.70,.75,.81,.86,.88,.89,.88,.84,.79,.69,.58,.55,.53],
    canopyShoulder:.25,canopyHeight:.82,
    center:-.015,span:.91,roof:"round",wheelRadius:.43
  },
  "car-uno":{
    widths:[.89,.92,.94,.99,1,1,1,1,1,1,.99,.97,.94,.90],
    shoulders:[.72,.73,.75,.77,.78,.79,.80,.80,.79,.78,.77,.76,.75,.73],
    bonnet:[.01,.01,.01,.012,.012,.012,.01,.008,.006,.005,.003,.003,0,0],
    cabin:[0,.77,.95,.98,1,1,1,1,.99,.98,.95,.84,.28,0],
    canopyWidth:[.77,.78,.80,.82,.84,.84,.85,.85,.85,.84,.83,.81,.80,.77],
    canopyShoulder:.30,canopyHeight:.75,
    center:-.02,span:.91,roof:"flat",wheelRadius:.35
  },
  "car-palio":{
    widths:[.80,.84,.89,.93,.97,1,1,1,.99,.98,.95,.91,.86,.82],
    shoulders:[.60,.64,.67,.70,.71,.72,.72,.72,.70,.68,.64,.60,.55,.51],
    bonnet:[.02,.02,.025,.03,.035,.04,.035,.03,.025,.02,.015,.01,0,0],
    cabin:[0,.29,.63,.87,.98,1,1,.96,.83,.63,.41,.15,0,0],
    canopyWidth:[.66,.71,.77,.81,.85,.86,.86,.85,.83,.79,.73,.67,.62,.58],
    canopyShoulder:.28,canopyHeight:.69,
    center:0,span:.84,roof:"rounded-hatch",wheelRadius:.36
  },
  "car-gol":{
    widths:[.85,.89,.94,.97,.99,1,1,1,1,.99,.97,.94,.90,.84],
    shoulders:[.62,.65,.67,.68,.70,.70,.71,.71,.70,.69,.67,.65,.63,.61],
    bonnet:[.01,.01,.01,.012,.012,.012,.01,.01,.008,.007,.005,.004,0,0],
    cabin:[0,.38,.73,.95,1,1,.99,.91,.78,.56,.34,.11,0,0],
    canopyWidth:[.71,.75,.78,.83,.86,.86,.86,.86,.85,.81,.74,.68,.62,.58],
    canopyShoulder:.29,canopyHeight:.67,
    center:-.02,span:.84,roof:"angular-hatch",wheelRadius:.36
  },
  "car-civic":{
    widths:[.83,.86,.89,.92,.96,.99,1,1,.99,.97,.94,.89,.85,.79],
    shoulders:[.52,.55,.56,.58,.60,.61,.61,.59,.58,.56,.53,.50,.48,.46],
    bonnet:[.025,.03,.035,.035,.04,.04,.035,.03,.025,.02,.01,.007,0,0],
    cabin:[0,.18,.43,.70,.89,.98,1,.96,.82,.54,.27,.06,0,0],
    canopyWidth:[.66,.69,.73,.76,.79,.80,.80,.77,.73,.67,.61,.55,.51,.47],
    canopyShoulder:.23,canopyHeight:.53,
    center:-.06,span:.73,roof:"fastback",wheelRadius:.34
  },
  "car-opala":{
    widths:[.87,.91,.94,.97,1,1,1,1,1,.99,.98,.95,.93,.87],
    shoulders:[.59,.62,.64,.66,.67,.68,.68,.68,.67,.66,.64,.62,.60,.58],
    bonnet:[.015,.015,.02,.025,.025,.025,.02,.02,.018,.016,.014,.01,0,0],
    cabin:[0,.18,.49,.83,.98,1,.97,.80,.40,.12,0,0,0,0],
    canopyWidth:[.72,.74,.77,.81,.83,.84,.84,.80,.71,.63,.57,.53,.50,.47],
    canopyShoulder:.25,canopyHeight:.56,
    center:-.13,span:.71,roof:"notchback",wheelRadius:.38
  }
};
export const HERO_SHAPES=Object.freeze(
  Object.fromEntries(Object.entries(STYLE).map(([key,v])=>[key,Object.freeze(v)]))
);
function buildGeometry(THREE,rings,pointsPerRing,wrap=true){
  const positions=[],uvs=[],indices=[];
  for(let i=0;i<rings.length;i++){
    const ring=rings[i];
    for(let j=0;j<ring.length;j++){
      const p=ring[j];positions.push(p[0],p[1],p[2]);
      uvs.push(j/Math.max(1,pointsPerRing-1),i/Math.max(1,rings.length-1));
    }
  }
  for(let i=0;i<rings.length-1;i++){
    for(let j=0;j<(wrap?pointsPerRing:pointsPerRing-1);j++){
      const next=(j+1)%pointsPerRing;
      const a=i*pointsPerRing+j,b=i*pointsPerRing+next;
      const c=(i+1)*pointsPerRing+j,d=(i+1)*pointsPerRing+next;
      indices.push(a,c,b,b,c,d);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(indices);g.computeVertexNormals();
  return g;
}
function makeHeroShell(THREE,id){
  const st=STYLE[id],rings=[];
  for(let i=0;i<STATIONS.length;i++){
    const z=STATIONS[i],w=st.widths[i]*.5,h=st.shoulders[i];
    const crown=st.bonnet[i];
    const round=id==="car-fusca";
    // 14-point transverse contour gives soft metal shoulders, curved top
    // and a separate bonnet crease instead of an enlarged box.
    rings.push([
      [-w*.83,.05,z],[-w*.99,.18,z],[-w,.34,z],
      [-w*.99,h*.70,z],[-w*.92,h*.94,z],[-w*.74,h,z],
      [-w*.38,h+crown*.80,z],[0,h+crown,z],
      [w*.38,h+crown*.80,z],[w*.74,h,z],[w*.92,h*.94,z],
      [w*.99,h*.70,z],[w,.34,z],[w*.83,.05,z]
    ]);
    if(round){/* the Fusca's varying station widths create fenders */ }
  }
  return buildGeometry(THREE,rings,14);
}
function makeHeroGlass(THREE,id){
  const st=STYLE[id],rings=[];
  for(let i=0;i<STATIONS.length;i++){
    const z=STATIONS[i],c=st.cabin[i],w=st.canopyWidth[i]*.5;
    const top=.05+c*st.canopyHeight;
    rings.push([
      [-w*.97,.01,z],[-w*.94,.13+c*st.canopyShoulder,z],
      [-w*.79,top*.96,z],[0,top,z],
      [w*.79,top*.96,z],[w*.94,.13+c*st.canopyShoulder,z],
      [w*.97,.01,z]
    ]);
  }
  return buildGeometry(THREE,rings,7);
}
function makeHeroRoof(THREE,id){
  const st=STYLE[id],rings=[];
  for(let i=0;i<STATIONS.length;i++){
    const z=STATIONS[i],c=st.cabin[i],w=st.canopyWidth[i]*.5;
    const top=.05+c*st.canopyHeight;
    rings.push([
      [-w*.83,top-.028,z],[-w*.55,top+.017,z],
      [0,top+.043,z],[w*.55,top+.017,z],
      [w*.83,top-.028,z]
    ]);
  }
  return buildGeometry(THREE,rings,5,false);
}
export function createHeroCarGeometries(THREE){
  const entries=new Map();
  for(const id of HERO_CAR_IDS){
    entries.set(id,{
      body:makeHeroShell(THREE,id),
      glass:makeHeroGlass(THREE,id),
      roof:makeHeroRoof(THREE,id)
    });
  }
  return entries;
}
export function heroIsWithLadder(id){
  return Boolean(HERO_CAR_SPECS[id]?.ladder);
}
// The ladder spans the length of Uno's roof, with two metallic side rails,
// twelve individual rungs and four brackets. Accessible as deterministic data
// to drive one InstancedMesh rather than separate WebGL draw calls.
export function roofLadderParts(id){
  if(!heroIsWithLadder(id))return [];
  const parts=[
    {name:"left-rail",p:[-.40,1.68,0],s:[.065,.065,1.77],tilt:0},
    {name:"right-rail",p:[.40,1.68,0],s:[.065,.065,1.77],tilt:0}
  ];
  for(let i=0;i<12;i++){
    parts.push({
      name:"rung-"+String(i+1),
      p:[0,1.695,-.79+i*(1.58/11)],s:[.88,.053,.060],tilt:0
    });
  }
  for(const x of [-.39,.39])for(const z of [-.63,.63]){
    parts.push({name:"mount-"+String(x)+"-"+String(z),
      p:[x,1.575,z],s:[.095,.19,.11],tilt:0});
  }
  return parts;
}
export function heroSignatureParts(id,width,length){
  // Data-only details: chrome bars, badges deliberately left unbranded,
  // bumper treatment and model-defining roof/bonnet accents.
  const w=width,l=length;
  const side=w*.46;
  const common=[
    {p:[0,.49,l*.500],s:[w*.69,.12,.09],mat:"chrome"},
    {p:[0,.51,-l*.500],s:[w*.74,.12,.09],mat:"chrome"},
    {p:[0,.65,l*.506],s:[w*.35,.13,.04],mat:"dark"}
  ];
  if(id==="car-fusca")return [
    ...common,
    {p:[0,.59,-l*.485],s:[.40,.055,.06],mat:"dark"},
    {p:[-.34,.72,-l*.41],s:[.17,.043,.09],mat:"dark"},
    {p:[.34,.72,-l*.41],s:[.17,.043,.09],mat:"dark"},
    {p:[0,.74,l*.437],s:[w*.18,.055,l*.17],mat:"paint"}
  ];
  if(id==="car-uno")return [
    ...common,
    {p:[0,.91,-l*.484],s:[w*.68,.08,.06],mat:"dark"},
    {p:[0,.69,l*.489],s:[w*.61,.11,.055],mat:"dark"},
    {p:[side,.84,0],s:[.045,.075,l*.29],mat:"dark"},
    {p:[-side,.84,0],s:[.045,.075,l*.29],mat:"dark"}
  ];
  if(id==="car-palio")return [
    ...common,
    {p:[0,.70,l*.497],s:[w*.46,.09,.06],mat:"dark"},
    {p:[0,.95,-l*.43],s:[w*.77,.064,.08],mat:"paint"}
  ];
  if(id==="car-gol")return [
    ...common,
    {p:[0,.70,l*.498],s:[w*.55,.12,.06],mat:"dark"},
    {p:[0,.93,-l*.442],s:[w*.69,.045,.07],mat:"dark"}
  ];
  if(id==="car-civic")return [
    ...common,
    {p:[0,.69,l*.50],s:[w*.78,.085,.06],mat:"dark"},
    {p:[0,.78,l*.44],s:[w*.47,.035,l*.17],mat:"paint"},
    {p:[0,.82,-l*.443],s:[w*.71,.067,.10],mat:"paint"}
  ];
  if(id==="car-opala")return [
    ...common,
    {p:[0,.72,l*.496],s:[w*.78,.17,.075],mat:"dark"},
    {p:[0,.93,l*.25],s:[w*.64,.046,l*.21],mat:"paint"},
    {p:[0,.63,-l*.484],s:[w*.56,.08,.05],mat:"chrome"}
  ];
  return common;
}
