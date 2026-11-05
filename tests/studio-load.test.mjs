import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudioState,studioFillBots,studioAdvance,studioTick,studioRank
} from '../src/studio-engine.js';
import {
  studioCrowdPoses,cameraTargetFor,advanceStudioCamera,studioCourseAt
} from '../src/studio-camera.js';

function simulate(distance,seed){
  const state=createStudioState({seed,distance,connected:false});
  assert.equal(studioFillBots(state,{count:100}),100);
  assert.equal(state.active.length,100);
  assert.equal(new Set(state.active.map(x=>x.id)).size,100);
  studioAdvance(state);assert.equal(state.phase,'COUNTDOWN');
  studioAdvance(state);assert.equal(state.phase,'RUNNING');
  let camera=cameraTargetFor(state);
  const past=new Map(state.active.map(x=>[x.id,0]));
  let steps=0;
  while(state.phase==='RUNNING'&&steps<2400){
    studioTick(state,100);
    steps++;
    if(state.phase!=='RUNNING')break;
    if(steps%20!==0)continue;
    assert.equal(state.active.length,100);
    assert.equal(studioRank(state.active).length,100);
    const poses=studioCrowdPoses(state);
    assert.equal(poses.size,100);
    for(const r of state.active){
      assert.ok(Number.isFinite(r.progress),'Distance must be finite');
      assert.ok(r.progress>=past.get(r.id)-1e-6,'Distance must never rewind');
      assert.ok(r.progress<=distance+1e-6,'Distance must not exceed finish');
      past.set(r.id,r.progress);
      const p=poses.get(r.id);
      assert.ok(Number.isFinite(p.x+p.y+p.z+p.heading));
    }
    const target=cameraTargetFor(state);
    assert.equal(target.mode,'CHASE');
    assert.equal(target.leaderId,null);
    camera=advanceStudioCamera(camera,state,.1);
    assert.ok(Number.isFinite(camera.position.x+camera.position.y+
      camera.position.z+camera.target.x+camera.target.y+camera.target.z));
  }
  assert.equal(state.phase,'RESULTS','Race must finish by 240 seconds');
  assert.equal(state.results.length,100);
  assert.equal(new Set(state.results.map(r=>r.id)).size,100);
  assert.deepEqual(state.results.map(r=>r.position),
    Array.from({length:100},(_,i)=>i+1));
  assert.equal(state.results[0].id,studioRank(state.active)[0].id);
  assert.equal(cameraTargetFor(state).mode,'WINNER_PODIUM');
  return {winner:state.results[0].id,steps,state};
}

test('Parte 9: 100 corredores concluem provas de 1000m e 1500m sem NaN nem perda',()=>{
  for(const distance of [1000,1500]){
    const {state,steps}=simulate(distance,20261105);
    assert.ok(steps>0);
    assert.equal(state.distance,distance);
  }
});

test('Parte 9: determinismo do resultado após carga com 100 corredores',()=>{
  const a=simulate(1200,4234);
  const b=simulate(1200,4234);
  assert.equal(a.steps,b.steps);
  assert.deepEqual(a.state.results,b.state.results);
});

test('Parte 9: curvas da pista longa não produzem coordenadas inválidas',()=>{
  let previous=studioCourseAt(0);
  for(let distance=1;distance<=1500;distance+=1){
    const p=studioCourseAt(distance);
    assert.ok(Number.isFinite(p.x+p.y+p.z+p.heading));
    const segment=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);
    assert.ok(segment>.95&&segment<1.02);
    previous=p;
  }
});
