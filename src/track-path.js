// Visual-only road geometry for the 5,000m race: a sinuous course with low hills.
// The authoritative race distance, lanes, collisions and winner ranking stay unchanged.
// The same deterministic formula is mirrored inside the optional Roblox Studio script.
export const COURSE_LENGTH=5000;
export const COURSE_TILE_LENGTH=300;
function clampDistance(value){
  return Number.isFinite(value)?Math.max(0,Math.min(COURSE_LENGTH,value)):0;
}
function horizontal(s){
  const start=Math.min(1,s/140);
  const ease=start*start*(3-2*start);
  return ease*(27*Math.sin(s/172)+10*Math.sin(s/69));
}
function altitude(s){
  return .72*Math.sin(s/115)**2+.32*Math.sin(s/46)**2;
}
export function trackCenter(distance){
  const d=clampDistance(distance);
  const lo=clampDistance(d-.5),hi=clampDistance(d+.5);
  const dx=(horizontal(hi)-horizontal(lo))/Math.max(.001,hi-lo);
  return {x:horizontal(d),y:altitude(d),z:d,heading:Math.atan(dx)};
}
export function trackPoint(distance,lateral=0,height=0){
  const center=trackCenter(distance);
  const side=Number.isFinite(lateral)?lateral:0;
  const up=Number.isFinite(height)?height:0;
  return {
    x:center.x+side*Math.cos(center.heading),
    y:center.y+up,
    z:center.z-side*Math.sin(center.heading),
    heading:center.heading
  };
}
export const COURSE_MILESTONES=Object.freeze([500,1000,1500,2000,2500,3000,3500,4000,4500]);
export function courseSection(distance){
  const d=clampDistance(distance);
  if(d<500)return "LARGADA · PRIMEIRA CURVA";
  if(d<1400)return "CURVAS DO VALE";
  if(d<2300)return "PASSAGEM SINUOSA";
  if(d<3300)return "SERPENTE DA SERRA";
  if(d<4300)return "CIRCUITO FINAL";
  return "ÚLTIMO QUILÔMETRO";
}
