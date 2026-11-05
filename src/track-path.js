// Three genuine 180-degree mountain hairpins over 5,000 meters of travelled distance.
// Visual geometry only; server-side race physics/ranking remain authoritative.
// Integrated at 2m arc-length intervals. Mirrored by the Roblox Studio Lua script.
export const COURSE_LENGTH=5000;
export const COURSE_TILE_LENGTH=300;
export const COURSE_MILESTONES=Object.freeze([500,1000,1500,2000,2500,3000,3500,4000,4500]);
export const COURSE_HAIRPINS=Object.freeze([
  {start:1400,end:1770,direction:"right",degrees:178},
  {start:2430,end:2810,direction:"left",degrees:178},
  {start:3420,end:3790,direction:"right",degrees:178}
]);
export const COURSE_TURNS=Object.freeze([
  [0,420,.03],[420,790,-1.55],[790,1400,-.05],
  [1400,1770,3.10],[1770,2430,.08],
  [2430,2810,-3.10],[2810,3420,-.06],
  [3420,3790,3.10],[3790,4460,.07],
  [4460,4800,-1.18],[4800,5000,-.10]
]);
export const COURSE_SAMPLE_STEP=2;
function bound(v){return Number.isFinite(v)?Math.max(0,Math.min(COURSE_LENGTH,v)):0;}
function headingAt(s){
  let h=0;
  for(const [start,end,turn] of COURSE_TURNS){
    if(s<=start)break;
    const t=Math.min(1,(s-start)/(end-start));
    h+=turn*(1-Math.cos(Math.PI*t))*.5;
    if(s<end)break;
  }
  return h;
}
const steps=COURSE_LENGTH/COURSE_SAMPLE_STEP;
const centersX=new Float64Array(steps+1);
const centersZ=new Float64Array(steps+1);
const bearings=new Float64Array(steps+1);
for(let i=0;i<=steps;i++){
  const s=i*COURSE_SAMPLE_STEP;
  bearings[i]=headingAt(s);
  if(i){
    const h=headingAt(s-COURSE_SAMPLE_STEP*.5);
    centersX[i]=centersX[i-1]+Math.sin(h)*COURSE_SAMPLE_STEP;
    centersZ[i]=centersZ[i-1]+Math.cos(h)*COURSE_SAMPLE_STEP;
  }
}
function elevation(s){
  return 2.5*Math.sin(s/185)**2+13*Math.sin(s/1500)**2+3*Math.sin(s/430)**2;
}
export function trackCenter(distance){
  const s=bound(distance),i=Math.min(steps-1,Math.floor(s/COURSE_SAMPLE_STEP));
  const t=(s-i*COURSE_SAMPLE_STEP)/COURSE_SAMPLE_STEP;
  return {
    x:centersX[i]+(centersX[i+1]-centersX[i])*t,
    y:elevation(s),
    z:centersZ[i]+(centersZ[i+1]-centersZ[i])*t,
    heading:bearings[i]+(bearings[i+1]-bearings[i])*t
  };
}
export function trackPoint(distance,lateral=0,height=0){
  const p=trackCenter(distance),side=Number.isFinite(lateral)?lateral:0;
  return {x:p.x+side*Math.cos(p.heading),y:p.y+(Number.isFinite(height)?height:0),
    z:p.z-side*Math.sin(p.heading),heading:p.heading};
}
export function trackBounds(step=20){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let d=0;d<=COURSE_LENGTH;d+=step){
    const p=trackCenter(d);
    minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
  }
  return {minX,maxX,minZ,maxZ};
}
export function courseSection(distance){
  const d=bound(distance);
  if(d<420)return "LARGADA · VALE DE NEVE";
  if(d<790)return "PRIMEIRA CURVA DA SERRA";
  if(d<1400)return "TRAVESSIA DA ENCOSTA";
  if(d<1770)return "COTOVELO DO PENHASCO";
  if(d<2430)return "RETA PANORÂMICA";
  if(d<2810)return "COTOVELO DO GELO";
  if(d<3420)return "ZIGUE-ZAGUE DA MONTANHA";
  if(d<3790)return "ÚLTIMO COTOVELO";
  if(d<4460)return "VALE DAS ARAUCÁRIAS";
  return "DESCIDA PARA A CHEGADA";
}
