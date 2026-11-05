// Studio V5 — one fixed, smoothed chase camera. Pure mathematics; no DOM/WebGL.
// The only intentional individual shot is the winner's 8-second podium.
import {LIVE_STUDIO,LANES,LANE_WIDTH} from "./config.js";

export const STUDIO_CAMERA=Object.freeze({
  // Match the reference framing: a lower, tighter shot behind the racing pack.
  // The same physical camera remains active; no random cuts or drone view.
  fovPortrait:72,near:0.1,far:520,
  followDistance:20.5,followHeight:9.35,lookAhead:22,
  gridBackMargin:19,gridHeight:12.6,
  winnerDistance:9.5,winnerHeight:5.6,smoothness:4.1,
  columns:10,gridGap:2.85,trackLength:1600
});
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const POINT_STEP=1;
const samples=[];
const accum=[0];
function rawPoint(z){
  const x=17*Math.sin(z/106)+10*Math.sin(z/54+.35)+7*Math.sin(z/178+.9);
  const y=1.28+.38*Math.sin(z/141)+.16*Math.sin(z/43);
  return {x,y,z};
}
for(let z=0;z<=STUDIO_CAMERA.trackLength+170;z+=POINT_STEP){
  const point=rawPoint(z);
  if(samples.length){
    const p=samples[samples.length-1];
    accum.push(accum[accum.length-1]+Math.hypot(point.x-p.x,point.y-p.y,point.z-p.z));
  }
  samples.push(point);
}
export const STUDIO_COURSE_TOTAL=accum[accum.length-1];
function fromArc(d){
  const target=clamp(d,0,STUDIO_COURSE_TOTAL);
  let lo=0,hi=accum.length-1;
  while(hi-lo>1){
    const m=(lo+hi)>>>1;
    if(accum[m]<target)lo=m;else hi=m;
  }
  const span=accum[hi]-accum[lo];
  const t=span>0?clamp((target-accum[lo])/span,0,1):0;
  const a=samples[lo],b=samples[hi];
  return {
    x:a.x+(b.x-a.x)*t,
    y:a.y+(b.y-a.y)*t,
    z:a.z+(b.z-a.z)*t
  };
}
function headingAt(distance){
  const a=fromArc(clamp(distance-.35,0,STUDIO_COURSE_TOTAL));
  const b=fromArc(clamp(distance+.35,0,STUDIO_COURSE_TOTAL));
  return Math.atan2(b.x-a.x,b.z-a.z);
}
const startHeading=headingAt(0);
export function studioCourseAt(distance){
  const d=finite(Number(distance));
  if(d<0){
    const s=samples[0];
    return {
      x:s.x+Math.sin(startHeading)*d,y:s.y,z:s.z+Math.cos(startHeading)*d,
      heading:startHeading
    };
  }
  const p=fromArc(d);
  return {...p,heading:headingAt(d)};
}
export function studioLaneOffset(lane){
  const index=clamp(Math.trunc(finite(Number(lane),4)),0,LANES-1);
  return (index-(LANES-1)/2)*LANE_WIDTH;
}
export function studioPositionOnCourse(distance,lane=4){
  const p=studioCourseAt(distance);
  const side=studioLaneOffset(lane);
  return {
    x:p.x+Math.cos(p.heading)*side,y:p.y,
    z:p.z-Math.sin(p.heading)*side,
    heading:p.heading
  };
}
export function studioRunnerPose(runner,index=0,phase="RUNNING",results=[]){
  const r=runner??{};
  const lane=Number.isInteger(r.lane)?r.lane:index%10;
  const progress=Math.max(0,finite(Number(r.progress)));
  const isStaging=phase==="LOBBY"||phase==="COUNTDOWN";
  let d=progress;
  const place=Number.isInteger(r.gridPosition)&&r.gridPosition>=1?
    r.gridPosition:index+1;
  const row=Math.floor((place-1)/STUDIO_CAMERA.columns);
  if(isStaging)d=-row*STUDIO_CAMERA.gridGap;
  else if(phase==="RUNNING"){
    // A full 100-runner grid cannot collapse into ten coordinates at GO.
    // Fade only the visual row spacing after 45m (no impact on official meters).
    const taper=clamp(1-progress/45,0,1);
    d=progress-row*STUDIO_CAMERA.gridGap*taper;
  }
  // The only individual focus in the whole game: the winner's podium.
  // The three podium runners stand together and are never placed over track traffic.
  if(phase==="RESULTS"){
    const rank=Array.isArray(results)?results.findIndex(v=>v.id===r.id):-1;
    if(rank>=0&&rank<3){
      const anchor=studioCourseAt(Math.max(0,progress-9));
      const lateral=[0,-3.4,3.4][rank];
      return {x:anchor.x+Math.cos(anchor.heading)*lateral,
        y:anchor.y+[1.55,.95,.55][rank],
        z:anchor.z-Math.sin(anchor.heading)*lateral,
        heading:anchor.heading,podium:rank+1};
    }
  }
  return {...studioPositionOnCourse(d,lane),podium:null};
}
export function studioCrowdPoses(state){
  const s=state?.state??state??{};
  const active=Array.isArray(s.active)?s.active:[];
  const results=Array.isArray(s.results)?s.results:[];
  const poses=new Map(active.map((r,i)=>[r.id,studioRunnerPose(r,i,s.phase,results)]));
  if(s.phase!=="RUNNING")return poses;
  // Visual-only collision separation on each lane: nearby runners never
  // occupy the same voxel space, even when server progress values coincide.
  for(let lane=0;lane<LANES;lane++){
    const group=active.filter(r=>r.lane===lane).sort((a,b)=>
      Number(b.progress||0)-Number(a.progress||0)||
      Number(a.gridPosition||0)-Number(b.gridPosition||0)||
      String(a.id).localeCompare(String(b.id)));
    let last=Infinity;
    for(const r of group){
      const pose=poses.get(r.id);
      if(!pose)continue;
      const base=studioRunnerPose(r,active.indexOf(r),"RUNNING");
      // Arc length coordinate is recovered by projection onto centerline;
      // use the official distance minus the decaying initial grid offset.
      const place=Number(r.gridPosition)||active.indexOf(r)+1;
      const row=Math.floor((place-1)/10);
      const progress=Math.max(0,finite(Number(r.progress)));
      const logical=progress-row*STUDIO_CAMERA.gridGap*
        clamp(1-progress/45,0,1);
      const spaced=Math.min(logical,last-1.30);
      last=spaced;
      poses.set(r.id,{...studioPositionOnCourse(spaced,r.lane),podium:null});
    }
  }
  return poses;
}

