// Configurações públicas do jogo. Nenhuma credencial TikTok é armazenada aqui.
export const TRACK_LENGTH = 150;
export const LANES = 5;
export const LANE_WIDTH = 1.85;
export const PHASE_TIMES = Object.freeze({ LOBBY: 20000, COUNTDOWN: 5000, RUNNING: 85000, RESULTS: 10000 });
export const BIOME_ORDER = Object.freeze(["forest", "desert", "volcano", "ice", "hell"]);
export const BIOMES = Object.freeze({
  forest:  { id:"forest",  emoji:"🌲", name:"FLORESTA", subtitle:"Vale Esmeralda",       sky:0xa7d9b6, fog:0xa7d9b6, ground:0x438957, road:0xbca981, trim:0x71543c, accent:"#bff55e", obstacle:"Troncos" },
  desert:  { id:"desert",  emoji:"🏜️", name:"DESERTO", subtitle:"Dunas Douradas",         sky:0xf7d7a4, fog:0xf7d7a4, ground:0xd6a35e, road:0xeac98d, trim:0x9a7046, accent:"#ffe18d", obstacle:"Rochas" },
  volcano: { id:"volcano", emoji:"🌋", name:"VULCÃO", subtitle:"Coração da Caldeira",   sky:0x79454a, fog:0x79454a, ground:0x40313a, road:0x62525a, trim:0x241f29, accent:"#ff925e", obstacle:"Cristais de magma" },
  ice:     { id:"ice",     emoji:"❄️", name:"GELO",    subtitle:"Expedição Boreal",       sky:0xb6deeb, fog:0xb6deeb, ground:0xe2f0f3, road:0xa2cfde, trim:0x769dac, accent:"#b5f4ff", obstacle:"Cristais de gelo" },
  hell:    { id:"hell",    emoji:"🔥", name:"INFERNO", subtitle:"Abismo Escarlate",      sky:0x361d34, fog:0x361d34, ground:0x332333, road:0x574155, trim:0x1a1521, accent:"#ff765b", obstacle:"Pilares de fogo" }
});
export function mapForRound(round) {
  return BIOME_ORDER[(Math.max(1, Math.trunc(Number(round) || 1)) - 1) % BIOME_ORDER.length];
}
export function biome(id) { return BIOMES[id] || BIOMES.forest; }
export function laneX(index) { return (index - 2) * LANE_WIDTH; }
export function obstaclesFor(id) {
  const result=[];
  for (let i=0;i<12;i++) result.push({
    index:i, z:14+i*11.15, lane:(i*3+2)%LANES, kind: id==="ice"?"ice":id==="forest"?"log":id==="desert"?"rock":id==="hell"?"fire":"magma"
  });
  return result;
}
export const RUNNER_COLORS = ["#c9f86e","#65d9fa","#ffd47d","#ea98ff","#ff9389","#6be6c9","#f9b0dc","#f2f7fa","#a2b5ff","#d6a97c"];