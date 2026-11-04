import test from "node:test";
import assert from "node:assert/strict";
import {createState,register,advance,validateSavedState} from "../src/engine.js";
import {recordCompletedRace,seasonTop,recentWinners,MAX_RACE_HISTORY,MAX_SEASON_LEADERS} from "../src/history.js";
import {getViewMode,broadcastLink} from "../src/view.js";

function finishRound(state,people=[["u1","Corredor 1",31000],["u2","Corredor 2",32900]]){
  for(const [id,name] of people){
    const ret=register(state,id,name,"entrar");assert.equal(ret.ok,true);
  }
  advance(state);advance(state);
  for(const [id,,finishTime]of people){
    const r=state.active.find(x=>x.id===id);
    r.finishTime=finishTime;r.progress=150;r.status="finished";
  }
  advance(state);
}
test("Results records one winner and latest podium",()=>{
  const state=createState();
  finishRound(state);
  assert.equal(state.phase,"RESULTS");
  assert.equal(state.history.length,1);
  assert.equal(state.history[0].winner.id,"u1");
  assert.equal(state.history[0].winner.timeMs,31000);
  assert.equal(state.history[0].podium.length,2);
  assert.equal(state.seasonLeaders[0].wins,1);
  assert.equal(seasonTop(state)[0].name,"Corredor 1");
  assert.equal(recentWinners(state)[0].round,1);
});
test("Replaying RESULTS does not award a second win",()=>{
  const state=createState();finishRound(state);
  assert.equal(recordCompletedRace(state),false);
  assert.equal(state.seasonLeaders.find(x=>x.id==="u1").wins,1);
  assert.equal(state.history.length,1);
});
test("Champions carry over across automatic rounds",()=>{
  const state=createState();finishRound(state);
  advance(state);
  assert.equal(state.round,2);
  assert.equal(state.active.length,0);
  finishRound(state,[["u2","Corredor 2",31000],["u1","Corredor 1",32500]]);
  const l=seasonTop(state);
  assert.equal(l.length,2);
  assert.equal(l[0].wins,1);
  assert.equal(l[1].wins,1);
  assert.equal(l[0].podiums,2);
  assert.equal(l[0].races,2);
  assert.equal(state.history.length,2);
  assert.equal(state.history[0].round,2);
});
test("Premature RESULTS never invent a victorious runner",()=>{
  const state=createState();
  register(state,"u1","Ana","entrar");
  advance(state);advance(state);advance(state);
  assert.equal(state.history[0].winner,null);
  assert.equal(state.seasonLeaders[0].wins,0);
  assert.equal(recentWinners(state).length,0);
});
test("No runners: empty RESULTS does not add phantom wins",()=>{
  const state=createState();
  advance(state);advance(state);advance(state);
  assert.equal(state.seasonLeaders.length,0);
  assert.equal(state.history.length,1);
  assert.equal(state.history[0].winner,null);
});
test("Legacy Postgres snapshots missing history are safely upgraded",()=>{
  const state=createState();
  delete state.history;delete state.seasonLeaders;
  assert.equal(validateSavedState(state),true);
  finishRound(state);
  assert.equal(state.history.length,1);
  assert.equal(state.seasonLeaders.length,2);
  assert.equal(validateSavedState(JSON.parse(JSON.stringify(state))),true);
});
test("Historical array and season standings remain bounded",()=>{
  const state=createState();
  for(let round=1;round<=MAX_SEASON_LEADERS+20;round++){
    state.round=round;state.phase="RESULTS";
    state.results=[{id:"user-"+round,name:"Jogador "+round,position:1,progress:150,finished:true,finishTime:30000}];
    assert.equal(recordCompletedRace(state),true);
  }
  assert.equal(state.history.length,MAX_RACE_HISTORY);
  assert.equal(state.seasonLeaders.length,MAX_SEASON_LEADERS);
  assert.equal(state.history[0].round,MAX_SEASON_LEADERS+20);
});
test("Broadcast view is opt-in; operator view remains default",()=>{
  assert.equal(getViewMode(""),"operator");
  assert.equal(getViewMode("?view=operator"),"operator");
  assert.equal(getViewMode("?view=live"),"live");
  assert.equal(getViewMode("view=live&foo=bar"),"live");
  assert.equal(getViewMode("?view=LIVE"),"operator");
  assert.equal(getViewMode("?view=live-not-admin"),"operator");
  assert.equal(broadcastLink("/"),"/?view=live");
  assert.equal(broadcastLink("/corrida/"),"/corrida/?view=live");
});
