import test from "node:test";
import assert from "node:assert/strict";
import {PREMIUM_HERO_MODELS,PREMIUM_CAR_IDS,SOURCE_COMMIT,
  premiumModelUrl,remoteModelUrl} from "../src/studio-premium-assets.js";
import {HERO_CAR_IDS} from "../src/vehicles.js";

test("Licenças CC BY visíveis, artistas corretos e URLs imutáveis",()=>{
  assert.equal(PREMIUM_CAR_IDS.length,5);
  assert.equal(SOURCE_COMMIT.length,40);
  assert.deepEqual(PREMIUM_CAR_IDS.sort(),[
    "car-civic","car-fusca","car-opala","car-palio","car-uno"
  ].sort());
  for(const id of PREMIUM_CAR_IDS){
    assert.ok(HERO_CAR_IDS.includes(id));
    const model=PREMIUM_HERO_MODELS[id];
    assert.equal(model.license,"CC BY 4.0");
    assert.ok(model.author.length>=4);
    assert.match(model.source,/^https:\/\/sketchfab\.com\/3d-models\/[a-z0-9-]+$/);
    assert.match(premiumModelUrl(id),/^\/assets\/models\/[\w-]+\.glb$/);
    assert.match(remoteModelUrl(id),
      new RegExp(SOURCE_COMMIT+"/assets/"));
    assert.ok(model.bytes>100000&&model.bytes<10000000);
  }
  // The source catalog's "volkswagen-gol" is a Golf MK1, NOT a Gol.
  // Keep the Brazilian Gol geometry hand-made instead of mislabeling assets.
  assert.equal(PREMIUM_HERO_MODELS["car-gol"],undefined);
  assert.equal(premiumModelUrl("car-gol"),null);
});
