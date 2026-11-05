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
  assert.ok(first.every(v=>v.vehicle!=="kart"));
  assert.ok(first.every(v=>v.vehicle!=="moto"));
});
test("Humanoid visuals cannot change the authoritative 5,000m race",()=>{
  const game=createState(51);
  register(game,"blocky-guest","Guest","entrar");advance(game);advance(game);
  const original=structuredClone(game);
  const looks=appearanceForRunner(game.active[0].id);
  assert.ok(looks.outfit>=0&&looks.outfit<8);
  assert.deepEqual(game,original);
  assert.equal(game.trackLength,400);
});

test("Frontal countdown avatars have original visible faces without new GPU draw calls",async()=>{
  const {readFile}=await import("node:fs/promises");
  const src=await readFile(new URL("../src/avatars.js",import.meta.url),"utf8");
  assert.ok(src.includes('part(body,[-.19,1.83,.425]'));
  assert.ok(src.includes('part(body,[.19,1.83,.425]'));
  assert.ok(src.includes('part(body,[0,1.54,.425]'));
  assert.ok(src.includes('InstancedMesh'));
});
