import test from "node:test";
import assert from "node:assert/strict";
import {createState,register,advance,rank,arrangeStartingGrid} from "../src/engine.js";
import {gridPosition,gridRow,visualStartingDistance,gridTrackPoint,startingGrid} from "../src/start-grid.js";
import {trackCenter} from "../src/track-path.js";
test("First, second and third on the official ranking are in the front three lanes",()=>{
  const state=createState(21);
  for(const id of ["u9","u3","u5","u1","u8","u2","u7","u4","u6","u0"])
    register(state,id,"Player "+id,"entrar");
  advance(state);
  const classified=rank(state.active);
  assert.deepEqual(classified.slice(0,3).map(r=>r.gridPosition),[1,2,3]);
  assert.deepEqual(classified.slice(0,3).map(r=>r.lane),[1,2,3]);
  assert.deepEqual(classified.slice(3,6).map(r=>r.gridPosition),[4,5,6]);
  assert.deepEqual(classified.slice(3,6).map(r=>r.lane),[1,2,3]);
  assert.deepEqual(classified.map(r=>gridRow(r)),[0,0,0,1,1,1,2,2,2,3]);
  assert.ok(state.active.every(r=>r.progress===0),"Starting grid is visual, not a head start");
  assert.equal(visualStartingDistance(classified[0],0),0);
  assert.equal(visualStartingDistance(classified[3],3),-2.65);
  assert.equal(visualStartingDistance(classified[6],6),-5.3);
});
test("Grid rows really extend backward from 0m, rather than collapsing to one spot",()=>{
  const a=trackCenter(0),back1=gridTrackPoint(-2.65,0,.76);
  const back2=gridTrackPoint(-5.3,0,.76);
  assert.ok(Math.hypot(back1.x-a.x,back1.z-a.z)>2.5);
  assert.ok(Math.hypot(back2.x-a.x,back2.z-a.z)>5);
  assert.ok(Math.hypot(back2.x-back1.x,back2.z-back1.z)>2.5);
  assert.equal(gridTrackPoint(-4,0).heading,a.heading);
});
test("Registration order does not displace the leaderboard leaders and grid stays fixed after launch",()=>{
  const s=createState(7);
  for(const id of ["z","c","a","b","y","e","d"])register(s,id,id,"entrar");
  advance(s);const slots=s.active.map(r=>({id:r.id,pos:r.gridPosition,lane:r.lane}));
  advance(s);
  assert.deepEqual(s.active.map(r=>({id:r.id,pos:r.gridPosition,lane:r.lane})),slots);
  arrangeStartingGrid(s);
  assert.deepEqual(s.active.map(r=>({id:r.id,pos:r.gridPosition,lane:r.lane})),slots);
  assert.ok(s.active.every(r=>r.progress===0));
});
test("Large 50-runner grid has 17 ordered rows of at most three runners",()=>{
  const s=createState(123);
  for(let i=0;i<50;i++)register(s,"u"+String(i).padStart(2,"0"),"Runner","entrar");
  const positions=startingGrid(s.active);
  assert.equal(positions.length,50);
  assert.equal(positions[0].row,0);
  assert.equal(positions[2].row,0);
  assert.equal(positions[3].row,1);
  assert.equal(positions[49].row,16);
  assert.ok(positions.every(p=>p.lane>=1&&p.lane<=3));
});
