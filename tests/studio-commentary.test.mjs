import test from "node:test";
import assert from "node:assert/strict";
import {createStudioCommentary,createStudioVoice,chooseBrazilianVoice,
  commentatorName,COMMENTARY_LIMITS} from "../src/studio-commentary.js";
import {createStudioState,studioFillBots,studioAdvance,studioTick}
  from "../src/studio-engine.js";
const batch=()=>{
  const s=createStudioState({seed:701,connected:false});
  studioFillBots(s,{count:15});return s;
};
test("narrador profissional: cada rodada tem introdução, largada e vencedor",()=>{
  const s=batch(),d=createStudioCommentary();
  assert.match(d.next(s,100).text,/Rodada 1/);
  assert.equal(d.next(s,200),null);
  studioAdvance(s);
  assert.match(d.next(s,400).text,/Inscrições encerradas/);
  studioAdvance(s);
  assert.match(d.next(s,500).text,/LARGOU/);
  assert.equal(d.next(s,501),null);
  studioTick(s,2500);
  assert.equal(d.next(s,1000),null);
  studioAdvance(s);
  assert.match(d.next(s,1500).text,/BANDEIRA QUADRICULADA/);
  assert.equal(d.next(s,1600),null);
  studioAdvance(s);
  assert.match(d.next(s,2000).text,/Rodada 2/);
});
test("narração detecta ultrapassagem real, rejeita replay e evita texto repetitivo",()=>{
  const s=batch(),d=createStudioCommentary();
  studioAdvance(s);studioAdvance(s);
  d.next(s,0);
  s.raceMs=3900;
  s.active.forEach((r,i)=>{r.progress=12-i;r.finishMs=null;});
  d.next(s,4000);
  const first=s.active[0],other=s.active[1];
  first.progress=12;other.progress=30;
  const line=d.next(s,8500);
  assert.match(line.text,/ULTRAPASSAGEM NA PONTA/);
  assert.match(line.text,new RegExp(other.name));
  const repeat=d.next(s,8600);
  assert.equal(repeat,null);
  s.raceMs=700;
  first.progress=40;
  assert.equal(d.next(s,9500),null);
  assert.ok(COMMENTARY_LIMITS.minIntervalMs>=7000);
});
test("momento final e narração de pódio acontecem somente uma vez",()=>{
  const s=batch(),d=createStudioCommentary();
  studioAdvance(s);studioAdvance(s);
  d.next(s,0);
  s.active.forEach((r,i)=>{r.progress=100-i;r.finishMs=null;});
  s.active[0].progress=s.distance*.90;
  assert.match(d.next(s,1500).text,/reta decisiva/);
  s.active[0].progress=s.distance*.98;
  assert.match(d.next(s,3000).text,/ÚLTIMOS METROS/);
  assert.equal(d.next(s,3300),null);
  studioAdvance(s);
  assert.match(d.next(s,4000).text,/BANDEIRA QUADRICULADA/);
  assert.match(d.next(s,8500).text,/Pódio definido/);
  assert.equal(d.next(s,9000),null);
});
test("nome do usuário é higienizado e voz pt-BR natural tem prioridade",()=>{
  assert.equal(commentatorName({name:"Civic",driverName:"@Nando🔥"}),"Civic de Nando");
  const list=[
    {name:"English",lang:"en-US",localService:true},
    {name:"Português Portugal",lang:"pt-PT",localService:true},
    {name:"Microsoft Antonio Natural",lang:"pt-BR",localService:false},
    {name:"Brasil Normal",lang:"pt-BR",localService:true}
  ];
  assert.equal(chooseBrazilianVoice(list).name,"Microsoft Antonio Natural");
  assert.equal(chooseBrazilianVoice([]),null);
});
test("voz só fala depois de ativação e encerra fila no mute/descarte",()=>{
  const lines=[],utterances=[],statuses=[];
  const synth={
    speaking:false,getVoices:()=>[{name:"Português Brasil",lang:"pt-BR"}],
    addEventListener(){},removeEventListener(){},
    speak(u){this.speaking=true;utterances.push(u);},
    cancel(){this.speaking=false;}
  };
  class Utterance{constructor(text){this.text=text;}}
  const player=createStudioVoice({
    host:{speechSynthesis:synth,SpeechSynthesisUtterance:Utterance},
    onCaption:s=>lines.push(s),onStatus:s=>statuses.push(s)
  });
  assert.equal(player.state().enabled,false);
  player.update({text:"Deve ficar mudo",priority:1});
  assert.equal(utterances.length,0);
  assert.equal(player.enable(),true);
  assert.equal(utterances.length,1);
  assert.equal(utterances[0].lang,"pt-BR");
  assert.equal(utterances[0].voice.name,"Português Brasil");
  const speakRace={text:"A corrida começou!",priority:4};
  player.update(speakRace);
  assert.equal(utterances.at(-1).text,speakRace.text);
  player.disable();
  assert.equal(player.state().enabled,false);
  assert.equal(player.state().speaking,false);
  assert.equal(lines.at(-1),"");
  player.dispose();
  assert.equal(player.enable(),false);
  assert.equal(statuses.includes("enabled"),true);
});
test("navegador sem mecanismo de voz não exibe sucesso falso",()=>{
  const player=createStudioVoice({host:{}});
  assert.equal(player.state().supported,false);
  assert.equal(player.enable(),false);
  assert.equal(player.state().enabled,false);
  player.update({text:"Nada",priority:3});
  player.dispose();
});