export function cameraTargetFor(state){
  const s=state?.state??state??{};
  const runners=Array.isArray(s.active)?s.active:[];
  const phase=String(s.phase??"LOBBY");
  const pathAngle=studioCourseAt(0).heading;
  if(phase==="LOBBY"||phase==="COUNTDOWN"){
    const rows=Math.max(1,Math.min(10,Math.ceil(runners.length/10)));
    const eye=studioCourseAt(-(rows-1)*STUDIO_CAMERA.gridGap-
      STUDIO_CAMERA.gridBackMargin);
    const look=studioCourseAt(19);
    return {
      position:{x:eye.x,y:eye.y+STUDIO_CAMERA.gridHeight+.08*rows,z:eye.z},
      target:{x:look.x,y:look.y+1.7,z:look.z},
      mode:"CHASE",leaderId:null,
      heading:pathAngle
    };
  }
  if(phase==="RESULTS"&&Array.isArray(s.results)&&s.results.length){
    const winnerId=s.results[0].id;
    const winner=runners.find(r=>r.id===winnerId);
    if(winner){
      const at=studioRunnerPose(winner,runners.indexOf(winner),"RESULTS",s.results);
      const forwardX=Math.sin(at.heading),forwardZ=Math.cos(at.heading);
      return {
        position:{
          x:at.x+forwardX*STUDIO_CAMERA.winnerDistance,
          y:at.y+STUDIO_CAMERA.winnerHeight,
          z:at.z+forwardZ*STUDIO_CAMERA.winnerDistance
        },
        target:{x:at.x,y:at.y+1.35,z:at.z},
        mode:"WINNER_PODIUM",leaderId:winnerId,
        heading:at.heading
      };
    }
  }
  const eligible=runners.filter(r=>r?.status==="running"||
    r?.status==="finished");
  const distances=eligible.map(r=>Math.max(0,finite(Number(r.progress))))
    .sort((a,b)=>a-b);
  const distance=distances.length?
    distances[Math.min(distances.length-1,Math.floor(distances.length*.58))]:0;
  const at=studioCourseAt(distance);
  const dx=Math.sin(at.heading),dz=Math.cos(at.heading);
  const future=studioCourseAt(distance+STUDIO_CAMERA.lookAhead);
  const rows=Math.max(1,Math.min(10,Math.ceil(runners.length/10)));
  const initialSpacing=(rows-1)*STUDIO_CAMERA.gridGap*
    clamp(1-distance/45,0,1);
  const followDistance=STUDIO_CAMERA.followDistance+initialSpacing;
  // Exactly one stable rear shot: no drone, random close, POV cuts or orbit.
  return {
    position:{
      x:at.x-dx*followDistance,
      y:at.y+STUDIO_CAMERA.followHeight,
      z:at.z-dz*followDistance
    },
    target:{x:future.x,y:future.y+1.9,z:future.z},
    mode:"CHASE",leaderId:null,heading:at.heading
  };
}
function smoothScalar(previous,next,alpha){
  return previous+(next-previous)*alpha;
}
export function advanceStudioCamera(previous,state,deltaSeconds,{snap=false}={}){
  const desired=cameraTargetFor(state);
  const dt=clamp(finite(Number(deltaSeconds)),0,.25);
  if(!previous||snap)return desired;
  const alpha=1-Math.exp(-STUDIO_CAMERA.smoothness*dt);
  const interpolate=(a,b)=>({
    x:smoothScalar(a.x,b.x,alpha),
    y:smoothScalar(a.y,b.y,alpha),
    z:smoothScalar(a.z,b.z,alpha)
  });
  return {
    ...desired,
    position:interpolate(previous.position,desired.position),
    target:interpolate(previous.target,desired.target)
  };
}
export function studioVisibleNameplates(state,{max=12,featuredId=null}={}){
  const s=state?.state??state??{};
  const active=Array.isArray(s.active)?s.active:[];
  const sorted=[...active].sort((a,b)=>Number(b.progress||0)-Number(a.progress||0)||
    String(a.id).localeCompare(String(b.id)));
  const count=clamp(Math.trunc(finite(Number(max),12)),0,12);
  const selected=sorted.slice(0,count);
  if(featuredId){
    const selectedRunner=active.find(r=>r.id===featuredId);
    if(selectedRunner&&!selected.some(r=>r.id===featuredId))
      selected.push(selectedRunner);
  }
  const positions=new Map(sorted.map((r,i)=>[r.id,i+1]));
  const results=Array.isArray(s.results)?s.results:[];
  const poses=studioCrowdPoses(s);
  return selected.map(r=>({
    id:r.id,name:String(r.name??"Corredor").slice(0,28),
    rank:positions.get(r.id),color:r.color,
    pose:poses.get(r.id)??studioRunnerPose(r,active.indexOf(r),s.phase,results)
  }));
}
