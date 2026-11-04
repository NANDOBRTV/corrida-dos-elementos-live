// Configurações públicas do jogo. Nenhuma credencial TikTok é armazenada aqui.
export const TRACK_LENGTH = 5000;
export const PREVIOUS_TRACK_LENGTH = 300;
export const STREAM_TILE_LENGTH = 300;
export const LONG_RACE_TIMEOUT = 1_500_000; // 25 min cap for the 5km course.
export const LEGACY_TRACK_LENGTH = 150;
export const LANES = 5;
export const LANE_WIDTH = 1.85;
export const PHASE_TIMES = Object.freeze({ LOBBY: 20000, COUNTDOWN: 5000, RUNNING: 85000, RESULTS: 10000 });
// Dois mapas definitivos. Um cenário 3D é carregado por corrida.
export const BIOME_ORDER = Object.freeze(["ice", "forest"]);
// IDs antigos são aceitos apenas na migração dos snapshots anteriores à versão 2.3.
export const LEGACY_BIOME_IDS = Object.freeze(["desert","volcano","hell"]);
export const BIOMES = Object.freeze({
  ice:     { id:"ice",     emoji:"❄️", name:"GELO",    subtitle:"Expedição Boreal", sky:0xb6deeb, fog:0xb6deeb, ground:0xe2f0f3, road:0xa2cfde, trim:0x769dac, accent:"#b5f4ff", obstacle:"Cristais de gelo" },
  forest:  { id:"forest",  emoji:"🌲", name:"FLORESTA", subtitle:"Vale Esmeralda",   sky:0xa7d9b6, fog:0xa7d9b6, ground:0x438957, road:0xbca981, trim:0x71543c, accent:"#bff55e", obstacle:"Troncos" }
});
export function mapForRound(round) {
  return BIOME_ORDER[(Math.max(1, Math.trunc(Number(round) || 1)) - 1) % BIOME_ORDER.length];
}
export function biome(id) { return BIOMES[id] || BIOMES.forest; }
export function laneX(index) { return (index - 2) * LANE_WIDTH; }
// One deterministic hazard pattern per 300m tile. Cache the arrays so
// the 50-runner fixed-step server does not rebuild ~400 objects every tick.
const hazardsCache=new Map();
export function obstaclesFor(id,length=TRACK_LENGTH) {
  const safeLength=[LEGACY_TRACK_LENGTH,PREVIOUS_TRACK_LENGTH,STREAM_TILE_LENGTH*2,TRACK_LENGTH].includes(length)
    ?length:TRACK_LENGTH;
  const key=id+"/"+safeLength;
  if(hazardsCache.has(key))return hazardsCache.get(key);
  const result=[];
  const count=Math.floor(safeLength/12.5);
  for(let i=0;i<count;i++){
    const local=i%24;
    const z=Math.floor(i/24)*STREAM_TILE_LENGTH+14+local*11.15;
    if(z>=safeLength)continue;
    result.push(Object.freeze({
      index:i,z,lane:(local*3+2)%LANES,kind:id==="ice"?"ice":"log"
    }));
  }
  hazardsCache.set(key,Object.freeze(result));
  return hazardsCache.get(key);
}
export const RUNNER_COLORS = ["#c9f86e","#65d9fa","#ffd47d","#ea98ff","#ff9389","#6be6c9","#f9b0dc","#f2f7fa","#a2b5ff","#d6a97c"];