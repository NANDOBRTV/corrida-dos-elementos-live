// Cadastro único da Corrida dos Elementos LIVE: 20 carros e 10 motos.
// Os nomes são identificadores de modelos conhecidos; as malhas voxel são
// desenhos originais sem logomarcas, emblemas oficiais ou assets licenciados.
const cars=[
 ["civic","Civic","sedan",1.91,3.32,.91],
 ["gol","Gol","hatch",1.76,2.83,.84],
 ["uno","Uno","compact",1.63,2.63,1.04],
 ["strada","Strada","pickup",1.88,3.43,1.03],
 ["palio","Palio","hatch",1.72,2.81,.87],
 ["corsa","Corsa","hatch",1.71,2.83,.83],
 ["onix","Onix","hatch",1.81,2.93,.86],
 ["hb20","HB20","hatch",1.80,2.87,.87],
 ["corolla","Corolla","sedan",1.94,3.44,.92],
 ["fiesta","Fiesta","hatch",1.81,2.91,.88],
 ["ka","Ka","compact",1.69,2.67,.82],
 ["saveiro","Saveiro","pickup",1.83,3.38,.95],
 ["s10","S10","pickup",2.05,3.70,1.19],
 ["hilux","Hilux","pickup",2.06,3.81,1.26],
 ["duster","Duster","suv",2.04,3.28,1.24],
 ["renegade","Renegade","suv",2.04,3.18,1.21],
 ["fusca","Fusca","classic-round",1.76,2.83,1.05],
 ["monza","Monza","sedan-old",1.89,3.43,.88],
 ["opala","Opala","muscle",1.98,3.66,.92],
 ["santana","Santana","sedan-old",1.90,3.48,.90]
];
const motorcycles=[
 ["cg160","CG 160","street",.79,2.25,.79],
 ["biz125","Biz 125","step-through",.74,2.18,.83],
 ["bros160","Bros 160","trail",.83,2.42,1.04],
 ["xre300","XRE 300","trail",.88,2.53,1.11],
 ["pop110i","Pop 110i","step-through",.73,2.15,.77],
 ["fazer250","Fazer 250","street",.83,2.43,.86],
 ["cb300ftwister","CB 300F Twister","naked",.87,2.44,.89],
 ["factor150","Factor 150","street",.78,2.28,.83],
 ["lander250","Lander 250","trail",.85,2.56,1.13],
 ["nmax160","NMAX 160","scooter",.88,2.35,.90]
];
const aliases={
  "scada":"strada","s-10":"s10","s 10":"s10","chevrolet s10":"s10",
  "cg":"cg160","cg 160":"cg160","titan":"cg160","titan 160":"cg160",
  "biz":"biz125","biz 125":"biz125","bros":"bros160",
  "bros 160":"bros160","xre":"xre300","xre 300":"xre300",
  "pop":"pop110i","pop 110":"pop110i","pop 110i":"pop110i",
  "fazer":"fazer250","fazer 250":"fazer250",
  "twister":"cb300ftwister","cb 300":"cb300ftwister",
  "cb300":"cb300ftwister","cb 300f":"cb300ftwister",
  "cb 300f twister":"cb300ftwister",
  "factor":"factor150","factor 150":"factor150",
  "lander":"lander250","lander 250":"lander250",
  "nmax":"nmax160","nmax 160":"nmax160"
};
export const VEHICLES=Object.freeze([
 ...cars.map(([code,name,shape,width,length,height],index)=>Object.freeze({
  id:"car-"+code,name,kind:"car",shape,width,length,height,index
 })),
 ...motorcycles.map(([code,name,shape,width,length,height],index)=>Object.freeze({
  id:"moto-"+code,name,kind:"motorcycle",shape,width,length,height,index:index+cars.length
 }))
]);
export const CAR_COUNT=20,MOTO_COUNT=10;
const lookup=new Map();
export function normalizeVehicleText(value){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim().replace(/[_-]+/g," ")
    .replace(/\s+/g," ");
}
for(const vehicle of VEHICLES){
  lookup.set(normalizeVehicleText(vehicle.name),vehicle);
  lookup.set(normalizeVehicleText(vehicle.id),vehicle);
}
for(const [alias,code] of Object.entries(aliases)){
  const vehicle=VEHICLES.find(v=>v.id.endsWith("-"+code));
  if(vehicle)lookup.set(normalizeVehicleText(alias),vehicle);
}
// Only exact catalog names/aliases are valid; never infer a random vehicle
// or silently substitute another model for a viewer's explicit choice.
export function resolveVehicle(input){
  if(typeof input!=="string"||input.length>80)return null;
  return lookup.get(normalizeVehicleText(input))??null;
}
export function parseVehicleChoice(comment){
  if(typeof comment!=="string"||comment.length>100)return null;
  let text=normalizeVehicleText(comment);
  text=text.replace(/^(entrar|participar|corrida)\s+/u,"");
  return lookup.get(text)??null;
}
export function vehicleForBot(index){
  // Deterministic demo filler, not a random real-user assignment.
  const slot=((Math.trunc(index)%VEHICLES.length)+VEHICLES.length)%VEHICLES.length;
  // Two cars followed by one motorcycle: every demo grid already includes
  // both types; all 20 cars and 10 motorcycles appear once every 30 slots.
  return slot%3===2?VEHICLES[CAR_COUNT+Math.floor(slot/3)]:
    VEHICLES[Math.floor(slot/3)*2+(slot%3)];
}
export function vehicleById(id){
  return resolveVehicle(id);
}
