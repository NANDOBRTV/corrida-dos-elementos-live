import test from "node:test";
import assert from "node:assert/strict";
import {appearanceForRunner} from "../src/cosmetics.js";
import {createState,register,advance} from "../src/engine.js";

test("Original blocky humanoid cosmetics are deterministic across refreshes",()=>{
  const ids=Array.from({length:50},(_,i)=>"roblox-style-guest-"+i);
  const first=ids.map(appearanceForRunner);
  assert.deepEqual(ids.map(appearanceForRunner),first);
  assert.ok(new Set(first.map(v=>v.outfit)).size>=5);
  assert.ok(new Set(first.map(v=>v.headwear)).size>=3);
  assert.ok(new Set(first.map(v=>v.hairStyle)).size>=3);
  assert.ok(first.some(v=>v.vehicle==="jetpack"));
  assert.ok(first.some(v=>v.vehicle==="kart"));
  assert.ok(first.some(v=>v.vehicle==="moto"));
});
test("Humanoid visuals cannot change the authoritative 5,000m race",()=>{
  const game=createState(51);
  register(game,"blocky-guest","Guest","entrar");advance(game);advance(game);
  const original=structuredClone(game);
  const looks=appearanceForRunner(game.active[0].id);
  assert.ok(looks.outfit>=0&&looks.outfit<8);
  assert.deepEqual(game,original);
  assert.equal(game.trackLength,5000);
});
