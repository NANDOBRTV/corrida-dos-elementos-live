import test from "node:test";
import assert from "node:assert/strict";
import {VEHICLES} from "../src/vehicles.js";
import {CAR_STYLE_HINTS,REALISTIC_PROFILES,
  REALISTIC_PARTS} from "../src/studio-vehicle-models.js";

test("20 carros possuem perfis de carroceria independentes",()=>{
  const cars=VEHICLES.filter(vehicle=>vehicle.kind==="car");
  assert.equal(cars.length,20);
  assert.equal(Object.keys(CAR_STYLE_HINTS).length,20);
  for(const vehicle of cars){
    const hint=CAR_STYLE_HINTS[vehicle.id];
    assert.ok(hint,"Falta modelo de carro: "+vehicle.name);
    assert.ok(hint.cabin>.35&&hint.cabin<.9);
    assert.ok(hint.height>.5&&hint.height<1);
    assert.ok(hint.offset>-.2&&hint.offset<.3);
    assert.ok(["slim","rect","round","vertical"].includes(hint.lights));
  }
  assert.equal(new Set(cars.map(c=>c.shape)).size>=5,true);
  assert.equal(REALISTIC_PROFILES.includes("pickup"),true);
  assert.equal(REALISTIC_PROFILES.includes("classic"),true);
});

test("10 motocicletas têm pneus arredondados e piloto obrigatoriamente",()=>{
  const motorcycles=VEHICLES.filter(vehicle=>vehicle.kind==="motorcycle");
  assert.equal(motorcycles.length,10);
  assert.equal(REALISTIC_PARTS.wheelsPerCar,4);
  assert.equal(REALISTIC_PARTS.wheelsPerMotorcycle,2);
  assert.equal(REALISTIC_PARTS.riderOnEveryMotorcycle,true);
  assert.ok(new Set(motorcycles.map(m=>m.shape)).size>=4);
});
