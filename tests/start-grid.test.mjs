import test from "node:test";
import assert from "node:assert/strict";
import {LANES,LANE_WIDTH,laneX} from "../src/config.js";
import {createState,register,advance,rank,arrangeStartingGrid} from "../src/engine.js";
import {GRID_COLUMNS,GRID_ROW_GAP,gridRow,visualStartingDistance,
  gridTrackPoint,startingGrid} from "../src/start-grid.js";
import {trackCenter} from "../src/track-path.js";

test("The 66-second video reference requires 10 avatars across the first row",()=>{
  assert.equal(GRID_COLUMNS,10);
  assert.equal(LANES,10);
  assert.equal(LANE_WIDTH,1.75);
  const s=createState(21);
  for(const id of ["u9","u3","u5","u1","u8","u2","u7","u4","u6","u0","u10","u11"])
    register(s,id,"Player "+id,"entrar");
  advance(s);
  const lineup=rank(s.active);
  assert.deepEqual(lineup.slice(0,10).map(r=>r.gridPosition),[1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(lineup.slice(0,10).map(r=>r.lane),[0,1,2,3,4,5,6,7,8,9]);
  assert.deepEqual(lineup.slice(10,12).map(r=>r.gridPosition),[11,12]);
  assert.deepEqual(lineup.slice(10,12).map(r=>r.lane),[0,1]);
  assert.deepEqual(lineup.map(r=>gridRow(r)),[0,0,0,0,0,0,0,0,0,0,1,1]);
  assert.ok(s.active.every(r=>r.progress===0),"No unfair head start");
  assert.equal(visualStartingDistance(lineup[0],0),0);
  assert.equal(visualStartingDistance(lineup[10],10),-GRID_ROW_GAP);
  assert.ok(laneX(9)-laneX(0)>15);
});
test("Ten-lane grid extrapolates backwards from 0m, without piling up bodies",()=>{
  const start=trackCenter(0),back=gridTrackPoint(-GRID_ROW_GAP,0,.76);
  const further=gridTrackPoint(-GRID_ROW_GAP*4,0,.76);
  assert.ok(Math.hypot(back.x-start.x,back.z-start.z)>2.8);
  assert.ok(Math.hypot(further.x-start.x,further.z-start.z)>11);
  assert.equal(gridTrackPoint(-4,0).heading,start.heading);
});
test("Grid order remains stable from countdown into RUNNING and after operator camera changes",()=>{
  const s=createState(7);
  for(const id of ["z","c","a","b","y","e","d","m","o","n","p"])
    register(s,id,id,"entrar");
  advance(s);
  const initial=s.active.map(r=>({id:r.id,pos:r.gridPosition,lane:r.lane}));
  advance(s);
  assert.deepEqual(s.active.map(r=>({id:r.id,pos:r.gridPosition,lane:r.lane})),initial);
  arrangeStartingGrid(s);
  assert.deepEqual(s.active.map(r=>({id:r.id,pos:r.gridPosition,lane:r.lane})),initial);
  assert.ok(s.active.every(r=>r.progress===0));
});
test("Fifty players form exactly five rows of ten without overlap and no extra entrants",()=>{
  const s=createState(123);
  for(let i=0;i<50;i++)register(s,"u"+String(i).padStart(2,"0"),"Runner","entrar");
  const grid=startingGrid(s.active);
  assert.equal(grid.length,50);
  for(let row=0;row<5;row++){
    const group=grid.filter(p=>p.row===row);
    assert.equal(group.length,10);
    assert.deepEqual(group.map(p=>p.lane),[0,1,2,3,4,5,6,7,8,9]);
  }
  assert.equal(grid[49].row,4);
  assert.ok(grid.every(p=>p.lane>=0&&p.lane<LANES));
  assert.equal(register(s,"extra","Extra","entrar").ok,false);
});
