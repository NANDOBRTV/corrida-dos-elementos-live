import { BIOME_ORDER, mapForRound, TRACK_LENGTH, obstaclesFor } from "./config.js";
import { createState, joinCommand, register, addDemo, rank, advance, tick, turbo, countdown, validateSavedState } from "./engine.js";
function check(condition,message="Resultado inesperado"){if(!condition)throw Error(message);}
function raceWithPlayers(n=10) {
  const s=createState(1234);
  for(let i=0;i<n;i++)register(s,"user-"+i,"Jogador "+i,"entrar");
  return s;
}
function start(s){advance(s);advance(s);check(s.phase==="RUNNING");return s;}
export const CASES=[
  ["Aceita entrar com letras e espaços variados",()=>{
    check(joinCommand(" ENTRAR "));check(joinCommand("EntrAr"));check(joinCommand("\tentrar\n"));
  }],
  ["Não aceita texto com outras palavras",()=>{
    for(const text of ["!entrar","quero entrar","entrando","entrar agora","sem entrar","entrar!"])check(!joinCommand(text));
  }],
  ["Um ID gera apenas uma inscrição por rodada",()=>{
    const s=createState();
    for(let i=0;i<5;i++)register(s,"id-10","Ana","entrar");
    check(s.active.length===1);
  }],
  ["Identificador é obrigatório e não é inventado",()=>{
    const s=createState();
    check(!register(s,"","Sem ID","entrar").ok);check(s.active.length===0);
  }],
  ["Entrada na contagem regressiva vai para a próxima",()=>{
    const s=raceWithPlayers(1);advance(s);
    const out=register(s,"next-1","Bia","entrar");
    check(out.ok&&out.round===2&&s.next.length===1&&s.active.length===1);
  }],
  ["Entrada durante corrida vai para a próxima",()=>{
    const s=start(raceWithPlayers(1));
    const out=register(s,"next-2","Bia","entrar");
    check(out.ok&&out.queue==="próxima"&&s.next[0].id==="next-2");
  }],
  ["Entrada nos resultados vai para a próxima",()=>{
    const s=start(raceWithPlayers(1));advance(s);
    check(register(s,"last","Ana","entrar").round===2);
  }],
  ["Não reinscreve participantes antigos",()=>{
    const s=start(raceWithPlayers(1));advance(s);advance(s);
    check(s.round===2&&s.active.length===0&&s.next.length===0);
  }],
  ["Fila seguinte é preservada e promovida",()=>{
    const s=start(raceWithPlayers(2));
    register(s,"future","Próxima","entrar");
    advance(s);advance(s);
    check(s.active.length===1&&s.active[0].id==="future"&&s.next.length===0);
  }],
  ["Uma nova inscrição é possível em uma nova rodada",()=>{
    const s=start(raceWithPlayers(1));
    register(s,"user-0","Jogador 0","entrar");
    advance(s);advance(s);
    check(s.active.length===1&&s.active[0].id==="user-0");
  }],
  ["Rotação dos cinco mapas tem ordem exata",()=>{
    const expected=[...BIOME_ORDER,...BIOME_ORDER,"forest"];
    for(let i=0;i<expected.length;i++)check(mapForRound(i+1)===expected[i]);
  }],
  ["Todos os obstáculos ficam dentro da pista",()=>{
    for(const id of BIOME_ORDER)check(obstaclesFor(id).every(h=>h.z>0&&h.z<TRACK_LENGTH&&h.lane>=0&&h.lane<=4));
  }],
  ["Dez corredores andam automaticamente",()=>{
    const s=start(raceWithPlayers(10));
    for(let i=0;i<30;i++)tick(s,100);
    check(s.active.length===10&&s.active.every(r=>r.progress>0));
  }],
  ["Velocidade não depende da cadência dos frames",()=>{
    const s1=start(raceWithPlayers(10));
    const s2=start(raceWithPlayers(10));
    for(let i=0;i<50;i++)tick(s1,100);
    for(let i=0;i<100;i++)tick(s2,50);
    check(s1.active.every((r,i)=>Math.abs(r.progress-s2.active[i].progress)<0.000001));
  }],
  ["Chegada determina ranking e pódio",()=>{
    const s=start(raceWithPlayers(10));
    for(let i=0;i<850&&s.phase==="RUNNING";i++)tick(s,100);
    check(s.phase==="RESULTS"&&s.results.length===10);
    check(s.results.every((r,i)=>r.position===i+1));
    check(s.results[0].finishTime<=s.results[1].finishTime);
  }],
  ["Turbo somente para corredor ativo",()=>{
    const s=start(raceWithPlayers(1));
    check(turbo(s,"user-0")&&s.active[0].turboUntil>0);
    check(!turbo(s,"not-present"));
  }],
  ["Limite de 50 corredores por rodada",()=>{
    const s=raceWithPlayers(50);
    check(!register(s,"one-more","Extra","entrar").ok&&s.active.length===50);
  }],
  ["Corrida pode ser pausada sem mudar estado",()=>{
    const s=start(raceWithPlayers(1));
    s.paused=true;const old=s.active[0].progress;
    tick(s,400);check(s.active[0].progress===old);
  }],
  ["Salvamento local reconhece estrutura válida",()=>{
    const s=createState();check(validateSavedState(JSON.parse(JSON.stringify(s))));
    check(!validateSavedState({phase:"HACK",active:[]}));
  }],
  ["Nenhuma corrida começa sem transição correta",()=>{
    const s=createState();check(countdown(s)===20);
    advance(s);check(s.phase==="COUNTDOWN"&&countdown(s)===5);
    advance(s);check(s.phase==="RUNNING");
  }]
];
export function runSelfTests() {
 const results=[];
 for(const [name,fn] of CASES){try{fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:String(e?.message||e)});}}
 return results;
}