// Configurações públicas do jogo. Nenhuma credencial TikTok é armazenada aqui.
export const TRACK_LENGTH = 400;
export const PREVIOUS_LONG_TRACK_LENGTH=5000;
export const MIN_LAPS=1,MAX_LAPS=10;
export const PREVIOUS_TRACK_LENGTH = 300;
export const STREAM_TILE_LENGTH = 300;
export const LONG_RACE_TIMEOUT = 1_500_000; // maximum running time for multi-lap events
export const LEGACY_TRACK_LENGTH = 150;
export const LANES = 5;
export const LANE_WIDTH = 1.85;
export const PHASE_TIMES = Object.freeze({ LOBBY: 20000, COUNTDOWN: 5000, RUNNING: 85000, RESULTS: 10000 });
// Dois mapas definitivos. Um cenário 3D é carregado por corrida.
export const BIOME_ORDER = Object.freeze(["ice", "forest"]);
// IDs antigos são aceitos apenas na migração dos snapshots anteriores à versão 2.3.
export const LEGACY_BIOME_IDS = Object.freeze(["desert","volcano","hell"]);
export const BIOMES = Object.freeze({
  ice:     { id:"ice",     emoji:"❄️", name:"GELO",    subtitle:"Expedição Boreal", sky:0xbac9df, fog:0xbac9df, ground:0xe0e9f3, road:0x566578, trim:0xe6edf4, accent:"#b5f4ff", obstacle:"Cristais de gelo" },
  forest:  { id:"forest",  emoji:"🌲", name:"FLORESTA", subtitle:"Vale Esmeralda",   sky:0xa7d9b6, fog:0xa7d9b6, ground:0x438957, road:0xbca981, trim:0x71543c, accent:"#bff55e", obstacle:"Troncos" }
});
export function mapForRound(round) {
  return BIOME_ORDER[(Math.max(1, Math.trunc(Number(round) || 1)) - 1) % BIOME_ORDER.length];
}
export function biome(id) { return BIOMES[id] || BIOMES.forest; }
export function laneX(index) { return (index - 2) * LANE_WIDTH; }
// Kept for legacy integrations only. Automatic procedural hazards are disabled.
const NO_AUTOMATIC_OBSTACLES=Object.freeze([]);
export function obstaclesFor(){return NO_AUTOMATIC_OBSTACLES;}
export const RUNNER_COLORS = ["#c9f86e","#65d9fa","#ffd47d","#ea98ff","#ff9389","#6be6c9","#f9b0dc","#f2f7fa","#a2b5ff","#d6a97c"];