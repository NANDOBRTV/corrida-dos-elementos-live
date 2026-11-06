import test from "node:test";
import assert from "node:assert/strict";
import {HERO_CAR_IDS,HERO_CAR_SPECS,parseVehicleChoice} from "../src/vehicles.js";
import {HERO_SHAPES,heroIsWithLadder,roofLadderParts,heroSignatureParts} from "../src/studio-hero-cars.js";

test("Seis carros principais têm silhuetas próprias, sem misturar modelos",()=>{
  assert.deepEqual(HERO_CAR_IDS,[
    "car-fusca","car-uno","car-palio","car-gol","car-civic","car-opala"
  ]);
  assert.equal(new Set(HERO_CAR_IDS).size,6);
  for(const id of HERO_CAR_IDS){
    const shape=HERO_SHAPES[id],spec=HERO_CAR_SPECS[id];
    assert.ok(shape&&spec,"Modelo sem desenho completo: "+id);
    assert.equal(shape.widths.length,14);
    assert.equal(shape.shoulders.length,14);
    assert.equal(shape.cabin.length,14);
    assert.equal(shape.canopyWidth.length,14);
    assert.ok(shape.canopyHeight>.5);
    assert.ok(heroSignatureParts(id,spec.width,spec.length).length>=4);
  }
  const signatures=new Set(HERO_CAR_IDS.map(id=>
    JSON.stringify([HERO_SHAPES[id].widths,HERO_SHAPES[id].cabin,
      HERO_SHAPES[id].shoulders,HERO_SHAPES[id].roof])
  ));
  assert.equal(signatures.size,6,"Nenhum carro pode reutilizar mesma carroceria");
  assert.notDeepEqual(HERO_SHAPES["car-palio"].cabin,
    HERO_SHAPES["car-gol"].cabin);
  assert.ok(HERO_CAR_SPECS["car-opala"].length>
    HERO_CAR_SPECS["car-uno"].length);
});
test("O Uno tem escada metálica inteira e funcional no teto",()=>{
  const parts=roofLadderParts("car-uno");
  assert.equal(parts.length,18);
  assert.equal(parts.filter(p=>p.name.includes("rail")).length,2);
  assert.equal(parts.filter(p=>p.name.startsWith("rung-")).length,12);
  assert.equal(parts.filter(p=>p.name.startsWith("mount-")).length,4);
  assert.ok(parts.every(p=>p.p.every(Number.isFinite)&&
    p.s.every(v=>Number.isFinite(v)&&v>0)));
  assert.ok(parts.find(p=>p.name==="left-rail").p[0]<0);
  assert.ok(parts.find(p=>p.name==="right-rail").p[0]>0);
  assert.equal(heroIsWithLadder("car-uno"),true);
  for(const id of HERO_CAR_IDS.filter(id=>id!=="car-uno")){
    assert.equal(heroIsWithLadder(id),false);
    assert.deepEqual(roofLadderParts(id),[]);
  }
});
test("Chat aceita Uno com escada e Fusquinha, sem sorteio",()=>{
  assert.equal(parseVehicleChoice("Uno com escada no teto")?.id,"car-uno");
  assert.equal(parseVehicleChoice("entrar uno escada")?.id,"car-uno");
  assert.equal(parseVehicleChoice("fusquinha")?.id,"car-fusca");
  for(const id of HERO_CAR_IDS){
    assert.equal(parseVehicleChoice(HERO_CAR_SPECS[id].ladder?
      "entrar Uno com escada no teto":
      "entrar "+{
        "car-fusca":"Fusca","car-palio":"Palio","car-gol":"Gol",
        "car-civic":"Civic","car-opala":"Opala"
      }[id])?.id,id);
  }
});
