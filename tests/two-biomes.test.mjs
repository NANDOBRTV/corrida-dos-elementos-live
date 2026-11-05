import test from "node:test";
import assert from "node:assert/strict";
import {BIOME_ORDER,BIOMES,LEGACY_BIOME_IDS,mapForRound,obstaclesFor} from "../src/config.js";
import {createState,register,advance,migrateSavedState,validateSavedState} from "../src/engine.js";
import {createApp} from "../server/index.js";

test("Only Ice and Forest are playable; neither biome contains automatic obstacles",()=>{
  assert.deepEqual(BIOME_ORDER,["ice","forest"]);
  assert.deepEqual(Object.keys(BIOMES).sort(),["forest","ice"]);
  assert.deepEqual(obstaclesFor("ice"),[]);
  assert.deepEqual(obstaclesFor("forest"),[]);
  for(let round=1;round<=40;round++)assert.equal(mapForRound(round),round%2?"ice":"forest");
});
test("Retiring three biomes does not remove runners, queued entries, or prior champions",()=>{
  const state=createState(129);
  state.round=345;state.mapId="volcano";
  state.history=[{round:344,mapId:"desert",winner:{name:"Campeão antigo"}}];
  state.seasonLeaders=[{id:"u1",name:"Campeão antigo",wins:15}];
  register(state,"u1","Campeão antigo","entrar");
  advance(state);
  register(state,"u2","Próximo corredor","entrar");
  const migrated=migrateSavedState(state);
  assert.equal(validateSavedState(state),false);
  assert.equal(validateSavedState(migrated),true);
  assert.equal(migrated.round,345);
  assert.equal(migrated.mapId,"ice");
  assert.equal(migrated.active[0].id,"u1");
  assert.equal(migrated.next[0].id,"u2");
  assert.deepEqual(migrated.history,state.history);
  assert.deepEqual(migrated.seasonLeaders,state.seasonLeaders);
  advance(migrated);advance(migrated);advance(migrated);
  assert.equal(migrated.round,346);
  assert.equal(migrated.mapId,"forest");
  assert.equal(migrated.active[0].id,"u2");
});
test("Only known old maps migrate: invalid unknown snapshots remain rejected",()=>{
  for(const old of LEGACY_BIOME_IDS){
    const state=createState();state.mapId=old;
    assert.equal(migrateSavedState(state).mapId,"ice");
  }
  const unknown=createState();unknown.mapId="unrecognized";
  assert.equal(migrateSavedState(unknown),unknown);
  assert.equal(validateSavedState(unknown),false);
});
test("A restarted server restores participants on an old map without resetting database history",async()=>{
  const saved=createState();saved.round=226;saved.mapId="hell";
  saved.active.push({id:"persisted",name:"Participante",lane:0,progress:24,status:"running",baseSpeed:6,finishTime:null});
  saved.history=[{round:225,mapId:"desert",winner:{name:"Antigo"}}];
  let row=structuredClone(saved);
  const storage={enabled:true,async load(){return structuredClone(row);},
    async save(value){row=structuredClone(value);},async close(){}};
  const app=await createApp({adminKey:"test-only-token",storage,seedDemo:false,disableTikTok:true});
  try{
    const url=await app.listen(0);
    const response=await fetch("http://127.0.0.1:"+url.port+"/api/state");
    const body=await response.json();
    assert.equal(body.state.round,226);
    assert.equal(body.state.mapId,"forest");
    assert.equal(body.state.active[0].id,"persisted");
    assert.equal(body.state.active[0].progress,24);
    assert.deepEqual(body.state.history,saved.history);
    await app.flush();
    assert.equal(row.mapId,"forest");
    assert.equal(row.active[0].id,"persisted");
  }finally{await app.close();}
});
