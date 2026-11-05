// Circuito fechado em forma de W / serpentina; 400m medidos na curva real.
// A polilinha de controle é reamostrada por comprimento de arco.
export const COURSE_LENGTH=400;
export const COURSE_TILE_LENGTH=400;
export const COURSE_MILESTONES=Object.freeze([100,200,300]);
export const COURSE_HAIRPINS=Object.freeze([75,165,280]);
export const COURSE_CONTROL_POINTS=Object.freeze([
  [48,162],[72,165],[87,152],[89,127],[77,110],[64,91],
  [59,70],[62,53],[76,50],[85,58],[92,48],[89,27],
  [71,16],[46,20],[33,35],[35,57],[47,78],
  [47,101],[37,106],[31,91],[21,86],[15,108],
  [21,137],[34,157]
]);
const SEGMENTS=64;
const raw=[];
function sample(i,t){
  const n=COURSE_CONTROL_POINTS.length;
  const at=k=>COURSE_CONTROL_POINTS[(k+n)%n];
  const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
  const t2=t*t,t3=t2*t;
  return [0,1].map(k=>.5*(2*b[k]+(c[k]-a[k])*t+
    (2*a[k]-5*b[k]+4*c[k]-d[k])*t2+
    (-a[k]+3*b[k]-3*c[k]+d[k])*t3));
}
for(let i=0;i<COURSE_CONTROL_POINTS.length;i++)
  for(let j=0;j<SEGMENTS;j++)raw.push(sample(i,j/SEGMENTS));
raw.push([...raw[0]]);
const cumulative=new Float64Array(raw.length);
for(let i=1;i<raw.length;i++)
  cumulative[i]=cumulative[i-1]+Math.hypot(raw[i][0]-raw[i-1][0],raw[i][1]-raw[i-1][1]);
const factor=COURSE_LENGTH/cumulative[cumulative.length-1];
const origin=raw[0];
function clamp(d){return Math.max(0,Math.min(COURSE_LENGTH,Number.isFinite(d)?d:0));}
function xy(distance){
  const target=clamp(distance)/factor;
  let lo=0,hi=cumulative.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>>1;if(cumulative[mid]<target)lo=mid;else hi=mid;}
  const step=cumulative[hi]-cumulative[lo];
  const t=step?Math.max(0,Math.min(1,(target-cumulative[lo])/step)):0;
  const x=raw[lo][0]+(raw[hi][0]-raw[lo][0])*t;
  const z=raw[lo][1]+(raw[hi][1]-raw[lo][1])*t;
  return {x:(x-origin[0])*factor,z:(origin[1]-z)*factor};
}
function direction(distance){
  const pre=xy((distance-.35+COURSE_LENGTH)%COURSE_LENGTH);
  const post=xy((distance+.35)%COURSE_LENGTH);
  return Math.atan2(post.x-pre.x,post.z-pre.z);
}
export function trackCenter(distance){
  const d=clamp(distance),p=xy(d),angle=d/COURSE_LENGTH*2*Math.PI;
  return {x:p.x,z:p.z,y:2*Math.sin(angle)**2+1.2*Math.sin(2*angle)**2,
    heading:direction(d)};
}
export function trackPoint(distance,lateral=0,height=0){
  const p=trackCenter(distance),side=Number.isFinite(lateral)?lateral:0;
  return {x:p.x+side*Math.cos(p.heading),y:p.y+(Number.isFinite(height)?height:0),
    z:p.z-side*Math.sin(p.heading),heading:p.heading};
}
export function lapDistance(progress,totalDistance=COURSE_LENGTH){
  if(!Number.isFinite(progress)||progress<=0)return 0;
  if(Number.isFinite(totalDistance)&&progress>=totalDistance)return COURSE_LENGTH;
  return (progress%COURSE_LENGTH+COURSE_LENGTH)%COURSE_LENGTH;
}
export function currentLap(progress,laps=1){
  const max=Math.max(1,Number.isInteger(laps)?laps:1);
  return Math.min(max,Math.floor(Math.max(0,(Number(progress)||0))/COURSE_LENGTH)+1);
}
export function trackBounds(step=2){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let d=0;d<=COURSE_LENGTH;d+=step){
    const p=trackCenter(d);
    minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
  }
  return {minX,maxX,minZ,maxZ};
}
export function courseSection(distance){
  const d=(Number(distance)||0)%COURSE_LENGTH;
  if(d<80)return "COTOVELO INICIAL";
  if(d<160)return "DESCIDA DO W";
  if(d<240)return "SERPENTINA SUPERIOR";
  if(d<320)return "CURVA EM U";
  return "RETA DE CHEGADA";
}
